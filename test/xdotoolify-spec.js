let Xdotoolify = require('../src/xdotoolify').default;

let noop = () => {};

describe('xdotoolify', function() {
  let page = null;

  beforeEach(async function() {
    page = {};
    Xdotoolify(page);
  });

  it('should throw error if not setup', async function() {
    let errorMsg = 'No error thrown';
    let badFunc = () => {};

    try {
      await page.X.check(badFunc, noop).do({unsafe: true});
    } catch (e) {
      errorMsg = e.message;
    }

    expect(errorMsg).toContain('you must call Xdotoolify.setupWithPage');
  });

  it('should throw error on bad check', async function() {
    let goodFunc = Xdotoolify.setupWithPage((page) => {});
    await expect(async () => {
      await page.X.check(goodFunc, () => { throw new Error('inside'); }).do({
        unsafe: true
      });
    }).rejects.toThrow('inside');
  });

  it('should print check values on bad check', async function() {
    let errorMsg = 'Nothing thrown';
    let stack = 'nothing';
    let goodFunc = Xdotoolify.setupWithPage((page) => { return [{a: 5}, 6]; });

    try {
      await page.X.check(goodFunc, () => { throw new Error('inside'); }).do({
        unsafe: true
      });
    } catch (e) {
      errorMsg = e.message;
      stack = e.stack;
    }

    expect(errorMsg).toContain('inside');
    expect(stack).toContain(' [{"a":5},6]\n');
  });

  it('should be able to handle circular objects in check', async function() {
    const circularObject = {};
    circularObject.b = circularObject;

    let stack = 'empty stack';
    let badFunc = Xdotoolify.setupWithPage((page) => { return circularObject; });

    try {
      await page.X.check(badFunc, () => {
        throw new Error('callback');
      }).do({unsafe: true});
    } catch (e) {
      stack = e.stack;
    }

    expect(stack).toContain('Value being checked: TypeError: Converting circular structure to JSON');
  });

  it('should work with new checkUntil', async function() {
    let goodFunc = Xdotoolify.setupWithPage((page) => [{a: 4}, {b: 6}]);
    await page.X
        .checkUntil(goodFunc, x => expect(x[0].a).toBe(4))
        .do({legacyCheckUntil: false});

    await expect(async () => {
      await page.X
          .checkUntil(goodFunc, x => expect(x[0].a).toBe(5))
          .do({legacyCheckUntil: false});
    }).rejects.toThrow();

    await page.X
        .checkUntil(goodFunc, x => x[0].a === 4)
        .do({legacyCheckUntil: false})

    let valueFunc = Xdotoolify.setupWithPage((page) => 5);
    await page.X
        .checkUntil(valueFunc, 5)
        .do({legacyCheckUntil: false})

    await expect(async () => {
      // legacy checkUntil should fail to prevent accidents
      await page.X
          .checkUntil(valueFunc, x => !!x, true)
          .do({legacyCheckUntil: false})
    }).rejects.toThrow();
  }, 15000);

  it('should print checkUntil values on bad check', async function() {
    let stack = 'nothing';
    let goodFunc = Xdotoolify.setupWithPage((page) => { return [{a: 5}, 6]; });

    try {
      await page.X.checkUntil(goodFunc, x => x[0].a, 4).do();
    } catch (e) {
      stack = e.stack;
    }

    expect(stack).toContain(' [{"a":5},6]\n');
    expect(stack).toContain(' 5\n');
  });

  it('should work with checkUntil', async function() {
    let errorMsg = 'Nothing thrown';
    let goodFunc = Xdotoolify.setupWithPage((page) => { return 5; });

    try {
      await page.X.checkUntil(goodFunc, x => x * 2, 10).do();
    } catch (e) {
      errorMsg = e.message;
    }

    expect(errorMsg).toBe('Nothing thrown');
  });

  it('should throw an error on checkUntil timeout', async function() {
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
  });

  it('should be able to customize checkUntil timeout', async function() {
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
  });

  it('should be able to handle circular objects in checkUntil', async function() {
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
  });

  it('should throw error when missing do() at the end of run command', async function() {
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
  });

  it('should throw error when missing checkUntil after interaction', async function() {
    let errorMsg = 'Nothing thrown';
    let goodFunc = Xdotoolify.setupWithPage((page) => { return 5; });
    let withCheck = Xdotoolify.setupWithPage((page) => {
      return page.X
          .click()
          .checkUntil(goodFunc, x => x * 2, 10)
          .do();
    });

    try {
      await page.X
          .run(withCheck)
          .do();
    } catch (e) {
      errorMsg = e.message;
    }

    expect(errorMsg).toBe('Nothing thrown');

    withCheck = Xdotoolify.setupWithPage((page) => {
      return page.X
          .click()
          .checkNothing()
          .do();
    });

    try {
      await page.X
          .run(withCheck)
          .do();
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
          .do();
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
          .do();
    } catch (e) {
      errorMsg = e.message;
    }

    expect(errorMsg).toBe('Missing checkUntil after interaction.');
  });

  it('should handle safe calls after unsafe ones and nested calls', async function() {
    let errorMsg = 'Nothing thrown';
    let goodFunc = Xdotoolify.setupWithPage((page) => { return 5; });

    let withCheck = Xdotoolify.setupWithPage((page) => {
      return page.X
          .click()
          .checkUntil(goodFunc, x => x * 2, 10)
          .do();
    });
    let withoutCheckUnsafe = Xdotoolify.setupWithPage((page) => {
      return page.X
          .click()
          .do({unsafe: true});
    });
    let withoutCheckSafe = Xdotoolify.setupWithPage((page) => {
      return page.X
          .click()
          .do();
    });

    try {
      await page.X
          .run(withCheck)
          .do();
      await page.X
          .run(withoutCheckUnsafe)
          .do({unsafe: true});
    } catch (e) {
      errorMsg = e.message;
    }

    expect(errorMsg).toBe('Nothing thrown');

    let safelyWrappedWithoutCheckUnsafe = Xdotoolify.setupWithPage((page) => {
      return page.X
          .run(withoutCheckUnsafe)
          .do();
    });
    let safelyWrappedWithoutCheckSafe = Xdotoolify.setupWithPage((page) => {
      return page.X
          .run(withoutCheckSafe)
          .do();
    });
    let safelyWrappedWithCheckSafe = Xdotoolify.setupWithPage((page) => {
      return page.X
          .run(withCheck)
          .checkUntil(goodFunc, x => x * 2, 10)
          .do();
    });

    // unsafe > safe > unsafe
    try {
      await page.X
          .run(safelyWrappedWithoutCheckUnsafe)
          .do({unsafe: true});
    } catch (e) {
      errorMsg = e.message;
    }

    expect(errorMsg).toBe('Unsafe do() calls are not allowed within safe ones.');

    errorMsg = 'Nothing thrown';

    // unsafe > safe > safe
    try {
      await page.X
          .run(safelyWrappedWithCheckSafe)
          .do({unsafe: true});
    } catch (e) {
      errorMsg = e.message;
    }

    expect(errorMsg).toBe('Nothing thrown');

    // unsafe > safe > safe (with missing checkUntil)
    try {
      await page.X
          .run(safelyWrappedWithoutCheckSafe)
          .do({unsafe: true});
    } catch (e) {
      errorMsg = e.message;
    }

    expect(errorMsg).toBe('Missing checkUntil after interaction.');
  });

  it('should not allow check statements in safe do call', async function() {
    let errorMsg = 'Nothing thrown';
    let goodFunc = Xdotoolify.setupWithPage((page) => { return 5; });
    const noop = () => {};

    try {
      await page.X
          .check(goodFunc, noop)
          .do({unsafe: true});
    } catch (e) {
      errorMsg = e.message;
    }

    expect(errorMsg).toBe('Nothing thrown');

    try {
      await page.X
          .check(goodFunc, noop)
          .do();
    } catch (e) {
      errorMsg = e.message;
    }

    expect(errorMsg).toBe(
      '\'check\' actions are now deprecated. Please rewrite' +
      ' as \'checkUntil\'.'
    );
  });

  it('should require check after addRequireCheckImmediatelyAfter', async function() {
    let goodFunc = Xdotoolify.setupWithPage((page) => { return 5; });
    let fnWithRequire = Xdotoolify.setupWithPage(
      async (page) => {
        await page.X
            .addRequireCheckImmediatelyAfter().do();
      }
    );

    await page.X
        .run(goodFunc)
        .do({legacyCheckUntil: false});

    await expect(async () => {
      await page.X
          .run(goodFunc)
          .run(fnWithRequire)
          .do({legacyCheckUntil: false});
    }).rejects.toThrow('Missing checkUntil after running \'requireCheckImmediatelyAfter\'');

    await expect(async () => {
      await page.X
          .run(goodFunc)
          .addRequireCheckImmediatelyAfter()
          .do();
    }).rejects.toThrow('Missing checkUntil after running \'requireCheckImmediatelyAfter\'');
  });

  it('should accept check after addRequireCheckImmediatelyAfter', async function() {
    let goodFunc = Xdotoolify.setupWithPage((page) => { return 5; });
    let fnWithRequire = Xdotoolify.setupWithPage(
      async (page) => {
        await page.X
            .addRequireCheckImmediatelyAfter().do();
      }
    );

    await page.X
        .run(goodFunc)
        .run(fnWithRequire)
        .checkUntil(
          goodFunc,
          x => x,
          5
        )
        .do({legacyCheckUntil: false});
  });

  it('should compare objects', async function() {
    let goodFunc = Xdotoolify.setupWithPage((page) => { return {
      a: 1,
      b: 2
    }; });

    await page.X.checkUntil(
      goodFunc,
      x => expect(x).toStrictEqual({a: 1, b: 2})
    ).do({legacyCheckUntil: false});
    
    await expect(async () => {
      await page.X.checkUntil(
        goodFunc,
        x => expect(x).toStrictEqual({a: 2, b: 2})
      ).do({legacyCheckUntil: false});
    }).rejects.toThrow('\"a\": 2')
  });

  it('should accept Xdotoolify.defer as argument', async function() {
    let goodFunc = Xdotoolify.setupWithPage(async (page) => { return {
      a: 1,
      b: 2
    }; });

    let funcWithArgs = Xdotoolify.setupWithPage((page, arg) => { return arg; });

    await page.X
        .checkUntil(
          funcWithArgs,
          Xdotoolify.defer(async (_page) => {
            return (await goodFunc(page)).a;
          }, page),
          x => x,
          1
        )
        .do({legacyCheckUntil: false})

    await page.X
        .checkUntil(
          funcWithArgs,
          Xdotoolify.defer(() => {
            return 3;
          }),
          x => x,
          3
        )
        .do({legacyCheckUntil: false})
  });

  it('should be able to use saved values', async function() {
    let funcWithArgs = Xdotoolify.setupWithPage((page, arg) => { return arg; });

    let val;
    await page.X.run(
        Xdotoolify.setupWithPage((page) => {
            val = funcWithArgs(page, 60);
          })
        )
        .checkUntil(
          funcWithArgs,
          60,
          x => expect(x).toBe(val)
        )
        .do({legacyCheckUntil: false})
  });
});
