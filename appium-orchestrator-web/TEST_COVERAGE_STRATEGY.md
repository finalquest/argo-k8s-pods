# Server.js Test Coverage Strategy

## Current Coverage Analysis
**Total Tests:** 118 passing  
**Estimated Server.js Coverage:** ~15%  
**Critical Gaps:** Authentication, API Routes, Worker Management, Socket.io

## Test Creation Strategy Before Modularization

### Phase 1: Security & Foundation (Critical Priority)
**Goal:** Test security-critical components first

#### 1.1 Authentication System Tests
- Google OAuth configuration validation
- Session management and Passport serialization
- Authentication middleware
- Auth routes (login, logout, current-user)
- Route protection and error handling

#### 1.2 Input Validation & Security Tests
- `sanitize()` function security testing
- Path traversal protection
- Request size limits
- File system access controls

#### 1.3 Configuration Validation Tests
- Environment variable validation
- Server configuration
- Error handling on missing config

### Phase 2: Core API Functionality (High Priority)
**Goal:** Test main business logic

#### 2.1 Device Management API Tests
- `/api/local-devices` endpoint
- ADB command execution
- Device validation and filtering

#### 2.2 Git Operations API Tests
- `/api/branches` endpoint
- Git remote validation
- Branch parsing and error handling

#### 2.3 APK Management API Tests
- `/api/apk/versions` endpoint
- Local APK directory handling
- ORAS registry integration

#### 2.4 Feature Management API Tests
- `/api/features` endpoint
- `readFeaturesRecursive()` function
- Feature tree structure building

#### 2.5 Workspace Management API Tests
- `/api/workspace-status/:branch`
- `/api/feature-content` (GET/POST)
- `/api/commit-status/:branch`
- `/api/workspace-changes/:branch`

### Phase 3: Worker System (High Priority)
**Goal:** Test the test execution engine

#### 3.1 Worker Creation Tests
- `createWorker()` function comprehensive testing
- Worker pool management
- Worker lifecycle (initializing → ready → busy → terminating)
- Process forking and environment setup

#### 3.2 Job Queue Tests
- Job queue management
- `processQueue()` function
- `assignJobToWorker()` function
- Job priority handling

#### 3.3 Job Execution Tests
- `runJobOnWorker()` function
- `startRecordingSequence()` function
- Worker communication protocol
- Report management and cleanup

### Phase 4: Socket.io Functionality (High Priority)
**Goal:** Test real-time features

#### 4.1 Socket Authentication Tests
- Socket session middleware
- Passport integration for sockets
- Connection authorization

#### 4.2 Test Execution Events Tests
- `run_test` event handler
- `run_batch` event handler
- `stop_test` event handler
- `cancel_job` event handler

#### 4.3 Workspace Events Tests
- `prepare_workspace` event handler
- `commit_changes` event handler
- `push_changes` event handler

### Phase 5: Supporting Services (Medium Priority)
**Goal:** Test supporting functionality

#### 5.1 WireMock Services Tests
- Mapping management endpoints
- Recording management endpoints
- File operations for mappings

#### 5.2 Utility Functions Tests
- File system operations
- Git operations
- System operations and cleanup

#### 5.3 Express Configuration Tests
- Middleware setup
- Error handling middleware
- Server startup and configuration

## Test Types by Priority

### Critical (Must Have Before Modularization)
- **Integration Tests:** API endpoints with real dependencies
- **Security Tests:** Authentication, input validation, file access
- **Error Handling Tests:** All error paths and edge cases

### High (Should Have Before Modularization)
- **Unit Tests:** Individual function testing
- **Workflow Tests:** Complete user scenarios
- **Socket Tests:** Real-time event handling

### Medium (Nice to Have)
- **Performance Tests:** Load and stress testing
- **E2E Tests:** Full application workflows

## Implementation Plan

### Week 1: Security Foundation
```bash
# Create test files for Phase 1
src/tests/server/auth/
├── authentication.test.js      # Authentication system
├── middleware.test.js          # Auth middleware
├── session.test.js             # Session management
└── validation.test.js          # Input validation

src/tests/server/config/
└── configuration.test.js       # Server configuration
```

### Week 2: Core API Testing
```bash
# Create test files for Phase 2
src/tests/server/api/
├── devices.test.js             # Device management
├── git.test.js                 # Git operations
├── apk.test.js                 # APK management
├── features.test.js            # Feature management
└── workspace.test.js           # Workspace management
```

### Week 3: Worker System Testing
```bash
# Create test files for Phase 3
src/tests/server/workers/
├── worker-creator.test.js     # Worker creation
├── job-queue.test.js           # Job queue
├── job-assigner.test.js        # Job assignment
├── job-execution.test.js       # Job execution
└── worker-lifecycle.test.js    # Worker lifecycle
```

### Week 4: Socket.io & Services
```bash
# Create test files for Phase 4-5
src/tests/server/socket/
├── socket-auth.test.js         # Socket authentication
├── test-events.test.js         # Test execution events
└── workspace-events.test.js    # Workspace events

src/tests/server/services/
├── wiremock.test.js            # WireMock services
└── utilities.test.js           # Utility functions
```

## Test Coverage Goals

### Before Modularization (Minimum Viable)
- **Authentication:** 100% coverage
- **Core API Routes:** 80% coverage
- **Worker Management:** 70% coverage
- **Critical Paths:** 100% coverage
- **Error Handling:** 90% coverage

### Total Tests Target
- **Current:** 118 tests
- **Target:** 300+ tests
- **Server.js Coverage:** 70%+

## Success Criteria

1. All new tests pass
2. Existing tests continue to pass
3. Test coverage reaches 70%+ for server.js
4. Critical security paths have 100% coverage
5. Integration tests cover main user workflows
6. Mocks and fixtures are properly isolated

## Next Steps

1. **Start with Phase 1** - Authentication and security tests
2. **Use test-driven approach** - Write tests before extracting modules
3. **Focus on integration tests** - Test components working together
4. **Prioritize critical paths** - Main user workflows first
5. **Document test scenarios** - Create test matrices for coverage

This strategy ensures we have comprehensive test coverage before starting the modularization process, significantly reducing the risk of breaking existing functionality.