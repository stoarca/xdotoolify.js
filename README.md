# xdotoolify.js

xdotoolify.js is used to simulate clicks and keystrokes in Selenium

Selenium tries to cater to many different browsers and operating systems,
but as a result, simulated user input is not the same as if the user
did the input themselves. This can make some things very hard to test for.

xdotoolify.js simulates clicks and keystrokes at the operating system level
(using xdotool) so the browser behaves exactly the same as when interacting
with a real user.

xdotoolify.js only supports Firefox at the moment

xdotoolify.js requires that a window manager (e.g. fluxbox) be installed if
using it in a docker container

## Installation

```bash
npm install --save-dev xdotoolify
```

## Usage

```js
import Xdotoolify from 'xdotoolify';
import {Builder, By} from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox';

var profile = new firefox.Profile('/tmp/profile');
var binary = new firefox.Binary();
binary.addArguments(['-no-remote']);

var firefoxOpts = new firefox.Options();
firefoxOpts.setProfile(profile);
firefoxOpts.setBinary(binary);

var page = await new Builder()
    .forBrowser('firefox')
    .setFirefoxOptions(firefoxOpts)
    .build();
await page.manage().window().setSize(1280, 1024);
Xdotoolify(page);

await page.X.autoClick('#button').do();
await page.X
    .autoKey('#email', 'ctrl+a BackSpace')
    .type('me@example.com')
    .autoClick('#submit')
    .do();
```

## API

### Xdotoolify(page)

  - `page` is a selenium [`ThenableWebDriver`][1] tied to Firefox

This will add a `.X` property to `page` that exposes methods for manipulating
input in that Firefox instance.

### page.X.mousemove(selector, relpos)

  - `selector` is one of:
    - a css selector e.g. `'.article > .date'`
    - an array where the first element is a css selector and the rest of the elements are integers. E.g. `['.question', 2]` would select the second of the elements with class `question` (note that this is different than the `:nth-child` selector)
    - an object with `x` and `y` properties. This is interpreted as an absolute screen position.
    - an object with `relx` and `rely` properties. This is interpreted as a position relative to where the mouse is now.
  - `relpos` *(optional: defaults to `'center'`)* is one of `'center'` or `'bottomright'`, ignored if `selector` is not a css selector or array. If `'center'`, it will move the mouse to the center of the element represented by `selector`. If `'bottomright'`, it will move the mouse to the bottom right of the element (useful for positioning the cursor at the end of the text of an input element, for example)

Returns `page.X` for easy chaining.

This method queues up a mousemove to the `selector`. The mousmove will happen
asynchronously when `page.X.do()` is next called.

### page.X.click(mouseButton)

  - `mouseButton` is one of `'left'`, `'middle'`, `'right'`

Returns `page.X` for easy chaining.

This method queues up a click (without moving the mouse). The click will happen
asynchronously when `page.X.do()` is next called.

### page.X.mousedown(mouseButton)

Same as `page.X.click()`, but just holds the mouse down until `page.X.mouseup()` is called.

### page.X.mouseup(mouseButton)

Same as `page.X.click()`, but releases the mouse if it was held down by `page.X.mousedown()`.

### page.X.wheeldown()

Returns `page.X` for easy chaining.

This method queues up a mouse wheel down event. The mouse wheel will be
scrolled asynchronously when `page.X.do()` is next called.

### page.X.wheelup()

Same as `page.X.wheeldown()` but going up.

### page.X.drag(selector, mouseButton)

  - `selector` is the same as in `page.X.mousemove()`
  - `mouseButton` is the same as in `page.X.click()`

Returns `page.X` for easy chaining.

This method queues up a mouse drag from where the mouse currently is to `selector`. The drag will happen asynchronously when `page.X.do()` is next called.

### page.X.key(key)

  - string of key names (usually just one) to be typed separated by spaces, e.g. `'ctrl+a BackSpace'`. Key names come from [here][2] (remove the prefix)

Returns `page.X` for easy chaining.

This method queues up a key or set of keys to be typed the next time `page.X.do()` is called. This is as if the user just started typing on the keyboard, so it's expected that the element is already focused and the text cursor is in the right position.

### page.X.type(type)

  - string of characters to type, e.g. `'blah blah lady gaga'`

Returns `page.X` for easy chaining.

This method queues up a set of characters to be typed the next time `page.X.do()` is called. This is as if the user just started typing on the keyboard, so it's expected that the element is already focused and the text cursor is in the right position.

### page.X.autoClick(selector, ...), page.X.autoDrag(selector, ...), page.X.autoKey(selector, ...), page.X.autoType(selector, ...)

  - `selector` is the same as in `page.X.mousemove()`

These are convenience methods to specify a `selector` target on which to apply the operation. The arguments following the first argument are the same as in the non-`auto` version of the command. For example, `page.X.autoType('#myemail', 'me@example.com')` will first queue up a `page.X.click()` to the bottom right of the `#myemail` element before typing in `me@example.com`.

### page.X.sleep(milliseconds)

  - `milliseconds` is the number of milliseconds to sleep for

Returns `page.X` for easy chaining.

This method will queue up a pause in between two commands. Useful when you need
to wait for the result of an action. For example:

```js
page.X
    .autoClick('#login')
    .sleep(500) // wait for the page to load
    .autoType('#myemail', 'me@example.com')
    .do();
```


### async page.X.do()

Returns `undefined`.

Executes all the commands that have been queued up asynchronously. Before any
commands are executed, the `page` will be brought to front and focused so
that input goes to the correct window.

`page.X.do()` has not been tested to work in parallel with itself, so it's
currently expected that only one call to `page.X.do()` is in process at a time.

### page.X.focus()

This method will put the window manager's focus on the firefox instance
behind `page`, and bring that instance in front of any other windows that
may exist. This is similar to bringing a window forward with alt+tab.

[1]: http://seleniumhq.github.io/selenium/docs/api/javascript/module/selenium-webdriver/index_exports_ThenableWebDriver.html
[2]: https://cgit.freedesktop.org/xorg/proto/x11proto/plain/keysymdef.h
