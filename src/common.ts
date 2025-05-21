import Xdotoolify, { XWebDriver } from './xdotoolify';

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

export const elementCount = Xdotoolify.setupWithPage(function(page, selector: string) {
  return evaluate(page, function(_selector) {
    return document.querySelectorAll(_selector).length;
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

export const getInputValue = Xdotoolify.setupWithPage(async (page, selector: string) => {
  const value = await evaluate(page, (_selector: string) => {
    const input = document.querySelector<HTMLInputElement>(_selector);
    if (!input) return false;
    return input.value;
  }, selector);
  return value;
});

export const elementText = Xdotoolify.setupWithPage(function(page, selector: string) {
  return evaluate(page, function(_selector: string) {
    const elem = document.querySelector<HTMLElement>(_selector);
    return elem ? elem.innerText : null;
  }, selector);
});

