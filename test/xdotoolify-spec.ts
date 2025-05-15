import Xdotoolify, { XWebDriver, XPageFunction } from '../src/xdotoolify';
import { Builder, WebDriver } from 'selenium-webdriver';
import firefox from 'selenium-webdriver/firefox';

const noop = () => {};

describe('xdotoolify', function() {
  let page: XWebDriver;
  let driver: WebDriver | null = null;

  beforeEach(async function() {
    const { execSync } = require('child_process');
    const { mkdtempSync, writeFileSync, mkdirSync } = require('fs');
    const tmpdir = mkdtempSync('/tmp/xdotoolify-selenium-test');

    const firefoxOpts = new firefox.Options();
    firefoxOpts.setProfile(tmpdir);
    firefoxOpts.setPreference('focusmanager.testmode', false);
    firefoxOpts.setPreference('security.fileuri.strict_origin_policy', false);
    firefoxOpts.setPreference('gfx.direct2d.disabled', true);
    firefoxOpts.setPreference('dom.storage.next_gen', true);
    firefoxOpts.setPreference('layers.acceleration.disabled', true);
    firefoxOpts.setPreference('devtools.webconsole.persistlog', true);
    firefoxOpts.setPreference('app.update.auto', false);
    firefoxOpts.setPreference('app.update.enabled', false);
    firefoxOpts.setPreference('browser.fullscreen.animate', false);
    firefoxOpts.setPreference('browser.fullscreen.autohide', false);
    firefoxOpts.setPreference('full-screen-api.warning.delay', 0);
    firefoxOpts.setPreference('full-screen-api.warning.timeout', 0);
    firefoxOpts.setPreference('browser.formfill.enable', false);
    firefoxOpts.setPreference('ui.caretBlinkTime', 0);
    firefoxOpts.setPreference('layout.spellcheckDefault', 0);
    firefoxOpts.setPreference('security.enterprise_roots.enabled', true);
    firefoxOpts.setPreference('security.cert_pinning.enforcement_level', 0);
    firefoxOpts.setPreference('security.ssl.enable_ocsp_stapling', false);
    firefoxOpts.setPreference('security.ssl.enable_ocsp_must_staple', false);
    firefoxOpts.setPreference('security.default_personal_cert', 'Select Automatically');
    firefoxOpts.setAcceptInsecureCerts(true);
    firefoxOpts.addArguments('-no-remote');
    firefoxOpts.addArguments('--shm-size=2g');

    driver = await new Builder()
      .forBrowser('firefox')
      .setFirefoxOptions(firefoxOpts)
      .build();

    await driver.manage().window().setRect({
      width: 1280,
      height: 1024
    });

    await driver.get('about:blank');

    page = Xdotoolify(driver);
    Xdotoolify.defaultCheckUntilTimeout = 100;
  }, 10000);

  afterEach(async function() {
    if (driver) {
      await driver.quit();
    }
  });

  it('should throw error if not setup', async function() {
    let errorMsg = 'No error thrown';
    // Intentionally create a function that looks like XPageFunction but missing the _xdotoolifyWithPage property
    const badFunc = (() => {}) as unknown as XPageFunction;

    try {
      await page.X.checkUntil(badFunc, noop).do();
    } catch (e: any) {
      errorMsg = e.message;
    }

    expect(errorMsg).toContain('you must call Xdotoolify.setupWithPage');
  });

  it('should throw error on bad check', async function() {
    let goodFunc = Xdotoolify.setupWithPage((page) => {});
    await expect(async () => {
      await page.X.checkUntil(goodFunc, () => { throw new Error('inside'); }).do();
    }).rejects.toThrow('inside');
  });

  it('should print check values on bad check', async function() {
    let errorMsg = 'Nothing thrown';
    let stack = 'nothing';
    let goodFunc = Xdotoolify.setupWithPage(page => { return [{a: 5}, 6]; });

    try {
      await page.X.checkUntil(goodFunc, () => { throw new Error('inside'); }).do();
    } catch (e: any) {
      errorMsg = e.message;
      stack = e.stack;
    }

    expect(errorMsg).toContain('inside');
    expect(stack).toContain(' [{"a":5},6]\n');
  });

  it('should be able to handle circular objects in check', async function() {
    const circularObject: any = {};
    circularObject.b = circularObject;

    let stack = 'empty stack';
    let badFunc = Xdotoolify.setupWithPage(page => { return circularObject; });

    try {
      await page.X.checkUntil(badFunc, () => {
        throw new Error('callback');
      }).do();
    } catch (e: any) {
      stack = e.stack;
    }

    expect(stack).toContain('Value being checked: TypeError: Converting circular structure to JSON');
  });

  it('should work with new checkUntil', async function() {
    let goodFunc = Xdotoolify.setupWithPage(page => [{a: 4}, {b: 6}]);
    await page.X
        .checkUntil(goodFunc, x => expect(x[0].a).toBe(4))
        .do();

    await expect(async () => {
      await page.X
          .checkUntil(goodFunc, x => expect(x[0].a).toBe(5))
          .do();
    }).rejects.toThrow();

    await page.X
        .checkUntil(goodFunc, x => expect(x[0].a).toBe(4))
        .do()

    let valueFunc = Xdotoolify.setupWithPage(page => 5);
    await page.X
        .checkUntil(valueFunc, 5)
        .do()

    await expect(async () => {
      await page.X
          // @ts-expect-error wrong number of arguments
          .checkUntil(valueFunc, x => !!x, true)
          .do()
    }).rejects.toThrow();
  }, 15000);

  it('should print checkUntil values on bad check', async function() {
    let stack = 'nothing';
    let goodFunc = Xdotoolify.setupWithPage(page => { return [{a: 5}, 6]; });

    try {
      await page.X.checkUntil(goodFunc, x => {
        const firstItem = x[0] as {a: number};
        expect(firstItem.a).toBe(4);
      }).do();
    } catch (e: any) {
      stack = e.stack;
    }

    expect(stack).toContain(
      'Expected: \u001b[32m4\u001b[39m\nReceived: \u001b[31m5\u001b[39m'
    );
    expect(stack).toContain('Value being checked: [{"a":5},6]');
  });

  it('should work with checkUntil', async function() {
    let errorMsg = 'Nothing thrown';
    let goodFunc = Xdotoolify.setupWithPage(page => { return 5; });

    try {
      await page.X.checkUntil(goodFunc, x => expect(x * 2).toBe(10)).do();
    } catch (e: any) {
      errorMsg = e.message;
    }

    expect(errorMsg).toBe('Nothing thrown');
  });

  it('should throw an error on checkUntil timeout', async function() {
    let stack = 'nothing';

    let value = 4;

    let slowFunc = Xdotoolify.setupWithPage(async page => {
      return value;
    });

    setTimeout(() => {
      value = 5;
    }, 4000)

    try {
      await page.X.checkUntil(slowFunc, 5).do();
    } catch (e: any) {
      stack = e.stack;
    }

    expect(stack).toContain('Error: Expected 4 to be 5\n');
  });

  it('should be able to customize checkUntil timeout', async function() {
    let stack = 'nothing';

    let value = 4;

    Xdotoolify.defaultCheckUntilTimeout = 5000;

    let slowFunc = Xdotoolify.setupWithPage(async page => {
      return value;
    });

    setTimeout(() => {
      value = 5;
    }, 4000)

    try {
      await page.X.checkUntil(slowFunc, 5).do();
    } catch (e: any) {
      stack = e.stack;
    }

    expect(stack).toContain('nothing');

    Xdotoolify.defaultCheckUntilTimeout = 3000;
  });

  it('should be able to handle circular objects in checkUntil', async function() {
    const circularObject: any = {};
    circularObject.b = circularObject;

    let errorMsg = 'Nothing thrown';
    let badFunc = Xdotoolify.setupWithPage(page => { return circularObject; });


    try {
      await page.X.checkUntil(badFunc, x => x === 10).do();
    } catch (e: any) {
      errorMsg = e.message;
    }

    expect(errorMsg).toContain('Converting circular structure to JSON');
  });

  it('should throw error when missing do() at the end of run command', async function() {
    let errorMsg = 'Nothing thrown';
    let goodFunc = Xdotoolify.setupWithPage(page => { return 5; });
    const withDo = Xdotoolify.setupWithPage(page => {
      return page.X
          .checkUntil(goodFunc, x => expect(x * 2).toBe(10))
          .do();
    });
    const withoutDo = Xdotoolify.setupWithPage(page => {
      return page.X
          .checkUntil(goodFunc, x => expect(x * 2).toBe(10));
    });

    try {
      await page.X
          .run(withDo)
          .checkUntil(goodFunc, x => expect(x * 2).toBe(10)).do();
    } catch (e: any) {
      errorMsg = e.message;
    }

    expect(errorMsg).toBe('Nothing thrown');

    try {
      await page.X
          .run(withoutDo)
          .checkUntil(goodFunc, x => expect(x * 2).toBe(10)).do();
    } catch (e: any) {
      errorMsg = e.message;
    }

    expect(errorMsg).toBe('You forgot to add ".do() "at the end of a subcommand.');
  });

  it('should throw error when missing checkUntil after interaction', async function() {
    let errorMsg = 'Nothing thrown';
    let goodFunc = Xdotoolify.setupWithPage(page => { return 5; });
    let withCheck = Xdotoolify.setupWithPage(page => {
      return page.X
          .click()
          .checkUntil(goodFunc, x => expect(x * 2).toBe(10))
          .do();
    });

    try {
      await page.X
          .run(withCheck)
          .do();
    } catch (e: any) {
      errorMsg = e.message;
    }

    expect(errorMsg).toBe('Nothing thrown');

    let withoutCheck = Xdotoolify.setupWithPage(page => {
      return page.X
          .click()
          .do();
    });

    try {
      await page.X
          .run(withoutCheck)
          .do();
    } catch (e: any) {
      errorMsg = e.message;
    }

    expect(errorMsg).toBe('Missing checkUntil after interaction.');
  });

  it('should not allow unsafe do calls', async function() {
    let errorMsg = 'Nothing thrown';
    let goodFunc = Xdotoolify.setupWithPage(page => { return 5; });

    try {
      await page.X
          .checkUntil(goodFunc, noop)
          .do({unsafe: true});
    } catch (e: any) {
      errorMsg = e.message;
    }

    expect(errorMsg).toBe('Unsafe do() calls are no longer supported.');
  });

  it('should require check after addRequireCheckImmediatelyAfter', async function() {
    let goodFunc = Xdotoolify.setupWithPage(page => { return 5; });
    let fnWithRequire = Xdotoolify.setupWithPage(
      async page => {
        await page.X
            .addRequireCheckImmediatelyAfter().do();
      }
    );

    await page.X
        .run(goodFunc)
        .do();

    await expect(async () => {
      await page.X
          .run(goodFunc)
          .run(fnWithRequire)
          .do();
    }).rejects.toThrow('Missing checkUntil after running \'requireCheckImmediatelyAfter\'');

    await expect(async () => {
      await page.X
          .run(goodFunc)
          .addRequireCheckImmediatelyAfter()
          .do();
    }).rejects.toThrow('Missing checkUntil after running \'requireCheckImmediatelyAfter\'');
  });

  it('should accept check after addRequireCheckImmediatelyAfter', async function() {
    let goodFunc = Xdotoolify.setupWithPage(page => { return 5; });
    let fnWithRequire = Xdotoolify.setupWithPage(
      async page => {
        await page.X
            .addRequireCheckImmediatelyAfter().do();
      }
    );

    await page.X
        .run(goodFunc)
        .run(fnWithRequire)
        .checkUntil(
          goodFunc,
          5
        )
        .do();
  });

  it('should compare objects', async function() {
    let goodFunc = Xdotoolify.setupWithPage((page) => { return {
      a: 1,
      b: 2
    }; });

    await page.X.checkUntil(
      goodFunc,
      x => expect(x).toStrictEqual({a: 1, b: 2})
    ).do();
    
    await expect(async () => {
      await page.X.checkUntil(
        goodFunc,
        x => expect(x).toStrictEqual({a: 2, b: 2})
      ).do();
    }).rejects.toThrow('\"a\": 2')
  });


  it('should be able to use saved values', async function() {
    let funcWithArgs = Xdotoolify.setupWithPage((page, arg) => { return arg; });

    let val: number;
    await page.X.run(
        Xdotoolify.setupWithPage(page => {
            val = funcWithArgs(page, 60);
          })
        )
        .checkUntil(
          funcWithArgs,
          60,
          x => expect(x).toBe(val)
        )
        .do()
  });

  /**
   * This test verifies that TypeScript correctly detects type errors
   * for incorrect usages of run() and checkUntil().
   * We use @ts-expect-error to mark places where TypeScript should
   * report errors during compilation.
   */
  it('should detect type errors for incorrect API usage', async function() {
    // Define goodFunc for use in this test
    const goodFunc = Xdotoolify.setupWithPage((page) => 5);
    
    // Too many arguments to run()
    await expect(async () => {
      // @ts-expect-error
      await page.X.checkUntil(goodFunc, 5, 5, 5, 5, x => x === 10).do();
    }).rejects.toThrow();
    
    // Too few arguments (no check callback)
    await expect(async () => {
      // @ts-expect-error
      await page.X.checkUntil(goodFunc).do();
    }).rejects.toThrow();
    
    // Incorrect argument types
    const numberFunc = Xdotoolify.setupWithPage((page) => 42);
    await expect(async () => {
      // @ts-expect-error - callback expects number but string is used for comparison
      await page.X.checkUntil(numberFunc, "not a number").do();
    }).rejects.toThrow();
    
    // Incorrect callback parameter type
    await expect(async () => {
      // @ts-expect-error - callback receives number but treats it as string
      await page.X.checkUntil(numberFunc, (x: string) => x.length > 0).do();
    }).rejects.toThrow();
    
    // Function with arguments - missing required arguments
    const funcWithTwoArgs = Xdotoolify.setupWithPage((page, arg1: string, arg2: number) => arg1 + arg2);
    await expect(async () => {
      // @ts-expect-error - missing second argument
      await page.X.checkUntil(funcWithTwoArgs, "test", (result) => result === "test123").do();
    }).rejects.toThrow();
    
    // Function with arguments - wrong argument types
    await expect(async () => {
      // @ts-expect-error - arguments in wrong order (number, string instead of string, number)
      await page.X.checkUntil(funcWithTwoArgs, 123, "test", (result) => result === "test123").do();
    }).rejects.toThrow();
  });

  it('should handle optional arguments in .run() correctly', async function() {
    const funcWithOptionals = Xdotoolify.setupWithPage((page, required: string, optional?: number) => {
      return optional ? required + optional : required;
    });

    await page.X.run(funcWithOptionals, "test", 42).do();
    
    await page.X.run(funcWithOptionals, "test").do();
    
    // @ts-expect-error - missing required argument
    await page.X.run(funcWithOptionals).do();
    
    // @ts-expect-error - too many arguments
    await page.X.run(funcWithOptionals, "test", 42, "extra").do();
  });

  it('should handle optional arguments in .checkUntil() correctly', async function() {
    const funcWithOptionals = Xdotoolify.setupWithPage((page, required: string, optional?: number) => {
      return optional ? required + optional : required;
    });

    await page.X.checkUntil(funcWithOptionals, "test", 42, (result) => result === "test42").do();
    
    await page.X.checkUntil(funcWithOptionals, "test", (result) => result === "test").do();
    
    await expect(async () => {
      // @ts-expect-error - missing required argument
      await page.X.checkUntil(funcWithOptionals, (result) => result === "test").do();
    }).rejects.toThrow();
    
    await expect(async () => {
      // @ts-expect-error - too many arguments (extra argument before callback)
      await page.X.checkUntil(funcWithOptionals, "test", 42, "extra", (result) => result === "test").do();
    }).rejects.toThrow();
  });

  it('should work with setupWithoutPage and run', async function() {
    const noPageFunc = Xdotoolify.setupWithoutPage(() => {
      return 42;
    });

    // no expect, just make sure types compile
    await page.X.run(noPageFunc).do();

    const noPageFuncWithArgs = Xdotoolify.setupWithoutPage((num: number, str: string) => {
      return `${str}: ${num}`;
    });

    // no expect, just make sure types compile
    await page.X.run(noPageFuncWithArgs, 23, "Result").do();

    const asyncFunc = Xdotoolify.setupWithoutPage(async (delay: number) => {
      await new Promise(resolve => setTimeout(resolve, delay));
      return 'delayed result';
    });

    // no expect, just make sure types compile
    await page.X.run(asyncFunc, 10).do();

    const withOptionalParams = Xdotoolify.setupWithoutPage((required: string, optional?: number) => {
      return optional ? `${required}:${optional}` : required;
    });

    // no expect, just make sure types compile
    await page.X.run(withOptionalParams, "test").do();

    // no expect, just make sure types compile
    await page.X.run(withOptionalParams, "test", 123).do();

    const multipleOptionals = Xdotoolify.setupWithoutPage((a: number, b?: number, c?: string) => {
      return c ? `${a}:${b}:${c}` : b ? `${a}:${b}` : `${a}`;
    });

    // no expect, just make sure types compile
    await page.X.run(multipleOptionals, 1).do();

    await page.X.run(multipleOptionals, 1, 2).do();

    await page.X.run(multipleOptionals, 1, 2, "three").do();
  });

  it('should work with setupWithoutPage and checkUntil', async function() {
    const noPageFunc = Xdotoolify.setupWithoutPage(() => {
      return 42;
    });

    await page.X.checkUntil(noPageFunc, 42).do();

    await page.X.checkUntil(noPageFunc, (value) => expect(value).toBe(42)).do();

    await page.X.checkUntil(noPageFunc, (value) => value === 42).do();

    await expect(async () => {
      await page.X.checkUntil(noPageFunc, 43).do();
    }).rejects.toThrow();

    const withArgs = Xdotoolify.setupWithoutPage((x: number, y: number) => x + y);
    await page.X.checkUntil(withArgs, 5, 7, 12).do();
    await page.X.checkUntil(withArgs, 10, 15, (sum) => expect(sum).toBe(25)).do();

    const arrayFunc = Xdotoolify.setupWithoutPage(() => [1, 2, 3]);
    await page.X.checkUntil(arrayFunc, (arr) => {
      expect(arr).toEqual([1, 2, 3]);
      expect(arr.length).toBe(3);
    }).do();

    const withOptionals = Xdotoolify.setupWithoutPage((base: number, multiplier?: number) => {
      return multiplier ? base * multiplier : base;
    });

    await page.X.checkUntil(withOptionals, 5, 5).do();
    await page.X.checkUntil(withOptionals, 5, 3, 15).do();

    const expectFunc = (result: number) => expect(result).toBe(5);
    await page.X.checkUntil(withOptionals, 5, expectFunc).do();
    await page.X.checkUntil(withOptionals, 5, 1, expectFunc).do();

    await expect(async () => {
      // @ts-expect-error - wrong argument type
      await page.X.checkUntil(withOptionals, "string", 10).do();
    }).rejects.toThrow();

    const multiOptional = Xdotoolify.setupWithoutPage((a: string, b?: boolean, c?: number) => {
      return c ? `${a}:${b}:${c}` : b ? `${a}:${b}` : a;
    });

    await page.X.checkUntil(multiOptional, "test", "test").do();
    await page.X.checkUntil(multiOptional, "test", true, `test:true`).do();
    await page.X.checkUntil(multiOptional, "test", false, 42, `test:false:42`).do();
  });
});
