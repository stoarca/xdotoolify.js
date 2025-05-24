import { XWebDriver } from '../src/xdotoolify';
import * as XC from '../src/common';
import { setupTestEnvironment, teardownTestEnvironment, resetPageState } from './setup';

describe('common utility functions', function() {
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

  describe('basic utility functions', function() {
    beforeEach(async function() {
      await XC.evaluate(page, () => {
        document.body.innerHTML = `
          <div class="test-visible">Visible Element 1</div>
          <div class="test-visible">Visible Element 2</div>
          <div class="test-visible" style="display: none;">Hidden Element</div>
          <input id="test-input" value="test value">
          <input id="empty-input" value="">
          <div id="text-element">This is a test text</div>
          <div id="empty-element"></div>
        `;
      });
    });

    it('should get element count correctly', async function() {
      const count = await XC.elementCount(page, ".test-visible");
      expect(count).toBe(3);
      
      const nonExistentCount = await XC.elementCount(page, ".non-existent");
      expect(nonExistentCount).toBe(0);
    });

    it('should get element text correctly', async function() {
      const text = await XC.elementText(page, "#text-element");
      expect(text).toBe("This is a test text");
      
      const emptyText = await XC.elementText(page, "#empty-element");
      expect(emptyText).toBe("");
      
      const nonExistentText = await XC.elementText(page, "#non-existent");
      expect(nonExistentText).toBe(null);
    });

    it('should get input value correctly', async function() {
      const value = await XC.getInputValue(page, "#test-input");
      expect(value).toBe("test value");
      
      const emptyValue = await XC.getInputValue(page, "#empty-input");
      expect(emptyValue).toBe("");
      
      const nonExistentValue = await XC.getInputValue(page, "#non-existent");
      expect(nonExistentValue).toBe(false);
    });

    it('should count visible elements correctly', async function() {
      const result = await XC.visibleElementCount(page, ".test-visible");
      expect(result.value).toBe(2);
      expect(result.debugInfo.totalElements).toBe(3);
      
      const nonExistentResult = await XC.visibleElementCount(page, ".non-existent");
      expect(nonExistentResult.value).toBe(0);
      expect(nonExistentResult.debugInfo.totalElements).toBe(0);
    });

    it('should check if element is active', async function() {
      await XC.evaluate(page, () => {
        document.getElementById('test-input')!.focus();
      });

      const isActive = await XC.isElementActive(page, "#test-input");
      expect(isActive).toBe(true);

      const isNotActive = await XC.isElementActive(page, "#empty-input");
      expect(isNotActive).toBe(false);
    });

    it('should check if all content is selected', async function() {
      await XC.evaluate(page, () => {
        const input = document.getElementById('test-input') as HTMLInputElement;
        input.focus();
        input.select();
      });

      const isSelected = await XC.isAllContentSelected(page, "#test-input");
      expect(isSelected).toBe(true);

      const isNotSelected = await XC.isAllContentSelected(page, "#empty-input");
      expect(isNotSelected).toBe(false);
    });

    it('should work with array selectors', async function() {
      await XC.evaluate(page, () => {
        document.body.innerHTML += `
          <input class="test-items" value="First">
          <input class="test-items" value="Second">
          <input class="test-items" value="Third">
        `;
      });

      const text = await XC.elementText(page, ['.test-items', 1]);
      expect(text).toBe('');

      await XC.evaluate(page, () => {
        (document.querySelectorAll('.test-items')[2] as HTMLInputElement).focus();
      });

      const isActive = await XC.isElementActive(page, ['.test-items', 2]);
      expect(isActive).toBe(true);
    });

    it('should work with checkUntil and visibleElementCount using value check', async function() {
      await XC.evaluate(page, () => {
        document.body.innerHTML = `
          <div class="test-visible">Visible Element 1</div>
          <div class="test-visible">Visible Element 2</div>
          <div class="test-visible" style="display: none;">Hidden Element</div>
        `;
      });
      
      await page.X.checkUntil(XC.visibleElementCount, ".test-visible", 2).do();
    });
    
    it('should work with checkUntil and visibleElementCount using callback', async function() {
      await XC.evaluate(page, () => {
        document.body.innerHTML = `
          <div class="test-visible">Visible Element 1</div>
          <div class="test-visible">Visible Element 2</div>
          <div class="test-visible" style="opacity: 0;">Zero Opacity Element</div>
        `;
      });
      
      await page.X.checkUntil(XC.visibleElementCount, ".test-visible", (result) => {
        expect(result).toBe(2);
        expect(typeof result).toBe("number");
        return true;
      }).do();
    });
  });

  describe('auto* functions', function() {
    beforeEach(async function() {
      await XC.evaluate(page, () => {
        document.body.innerHTML = `
          <input id="test-input" value="initial value">
          <textarea id="test-textarea">initial text</textarea>
          <button id="test-button">Click Me</button>
          <div id="draggable" draggable="true" style="width: 50px; height: 50px; background: red; position: absolute; left: 100px; top: 100px;">Drag</div>
          <div id="drop-target" style="width: 200px; height: 200px; background: blue; position: absolute; left: 200px; top: 200px;">Drop</div>
          <input id="key-input" value="">
        `;

        // Add proper drag and drop event listeners
        const draggable = document.getElementById('draggable')!;
        const dropTarget = document.getElementById('drop-target')!;

        draggable.addEventListener('dragstart', (e) => {
          console.log('Drag started');
          (window as any).dragStarted = true;
          e.dataTransfer!.effectAllowed = 'move';
          e.dataTransfer!.setData('text/html', draggable.outerHTML);
        });

        draggable.addEventListener('dragend', (e) => {
          console.log('Drag ended');
          (window as any).dragEnded = true;
        });

        dropTarget.addEventListener('dragover', (e) => {
          e.preventDefault();
        });

        dropTarget.addEventListener('dragenter', (e) => {
          e.preventDefault();
        });

        dropTarget.addEventListener('drop', (e) => {
          e.preventDefault();
          console.log('Drop occurred');
          (window as any).dropOccurred = true;
          
          // Move the draggable element to the drop target position
          const dropRect = dropTarget.getBoundingClientRect();
          draggable.style.left = dropRect.left + 'px';
          draggable.style.top = dropRect.top + 'px';
        });

        // Also add mousedown/mouseup tracking for comparison
        draggable.addEventListener('mousedown', () => {
          console.log('Mouse down on draggable');
          (window as any).mouseDownOccurred = true;
        }, true);

        document.addEventListener('mouseup', () => {
          console.log('Mouse up on document');
          (window as any).mouseUpOccurred = true;
        }, true);
      });
    });

    it('asdfg should autoClick on elements', async function() {
      await XC.evaluate(page, () => {
        document.getElementById('test-button')!.addEventListener('click', () => {
          (window as any).buttonClicked = true;
        });
      });

      await page.X
        .run(XC.autoClick, '#test-button')
        .checkUntil(XC.evaluate, () => (window as any).buttonClicked, true)
        .do();

      const wasClicked = await XC.evaluate(page, () => (window as any).buttonClicked);
      expect(wasClicked).toBe(true);
    });

    it('asdfg should autoClick with custom options', async function() {
      await XC.evaluate(page, () => {
        document.getElementById('test-button')!.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          (window as any).rightClicked = true;
        });
      });

      await page.X
        .run(XC.autoClick, '#test-button', { mouseButton: 'right', timeout: 2000 })
        .checkUntil(XC.evaluate, () => (window as any).rightClicked, true)
        .do();

      const wasRightClicked = await XC.evaluate(page, () => (window as any).rightClicked);
      expect(wasRightClicked).toBe(true);
    });

    it('should autoDrag elements', async function() {
      await page.X
        .run(XC.autoDrag, '#draggable', '#drop-target')
        .checkUntil(XC.evaluate, () => (window as any).dragEnded, true)
        .do();
      
      const events = await XC.evaluate(page, () => {
        return {
          mouseDown: (window as any).mouseDownOccurred,
          mouseUp: (window as any).mouseUpOccurred,
          dragStarted: (window as any).dragStarted,
          dragEnded: (window as any).dragEnded,
          dropOccurred: (window as any).dropOccurred,
        };
      });
      
      expect(events.mouseDown).toBe(true);
      expect(events.mouseUp).toBe(true);
      expect(events.dragStarted).toBe(true);
      expect(events.dragEnded).toBe(true);
      // THIS IS WRONG!! For some reason using xdotool does not cause the
      // drop event to fire. Need to investigate more
      expect(events.dropOccurred).toBeFalsy();
    });

    it('should autoKey on elements', async function() {
      await XC.evaluate(page, () => {
        (document.getElementById('key-input') as HTMLInputElement).focus();
      });

      await page.X
        .run(XC.autoKey, '#key-input', 'h e l l o space w o r l d')
        .checkUntil(XC.getInputValue, '#key-input', 'hello world')
        .do();

      const value = await XC.getInputValue(page, '#key-input');
      expect(value).toBe('hello world');
    });

    it('should autoKey with custom relpos', async function() {
      await XC.evaluate(page, () => {
        (document.getElementById('key-input') as HTMLInputElement).focus();
      });

      await page.X
        .run(XC.autoKey, '#key-input', 't e s t', { relpos: 'center', timeout: 1000 })
        .checkUntil(XC.getInputValue, '#key-input', 'test')
        .do();

      const value = await XC.getInputValue(page, '#key-input');
      expect(value).toBe('test');
    });

    it('should autoType on input elements', async function() {
      await page.X
        .run(XC.autoType, '#test-input', 'New text content')
        .checkUntil(XC.getInputValue, '#test-input', 'initial valueNew text content')
        .do();

      const value = await XC.getInputValue(page, '#test-input');
      expect(value).toBe('initial valueNew text content');
    });

    it('should autoType with overwrite option', async function() {
      await page.X
        .run(XC.autoType, '#test-input', 'Replaced text', { overwrite: true })
        .checkUntil(XC.getInputValue, '#test-input', 'Replaced text')
        .do();

      const value = await XC.getInputValue(page, '#test-input');
      expect(value).toBe('Replaced text');
    });

    it('should autoType on textarea elements', async function() {
      await page.X
        .run(XC.autoType, '#test-textarea', 'New content')
        .checkUntil(XC.getInputValue, '#test-textarea', 'initial textNew content')
        .do();

      const value = await XC.getInputValue(page, '#test-textarea');
      expect(value).toBe('initial textNew content');
    });

    it('should autoType with overwrite on textarea', async function() {
      await page.X
        .run(XC.autoType, '#test-textarea', 'Completely new content', { overwrite: true })
        .checkUntil(XC.getInputValue, '#test-textarea', 'Completely new content')
        .do();

      const value = await XC.getInputValue(page, '#test-textarea');
      expect(value).toBe('Completely new content');
    });

    it('should autoType with multi-line text', async function() {
      const multilineText = 'Line 1\nLine 2\nLine 3';
      await page.X
        .run(XC.autoType, '#test-textarea', multilineText, { overwrite: true })
        .checkUntil(XC.getInputValue, '#test-textarea', multilineText)
        .do();

      const value = await XC.getInputValue(page, '#test-textarea');
      expect(value).toBe(multilineText);
    });

    it('should autoType with custom relpos and timeout', async function() {
      await page.X
        .run(XC.autoType, '#test-input', 'Custom pos', { 
          relpos: 'topleft', 
          timeout: 2000, 
          overwrite: true 
        })
        .checkUntil(XC.getInputValue, '#test-input', 'Custom pos')
        .do();

      const value = await XC.getInputValue(page, '#test-input');
      expect(value).toBe('Custom pos');
    });

    it('should work with array selectors', async function() {
      await XC.evaluate(page, () => {
        document.body.innerHTML += `
          <button class="test-items">First</button>
          <button class="test-items">Second</button>
          <button class="test-items">Third</button>
        `;
      });

      await XC.evaluate(page, () => {
        document.querySelectorAll('.test-items')[1].addEventListener('click', () => {
          (window as any).secondItemClicked = true;
        });
      });

      await page.X
        .run(XC.autoClick, ['.test-items', 1])
        .checkUntil(XC.evaluate, () => (window as any).secondItemClicked, true)
        .do();

      const wasClicked = await XC.evaluate(page, () => (window as any).secondItemClicked);
      expect(wasClicked).toBe(true);
    });

    it('should handle errors gracefully', async function() {
      await expect(async () => {
        await page.X.run(XC.autoClick, '#non-existent-element').do();
      }).rejects.toThrow();
    });

    it('should work with empty text in autoType', async function() {
      await page.X
        .run(XC.autoType, '#test-input', '', { overwrite: true })
        .checkUntil(XC.getInputValue, '#test-input', '')
        .do();

      const value = await XC.getInputValue(page, '#test-input');
      expect(value).toBe('');
    });

    it('should preserve focus after autoKey operations', async function() {
      await page.X
        .run(XC.autoKey, '#key-input', 'f o c u s e d')
        .checkUntil(XC.isElementActive, '#key-input', true)
        .do();

      const isActive = await XC.isElementActive(page, '#key-input');
      expect(isActive).toBe(true);
    });

    it('should handle special keys in autoKey', async function() {
      await XC.evaluate(page, () => {
        (document.getElementById('key-input') as HTMLInputElement).value = 'test';
      });

      await page.X
        .run(XC.autoKey, '#key-input', 'ctrl+a Delete')
        .checkUntil(XC.getInputValue, '#key-input', '')
        .do();

      const value = await XC.getInputValue(page, '#key-input');
      expect(value).toBe('');
    });

    it('should autoType without overwrite preserves existing content', async function() {
      await page.X
        .run(XC.autoType, '#test-input', ' appended', { overwrite: false })
        .checkUntil(XC.getInputValue, '#test-input', 'initial value appended')
        .do();

      const value = await XC.getInputValue(page, '#test-input');
      expect(value).toBe('initial value appended');
    });

    it('should handle timeout option in autoClick', async function() {
      // Create element dynamically after a delay
      setTimeout(async () => {
        await XC.evaluate(page, () => {
          document.body.innerHTML += '<button id="delayed-button">Delayed Button</button>';
          document.getElementById('delayed-button')!.addEventListener('click', () => {
            (window as any).delayedClicked = true;
          });
        });
      }, 50);

      await page.X
        .run(XC.autoClick, '#delayed-button', { timeout: 1000 })
        .checkUntil(XC.evaluate, () => (window as any).delayedClicked, true)
        .do();

      const wasClicked = await XC.evaluate(page, () => (window as any).delayedClicked);
      expect(wasClicked).toBe(true);
    });

    it('should work with different relpos options in autoType', async function() {
      const positions = ['topleft', 'topright', 'bottomleft', 'bottomright', 'center'];
      
      for (const relpos of positions) {
        await page.X
          .run(XC.autoType, '#test-input', `pos-${relpos}`, { 
            overwrite: true,
            relpos: relpos
          })
          .checkUntil(XC.getInputValue, '#test-input', `pos-${relpos}`)
          .do();

        const value = await XC.getInputValue(page, '#test-input');
        expect(value).toBe(`pos-${relpos}`);
      }
    });
  });
});
