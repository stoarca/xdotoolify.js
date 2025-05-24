import * as childProcess from 'child_process';
import equal from 'fast-deep-equal';

import { WebDriver } from 'selenium-webdriver';

export type Selector = string | [string, number];

// Define specific position types
interface AbsolutePosition {
  x: number;
  y: number;
}

interface RelativePosition {
  relx: number;
  rely: number;
}

interface ScreenPosition {
  screenx: number;
  screeny: number;
}

type Position = AbsolutePosition | RelativePosition | ScreenPosition;

// Helper type to skip the first item in a tuple
type Tail<T extends any[]> = T extends [any, ...infer U] ? U : never;

export interface XWebDriver extends WebDriver {
  X: _Xdotoolify;
  xjsLastPos: AbsolutePosition;
  executeScript<P extends any[], T>(fn: (...args: P) => T, ...args: P): Promise<T>;
}

// Base operation with common properties
interface BaseOperation {
  type: string;
  error?: Error;
  checkAfter?: boolean;
}

// Sleep operation
interface SleepOperation extends BaseOperation {
  type: 'sleep';
  ms: number;
}

type PageFunction<P extends any[], R> = (page: XWebDriver, ...args: P) => R;
export interface XPageFunction<P extends any[], R> {
  (page: XWebDriver, ...args: P): R;
  _xdotoolifyWithPage: true;
}

type NoPageFunction<P extends any[], R> = (...args: P) => R;
export interface XNoPageFunction<P extends any[], R> {
  (...args: P): R;
  _xdotoolifyWithPage: false;
}

// Check/run operations with proper function types
interface RunOperation<P extends any[] = any[], R = any> extends BaseOperation {
  type: 'run';
  func: XPageFunction<P, R> | XNoPageFunction<P, R>;
  args: P;
}

// Helper type to unwrap Promise if it's a Promise
type Await<T> = T extends Promise<infer U> ? U : T;

interface CheckUntilOperation<P extends any[] = any[], R = any> extends BaseOperation {
  type: 'checkUntil';
  func: XPageFunction<P, R> | XNoPageFunction<P, R>;
  args: P;
  callbackOrExpectedValue: ((result: Await<R> extends DebuggableResult<infer T> ? T : Await<R>) => any) | any;
}

interface RequireCheckOperation extends BaseOperation {
  type: 'addCheckRequirement';
}


// Mouse operations
interface MouseMoveOperation extends BaseOperation {
  type: 'mousemove';
  selector: Selector | Position;
  relpos: string;
  twoStep: boolean;
  timeout: number;
}

interface ClickOperation extends BaseOperation {
  type: 'click';
  mouseButton: number;
  selector?: Selector | null;
}

interface MouseButtonOperation extends BaseOperation {
  type: 'mousedown' | 'mouseup';
  mouseButton: number;
}

interface JitterOperation extends BaseOperation {
  type: 'jitter';
}

// Keyboard operations
interface KeyOperation extends BaseOperation {
  type: 'key';
  key: string;
}

interface TypeOperation extends BaseOperation {
  type: 'type';
  text: string;
}


interface MouseMoveOptions {
  twoStep?: boolean;
  timeout?: number;
  checkAfter?: boolean;
}

// Union of all operation types
type Operation = 
  | SleepOperation
  | RunOperation<any[], any>
  | CheckUntilOperation<any[], any>
  | RequireCheckOperation
  | MouseMoveOperation
  | ClickOperation
  | MouseButtonOperation
  | JitterOperation
  | KeyOperation
  | TypeOperation;

// Element rectangle interface
interface ElementAndBrowserRect {
  rect: Rect;
  window: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// Extend Window interface for Firefox-specific properties and custom properties
interface ClickInfo {
  registered: boolean;
  success?: boolean;
  error: string | null;
  wrongClickMessage?: string;
}

// Custom error class with error code
class ErrorWithCode extends Error {
  errorCode?: string;
  
  constructor(message: string, errorCode?: string) {
    super(message);
    this.name = 'ErrorWithCode';
    this.errorCode = errorCode;
  }
}

declare global {
  interface Window {
    mozInnerScreenX: number;
    mozInnerScreenY: number;
    clickInfo: ClickInfo;
    selectedEl: Element | null;
    handlerActive: boolean;
  }
}

const _sleep = function(time: number): Promise<void> {
  return new Promise(function(resolve) {
    setTimeout(resolve, time);
  });
};

const _waitForDOM = async function(page: XWebDriver, timeout: number): Promise<void> {
  let expires = Date.now() + timeout;

  if (!(page && page.executeScript)) { return; }

  const getReadyState = async (): Promise<string> => {
    try {
      const readyState = await page.executeScript(function() {
        return document.readyState;
      });
      return readyState;
    } catch (e: any) {
      // this error is thrown when a tab is closed
      // so we ignore it
      if (e.name === 'NoSuchWindowError') {
        return 'complete';
      } else {
        throw e;
      }
    }
  };

  return new Promise<void>(async (resolve, reject) => {
    while (Date.now() < expires) {
      if (await getReadyState() === 'complete') {
        return resolve();
      }
      await _sleep(20);
    }
    reject('Timed out while waiting for the dom to load');
  });
};

const _waitForClickAction = async function(page: XWebDriver, timeout: number): Promise<null> {
  let expires = Date.now() + timeout;

  return new Promise<null>(async (resolve, reject) => {
    let clickInfo: ClickInfo | undefined;
    while (Date.now() < expires) {
      clickInfo = await page.executeScript(function() {
        return window.clickInfo;
      });
      if (!clickInfo || clickInfo.registered) { break; }
      await _sleep(50);
    }
    if (!clickInfo) {
      resolve(null);
      return;
    }
    if (!clickInfo.registered) {
      reject(new ErrorWithCode(
        'Timed out while waiting for click to be registered.',
        'click.timeOut'
      ));
      return;
    }

    if (clickInfo.registered && !clickInfo.success) {
      reject(new Error(clickInfo.wrongClickMessage || 'Unknown click error'));
    }

    if (clickInfo.error) {
      reject(new ErrorWithCode(
        clickInfo.error,
        'click.wrongElement'
      ));
      return;
    }

    resolve(null);
  });
};

interface ElementInfo {
  classes: DOMTokenList;
  tagName: string;
  id: string;
  dataTest: string | null;
}

const _addClickHandler = async function(page: XWebDriver, selector: Selector, eventType: string): Promise<void> {
  await page.executeScript(function(_selector: Selector, _eventType: string) {
    console.log('starting to add click handler');
    window.selectedEl = Array.isArray(_selector) ? (
      document.querySelectorAll(_selector[0])[_selector[1] as number]
    ) : document.querySelector(_selector as string);

    window.clickInfo = {
      registered: false,
      error: null
    };

    const listenerOptions = {once: true, capture: true};

    if (!window.selectedEl) {
      window.clickInfo.error = `Tried to click, but element not found by selector ${
        _selector
      }.`;
    } else {
      const onClick = () => {
        window.clickInfo.success = true;
        window.selectedEl!.removeEventListener(_eventType, onClick, listenerOptions);
      };

      window.selectedEl.addEventListener(_eventType, onClick, listenerOptions);
    }

    const documentClickHandler = (event: Event) => {
      window.handlerActive = false;
      window.clickInfo.error = null;

      const mouseEvent = event as MouseEvent;
      if (![0, 1, 2].includes(mouseEvent.button)) { return; }

      window.clickInfo.registered = true;

      const {target} = event;

      const _getAncestry = function(el: Element): ElementInfo[] {
        let ancestry: ElementInfo[] = [{
          classes: el.classList,
          tagName: el.tagName,
          id: el.id,
          dataTest: el.getAttribute('data-test')
        }];
        let currentEl = el.parentNode as Element;
        while (currentEl && currentEl.parentNode) {
          ancestry.push({
            classes: currentEl.classList,
            tagName: currentEl.tagName,
            id: currentEl.id,
            dataTest: currentEl.getAttribute('data-test')
          });
          currentEl = currentEl.parentNode as Element;
        }
        return ancestry.reverse();
      };
      
      let ancestry: ElementInfo[] = [];
      try {
        ancestry = _getAncestry(target as Element);
      } catch (e) {
        console.error(e);
      }

      let genericMessage = (
          'The clicked element has the following ancestor tree: \n'
      );

      ancestry.forEach(el => {
        genericMessage += (
          'tagName: "' + el.tagName + '" ' +
          'id: "' + el.id + '" ' +
          'data-test: "' + el.dataTest + '" ' +
          'classes: "' + el.classes + '" >\n'
        );
      });

      const errorMsg = (
        'Selector ' + _selector + ' does not match the clicked element. ' +
          'This may be caused by (1) the element changing position (e.g ' +
          'due to an animation) or (2) another element covering up the target ' +
          'element. Please review screenshots and ensure that the cursor is at the ' +
          'correct position. '
      );

      window.clickInfo.wrongClickMessage = (errorMsg + genericMessage);

      document.removeEventListener(_eventType, documentClickHandler, listenerOptions);
    };

    document.addEventListener(_eventType, documentClickHandler, listenerOptions);
    console.log('finished adding click handler');
    window.handlerActive = true;
  }, selector, eventType);
};

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const _getElementAndBrowserRect = async function(page: XWebDriver, selector: Selector): Promise<ElementAndBrowserRect> {
  return await page.executeScript(function(_selector: Selector) {
    const intersectRects = function(a: Rect, b: Rect): Rect | null {
      if (a.x > b.x + b.width ||
          b.x > a.x + a.width ||
          a.y > b.y + b.height ||
          b.y > a.y + a.height) {
        return null;
      }
      const x = Math.max(a.x, b.x);
      const y = Math.max(a.y, b.y);
      return {
        x: x,
        y: y,
        width: Math.min(a.x + a.width, b.x + b.width) - x,
        height: Math.min(a.y + a.height, b.y + b.height) - y,
      };
    };
    
    const getElementVisibleBoundingRect = function(element: Element): Rect {
      let rect = element.getBoundingClientRect() as Rect;
      let currElement: Element | null = element;
      while (currElement.parentElement) {
        currElement = currElement.parentElement;
        const style = window.getComputedStyle(currElement);
        const overflow = style.overflow + style.overflowX + style.overflowY;
        if (style.position === 'fixed') {
          break;
        }
        if (/auto|scroll|hidden/.test(overflow)) {
          const intersect = intersectRects(rect, currElement.getBoundingClientRect() as Rect);
          if (!intersect) {
            return {
              x: 1000000,
              y: 1000000,
              width: 0,
              height: 0,
            };
          }
          rect = intersect;
        }
      }
      return rect;
    };

    const checkIfInFrame = function(element: Element): void {
      if (element.ownerDocument !== document) {
        throw new Error(
          'Frame elements not allowed within autoclick/mousemove ' +
          'without switching to frame.'
        );
      }
      if (element.tagName === 'IFRAME') {
        throw new Error(
          'It is prohibited to click iFrames directly. Please, ' +
            'switch into the iFrame and click the desired element ' +
            'from within it.'
        );
      }
    };

    let element: any;
    let result: Rect;

    if (Array.isArray(_selector)) {
      element = document.querySelectorAll(_selector[0]);
      if (!element || element.length === 0) {
        throw new Error(`Element selector "${_selector[0]}" not found`);
      }
      result = getElementVisibleBoundingRect(element[0]);
      for (let i = 1; i < _selector.length; ++i) {
        if (Number.isInteger(_selector[i] as number)) {
          element = element[_selector[i] as number];
          checkIfInFrame(element);
          result = getElementVisibleBoundingRect(element);
        } else {
          const subDoc =
              element.contentDocument || element.contentWindow.document;
          element = subDoc.querySelectorAll(_selector[i] as string);
          if (!element || element.length === 0) {
            throw new Error(`Element selector "${_selector[i]}" not found`);
          }
          checkIfInFrame(element[0]);
          const subResult = getElementVisibleBoundingRect(element[0]);
          result = {
            x: result.x + subResult.x,
            y: result.y + subResult.y,
            width: subResult.width,
            height: subResult.height,
          };
        }
      }
    } else {
      element = document.querySelector(_selector as string);
      if (!element) {
        throw new Error(`Element selector "${_selector}" not found`);
      }
      checkIfInFrame(element);
      result = getElementVisibleBoundingRect(element);
    }

    return {
      rect: result,
      window: {
        x: window.mozInnerScreenX,
        y: window.mozInnerScreenY,
        width: window.innerWidth,
        height: window.innerHeight,
      }
    };
  }, selector);
};

const _getElementAndBrowserScreenRect = async function(page: XWebDriver, selector: Selector): Promise<ElementAndBrowserRect> {
  let ret = await _getElementAndBrowserRect(page, selector);
  return page.executeScript(function(_ret: ElementAndBrowserRect) {
    _ret.rect.x += window.mozInnerScreenX;
    _ret.rect.y += window.mozInnerScreenY;
    return _ret;
  }, ret);
};

const waitUntilElementIsAvailable = async function(page: XWebDriver, selector: Selector, timeout: number): Promise<boolean> {
  const startTime = Date.now();
  let curTime = Date.now();
  let element: any = null;

  while (curTime - startTime <= timeout) {
    element = await page.executeScript(function(_selector: Selector) {
      let elem = null;
      if (Array.isArray(_selector)) {
        elem = document.querySelectorAll(_selector[0]);
      }
      else {
        elem = document.querySelector(_selector as string);
      }
      return elem;
    }, selector);
    if (element !== null) {
      break;
    }
    await _sleep(50);
    curTime = Date.now();
  }
  if (element) {
    return true;
  }
  throw new Error(
    'Timed out while waiting for element ' +
    'to become available.'
  );
};

const centerize = function(rect: Rect): AbsolutePosition {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
};

const topleftize = function(rect: Rect): AbsolutePosition {
  return {
    x: rect.x + 1,
    y: rect.y + 1,
  };
};

const toprightize = function(rect: Rect): AbsolutePosition {
  return {
    x: rect.x + rect.width - 17,
    y: rect.y + 1,
  };
};

const bottomleftize = function(rect: Rect): AbsolutePosition {
  return {
    x: rect.x + 1,
    y: rect.y + rect.height - 17,
  };
};

const bottomrightize = function(rect: Rect): AbsolutePosition {
  return {
    // -15 in order to avoid scrollbars and resize scrubbers on textareas
    x: rect.x + rect.width - 17,
    y: rect.y + rect.height - 17,
  };
};

const RELATIVE_POSITION_MAPPING: Record<string, (rect: Rect) => AbsolutePosition> = {
  center: centerize,
  topleft: topleftize,
  topright: toprightize,
  bottomleft: bottomleftize,
  bottomright: bottomrightize,
};

const MOUSE_BUTTON_MAPPING: Record<string, number> = {
  left: 1,
  middle: 2,
  right: 3,
  wheelup: 4,
  wheeldown: 5,
};

// Global variables
let lastWindow: string | null = null;

class _Xdotoolify {
  page: XWebDriver;
  requireCheckImmediatelyAfter: boolean;
  level: number;
  xWindowId: string;
  operations: Operation[];
  defaultTimeout: number;

  constructor(page: XWebDriver, xjsLastPos?: AbsolutePosition) {
    this.page = page;
    this.requireCheckImmediatelyAfter = false;
    this.level = 0;
    this.xWindowId = childProcess.execSync(
      'xdotool getactivewindow'
    ).toString('utf8').trim();
    childProcess.execSync('xdotool windowmove ' + this.xWindowId + ' 0 0');
    this.operations = [];
    
    // Initialize xjsLastPos on the page
    this.page.xjsLastPos = xjsLastPos || {
      x: 0,
      y: 0,
    };
    
    this.defaultTimeout = 1000;
  }
  _addOperation(op: Operation): void {
    op.error = new Error(
      'The above error happened when executing xdotoolify operation ' + op.type
    );
    this.operations.push(op);
  }
  sleep(ms: number): this {
    this._addOperation({
      type: 'sleep',
      ms: ms,
    });
    return this;
  }
  run<P extends any[], R>(
    f: XPageFunction<P, R> | XNoPageFunction<P, R>,
    ...rest: [...P]
  ): this {
    this._addOperation({
      type: 'run',
      func: f,
      args: rest as P,
    });
    return this;
  }
  checkUntil<P extends any[], R>(
    f: XPageFunction<P, R> | XNoPageFunction<P, R>,
    ...rest: [...P, ((result: Await<R> extends DebuggableResult<infer T> ? T : Await<R>) => any) | (Await<R> extends DebuggableResult<infer T> ? T : Await<R>)]
  ): this {
    // .checkUntil(myFunc, x => expect(x).toBe(5))
    // .checkUntil(myFunc, x => x == 5)
    // .checkUntil(myFunc, 5)
    this._addOperation({
      type: 'checkUntil',
      func: f,
      args: rest.slice(0, rest.length - 1) as P,
      callbackOrExpectedValue: rest[rest.length - 1],
    });
    return this;
  }
  addRequireCheckImmediatelyAfter(): this {
    this._addOperation({
      type: 'addCheckRequirement'
    });
    return this;
  }

  // internal versions of interaction functions do not
  // check for the presence of checkUntil after them
  // by default
  _mousemove(
    selector: Selector | Position,
    relpos?: string,
    options: MouseMoveOptions = {}
  ): this {
    relpos = relpos || 'center';
    if (!RELATIVE_POSITION_MAPPING[relpos.toLowerCase()]) {
      throw new Error('Unknown relative position ' + relpos);
    }
    this._addOperation({
      type: 'mousemove',
      selector: selector,
      relpos: relpos.toLowerCase(),
      twoStep: options.twoStep || false,
      timeout: options.timeout || this.defaultTimeout,
      checkAfter: options.checkAfter || false,
    });
    return this;
  }

  mousemove(
    selector: Selector | Position,
    relpos?: string,
    twoStep?: boolean,
    timeout?: number,
  ): this {
    return this._mousemove(
      selector,
      relpos,
      {
        twoStep,
        timeout,
        checkAfter: true,
      }
    );
  }
  _click(
    mouseButton = 'left',
    checkAfter = false,
    selector?: Selector
  ): this {
    if (!MOUSE_BUTTON_MAPPING[mouseButton.toLowerCase()]) {
      throw new Error('Unknown mouse button ' + mouseButton);
    }
    this._addOperation({
      type: 'click',
      mouseButton: MOUSE_BUTTON_MAPPING[mouseButton.toLowerCase()],
      checkAfter: checkAfter,
      selector: selector
    });
    return this;
  }

  click(mouseButton = 'left'): this {
    return this._click(
      mouseButton,
      true
    );
  }
  _mousedown(mouseButton?: string, checkAfter = false): this {
    mouseButton = mouseButton || 'left';
    if (!MOUSE_BUTTON_MAPPING[mouseButton.toLowerCase()]) {
      throw new Error('Unknown mouse button ' + mouseButton);
    }
    this._addOperation({
      type: 'mousedown',
      mouseButton: MOUSE_BUTTON_MAPPING[mouseButton.toLowerCase()],
      checkAfter: checkAfter
    });
    return this;
  }

  mousedown(mouseButton?: string): this {
    return this._mousedown(
      mouseButton,
      true
    );
  }

  _mouseup(mouseButton?: string, checkAfter = false): this {
    mouseButton = mouseButton || 'left';
    if (!MOUSE_BUTTON_MAPPING[mouseButton.toLowerCase()]) {
      throw new Error('Unknown mouse button ' + mouseButton);
    }
    this._addOperation({
      type: 'mouseup',
      mouseButton: MOUSE_BUTTON_MAPPING[mouseButton.toLowerCase()],
      checkAfter: checkAfter
    });
    return this;
  }

  mouseup(mouseButton?: string): this {
    return this._mouseup(mouseButton, true);
  }
  _jitter(): this {
    this._addOperation({
      type: 'jitter'
    });
    return this;
  }

  jitter(): this {
    return this._jitter();
  }
  _wheeldown(checkAfter = false): this {
    // In Firefox, if a scroll is done on one element, and then the mouse
    // hovers on another element while still scrolling, there is a short
    // period of time where continued scrolls will apply to the initially
    // scrolled element rather than the new one. This can sometimes affect
    // tests that do scrolls too quickly on multiple different elements. A
    // jitter of the mouse forces Firefox to apply the next scroll to the
    // newly hovered element immediately, and since this is almost always
    // the expected behavior in tests, you should usually use `scrollWithJitter`.

    this._jitter();
    this._click('wheeldown', checkAfter);
    return this;
  }

  wheeldown(): this {
    return this._wheeldown(true);
  }

  _wheelup(checkAfter = false): this {
    this._jitter();
    this._click('wheelup', checkAfter);
    return this;
  }

  wheelup(): this {
    return this._wheelup(true);
  }

  _drag(
    selector: Selector | Position,
    mouseButton?: string,
    timeout?: number,
    checkAfter = false
  ): this {
    this._mousedown(mouseButton);
    this._mousemove(selector, 'center', { twoStep: true, timeout: timeout || this.defaultTimeout });
    this._mouseup(mouseButton, checkAfter);
    return this;
  }

  drag(
    selector: Selector | Position,
    mouseButton?: string,
    timeout?: number
  ): this {
    return this._drag(
      selector,
      mouseButton,
      timeout,
      true
    );
  }
  _key(key: string, checkAfter = false): this {
    this._addOperation({
      type: 'key',
      key: key,
      checkAfter: checkAfter
    });
    return this;
  }

  key(key: string): this {
    return this._key(key, true);
  }

  _type(text: string, checkAfter = false): this {
    this._addOperation({
      type: 'type',
      text: text,
      checkAfter: checkAfter
    });
    return this;
  }

  type(text: string): this {
    return this._type(text, true);
  }


  async do({unsafe = false} = {}): Promise<void> {
    if (unsafe) {
      throw new Error('Unsafe do() calls are no longer supported.');
    }
    this.level += 1;
    try {
      var commandArr: string[] = [];
      let operations = this.operations;
      this.operations = [];
      for (var i = 0; i < operations.length; ++i) {
        var op = operations[i];

        try {
          if (
            this.requireCheckImmediatelyAfter &&
            op.type !== 'checkUntil' &&
            op.type !== 'addCheckRequirement'
          ) {
            throw new Error(
              'Missing checkUntil after running ' +
              '\'requireCheckImmediatelyAfter\'.'
            );
          }


          if (op.type === 'sleep') {
            await this._do(commandArr.join(' '));
            commandArr = [];
            await _sleep(op.ms!);
          } else if (op.type === 'addCheckRequirement') {
            this.requireCheckImmediatelyAfter = true;
          } else if (op.type === 'run' || op.type === 'checkUntil') {
            // Narrow the type to RunOperation or CheckOperation, preserving the generic type parameters
            const runOrCheckOp = op.type === 'run' 
              ? op as RunOperation<any[], any>
              : op as CheckUntilOperation<any[], any>;
            
            if (
              op.type === 'checkUntil' &&
              this.requireCheckImmediatelyAfter
            ) {
              this.requireCheckImmediatelyAfter = false;
            }
            await this._do(commandArr.join(' '));
            commandArr = [];
            
            // This is a JavaScript-only code path, never hit in TypeScript
            if (runOrCheckOp.func && !('_xdotoolifyWithPage' in runOrCheckOp.func)) {
              // Use type assertion to tell TypeScript this is for JS codebases
              const jsFunc = runOrCheckOp.func as unknown as { name: string, toString: () => string };
              const funcName = jsFunc.name || 'anonymous';
              let idMsg = null;
              if (funcName === 'anonymous') {
                idMsg = '\nPrinting the function definition for ' +
                    'identification since it is anonymous:' +
                    '\n' + jsFunc.toString() + '\n';
              } else {
                idMsg = '\nPrinting the function name for identification: ' +
                    funcName;
              }
              throw new Error(
                'Before calling run() or check() on a function, you must call ' +
                'Xdotoolify.setupWithPage(f) or Xdotoolify.setupWithoutPage(f) ' +
                'to initialize the function for Xdotoolify usage.' +
                idMsg
              );
            }
            
            // Type debugging - Remove these lines when done debugging
            // let blah: 'asdf' = runOrCheckOp.func;
            // let alah: 'asdf' = runOrCheckOp;
            
            let run = async (ignoreCallbackError: boolean) => {
              // Type debugging - Remove this line when done debugging
              // let asdf: 'asdf' = runOrCheckOp.args;
              
              let ret: ReturnType<typeof runOrCheckOp.func>;
              if (runOrCheckOp.func._xdotoolifyWithPage) {
                ret = await runOrCheckOp.func(this.page, ...runOrCheckOp.args);
              } else {
                ret = await runOrCheckOp.func(...runOrCheckOp.args);
              }
              
              // Only check operations have callbackOrExpectedValue
              if (op.type === 'checkUntil') {
                const checkOp = runOrCheckOp as CheckUntilOperation;
                if (typeof checkOp.callbackOrExpectedValue === 'object' && 
                    checkOp.callbackOrExpectedValue !== null && 
                    'then' in checkOp.callbackOrExpectedValue) {
                  throw new Error(
                    'Check callbacks should be synchronous. ' +
                        'Use multiple check() calls instead.'
                  );
                }
                try {
                  const value = ret instanceof DebuggableResult ? ret.value : ret;
                  
                  if (typeof checkOp.callbackOrExpectedValue === 'function') {
                    return [ret, checkOp.callbackOrExpectedValue(value)];
                  } else {
                    return [ret, value === checkOp.callbackOrExpectedValue];
                  }
                } catch (e: any) {
                  if (ignoreCallbackError) {
                    return [ret, e];
                  } else {
                    let retJSON;

                    try {
                      retJSON = JSON.stringify(ret);
                    } catch (e) {
                      retJSON = e;
                    }

                    e.message += '\nValue being checked: ' + retJSON;
                    throw e;
                  }
                }
              }
              return [ret, undefined];
            };
            
            if (op.type === 'checkUntil') {
              const checkOp = runOrCheckOp as CheckUntilOperation;
              let expires = Date.now() + Xdotoolify.defaultCheckUntilTimeout;
              
              while (true) {
                let [result, errorOrCheck] = await run(true);
                if (!(errorOrCheck instanceof Error) &&
                    (errorOrCheck === true || errorOrCheck === undefined)) {
                  // ^ this allows both:
                  // 1. x => x == 5
                  // 2. x => expect(x).toBe(5)
                  // to be used as the callback
                  break;
                }
                if (Date.now() > expires) {
                  let msg = 'The above error happened because ' +
                      'checkUntil timed out for ' + checkOp.func.name;
                  
                  const isDebuggable = result instanceof DebuggableResult;
                  const actualValue = isDebuggable ? (result as DebuggableResult<any>).value : result;
                  const debugInfo = isDebuggable ? (result as DebuggableResult<any>).debugInfo : null;
                  
                  if (errorOrCheck instanceof Error) {
                    let retJSON;
                    try {
                      retJSON = JSON.stringify(isDebuggable ? actualValue : result);
                    } catch (e) {
                      retJSON = e;
                    }
                    
                    errorOrCheck.message += '\nValue being checked: ' + retJSON;
                    
                    if (isDebuggable && debugInfo) {
                      try {
                        const debugInfoStr = JSON.stringify(debugInfo);
                        errorOrCheck.message += '\nDebug info: ' + debugInfoStr;
                      } catch (e) {
                        errorOrCheck.message += '\nDebug info: [Cannot stringify debug info]';
                      }
                    }
                    
                    errorOrCheck.stack += '\n' + msg;
                    throw errorOrCheck;
                  } else {
                    try {
                      let errorMsg = 'Expected ' + JSON.stringify(isDebuggable ? actualValue : result) +
                        ' to be ' + String(checkOp.callbackOrExpectedValue);
                      
                      const error = new Error(errorMsg);
                      
                      if (isDebuggable && debugInfo) {
                        try {
                          const debugInfoStr = JSON.stringify(debugInfo);
                          error.message += '\nDebug info: ' + debugInfoStr;
                        } catch (e) {
                          error.message += '\nDebug info: [Cannot stringify debug info]';
                        }
                      }
                      
                      error.stack += '\n' + msg;
                      throw error;
                    } catch (e: any) {
                      throw e;
                    }
                  }
                }
                await _sleep(100);
              }
            } else {
              await run(false);
              if (op.type === 'run' && this.operations.length > 0) {
                throw new Error('You forgot to add ".do() "' +
                  'at the end of a subcommand.');
              }
            }
          } else {
            let nextOp = null;
            if (i < operations.length - 1) {
              nextOp = operations[i+1];
            }
            if (
              op.checkAfter && (!nextOp ||
              !['checkUntil', 'addCheckRequirement'].includes(nextOp.type))
            ) {
              throw new Error('Missing checkUntil after interaction.');
            }
          }
          if (op.type === 'jitter') {
            const pos = {
              x: this.page.xjsLastPos.x,
              y: this.page.xjsLastPos.y,
            };
            commandArr.push(`mousemove --sync ${
              pos.x > 0 ?  pos.x - 1 : pos.x + 1
            } ${pos.y}`);
            commandArr.push(`mousemove --sync ${pos.x} ${pos.y}`);
            await this._do(commandArr.join(' '));
            await _sleep(50);
            commandArr = [];
          }
          if (op.type === 'mousemove') {
            await this._do(commandArr.join(' '));
            commandArr = [];

            var pos = op.selector as AbsolutePosition;
            if (typeof op.selector === 'string' || Array.isArray(op.selector)) {
              let timeout = (op as MouseMoveOperation).timeout || this.defaultTimeout;
              if (timeout) {
                await waitUntilElementIsAvailable(this.page, op.selector as Selector, timeout);
              }
              var ret = await _getElementAndBrowserScreenRect(
                this.page, op.selector as Selector
              );
              pos = RELATIVE_POSITION_MAPPING[(op as MouseMoveOperation).relpos](ret.rect);
              if (pos.x < ret.window.x ||
                  pos.x > ret.window.x + ret.window.width ||
                  pos.y < ret.window.y ||
                  pos.y > ret.window.y + ret.window.height) {
                throw new Error(
                  'The pos for ' +
                  op.selector +
                  ' ended up outside of window. ' +
                  JSON.stringify(pos) +
                  ' was not inside ' +
                  JSON.stringify(ret.window)
                );
              }
            } else if (
              (op.selector as ScreenPosition).screenx ||
              (op.selector as ScreenPosition).screeny
            ) {
              pos = {
                x: (op.selector as ScreenPosition).screenx!,
                y: (op.selector as ScreenPosition).screeny!,
              };
            } else if (
              (op.selector as RelativePosition).relx !== undefined ||
              (op.selector as RelativePosition).rely !== undefined
            ) {
              const relPos = op.selector as RelativePosition;
              pos = {
                x: this.page.xjsLastPos.x + (relPos.relx || 0),
                y: this.page.xjsLastPos.y + (relPos.rely || 0),
              };
            } else {
              pos = await this.page.executeScript(function(_pos: AbsolutePosition) {
                return {
                  x: _pos.x + window.mozInnerScreenX,
                  y: _pos.y + window.mozInnerScreenY,
                };
              }, pos);
            }
            // We always add jitter because Firefox does not work correctly
            // in some cases if the mouse has not moved at all from the
            // previous operation.
            commandArr.push(`mousemove --sync ${
              pos.x > 0 ?  pos.x - 1 : pos.x + 1
            } ${pos.y}`);
            commandArr.push(`mousemove --sync ${pos.x} ${pos.y}`);
            await this._do(commandArr.join(' '));
            await _sleep(50);
            commandArr = [];
            this.page.xjsLastPos.x = pos.x;
            this.page.xjsLastPos.y = pos.y;
          } else if (op.type === 'click') {
            if (
              [1, 2, 3].includes((op as ClickOperation).mouseButton) &&
              (op as ClickOperation).selector &&
              (Array.isArray((op as ClickOperation).selector) || typeof (op as ClickOperation).selector === 'string')
            ) {
              // clean up previous commands
              await this._do(commandArr.join(' '));
              await _sleep(50);
              commandArr = [];

              try {
                await this.page.executeScript(() => console.log('adding click handler'));
                const eventType = (op as ClickOperation).mouseButton === 3 ? 'contextmenu' : 'click';
                await _addClickHandler(this.page, (op as ClickOperation).selector as Selector, eventType);
                await this.page.executeScript(() => console.log('click handler added'));
              } catch (e: any) {
                throw new Error(e.toString());
              }
              commandArr.push(`click ${(op as ClickOperation).mouseButton}`);
              await this._do(commandArr.join(' '));
              try {
                // TO DO: It seems that Firefox sometimes swallows clicks
                // when passing from one textarea to another. This needs
                // to be investigated. For now, it suffices to alert
                // in the case of these "missed clicks" in case that
                // they correspond to actual failures.
                await _waitForClickAction(this.page, (Xdotoolify as any).defaultCheckUntilTimeout);
              } catch (e: any) {
                if (e.errorCode === 'click.timeOut') {
                  console.warn(
                    'Click was not registered. Not necessarily a failure ' +
                    'unless it is accompanied by one.'
                  );
                } else {
                  throw e;
                }
              }
              await _sleep(50);
              commandArr = [];
            } else {
              commandArr.push(`click ${(op as ClickOperation).mouseButton}`);
            }
          } else if (op.type === 'mousedown') {
            if (
              [1, 2, 3].includes((op as MouseButtonOperation).mouseButton) &&
              (op as any).selector &&
              (Array.isArray((op as any).selector) || typeof (op as any).selector === 'string')
            ) {
              // clean up previous commands
              await this._do(commandArr.join(' '));
              await _sleep(50);
              commandArr = [];

              try {
                const eventType = (op as MouseButtonOperation).mouseButton === 3 ? 'contextmenu' : 'mousedown';
                await _addClickHandler(this.page, (op as any).selector, eventType);
              } catch (e: any) {
                throw new Error(e.toString());
              }
              commandArr.push(`mousedown ${(op as MouseButtonOperation).mouseButton}`);
              await this._do(commandArr.join(' '));
              try {
                await _waitForClickAction(this.page, (Xdotoolify as any).defaultCheckUntilTimeout);
              } catch (e: any) {
                if (e.errorCode === 'click.timeOut') {
                  console.warn(
                    'Click was not registered. Not necessarily a failure ' +
                    'unless it is accompanied by one.'
                  );
                } else {
                  throw e;
                }
              }
              await _sleep(50);
              commandArr = [];
            } else {
              commandArr.push(`mousedown ${(op as MouseButtonOperation).mouseButton}`);
            }
          } else if (op.type === 'mouseup') {
            commandArr.push(`mouseup ${(op as MouseButtonOperation).mouseButton}`);
          } else if (op.type === 'key') {
            commandArr.push(`key ${(op as KeyOperation).key}`);
          } else if (op.type === 'type') {
            commandArr.push(`type ${JSON.stringify((op as TypeOperation).text)}`);
            await this._do(commandArr.join(' '));
            commandArr = [];
          }
        } catch (e: any) {
          // HACK: because the operations are all chained up first, and then
          // only executed when do() is called, we get really crappy stack
          // traces. So here, we save the stack trace from when it was chained
          // and add it on to the trace to make it obvious what caused the error
          if (op.error) {
            e.stack += '\n' + op.error.stack;
          }
          throw e;
        }
      }
      if (commandArr.length) {
        await this._do(commandArr.join(' '));
      }
      this.level -= 1;
      if (this.level === 0 && this.requireCheckImmediatelyAfter) {
        throw new Error(
          'Missing checkUntil after running ' +
          '\'requireCheckImmediatelyAfter\'.'
        );
      }
    } finally {
      await _sleep(50);
    }
  }

  async focus(): Promise<void> {
    if (lastWindow !== this.xWindowId) {
      childProcess.execSync('xdotool windowraise ' + this.xWindowId);
      childProcess.execSync('xdotool windowfocus ' + this.xWindowId);
      lastWindow = this.xWindowId;
      await _sleep(500);
    }
  }

  async verify(): Promise<void> {
    if (this.operations.length > 0) {
      throw new Error('You forgot to call do() on some xdotoolify operation');
    }
  }

  async _do(command: string): Promise<void> {
    await this.focus();
    await _waitForDOM(this.page, (Xdotoolify as any).defaultCheckUntilTimeout); 
    if (command) {
      await this.page.executeScript(() => console.log('clicking'));
      //console.log('command is ' + command);
      childProcess.execSync('xdotool ' + command);
    }
  }
}

class DebuggableResult<T> {
  value: T;
  debugInfo: any;

  constructor(value: T, debugInfo: any) {
    this.value = value;
    this.debugInfo = debugInfo;
  }
}

interface XdotoolifyFunction {
  (page: WebDriver, xjsLastPos?: AbsolutePosition): XWebDriver;
  defaultCheckUntilTimeout: number;
  setupWithPage: <P extends any[], R> (f: PageFunction<P, R>) => XPageFunction<P, R>;
  setupWithoutPage: <P extends any[], R> (f: NoPageFunction<P, R>) => XNoPageFunction<P, R>;
  DebuggableResult: typeof DebuggableResult;
}

const Xdotoolify = function(page: WebDriver, xjsLastPos?: AbsolutePosition): XWebDriver {
  const pageWithX = page as XWebDriver;
  pageWithX.X = new _Xdotoolify(pageWithX, xjsLastPos);
  return pageWithX;
} as XdotoolifyFunction;


Xdotoolify.defaultCheckUntilTimeout = 3000;

// setupWithPage expects a function taking a WebDriver as first param and returns a XPageFunction
Xdotoolify.setupWithPage = function<P extends any[], R>(
  f: PageFunction<P, R>
): XPageFunction<P, R> {
  (f as XPageFunction<P, R>)._xdotoolifyWithPage = true;
  return f as XPageFunction<P, R>;
};

// setupWithoutPage expects any function and returns a XNoPageFunction
Xdotoolify.setupWithoutPage = function<P extends any[], R>(
  f: NoPageFunction<P, R>
): XNoPageFunction<P, R> {
  (f as XNoPageFunction<P, R>)._xdotoolifyWithPage = false;
  return f as XNoPageFunction<P, R>;
};

Xdotoolify.DebuggableResult = DebuggableResult;



export default Xdotoolify;
