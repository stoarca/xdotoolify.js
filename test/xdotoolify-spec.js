import {syncify} from 'jasmine_test_utils';

import Xdotoolify from '../src/xdotoolify';

let noop = () => {};

describe('xdotoolify', function() {
  let page = null;

  beforeEach(syncify(async function() {
    page = {};
    Xdotoolify(page);
  }));

  it('should throw error if not setup', syncify(async function() {
    let errorMsg = 'No error thrown';
    let badFunc = () => {};

    try {
      await page.X.check(badFunc, noop).do();
    } catch (e) {
      errorMsg = e.message;
    }

    expect(errorMsg).toContain('you must call Xdotoolify.setupWithPage');
  }));

  it('should throw error on bad check', syncify(async function() {
    let errorMsg = 'Nothing thrown';
    let goodFunc = Xdotoolify.setupWithPage((page) => {});

    try {
      await page.X.check(goodFunc, () => { throw new Error('inside'); }).do();
    } catch (e) {
      errorMsg = e.message;
    }

    expect(errorMsg).toContain('inside');
  }));

  it('should print check values on bad check', syncify(async function() {
    let errorMsg = 'Nothing thrown';
    let stack = 'nothing';
    let goodFunc = Xdotoolify.setupWithPage((page) => { return [{a: 5}, 6]; });

    try {
      await page.X.check(goodFunc, () => { throw new Error('inside'); }).do();
    } catch (e) {
      errorMsg = e.message;
      stack = e.stack;
    }

    expect(errorMsg).toContain('inside');
    expect(stack).toContain(' [{"a":5},6]\n');
  }));

  it('should be able to handle circular objects in check', syncify(async function() {
    const circularObject = {};
    circularObject.b = circularObject;

    let stack = 'empty stack';
    let badFunc = Xdotoolify.setupWithPage((page) => { return circularObject; });

    try {
      await page.X.check(badFunc, () => {
        throw new Error('callback');
      }).do();
    } catch (e) {
      stack = e.stack;
    }

    expect(stack).toContain('Value being checked: TypeError: Converting circular structure to JSON');
  }));

  it('should print checkUntil values on bad check', syncify(async function() {
    let stack = 'nothing';
    let goodFunc = Xdotoolify.setupWithPage((page) => { return [{a: 5}, 6]; });

    try {
      await page.X.checkUntil(goodFunc, x => x[0].a, 4).do();
    } catch (e) {
      stack = e.stack;
    }

    expect(stack).toContain(' [{"a":5},6]\n');
    expect(stack).toContain(' 5\n');
  }));

  it('should work with checkUntil', syncify(async function() {
    let errorMsg = 'Nothing thrown';
    let goodFunc = Xdotoolify.setupWithPage((page) => { return 5; });

    try {
      await page.X.checkUntil(goodFunc, x => x * 2, 10).do();
    } catch (e) {
      errorMsg = e.message;
    }

    expect(errorMsg).toBe('Nothing thrown');
  }));

  it('should throw an error on checkUntil timeout', syncify(async function() {
    let stack = 'nothing';

    let value = 4;

    let slowFunc = Xdotoolify.setupWithPage(async (page) => {
      return value;
    });

    setTimeout(() => {
      value = 5;
    }, 4000)

    try {
      await page.X.checkUntil(slowFunc, x => x, 5).do();
    } catch (e) {
      stack = e.stack;
    }

    expect(stack).toContain('Timeout exceeded waiting for  called with  to be 5.\n');
  }));

  it('should be able to customize checkUntil timeout', syncify(async function() {
    let stack = 'nothing';

    let value = 4;

    Xdotoolify.defaultCheckUntilTimeout = 5000;

    let slowFunc = Xdotoolify.setupWithPage(async (page) => {
      return value;
    });

    setTimeout(() => {
      value = 5;
    }, 4000)

    try {
      await page.X.checkUntil(slowFunc, x => x, 5).do();
    } catch (e) {
      stack = e.stack;
    }

    expect(stack).toContain('nothing');

    Xdotoolify.defaultCheckUntilTimeout = 3000;
  }));

  it('should be able to handle circular objects in checkUntil', syncify(async function() {
    const circularObject = {};
    circularObject.b = circularObject;

    let errorMsg = 'Nothing thrown';
    let badFunc = Xdotoolify.setupWithPage((page) => { return circularObject; });

    try {
      await page.X.checkUntil(badFunc, x => x, 10).do();
    } catch (e) {
      errorMsg = e.message;
    }

    expect(errorMsg).toContain('Most recent value: TypeError: Converting circular structure to JSON');
  }));

  it('should throw error when missing do() at the end of run command', syncify(async function() {
    let errorMsg = 'Nothing thrown';
    let goodFunc = Xdotoolify.setupWithPage((page) => { return 5; });
    const withDo = Xdotoolify.setupWithPage((page) => {
      return page.X
          .checkUntil(goodFunc, x => x * 2, 10)
          .do();
    });
    const withoutDo = Xdotoolify.setupWithPage((page) => {
      return page.X
          .checkUntil(goodFunc, x => x * 2, 10);
    });

    try {
      await page.X
          .run(withDo)
          .checkUntil(goodFunc, x => x * 2, 10).do();
    } catch (e) {
      errorMsg = e.message;
    }

    expect(errorMsg).toBe('Nothing thrown');

    try {
      await page.X
          .run(withoutDo)
          .checkUntil(goodFunc, x => x * 2, 10).do();
    } catch (e) {
      errorMsg = e.message;
    }
    
    expect(errorMsg).toBe('You forgot to add ".do() "at the end of a subcommand.');
  }));

  it('should throw error when missing checkUntil after interaction', syncify(async function() {
    let errorMsg = 'Nothing thrown';
    let goodFunc = Xdotoolify.setupWithPage((page) => { return 5; });
    let withCheck = Xdotoolify.setupWithPage((page) => {
      return page.X
          .click()
          .checkUntil(goodFunc, x => x * 2, 10)
          .do()
    });

    try {
      await page.X
          .run(withCheck)
          .do()
    } catch (e) {
      errorMsg = e.message;
    }

    expect(errorMsg).toBe('Nothing thrown');

    withCheck = Xdotoolify.setupWithPage((page) => {
      return page.X
          .click()
          .checkNothing()
          .do()
    });

    try {
      await page.X
          .run(withCheck)
          .do()
    } catch (e) {
      errorMsg = e.message;
    }

    expect(errorMsg).toBe('Nothing thrown');

    let withoutCheck = Xdotoolify.setupWithPage((page) => {
      return page.X
          .click()
          .do({unsafe: true});
    });

    try {
      await page.X
          .run(withoutCheck)
          .do()
    } catch (e) {
      errorMsg = e.message;
    }
    
    expect(errorMsg).toBe('Unsafe do() calls are not allowed within safe ones.');

    withoutCheck = Xdotoolify.setupWithPage((page) => {
      return page.X
          .click()
          .do();
    });

    try {
      await page.X
          .run(withoutCheck)
          .do()
    } catch (e) {
      errorMsg = e.message;
    }
    
    expect(errorMsg).toBe('Missing checkUntil after interaction.');
  }));
});
