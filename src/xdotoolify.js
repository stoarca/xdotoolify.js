import childProcess from 'child_process';

var _getElementAndBrowserRect = async function(page, selector) {
  return await page.executeScript(function(_selector) {
    var intersectRects = function(a, b) {
      if (a.x > b.x + b.width ||
          b.x > a.x + a.width ||
          a.y > b.y + b.height ||
          b.y > a.y + a.height) {
        return null;
      }
      var x = Math.max(a.x, b.x);
      var y = Math.max(a.y, b.y);
      return {
        x: x,
        y: y,
        width: Math.min(a.x + a.width, b.x + b.width) - x,
        height: Math.min(a.y + a.height, b.y + b.height) - y,
      };
    }
    getElementVisibleBoundingRect = function(element) {
      var rect = element.getBoundingClientRect();
      while (element.parentElement) {
        element = element.parentElement;
        var style = window.getComputedStyle(element);
        var overflow = style.overflow + style.overflowX + style.overflowY;
        if (/auto|scroll|hidden/.test(overflow)) {
          rect = intersectRects(rect, element.getBoundingClientRect());
          if (!rect) {
            return {
              x: 1000000,
              y: 1000000,
              width: 0,
              height: 0,
            };
          }
        }
      }
      return rect;
    };
    if (Array.isArray(_selector)) {
      var element = document.querySelectorAll(_selector[0]);
      if (!element) {
        throw new Error(`Element selector "${_selector[0]}" not found`);
      }
      var result = getElementVisibleBoundingRect(element[0]);
      for (var i = 1; i < _selector.length; ++i) {
        if (Number.isInteger(_selector[i])) {
          element = element[_selector[i]];
          result = getElementVisibleBoundingRect(element);
        } else {
          var subDoc =
              element.contentDocument || element.contentWindow.document;
          element = subDoc.querySelectorAll(_selector[i]);
          if (!element) {
            throw new Error(`Element selector "${_selector[i]}" not found`);
          }
          var subResult = getElementVisibleBoundingRect(element[0]);
          result = {
            x: result.left + subResult.left,
            y: result.top + subResult.top,
            width: subResult.width,
            height: subResult.height,
          };
        }
      }
    } else {
      var element = document.querySelector(_selector);
      if (!element) {
        throw new Error(`Element selector "${_selector}" not found`);
      }
      var result = getElementVisibleBoundingRect(element);
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

var _getElementAndBrowserScreenRect = async function(page, selector) {
  let ret = await _getElementAndBrowserRect(page, selector);
  return page.executeScript(function(_ret) {
    _ret.rect.x += window.mozInnerScreenX;
    _ret.rect.y += window.mozInnerScreenY;
    return _ret;
  }, ret);
};

var waitUntilElementIsAvailable = async function(page, selector, timeout) {
  var startTime = Date.now();
  var curTime = Date.now();

  while (curTime - startTime <= timeout) {
    var element = await page.executeScript(function(_selector) {
      var elem = null;
      if (Array.isArray(_selector)) {
        elem = document.querySelectorAll(_selector[0]);
      }
      else {
        elem = document.querySelector(_selector);
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
  return false;
};

var _sleep = function(time) {
  return new Promise(function(resolve) {
    setTimeout(resolve, time);
  });
};

var centerize = function(rect) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
};
var topleftize = function(rect) {
  return {
    x: rect.x + 1,
    y: rect.y + 1,
  };
};
var toprightize = function(rect) {
  return {
    x: rect.x + rect.width - 17,
    y: rect.y + 1,
  };
};
var bottomleftize = function(rect) {
  return {
    x: rect.x + 1,
    y: rect.y + rect.height - 17,
  };
};
var bottomrightize = function(rect) {
  return {
    // -15 in order to avoid scrollbars and resize scrubbers on textareas
    x: rect.x + rect.width - 17,
    y: rect.y + rect.height - 17,
  };
};

var RELATIVE_POSITION_MAPPING = {
  center: centerize,
  topleft: topleftize,
  topright: toprightize,
  bottomleft: bottomleftize,
  bottomright: bottomrightize,
};

var MOUSE_BUTTON_MAPPING = {
  left: 1,
  middle: 2,
  right: 3,
  wheelup: 4,
  wheeldown: 5,
};

var _Xdotoolify = function(page) {
  this.page = page;
  this.xWindowId = childProcess.execSync(
    'xdotool getactivewindow'
  ).toString('utf8').trim();
  childProcess.execSync('xdotool windowmove ' + this.xWindowId + ' 0 0');
  this.operations = [];
  if (!page.xjsLastPos) {
    page.xjsLastPos = {
      x: 0,
      y: 0,
    };
  }
  this.defaultTimeout = 1000;
};
_Xdotoolify.prototype._addOperation = function(op) {
  op.error = new Error(
    'The above error happened when executing xdotoolify operation ' + op.type
  );
  this.operations.push(op);
};
_Xdotoolify.prototype.sleep = function(ms) {
  this._addOperation({
    type: 'sleep',
    ms: ms,
  });
  return this;
};
_Xdotoolify.prototype.run = function(f, ...rest) {
  this._addOperation({
    type: 'run',
    func: f,
    args: rest,
  });
  return this;
};
_Xdotoolify.prototype.check = function(f, ...rest) {
  this._addOperation({
    type: 'check',
    func: f,
    args: rest.slice(0, rest.length - 1),
    callback: rest[rest.length - 1],
  });
  return this;
};
_Xdotoolify.prototype.checkUntil = function(f, ...rest) {
  this._addOperation({
    type: 'check',
    func: f,
    args: rest.slice(0, rest.length - 2),
    callback: rest[rest.length - 2],
    until: true,
    value: rest[rest.length - 1],
  });
  return this;
};
_Xdotoolify.prototype.checkNothing = function() {
  let emptyFunc = Xdotoolify.setupWithPage((page) => { return true; });
  return this.checkUntil(
    emptyFunc,
    x => x,
    true
  );
};
// internal versions of interaction functions do not
// check for the presence of checkUntil after them
// by default
_Xdotoolify.prototype._mousemove = function(
  selector,
  relpos,
  twoStep,
  timeout,
  checkAfter = false
) {
  relpos = relpos || 'center';
  if (!RELATIVE_POSITION_MAPPING[relpos.toLowerCase()]) {
    throw new Error('Unknown relative position ' + relpos);
  }
  this._addOperation({
    type: 'mousemove',
    selector: selector,
    relpos: relpos.toLowerCase(),
    twoStep: twoStep || false,
    timeout: timeout || this.defaultTimeout,
    checkAfter: checkAfter
  });
  return this;
};
_Xdotoolify.prototype.mousemove = function(
  selector,
  relpos,
  twoStep,
  timeout
) {
  return this._mousemove(
    selector,
    relpos,
    twoStep,
    timeout,
    true
  )
};
_Xdotoolify.prototype._click = function(
  mouseButton='left',
  checkAfter = false
) {
  if (!MOUSE_BUTTON_MAPPING[mouseButton.toLowerCase()]) {
    throw new Error('Unknown mouse button ' + mouseButton);
  }
  this._addOperation({
    type: 'click',
    mouseButton: MOUSE_BUTTON_MAPPING[mouseButton.toLowerCase()],
    checkAfter: checkAfter
  });
  return this;
};
_Xdotoolify.prototype.click = function(mouseButton='left') {
  return this._click(
    mouseButton,
    true
  );
};
_Xdotoolify.prototype._mousedown = function(mouseButton, checkAfter = false) {
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
};
_Xdotoolify.prototype.mousedown = function(mouseButton) {
  return this._mousedown(
    mouseButton,
    true
  );
};
_Xdotoolify.prototype._mouseup = function(mouseButton, checkAfter = false) {
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
};
_Xdotoolify.prototype.mouseup = function(mouseButton) {
  return this._mouseup(mouseButton, true);
};
_Xdotoolify.prototype._wheeldown = function(checkAfter = false) {
  this._click('wheeldown', checkAfter);
  return this;
};
_Xdotoolify.prototype.wheeldown = function() {
  return this._wheeldown(true);
};
_Xdotoolify.prototype._wheelup = function(checkAfter = false) {
  this._click('wheelup', checkAfter);
  return this;
};
_Xdotoolify.prototype.wheelup = function() {
  return this._wheelup(true);
};
_Xdotoolify.prototype._drag = function(
  selector,
  mouseButton,
  timeout,
  checkAfter = false
) {
  this._mousedown(mouseButton);
  this._mousemove(selector, 'center', true, timeout || this.defaultTimeout);
  this._mouseup(mouseButton, checkAfter);
  return this;
};
_Xdotoolify.prototype.drag = function(
  selector,
  mouseButton,
  timeout
) {
  return this._drag(
    selector,
    mouseButton,
    timeout,
    true
  );
};
_Xdotoolify.prototype._key = function(key, checkAfter = false) {
  this._addOperation({
    type: 'key',
    key: key,
    checkAfter: checkAfter
  });
  return this;
};
_Xdotoolify.prototype.key = function(key) {
  return this._key(key, true);
};
_Xdotoolify.prototype._type = function(text, checkAfter = false) {
  this._addOperation({
    type: 'type',
    text: text,
    checkAfter: checkAfter
  });
  return this;
};
_Xdotoolify.prototype.type = function(text) {
  return this._type(text, true);
};
_Xdotoolify.prototype._autoClick = function(
  selector,
  mouseButton,
  timeout,
  checkAfter = false
) {
  this._mousemove(selector, null, null, timeout || this.defaultTimeout);
  this._click(mouseButton, checkAfter);
  return this;
};
_Xdotoolify.prototype.autoClick = function(
  selector,
  mouseButton,
  timeout
) {
  return this._autoClick(
    selector,
    mouseButton,
    timeout,
    true
  );
};
_Xdotoolify.prototype._autoDrag = function(
  sel1,
  sel2,
  mouseButton,
  timeout,
  checkAfter = false
) {
  this._mousemove(sel1, null, null, timeout || this.defaultTimeout);
  this._drag(sel2, mouseButton, checkAfter);
  return this;
};
_Xdotoolify.prototype.autoDrag = function(
  sel1,
  sel2,
  mouseButton,
  timeout
) {
  return this._autoDrag(
    sel1,
    sel2,
    mouseButton,
    timeout,
    true
  );
};
_Xdotoolify.prototype._autoKey = function(
  selector,
  key,
  relpos,
  timeout,
  checkAfter = false
) {
  if (!relpos) {
    relpos = 'bottomright';
  }
  this._mousemove(selector, relpos, null, timeout || this.defaultTimeout);
  this._click('left');
  this._key(key, checkAfter);
  return this;
};
_Xdotoolify.prototype.autoKey = function(
  selector,
  key,
  relpos,
  timeout
) {
  return this._autoKey(
    selector,
    key,
    relpos,
    timeout,
    true
  );
};
_Xdotoolify.prototype._autoType = function(
  selector,
  text,
  relpos,
  timeout,
  checkAfter = false
) {
  if (!relpos) {
    relpos = 'bottomright'
  }
  this._mousemove(selector, relpos, null, timeout || this.defaultTimeout);
  this._click('left');
  var lines = text.toString().split('\n');
  for (var i = 0; i < lines.length; ++i) {
    if (i > 0) {
      this._key('Return');
    }
    if (i === lines.length - 1) {
      this._type(lines[i], checkAfter);
    } else {
      this._type(lines[i]);
    }
  }
  return this;
};
_Xdotoolify.prototype.autoType = function(
  selector,
  text,
  relpos,
  timeout
) {
  return this._autoType(
    selector,
    text,
    relpos,
    timeout,
    true
  );
};

_Xdotoolify.prototype.do = async function(options = {unsafe: false}) {
  try {
    if (this.unsafe === undefined) {
      this.unsafe = options.unsafe
    }
    if (!this.unsafe && options.unsafe) {
      throw new Error(
        'Unsafe do() calls are not allowed within ' +
        'safe ones.'
      )
    }
    var commandArr = [];
    let operations = this.operations;
    this.operations = [];
    for (var i = 0; i < operations.length; ++i) {
      var op = operations[i];
      try {
        if (op.type === 'sleep') {
          await this._do(commandArr.join(' '));
          commandArr = [];
          await _sleep(op.ms);
        } else if (['run', 'check'].includes(op.type)) {
          await this._do(commandArr.join(' '));
          commandArr = [];
          if (op.func._xdotoolifyWithPage === undefined) {
            let funcName = op.func.name || 'anonymous';
            let idMsg = null;
            if (funcName === 'anonymous') {
              idMsg = '\nPrinting the function definition for ' +
                  'identification since it is anonymous:' +
                  '\n' + op.func.toString() + '\n';
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
          let args = null;
          if (op.func._xdotoolifyWithPage) {
            args = [this.page, ...op.args];
          } else {
            args = op.args;
          }
          let run = async function(ignoreCallbackError) {
            let ret = await op.func.apply(null, args);
            if (op.callback) {
              if (op.callback.then) {
                throw new Error(
                  'Check callbacks should be synchronous. ' +
                      'Use multiple check() calls instead.'
                );
              }
              try {
                return [ret, op.callback(ret)];
              } catch (e) {
                if (ignoreCallbackError) {
                  return [ret, e];
                } else {
                  let retJSON;

                  try {
                    retJSON = JSON.stringify(ret)
                  } catch (e) {
                    retJSON = e;
                  }

                  e.stack += '\nValue being checked: ' + retJSON;
                  throw e;
                }
              }
            }
          }
          if (op.until) {
            let expires = Date.now() + Xdotoolify.defaultCheckUntilTimeout;
            let mostRecent = null;
            while ((mostRecent = await run(true))[1] !== op.value) {
              let mostRecentJSON;

              try {
                mostRecentJSON = JSON.stringify(mostRecent[0])
              } catch (e) {
                mostRecentJSON = e;
              }

              if (Date.now() > expires) {
                throw new Error(
                  'Timeout exceeded waiting for ' + op.func.name +
                  ' called with ' + op.args.map(x => x.toString()).join(', ') +
                  ' to be ' + op.value + '.\n' +
                  'Most recent value: ' + mostRecentJSON + '\n' +
                  'Most recent check result: ' + mostRecent[1] + '\n'
                );
              }
              await _sleep(100);
            }
          } else {
            await run(false);
            if (op.type === 'run' && this.operations.length > 0) {
              throw new Error('You forgot to add ".do() "' +
                'at the end of a subcommand.')
            }
          }
        } else {
          let nextOp = null;
          if (i < operations.length - 1) {
            nextOp = operations[i+1]
          }
          if (!options.unsafe && op.checkAfter && (!nextOp || !['check'].includes(nextOp.type))) {
            throw new Error('Missing checkUntil after interaction.')
          }
        }
        
        if (op.type === 'mousemove') {
          await this._do(commandArr.join(' '));
          commandArr = [];

          var pos = op.selector;
          if (typeof op.selector === 'string' || Array.isArray(op.selector)) {
            let timeout = op.timeout || this.defaultTimeout;
            if (timeout) {
              await waitUntilElementIsAvailable(this.page, op.selector, timeout);
            }
            var ret = await _getElementAndBrowserScreenRect(
              this.page, op.selector
            );
            pos = RELATIVE_POSITION_MAPPING[op.relpos](ret.rect);
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
          } else if (op.selector.screenx || op.selector.screeny) {
            pos = {
              x: op.selector.screenx,
              y: op.selector.screeny,
            };
          } else if (op.selector.relx || op.selector.rely) {
            pos = {
              x: this.page.xjsLastPos.x + (pos.relx || 0),
              y: this.page.xjsLastPos.y + (pos.rely || 0),
            };
          } else {
            pos = await this.page.executeScript(function(_pos) {
              return {
                x: _pos.x + window.mozInnerScreenX,
                y: _pos.y + window.mozInnerScreenY,
              };
            }, pos);
          }
          // jitter when moving a mouse to the same location or it won't trigger
          if (!this.page.xjsLastPos ||
              this.page.xjsLastPos.x === pos.x &&
                  this.page.xjsLastPos.y === pos.y) {
            commandArr.push(`mousemove --sync ${pos.x - 1} ${pos.y}`);
            await this._do(commandArr.join(' '));
            await _sleep(50);
            commandArr = [];
          }
          if (op.twoStep) {
            // we issue two mousemove commands because firefox won't start a drag
            // otherwise. We don't want to always do this because it adds some
            // noise to the activity screenshots so they become not deterministic
            var midPoint = {
              x: (this.page.xjsLastPos.x + pos.x) / 2,
              y: (this.page.xjsLastPos.y + pos.y) / 2,
            };
            commandArr.push(`mousemove --sync ${midPoint.x} ${midPoint.y}`);
            await this._do(commandArr.join(' '));
            await _sleep(50);
            commandArr = [];
          }
          commandArr.push(`mousemove --sync ${pos.x} ${pos.y}`);
          await this._do(commandArr.join(' '));
          await _sleep(50);
          commandArr = [];
          this.page.xjsLastPos = pos;
        } else if (op.type === 'click') {
          commandArr.push(`click ${op.mouseButton}`);
        } else if (op.type === 'mousedown') {
          commandArr.push(`mousedown ${op.mouseButton}`);
        } else if (op.type === 'mouseup') {
          commandArr.push(`mouseup ${op.mouseButton}`);
        } else if (op.type === 'key') {
          commandArr.push(`key ${op.key}`);
        } else if (op.type === 'type') {
          commandArr.push(`type ${JSON.stringify(op.text)}`);
          await this._do(commandArr.join(' '));
          commandArr = [];
        }
      } catch (e) {
        // HACK: because the operations are all chained up first, and then
        // only executed when do() is called, we get really crappy stack
        // traces. So here, we save the stack trace from when it was chained
        // and add it on to the trace to make it obvious what caused the error
        e.stack += '\n' + op.error.stack;
        throw e;
      }
    }
    if (commandArr.length) {
      await this._do(commandArr.join(' '));
    }
  } finally {
    await _sleep(50);
  }
};

var lastWindow = null;
_Xdotoolify.prototype.focus = async function() {
  if (lastWindow !== this.xWindowId) {
    childProcess.execSync('xdotool windowraise ' + this.xWindowId);
    childProcess.execSync('xdotool windowfocus ' + this.xWindowId);
    lastWindow = this.xWindowId;
    await _sleep(500);
  }
};

_Xdotoolify.prototype._do = async function(command) {
  await this.focus();
  if (command) {
    //console.log('command is ' + command);
    childProcess.execSync('xdotool ' + command);
  }
};

var Xdotoolify = function(page) {
  page.X = new _Xdotoolify(page);
};

Xdotoolify.defaultCheckUntilTimeout = 3000;

Xdotoolify.setupWithPage = function(f) {
  f._xdotoolifyWithPage = true;
  return f;
};
Xdotoolify.setupWithoutPage = function(f) {
  f._xdotoolifyWithPage = false;
  return f;
};
export default Xdotoolify;
