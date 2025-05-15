# CLAUDE.md - xdotoolify.js Project

## Project Overview
xdotoolify.js is a TypeScript library that enables Selenium to simulate user interactions (clicks, keystrokes) at the operating system level using xdotool. This makes browser automation indistinguishable from real user actions.

## Key Technical Details
- **Language**: TypeScript (recently migrated from JavaScript)
- **Target Browser**: Firefox only (as of current version)
- **Dependencies**: selenium-webdriver, xdotool, fast-deep-equal
- **Testing**: Jest with ts-jest, runs in Docker with Xvfb and fluxbox

## Project Structure
```
xdotoolify.js/
├── src/
│   └── xdotoolify.ts      # Main implementation (~1458 lines)
├── test/
│   └── xdotoolify-spec.ts # Test suite
├── Dockerfile             # Test environment with xdotool, Firefox, Xvfb
├── run-tests.sh          # Test runner script (MUST USE THIS)
├── package.json          # Project configuration
└── tsconfig.json         # TypeScript configuration
```

## Testing

### IMPORTANT: Running Tests
Tests MUST be run using the provided script which sets up the required Docker environment:

Run all tests:
```bash
./run-tests.sh
```

Run a single test (using Jest pattern matching):
```bash
./run-tests.sh -t "detect type errors"
```

Run all tests matching "checkUntil":
```bash
./run-tests.sh -t "checkUntil"
```

Run specific test by exact name:
```bash
./run-tests.sh -t "should detect type errors for incorrect API usage"
```

This script:
1. Builds a Docker image with Firefox, xdotool, fluxbox, and Xvfb
2. Starts Xvfb (virtual display) on display :50
3. Starts fluxbox window manager
4. Runs the Jest test suite inside the container

**DO NOT** run tests directly with `npm test` outside of Docker - they will fail due to missing dependencies (xdotool, X server, window manager).

### Test Environment
The Docker container includes:
- Selenium standalone Firefox
- xdotool for OS-level input simulation
- fluxbox window manager
- Xvfb for headless display
- Node.js 24.x

## Key Concepts
1. **Page Extensions**: Adds `.X` property to WebDriver instances
2. **Operation Chaining**: All operations are queued and executed with `.do()`
3. **Type Safety**: Uses generics and branded types for function setup
4. **Check System**: `checkUntil` provides assertion capabilities
5. **Focus Management**: Handles window focus and positioning

## Common Tasks

### Building
```bash
npm run build
```

### Type Checking
```bash
npm run typecheck
```

## Code Style Guidelines
- Use TypeScript strict mode
- Avoid adding comments that describe what code does (only explain why)
- Follow existing patterns for operation methods
- Ensure all new methods have proper type definitions
- Add test coverage for new features

## Important Notes
1. Tests require Docker environment with X server and window manager
2. The library currently only supports Firefox
3. All coordinates are screen-relative, not page-relative
4. Display is set to :50.0 in the test environment

## Common Patterns

### Adding New Operations
```typescript
_newOperation(param: Type, checkAfter = false): this {
  this._addOperation({
    type: 'newOperation',
    param: param,
    checkAfter: checkAfter
  });
  return this;
}

newOperation(param: Type): this {
  return this._newOperation(param, true);
}
```

### Type-Safe Functions
```typescript
const myFunc = Xdotoolify.setupWithPage((page: PageWithX, arg: string) => {
  // function body
});
```

## Current Git Branch
- Working on: `typescript` branch
- Main branch: `master`

## Recent Changes
- Migrated entire codebase from JavaScript to TypeScript
- Added comprehensive type definitions
- Improved type safety for operation chaining
- Enhanced test coverage for type errors