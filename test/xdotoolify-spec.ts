import Xdotoolify, { XWebDriver, XPageFunction } from '../src/xdotoolify';
import * as C from '../src/common';
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
    const badFunc = (() => {}) as unknown as XPageFunction<any[], any>;

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

    // Check for presence of error message while ignoring potential color codes
    expect(stack.toLowerCase().replace(/\u001b\[\d+m/g, '')).toContain('expected: 4');
    expect(stack.toLowerCase().replace(/\u001b\[\d+m/g, '')).toContain('received: 5');
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
  
  it('should handle DebuggableResult objects correctly', async function() {
    const basicFunc = Xdotoolify.setupWithPage(() => 42);
    await page.X.checkUntil(basicFunc, 42).do();
    
    const debuggableFunc = Xdotoolify.setupWithPage(() => {
      return new Xdotoolify.DebuggableResult(42, {
        context: "Test context",
        details: "Additional debug information"
      });
    });
    
    await page.X.checkUntil(debuggableFunc, 42).do();
    await page.X.checkUntil(debuggableFunc, (value) => value === 42).do();
    
    // Test with a callback that expects the value, not the DebuggableResult
    await page.X.checkUntil(debuggableFunc, (num) => {
      expect(typeof num).toBe("number");
      return num === 42;
    }).do();
    
    // Test failed match with debug info
    let errorStack = "";
    try {
      await page.X.checkUntil(debuggableFunc, 43).do();
    } catch (e: any) {
      errorStack = e.stack;
    }
    
    expect(errorStack).toContain("Debug info:");
    expect(errorStack).toContain("Test context");
    expect(errorStack).toContain("Additional debug information");
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
  
  it('should preserve return types with executeScript', async function() {
    // Type tests to verify that executeScript preserves the return type of the function
    
    // Number return type
    const numberFn = () => 42;
    const numberResult = await page.executeScript(numberFn);
    const _numberCheck: number = numberResult; // Should not cause a type error
    
    // String return type
    const stringFn = () => "hello";
    const stringResult = await page.executeScript(stringFn);
    const _stringCheck: string = stringResult; // Should not cause a type error
    
    // Object return type
    const objFn = () => ({ foo: "bar", count: 123 });
    const objResult = await page.executeScript(objFn);
    const _objCheck: { foo: string, count: number } = objResult; // Should not cause a type error
    
    // Array return type
    const arrayFn = () => [1, 2, 3];
    const arrayResult = await page.executeScript(arrayFn);
    const _arrayCheck: number[] = arrayResult; // Should not cause a type error
    
    // Function with arguments
    const argsFunc = (x: number, y: string) => `${x}-${y}`;
    const argsResult = await page.executeScript(argsFunc, 100, "test");
    const _argsCheck: string = argsResult; // Should not cause a type error
    
    // This test passes if it compiles without type errors
    expect(true).toBe(true);
  });
  
  it('should work with evaluate() and preserve types', async function() {
    await page.X.run(C.evaluate, () => 42).do();
    
    const numberResult = await C.evaluate(page, () => 42);
    const _numberCheck: number = numberResult;
    expect(numberResult).toBe(42);
    
    const stringResult = await C.evaluate(page, () => "hello world");
    const _stringCheck: string = stringResult;
    expect(stringResult).toBe("hello world");
    
    const objectResult = await C.evaluate(
      page, 
      () => ({ name: "test", count: 123, active: true })
    );
    const _objectCheck: { name: string, count: number, active: boolean } = objectResult;
    expect(objectResult).toEqual({ name: "test", count: 123, active: true });
    
    const argsResult = await C.evaluate(
      page,
      (x: number, y: string, z: boolean) => ({ x, y, z }),
      100,
      "test", 
      true
    );
    const _argsCheck: { x: number, y: string, z: boolean } = argsResult;
    expect(argsResult).toEqual({ x: 100, y: "test", z: true });
    
    const domResult = await C.evaluate(
      page,
      () => document.title
    );
    const _domCheck: string = domResult;
    
    const asyncResult = await C.evaluate(
      page,
      async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return "async result";
      }
    );
    const _asyncCheck: string = asyncResult;
    expect(asyncResult).toBe("async result");
    
    try {
      await C.evaluate(
        page,
        () => { throw new Error("Test error"); }
      );
      fail("Should have thrown an error");
    } catch (e: any) {
      expect(e.message).toContain("Test error");
      expect(e.stack).toContain("The above error occurred in the evaluate() func with args");
    }
  });
  
  it('should have correct type checking for evaluate()', async function() {
    const basicFunc = async () => {
      // @ts-expect-error - Missing page argument
      await C.evaluate(() => {});
      
      // @ts-expect-error - Missing function argument
      await C.evaluate(page);
    };
    
    const noArgsFunc = async () => {
      const result = await C.evaluate(page, () => 'success');
      const _typeCheck: string = result;
    };
    
    const requiredArgsFunc = async () => {
      // @ts-expect-error - Missing required argument to inner function
      await C.evaluate(page, (requiredArg: string) => requiredArg.length);
      
      const result = await C.evaluate(
        page, 
        (requiredArg: string) => requiredArg.length, 
        'test'
      );
      const _typeCheck: number = result;
    };
    
    const optionalArgsFunc = async () => {
      await C.evaluate(
        page,
        (required: string, optional?: number) => optional ? required + optional : required,
        'test'
      );
      
      const withOptional = await C.evaluate(
        page,
        (required: string, optional?: number) => optional ? required + optional : required,
        'test',
        42
      );
      
      await C.evaluate(
        page,
        (...args: number[]) => args.reduce((sum, n) => sum + n, 0),
        1, 2, 3, 4, 5
      );
    };
    
    const asyncReturnFunc = async () => {
      const result = await C.evaluate(
        page,
        async () => 'async result'
      );
      const _typeCheck: string = result;
      
      const complexResult = await C.evaluate(
        page,
        async () => ({ data: [1, 2, 3], status: 'success' })
      );
      const _complexCheck: { data: number[], status: string } = complexResult;
    };
    
    const domTypesFunc = async () => {
      const elementResult = await C.evaluate(
        page,
        () => document.querySelector('body')
      );
      
      const attributeResult = await C.evaluate(
        page,
        () => document.querySelector('a')?.getAttribute('href')
      );
      const _attributeCheck: string | null | undefined = attributeResult;
    };
    
    expect(true).toBe(true);
  });
  
  it('should get element count correctly', async function() {
    await C.evaluate(page, () => {
      document.body.innerHTML = `
        <div class="test-div">Div 1</div>
        <div class="test-div">Div 2</div>
        <div class="test-div">Div 3</div>
      `;
    });
    
    const count = await C.elementCount(page, ".test-div");
    expect(count).toBe(3);
    
    const nonExistentCount = await C.elementCount(page, ".non-existent");
    expect(nonExistentCount).toBe(0);
  });
  
  it('should get element text correctly', async function() {
    await C.evaluate(page, () => {
      document.body.innerHTML = `
        <div id="text-element">This is a test text</div>
        <div id="empty-element"></div>
      `;
    });
    
    const text = await C.elementText(page, "#text-element");
    expect(text).toBe("This is a test text");
    
    const emptyText = await C.elementText(page, "#empty-element");
    expect(emptyText).toBe("");
    
    const nonExistentText = await C.elementText(page, "#non-existent");
    expect(nonExistentText).toBe(null);
  });
  
  it('should get input value correctly', async function() {
    await C.evaluate(page, () => {
      document.body.innerHTML = `
        <input id="test-input" value="test value">
        <input id="empty-input" value="">
      `;
    });
    
    const value = await C.getInputValue(page, "#test-input");
    expect(value).toBe("test value");
    
    const emptyValue = await C.getInputValue(page, "#empty-input");
    expect(emptyValue).toBe("");
    
    const nonExistentValue = await C.getInputValue(page, "#non-existent");
    expect(nonExistentValue).toBe(false);
  });
  
  it('should count visible elements correctly', async function() {
    await C.evaluate(page, () => {
      document.body.innerHTML = `
        <div class="test-visible">Visible Element 1</div>
        <div class="test-visible">Visible Element 2</div>
        <div class="test-visible" style="display: none;">Hidden Element</div>
        <div class="test-visible" style="visibility: hidden;">Invisible Element</div>
        <div class="test-visible" style="opacity: 0;">Zero Opacity Element</div>
      `;
    });
    
    const result = await C.visibleElementCount(page, ".test-visible");
    expect(result.value).toBe(2);
    expect(result.debugInfo.totalElements).toBe(5);
    
    // Test with custom options
    const resultWithOptions = await C.visibleElementCount(page, ".test-visible", {
      allowZeroOpacity: true
    });
    expect(resultWithOptions.value).toBe(3);
    
    // Test with non-existent elements
    const nonExistentResult = await C.visibleElementCount(page, ".non-existent");
    expect(nonExistentResult.value).toBe(0);
    expect(nonExistentResult.debugInfo.totalElements).toBe(0);
  });
  
  it('should work with checkUntil and visibleElementCount using value check', async function() {
    await C.evaluate(page, () => {
      document.body.innerHTML = `
        <div class="test-visible">Visible Element 1</div>
        <div class="test-visible">Visible Element 2</div>
        <div class="test-visible" style="display: none;">Hidden Element</div>
      `;
    });
    
    await page.X.checkUntil(C.visibleElementCount, ".test-visible", 2).do();
  });
  
  it('should work with checkUntil and visibleElementCount using callback', async function() {
    await C.evaluate(page, () => {
      document.body.innerHTML = `
        <div class="test-visible">Visible Element 1</div>
        <div class="test-visible">Visible Element 2</div>
        <div class="test-visible" style="opacity: 0;">Zero Opacity Element</div>
      `;
    });
    
    await page.X.checkUntil(C.visibleElementCount, ".test-visible", (result) => {
      // explicit typecheck
      let asdf: number = result;
      expect(result).toBe(2);
      expect(typeof result).toBe("number"); // Verify it's unwrapped from DebuggableResult
      return true;
    }).do();
  });
});
