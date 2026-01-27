# AGENTS.md

This document provides guidelines for agentic coding tools working in this repository.

## Repository Structure

This is a Kubernetes-focused monorepo with multiple services:
- `inventory/` - NestJS backend (`api/`) and React frontend (`web/`)
- `appium-orchestrator-web/` - Express.js backend with Socket.IO
- `tokyo-bot/` - Telegram bot (simple ES modules)
- `media-arr-books/` - Books search bot
- Various Kubernetes manifests and Helm charts

## Build, Lint, and Test Commands

### inventory/api (NestJS + TypeScript)
```bash
cd inventory/api
npm run build          # Build project
npm run format          # Format with Prettier
npm run lint            # Run ESLint with auto-fix
npm test                # Run Jest tests
npm run test:watch      # Watch mode
npm run test:cov        # Coverage report
npm run test:e2e        # E2E tests
npm run start:dev       # Dev mode with watch
```
Run single test: `jest path/to/test.spec.ts` or `jest -t "test name"`

### inventory/web (React + Vite + TypeScript)
```bash
cd inventory/web
npm run dev             # Vite dev server
npm run build           # Build for production
npm run lint            # Run ESLint
npm run test:e2e        # Playwright E2E tests
```

### appium-orchestrator-web (Express + CommonJS)
```bash
cd appium-orchestrator-web
npm run dev             # Nodemon watch mode
npm test                # Run Jest tests
npm run test:watch      # Watch mode
npm run test:smoke      # Phase 0 tests
npm run test:phase1      # Phase 1 tests
npm run test:phase2      # Phase 2 tests
npm run test:phase3      # Phase 3 tests
npm run test:coverage    # Coverage report
npm run lint            # Run ESLint
npm run lint:fix        # ESLint with auto-fix
npm run format          # Prettier format
```
Run single test: `jest path/to/test.test.js`

### tokyo-bot / media-arr-books (ES Modules)
```bash
cd tokyo-bot  # or cd media-arr-books/books-bot-image
npm start              # Start the bot
npm test               # Run Jest tests
npm run test:watch     # Watch mode
```

## Code Style Guidelines

### General
- **Prettier**: Single quotes, semicolons, trailing commas (all), 2 spaces, 80 char width
- **ESLint**: Used in all TypeScript/JavaScript projects
- Run `npm run lint` (or appropriate lint command) before committing changes

### TypeScript Services (inventory/api)
- **Module system**: ES modules with `import/export`
- **Imports**: Relative imports using `../` notation (no path aliases)
- **File extensions**: `.ts` for source, `.spec.ts` for tests
- **Types**: TypeScript enabled but `noImplicitAny` is disabled
- **Decorators**: Enabled for NestJS (`@Injectable`, `@Controller`, etc.)
- **Test patterns**: Jest with `@nestjs/testing`, use `Test.createTestingModule()`

### React Frontend (inventory/web)
- **Framework**: React 19 with TypeScript
- **Build tool**: Vite
- **Styling**: Tailwind CSS + CSS custom properties for theming
- **Types**: TypeScript enabled, use type imports for React (`import type { ... }`)
- **Testing**: Playwright for E2E
- **Imports**: Relative imports, CSS files imported directly

### JavaScript Services (appium-orchestrator-web)
- **Module system**: CommonJS (`require/module.exports`)
- **Path aliases**: Use `@/` for project root (configured in Jest)
- **File extensions**: `.js` for source, `.test.js` for tests
- **Testing**: Jest with jsdom environment, test phases (smoke, phase1, phase2, phase3)
- **Config**: Uses module-based architecture in `src/modules/`

### ES Module Services (tokyo-bot, media-arr-books)
- **Module system**: ES modules (`import/export`)
- **File extensions**: `.js`
- **Testing**: Jest with `--experimental-vm-modules` flag

### Naming Conventions
- **Classes**: PascalCase (`WorkspaceManager`)
- **Variables/Functions**: camelCase (`createWorkspace`, `prisma`)
- **Constants**: UPPER_SNAKE_CASE or camelCase depending on scope
- **Files**: kebab-case for directories, PascalCase/camelCase for files
- **Test files**: `.spec.ts` (NestJS), `.test.js` (Node.js), `.test.tsx` (React)

### Error Handling
- **NestJS services**: Use NestJS exceptions (`@nestjs/common`)
  - `NotFoundException` for missing resources
  - `ConflictException` for duplicates/invalid state
  - `BadRequestException` for invalid input
- **Services**: Return `{ success: boolean, ...data }` objects or throw
- **React**: Show user-friendly status banners, use `try/catch` with status states

### Async Operations
- Use `async/await` consistently
- Use `Promise.all()` for parallel operations
- Handle errors appropriately for each service type

### Testing Guidelines
- **NestJS**: Mock PrismaService using jest.fn(), test happy and error paths
- **Node.js**: Use Jest mocks, phase-based test organization
- **React**: Component tests not present, focus on E2E with Playwright
- **Before running tests**: Verify all dependencies are installed

### Kubernetes/Helm
- Use YAML for all manifests
- Follow existing chart structure in `android-emulators/`, `maestro-orchestrator-chart/`
- Use `values.yaml` for configuration
- Namespace all resources appropriately

### General Rules
- No console.logs in production code (use logging utilities)
- Follow existing file structure in each service
- Match import/export style of the service you're editing
- Run lint commands before committing
- Add type definitions for new TypeScript code
- Spanish comments and error messages are acceptable (especially in appium-orchestrator-web)
