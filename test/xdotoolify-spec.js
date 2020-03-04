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
});
