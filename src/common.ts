import Xdotoolify, { XWebDriver, Selector } from './xdotoolify';

export interface AutoTypeOptions {
  relpos?: string;
  timeout?: number;
  overwrite?: boolean;
}

export const evaluate = Xdotoolify.setupWithPage(async function<P extends any[], R>(
  page: XWebDriver,
  func: (...args: P) => R,
  ...args: P
): Promise<R> {
  try {
    const result = await page.executeScript(func, ...args);
    return result as R;
  } catch (e: unknown) {
    if (e instanceof Error) {
      e.stack += '\nThe above error occurred in the evaluate() func with args:\n' +
          [func, ...args].map(x => String(x)).join('\n');
    }
    throw e;
  }
}) as (<P extends any[], R>(page: XWebDriver, func: (...args: P) => R, ...args: P) => Promise<R>) & { _xdotoolifyWithPage: true };

export const elementCount = Xdotoolify.setupWithPage(function(page, selector: Selector) {
  return evaluate(page, function(_selector: Selector) {
    if (Array.isArray(_selector)) {
      return document.querySelectorAll(_selector[0]).length;
    } else {
      return document.querySelectorAll(_selector).length;
    }
  }, selector);
});

export interface VisibilityOptions {
  checkForOverlap?: boolean;
  allowZeroOpacity?: boolean;
  shouldAcceptZeroHeight?: boolean;
  shouldAcceptZeroWidth?: boolean;
}

interface ElementCountResult {
  numVisible: number;
  selector: string;
  debugArray: string[];
  totalElements: number;
}

export const visibleElementCount = Xdotoolify.setupWithPage(async (page, selector: string, options: VisibilityOptions = {}) => {
  const {
    checkForOverlap = false,
    allowZeroOpacity = false,
    shouldAcceptZeroHeight = true,
    shouldAcceptZeroWidth = true
  } = options;


  const result = await evaluate(page, function(
    _selector: string,
    _checkForOverlap: boolean,
    _shouldAcceptZeroWidth: boolean,
    _shouldAcceptZeroHeight: boolean,
    _allowZeroOpacity: boolean
  ) {
    const elems = document.querySelectorAll(_selector);
    let numVisible = elems.length;

    let debugArray = [];

    for (let i = 0; i < elems.length; i++) {
      const elem = elems[i];

      if (!elem) {
        numVisible = numVisible - 1;
        debugArray.push('no element');
        continue;
      }

      if (!(elem instanceof HTMLElement)) {
        throw Error(`elem for selector ${_selector} is not an HTML element.`);
      }

      if (elem.offsetParent === null) {
        debugArray.push('no offset parent');
        numVisible = numVisible - 1;
        continue;
      }

      const style = getComputedStyle(elem);

      if (!style) {
        debugArray.push('no computed style');
        numVisible = numVisible - 1;
        continue;
      }

      if (style.display === 'none') {
        debugArray.push('display was none');
        numVisible = numVisible - 1;
        continue;
      }

      if (style.visibility === 'hidden') {
        debugArray.push('visibility hidden');
        numVisible = numVisible - 1;
        continue;
      }

      const boundingClientRect = elem.getBoundingClientRect();

      const heightSum =
          elem.offsetHeight +
          boundingClientRect.height;

      const widthSum =
          boundingClientRect.width +
          elem.offsetWidth;

      if (heightSum + widthSum === 0) {
        debugArray.push(
          'offset sum 0' + ' - ' +
            elem.offsetHeight + ' - ' +
            elem.offsetWidth + ' - ' +
            JSON.stringify(elem.getBoundingClientRect())
        );
        numVisible = numVisible - 1;
        continue;
      }

      if (widthSum === 0 && !_shouldAcceptZeroWidth) {
        debugArray.push('zero width not accepted');
        numVisible = numVisible - 1;
        continue;
      }

      if (heightSum === 0 && !_shouldAcceptZeroHeight) {
        debugArray.push('zero height not accepted');
        numVisible = numVisible - 1;
        continue;
      }

      if (boundingClientRect.left + boundingClientRect.width < 0) {
        debugArray.push('out of bounds on the left');
        numVisible = numVisible - 1;
        continue;
      }

      if (boundingClientRect.left >
          (document.documentElement.clientWidth || window.innerWidth)) {

        debugArray.push('out of bounds on the right');
        numVisible = numVisible - 1;
        continue;
      }

      if (boundingClientRect.top + boundingClientRect.height < 0) {
        debugArray.push('out of bounds on the top');
        numVisible = numVisible - 1;
        continue;
      }

      if (boundingClientRect.top >
          (document.documentElement.clientHeight || window.innerHeight)) {

        debugArray.push('out of bounds on the bottom');
        numVisible = numVisible - 1;
        continue;
      }

      if (style.opacity === '0' && !_allowZeroOpacity) {
        debugArray.push('element has 0 opacity');
        numVisible = numVisible - 1;
        continue;
      }

      let parent = elem.parentElement;
      let parentOpacity;
      let parentVisibility;
      let parentDisplay;
      while (parent) {
        const parentStyles = getComputedStyle(parent);
        parentOpacity = parentStyles.opacity;
        parentVisibility = parentStyles.visibility;
        parentDisplay = parentStyles.display;

        if (parentOpacity === '0') {
          break;
        }
        if (parentVisibility === 'hidden') {
          break;
        }
        if (parentDisplay === 'none') {
          break;
        }

        parent = parent.parentElement;
      }

      if (parentOpacity === '0' && !_allowZeroOpacity) {
        debugArray.push('parent has 0 opacity');
        numVisible = numVisible - 1;
        continue;
      }

      if (parentVisibility === 'hidden') {
        debugArray.push('parent is hidden');
        numVisible = numVisible - 1;
        continue;
      }

      if (parentDisplay === 'none') {
        debugArray.push('parent has display: none');
        numVisible = numVisible - 1;
        continue;
      }

      if (_checkForOverlap) {
        let topEl = document.elementFromPoint(
          (boundingClientRect.left + boundingClientRect.width / 2),
          (boundingClientRect.top + boundingClientRect.height / 2),
        );

        if (
          topEl &&
          topEl.nodeName !== 'IFRAME' &&
          elem.nodeName !== 'IFRAME'
        ) {
          while (topEl !== null && !topEl.isSameNode(elem)) {
            topEl = topEl.parentNode as Element;
          }

          if (!topEl) {
            debugArray.push('element obscured by another');
            numVisible = numVisible - 1;
            continue;
          }
        }
      }
      debugArray.push('successfully visible');
    }

    return {
      numVisible,
      selector: _selector,
      debugArray,
      totalElements: elems.length
    };
  }, selector, checkForOverlap, shouldAcceptZeroWidth,
     shouldAcceptZeroHeight, allowZeroOpacity);
     
  return new Xdotoolify.DebuggableResult(result.numVisible, {
    selector: result.selector,
    debugArray: result.debugArray,
    totalElements: result.totalElements
  });
});

export const getInputValue = Xdotoolify.setupWithPage(async (page, selector: Selector) => {
  const value = await evaluate(page, (_selector: Selector) => {
    let input: HTMLInputElement | null;
    if (Array.isArray(_selector)) {
      const elements = document.querySelectorAll<HTMLInputElement>(_selector[0]);
      input = elements[_selector[1]] || null;
    } else {
      input = document.querySelector<HTMLInputElement>(_selector);
    }
    if (!input) return false;
    return input.value;
  }, selector);
  return value;
});

export const elementText = Xdotoolify.setupWithPage(function(page, selector: Selector) {
  return evaluate(page, function(_selector: Selector) {
    let elem: HTMLElement | null;
    if (Array.isArray(_selector)) {
      const elements = document.querySelectorAll<HTMLElement>(_selector[0]);
      elem = elements[_selector[1]] || null;
    } else {
      elem = document.querySelector<HTMLElement>(_selector);
    }
    return elem ? elem.innerText : null;
  }, selector);
});

export const isElementActive = Xdotoolify.setupWithPage(function(page, selector: Selector) {
  return evaluate(page, function(_selector: Selector) {
    let el: Element | null;
    if (Array.isArray(_selector)) {
      const elements = document.querySelectorAll(_selector[0]);
      el = elements[_selector[1]] || null;
    } else {
      el = document.querySelector(_selector);
    }
    return el && el === document.activeElement;
  }, selector);
});

export const isAllContentSelected = Xdotoolify.setupWithPage(function(page, selector: Selector) {
  return evaluate(page, (_selector: Selector) => {
    let el: Element | null;
    if (Array.isArray(_selector)) {
      const elements = document.querySelectorAll(_selector[0]);
      el = elements[_selector[1]] || null;
    } else {
      el = document.querySelector(_selector);
    }
    
    if (!el) {
      return false;
    }
    
    // https://stackoverflow.com/questions/20419515/window-getselection-of-textarea-not-working-in-firefox
    // https://bugzilla.mozilla.org/show_bug.cgi?id=85686
    if (el.tagName === 'INPUT') {
      const inputEl = el as HTMLInputElement;
      // input type number does not have seletion attributes
      if (inputEl.type === 'number') {
        return true;
      }
      // Firefox getSelection returns an empty string for inputs
      const selectionLenth = (inputEl.selectionEnd || 0) - (inputEl.selectionStart || 0);
      return selectionLenth === inputEl.value.length;
    }

    const selectionText = document.getSelection()?.toString() || '';
    return (el as HTMLElement).innerText === selectionText;
  }, selector);
});

export const autoClick = Xdotoolify.setupWithPage(function(
  page: XWebDriver,
  selector: Selector,
  options: { mouseButton?: string; timeout?: number } = {}
) {
  return page.X
    ._mousemove(
      selector,
      undefined,
      { timeout: options.timeout }
    )
    ._click(options.mouseButton, false, selector)
    .addRequireCheckImmediatelyAfter()
    .do();
});

export const autoDrag = Xdotoolify.setupWithPage(function(
  page: XWebDriver,
  sel1: Selector,
  sel2: Selector,
  options: { mouseButton?: string; timeout?: number } = {}
) {
  return page.X
    ._mousemove(
      sel1,
      'center',
      { timeout: options.timeout }
    )
    ._drag(sel2, options.mouseButton, options.timeout, false)
    .addRequireCheckImmediatelyAfter()
    .do();
});

export const autoKey = Xdotoolify.setupWithPage(function(
  page: XWebDriver,
  selector: Selector,
  key: string,
  options: { relpos?: string; timeout?: number } = {}
) {
  const relpos = options.relpos || 'bottomright';
  return page.X
    ._mousemove(
      selector,
      relpos,
      { timeout: options.timeout }
    )
    ._click('left')
    ._key(key, false)
    .addRequireCheckImmediatelyAfter()
    .do();
});

export const autoType = Xdotoolify.setupWithPage(async function(
  page: XWebDriver,
  selector: Selector,
  text: string,
  options: AutoTypeOptions = {}
) {
  const relpos = options.relpos || 'bottomright';
  const timeout = options.timeout;
  const overwrite = options.overwrite || false;
  
  await page.X
    ._mousemove(
      selector,
      relpos,
      { timeout }
    )
    ._click('left', false, selector)
    .do();
    
  if (overwrite) {
    await page.X
      ._key('ctrl+a')
      .checkUntil(isAllContentSelected, selector, true)
      ._key('BackSpace')
      .checkUntil(getInputValue, selector, '')
      .do();
  }
  
  const lines = text.toString().split('\n');
  let chain = page.X;
  for (let i = 0; i < lines.length; ++i) {
    if (i > 0) {
      chain = chain._key('Return');
    }
    if (i === lines.length - 1) {
      chain = chain._type(lines[i], false);
    } else {
      chain = chain._type(lines[i]);
    }
  }
  
  return chain.addRequireCheckImmediatelyAfter().do();
});

