import childProcess from 'child_process';

var _getElementRect = function(page, selector) {
  try {
    return evaluate(page, function(_selector) {
      if (Array.isArray(_selector)) {
        var element = document.querySelectorAll(_selector[0]);
        var result = element[0].getBoundingClientRect();
        for (var i = 1; i < _selector.length; ++i) {
          if (Number.isInteger(_selector[i])) {
            element = element[_selector[i]];
            result = element.getBoundingClientRect();
          } else {
            var subDoc =
                element.contentDocument || element.contentWindow.document;
            element = subDoc.querySelectorAll(_selector[i]);
            var subResult = element[0].getBoundingClientRect();
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
        var result = element.getBoundingClientRect();
      }
      return result;
    }, selector);
  } catch (e) {
    console.warn('getElementRect failed for');
    console.warn(selector);
    throw e;
  }
};

var _getElementScreenRect = async function(page, selector) {
  // TODO: only works in firefox
  var rect = await _getElementRect(page, selector);
  return evaluate(page, function(_rect) {
    _rect.x += window.mozInnerScreenX;
    _rect.y += window.mozInnerScreenY;
    return _rect;
  }, rect);
};

var _sleep = function(time) {
  return new Promise(function(resolve) {
    setTimeout(resolve, time);
  });
};

var _centerize = function(rect) {
  return {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  };
};
var _bottomrightize = function(rect) {
  return {
    // -15 in order to avoid scrollbars and resize scrubbers on textareas
    x: rect.x + rect.width - 17,
    y: rect.y + rect.height - 17,
  };
};

var RELATIVE_POSITION_MAPPING = {
  center: true,
  bottomright: true,
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
};
_Xdotoolify.prototype.focus = async function() {
  await this._do();
};
_Xdotoolify.prototype.sleep = function(ms) {
  this.operations.push({
    type: 'sleep',
    ms: ms,
  });
  return this;
};
_Xdotoolify.prototype.mousemove = function(selector, relpos, twoStep) {
  relpos = relpos || 'center';
  if (!RELATIVE_POSITION_MAPPING[relpos.toLowerCase()]) {
    throw new Error('Unknown relative position ' + relpos);
  }
  this.operations.push({
    type: 'mousemove',
    selector: selector,
    relpos: relpos.toLowerCase(),
    twoStep: twoStep || false,
  });
  return this;
};
_Xdotoolify.prototype.click = function(mouseButton) {
  mouseButton = mouseButton || 'left';
  if (!MOUSE_BUTTON_MAPPING[mouseButton.toLowerCase()]) {
    throw new Error('Unknown mouse button ' + mouseButton);
  }
  this.operations.push({
    type: 'click',
    mouseButton: MOUSE_BUTTON_MAPPING[mouseButton.toLowerCase()],
  });
  return this;
};
_Xdotoolify.prototype.mousedown = function(mouseButton) {
  mouseButton = mouseButton || 'left';
  if (!MOUSE_BUTTON_MAPPING[mouseButton.toLowerCase()]) {
    throw new Error('Unknown mouse button ' + mouseButton);
  }
  this.operations.push({
    type: 'mousedown',
    mouseButton: MOUSE_BUTTON_MAPPING[mouseButton.toLowerCase()],
  });
  return this;
};
_Xdotoolify.prototype.mouseup = function(mouseButton) {
  mouseButton = mouseButton || 'left';
  if (!MOUSE_BUTTON_MAPPING[mouseButton.toLowerCase()]) {
    throw new Error('Unknown mouse button ' + mouseButton);
  }
  this.operations.push({
    type: 'mouseup',
    mouseButton: MOUSE_BUTTON_MAPPING[mouseButton.toLowerCase()],
  });
  return this;
};
_Xdotoolify.prototype.wheeldown = function() {
  this.click('wheeldown');
  return this;
};
_Xdotoolify.prototype.wheelup = function() {
  this.click('wheelup');
  return this;
};
_Xdotoolify.prototype.drag = function(selector, mouseButton) {
  this.mousedown(mouseButton);
  this.mousemove(selector, 'center', true);
  this.mouseup(mouseButton);
  return this;
};
_Xdotoolify.prototype.key = function(key) {
  this.operations.push({
    type: 'key',
    key: key,
  });
  return this;
};
_Xdotoolify.prototype.type = function(text) {
  this.operations.push({
    type: 'type',
    text: text,
  });
  return this;
};
_Xdotoolify.prototype.autoClick = function(selector, mouseButton) {
  this.mousemove(selector);
  this.click(mouseButton);
  return this;
};
_Xdotoolify.prototype.autoDrag = function(sel1, sel2, mouseButton) {
  this.mousemove(sel1);
  this.drag(sel2, mouseButton);
  return this;
};
_Xdotoolify.prototype.autoKey = function(selector, key) {
  this.mousemove(selector, 'bottomright');
  this.click();
  this.key(key);
  return this;
};
_Xdotoolify.prototype.autoType = function(selector, text) {
  this.mousemove(selector, 'bottomright');
  this.click();
  this.type(text);
  return this;
};
_Xdotoolify.prototype.do = async function() {
  var commandArr = [];
  for (var i = 0; i < this.operations.length; ++i) {
    var op = this.operations[i];
    if (op.type === 'sleep') {
      await this._do(commandArr.join(' '));
      commandArr = [];
      await _sleep(op.ms);
    } else if (op.type === 'mousemove') {
      var pos = op.selector;
      if (typeof op.selector === 'string' || Array.isArray(op.selector)) {
        var rect = await _getElementScreenRect(this.page, op.selector);
        if (op.relpos === 'center') {
          pos = _centerize(rect);
        } else if (op.relpos === 'bottomright') {
          pos = _bottomrightize(rect);
        }
      } else if (op.selector.relx || op.selector.posy) {
        pos = {
          x: this.page.xjsLastPos.x + (pos.relx || 0),
          y: this.page.xjsLastPos.y + (pos.rely || 0),
        };
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
  }
  if (commandArr.length) {
    await this._do(commandArr.join(' '));
  }
  await _sleep(50);
  this.operations = [];
};
var lastWindow = null;
_Xdotoolify.prototype._do = async function(command) {
  if (lastWindow !== this.page.xWindowId) {
    childProcess.execSync('xdotool windowraise ' + this.page.xWindowId);
    childProcess.execSync('xdotool windowfocus ' + this.page.xWindowId);
    lastWindow = this.page.xWindowId;
    await _sleep(500);
  }
  if (command) {
    //console.log('command is ' + command);
    childProcess.execSync('xdotool ' + command);
  }
};

var Xdotoolify = function(page) {
  page.X = new _Xdotoolify(page);
};
export default Xdotoolify;
