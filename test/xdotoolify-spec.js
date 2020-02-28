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
    let errorMsg = 'No error thrown';
    let goodFunc = Xdotoolify.setupWithPage((page) => {});
    try {
      await page.X.check(goodFunc, () => { throw new Error('err inside'); }).do();
    } catch (e) {
      errorMsg = e.message;
    }
    expect(errorMsg).toContain('err inside');
  }));
});
