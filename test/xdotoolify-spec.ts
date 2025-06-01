import Xdotoolify, { XWebDriver, XPageFunction } from '../src/xdotoolify';
import * as C from '../src/common';
import { setupTestEnvironment, teardownTestEnvironment, resetPageState } from './setup';

const noop = () => {};

describe('xdotoolify', function() {
  let page: XWebDriver;

  beforeAll(async function() {
    page = await setupTestEnvironment();
  }, 10000);

  beforeEach(async function() {
    await resetPageState(page);
  });

  afterAll(async function() {
    await teardownTestEnvironment(page);
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

  it('should be able to log messages in operation chain', async function() {
    const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    
    const testMessage = 'Test log message';
    const testObject = { test: 'value', number: 42 };
    
    await page.X
      .log(testMessage)
      .log(testObject)
      .do();
    
    expect(mockConsoleLog).toHaveBeenCalledWith(testMessage);
    expect(mockConsoleLog).toHaveBeenCalledWith(testObject);
    expect(mockConsoleLog).toHaveBeenCalledTimes(2);
    
    // Test that log() is allowed after run() that requires check
    const goodFunc = Xdotoolify.setupWithPage((page) => 5);
    const fnWithRequire = Xdotoolify.setupWithPage(
      async page => {
        await page.X
            .addRequireCheckImmediatelyAfter().do();
      }
    );
    
    await page.X
        .run(fnWithRequire)
        .log('This should be allowed')
        .checkUntil(goodFunc, 5)
        .do();
    
    expect(mockConsoleLog).toHaveBeenCalledWith('This should be allowed');
    
    // Test that check is still required after .run().log()
    await expect(async () => {
      await page.X
          .run(fnWithRequire)
          .log('Log message')
          .do();
    }).rejects.toThrow('Missing checkUntil after running \'requireCheckImmediatelyAfter\'');
    
    mockConsoleLog.mockRestore();
  });

  it('should be able to click on standard system dropdowns and select options', async function() {
    await page.executeScript(function() {
      document.body.innerHTML = `
        <div style="padding: 50px;">
          <label for="test-dropdown">Choose an option:</label>
          <select id="test-dropdown" style="font-size: 16px; padding: 8px; margin: 10px;">
            <option value="">-- Select an option --</option>
            <option value="apple">Apple</option>
            <option value="banana">Banana</option>
            <option value="cherry">Cherry</option>
            <option value="date">Date</option>
          </select>
          <p id="selected-value">Selected: <span id="selection-display">None</span></p>
        </div>
      `;
      
      const dropdown = document.getElementById('test-dropdown') as HTMLSelectElement;
      const display = document.getElementById('selection-display') as HTMLElement;
      
      dropdown.addEventListener('change', function() {
        const selectedText = dropdown.options[dropdown.selectedIndex].text;
        display.textContent = selectedText;
      });
    });

    const getSelectedValue = Xdotoolify.setupWithPage((page) => {
      return page.executeScript(function() {
        const dropdown = document.getElementById('test-dropdown') as HTMLSelectElement;
        return dropdown.value;
      });
    });

    const getSelectedText = Xdotoolify.setupWithPage((page) => {
      return page.executeScript(function() {
        const display = document.getElementById('selection-display') as HTMLElement;
        return display.textContent;
      });
    });

    await page.X
      .run(C.autoClick, '#test-dropdown')
      .checkUntil(getSelectedValue, '')
      .run(C.autoClick, 'option[value="banana"]')
      .checkUntil(getSelectedValue, 'banana')
      .checkUntil(getSelectedText, 'Banana')
      .do();
  });
  
  it('should retry when checkUntil function throws an error', async function() {
    let callCount = 0;
    const funcThatEventuallySucceeds = Xdotoolify.setupWithPage((page) => {
      callCount++;
      if (callCount < 3) {
        throw new Error('Function error ' + callCount);
      }
      return 'success';
    });

    await page.X
      .checkUntil(funcThatEventuallySucceeds, 'success')
      .do();

    expect(callCount).toBe(3);
  });

  it('should handle click with no selector', async function() {
    await page.executeScript(function() {
      document.body.innerHTML = `
        <div id="click-area" style="width: 100%; height: 300px; background-color: #f0f0f0;">
          Click anywhere in this area
        </div>
        <div id="click-status">No click detected</div>
      `;
      
      document.addEventListener('click', function() {
        const statusElement = document.getElementById('click-status');
        if (statusElement) {
          statusElement.textContent = 'Click detected';
        }
      });
    });
    
    await page.X
      // Move to a known location first
      .mousemove('#click-area')
      .checkUntil(Xdotoolify.setupWithPage(page => true), true)
      // Then click without a selector (should click at current mouse position)
      .click()
      .checkUntil(C.elementText, '#click-status', 'Click detected')
      .do();
  });
  
  it('should detect when click is blocked by a parent element', async function() {
    await page.executeScript(function() {
      document.body.innerHTML = `
        <div id="mousedown-test-container">
          <button id="target-button">Click me (parent blocks click)</button>
          <div id="mousedown-status">No action detected</div>
        </div>
      `;
      
      const container = document.getElementById('mousedown-test-container');
      const button = document.getElementById('target-button');
      const status = document.getElementById('mousedown-status');
      
      if (container && button && status) {
        button.addEventListener('mousedown', function(e) {
          status.textContent = 'Mousedown detected';
        });
        
        container.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
        }, true);
      }
    });
    
    const getStatus = Xdotoolify.setupWithPage((page) => {
      return page.executeScript(function() {
        const statusEl = document.getElementById('mousedown-status');
        return statusEl ? statusEl.textContent : null;
      });
    });
    
    let errorMessage = '';
    try {
      await page.X
        .run(C.autoClick, '#target-button')
        .checkUntil(getStatus, 'Mousedown detected')
        .do();
    } catch (e: any) {
      errorMessage = e.toString();
    }
    
    expect(errorMessage).toContain('Selector #target-button does not match the clicked element');
    expect(errorMessage).toContain('This may be caused by (1) the element changing position');
    expect(errorMessage).toContain('or (3) some components in some frameworks');
    
    const status = await getStatus(page);
    expect(status).toBe('Mousedown detected');
    
    await page.executeScript(function() {
      const status = document.getElementById('mousedown-status');
      if (status) {
        status.textContent = 'No action detected';
      }
    });
    
    await page.X
      .run(C.autoClick, '#target-button', { unsafeIgnoreUnmatchedClick: true })
      .checkUntil(getStatus, 'Mousedown detected')
      .do();
  });
  
});
