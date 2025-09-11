# Server.js Modularization Plan

## Overview
**Current File Size:** 2,232 lines  
**Goal:** Transform monolithic server.js into maintainable modules while preserving all functionality.

## Architecture Strategy

### Directory Structure
```
src/
├── config/
│   ├── index.js          # Main configuration
│   ├── auth.js           # Authentication config
│   ├── server.js         # Server config
│   └── constants.js      # Application constants
├── auth/
│   ├── index.js          # Auth setup & middleware
│   ├── strategies.js     # Passport strategies
│   ├── middleware.js     # Auth middleware
│   └── routes.js         # Auth routes
├── api/
│   ├── index.js          # API router setup
│   ├── devices.js        # Device management
│   ├── git.js            # Git endpoints
│   ├── apk.js            # APK management
│   ├── features.js       # Feature file endpoints
│   ├── workspace.js      # Workspace management
│   ├── wiremock.js       # Wiremock management
│   └── mappings.js       # Mapping file endpoints
├── workers/
│   ├── index.js          # Worker pool management
│   ├── creator.js        # Worker creation & lifecycle
│   ├── job-queue.js      # Job queue management
│   ├── job-assigner.js   # Job assignment logic
│   ├── reporter.js       # Report handling
│   └── types.js          # Type definitions
├── socket/
│   ├── index.js          # Socket.io setup
│   ├── handlers.js       # Event handlers
│   ├── test-events.js    # Test execution events
│   ├── workspace-events.js # Workspace events
│   ├── git-events.js     # Git operation events
│   └── middleware.js     # Socket auth middleware
├── services/
│   ├── git.js            # Git operations
│   ├── file-system.js    # File system operations
│   ├── recording.js      # Recording sequences
│   ├── wiremock.js       # Wiremock API service
│   └── workspace.js      # Workspace management
├── utils/
│   ├── index.js          # Utility exports
│   ├── sanitize.js       # Input sanitization
│   ├── cleanup.js        # Cleanup utilities
│   ├── broadcast.js      # Status broadcasting
│   └── validation.js     # Input validation
└── tests/
    └── modular/          # Module-specific tests
```

## Phase-by-Phase Implementation

### Phase 1: Core Infrastructure (High Priority)
**Goal:** Extract foundational modules that others depend on

#### 1.1 Configuration Module
- **Target:** Lines 1-37, environment variables, constants
- **Files:** `src/config/index.js`, `src/config/auth.js`, `src/config/server.js`
- **Key Components:**
  - Environment variable validation
  - Server configuration (PORT, session settings)
  - Authentication configuration
  - Application constants

#### 1.2 Utilities Module
- **Target:** Lines 1181-1183 (sanitize), other utility functions
- **Files:** `src/utils/index.js`, `src/utils/sanitize.js`
- **Key Components:**
  - Input sanitization
  - Cleanup utilities
  - Validation helpers

#### 1.3 Authentication Module
- **Target:** Lines 25-132 (authentication setup)
- **Files:** `src/auth/index.js`, `src/auth/strategies.js`, `src/auth/middleware.js`
- **Key Components:**
  - Google OAuth configuration
  - Passport setup
  - Session middleware
  - Authentication middleware

### Phase 2: Services Layer (Medium Priority)
**Goal:** Extract business logic services

#### 2.1 Git Service
- **Target:** Git-related code scattered across API routes
- **Files:** `src/services/git.js`
- **Key Components:**
  - Repository operations
  - Branch management
  - Commit operations
  - Push operations

#### 2.2 File System Service
- **Target:** File operations, directory reading
- **Files:** `src/services/file-system.js`
- **Key Components:**
  - Recursive directory reading
  - File operations
  - Path management

#### 2.3 Workspace Service
- **Target:** Workspace management logic
- **Files:** `src/services/workspace.js`
- **Key Components:**
  - Workspace creation
  - Workspace status checking
  - Workspace cleanup

#### 2.4 Wiremock Service
- **Target:** Wiremock API interactions
- **Files:** `src/services/wiremock.js`
- **Key Components:**
  - Wiremock admin API
  - Stub management
  - Mapping operations

### Phase 3: API Layer (Medium Priority)
**Goal:** Extract route handlers into logical modules

#### 3.1 API Router Setup
- **Target:** Lines 133-1172 (all API routes)
- **Files:** `src/api/index.js`
- **Key Components:**
  - Express router setup
  - Route registration
  - Error handling middleware

#### 3.2 Individual Route Modules
- **Target:** Specific route groups
- **Files:** Individual files in `src/api/`
- **Key Components:**
  - Device management routes (Lines 133-183)
  - Git configuration routes (Lines 185-236)
  - APK management routes (Lines 238-434)
  - Feature management routes (Lines 436-502)
  - Workspace routes (Lines 504-851)
  - Wiremock routes (Lines 854-1108)
  - Mapping routes (Lines 1110-1172)

### Phase 4: Worker Management (High Priority)
**Goal:** Extract complex worker system

#### 4.1 Worker Types and Constants
- **Target:** Worker-related type definitions
- **Files:** `src/workers/types.js`
- **Key Components:**
  - Worker status enums
  - Job type definitions
  - Configuration constants

#### 4.2 Worker Creation
- **Target:** Lines 1437-1683 (createWorker function)
- **Files:** `src/workers/creator.js`
- **Key Components:**
  - Worker process creation
  - Workspace path logic
  - Worker lifecycle management

#### 4.3 Job Queue Management
- **Target:** Lines 1287-1304 (job queue)
- **Files:** `src/workers/job-queue.js`
- **Key Components:**
  - Queue initialization
  - Job processing
  - Queue management

#### 4.4 Job Assignment Logic
- **Target:** Lines 1306-1348 (job assignment)
- **Files:** `src/workers/job-assigner.js`
- **Key Components:**
  - Worker availability checking
  - Job assignment algorithms
  - Load balancing

#### 4.5 Worker Pool Management
- **Target:** Lines 1174-1183, 1268-1285
- **Files:** `src/workers/index.js`
- **Key Components:**
  - Worker pool initialization
  - Worker cleanup
  - Pool management

### Phase 5: Socket Layer (Medium Priority)
**Goal:** Extract Socket.io event handlers

#### 5.1 Socket Setup
- **Target:** Lines 1685-1701, 1703-1721
- **Files:** `src/socket/index.js`, `src/socket/middleware.js`
- **Key Components:**
  - Socket.io setup
  - Authentication middleware
  - Connection handling

#### 5.2 Event Handler Modules
- **Target:** Lines 1722-2227 (event handlers)
- **Files:** `src/socket/test-events.js`, `src/socket/workspace-events.js`, `src/socket/git-events.js`
- **Key Components:**
  - Test execution events
  - Workspace management events
  - Git operation events

### Phase 6: Integration (Low Priority)
**Goal:** Update main server file and finalize

#### 6.1 Main Server File Update
- **Target:** Lines 2229-2231, plus all module imports
- **Files:** `server.js` (refactored)
- **Key Components:**
  - Module imports
  - Server setup
  - Module integration

#### 6.2 Testing and Validation
- **Target:** All new modules
- **Files:** `src/tests/modular/`
- **Key Components:**
  - Unit tests for each module
  - Integration tests
  - End-to-end tests

## Implementation Benefits

### Code Quality
1. **Maintainability:** Easier to navigate and modify specific functionality
2. **Readability:** Clear separation of concerns
3. **Testability:** Individual modules can be unit tested
4. **Reusability:** Common utilities can be shared

### Development Benefits
1. **Parallel Development:** Multiple developers can work on different modules
2. **Easier Debugging:** Issues are isolated to specific modules
3. **Better Onboarding:** New developers can understand the codebase faster
4. **Documentation:** Modules can be documented independently

### Performance Benefits
1. **Faster Startup:** Only required modules are loaded
2. **Better Memory Usage:** Unused modules can be optimized
3. **Improved Caching:** Individual modules can be cached

## Risk Assessment

### Low Risk
- Configuration module extraction
- Utilities module extraction
- Individual route modules

### Medium Risk
- Service layer extraction
- API route restructuring
- Socket handler separation

### High Risk
- Worker management extraction (complex interdependencies)
- Authentication module (security-critical)

## Success Criteria

1. All existing functionality preserved
2. All existing tests pass
3. New modules have comprehensive test coverage
4. Performance is not degraded
5. Code is more maintainable and readable
6. Development workflow is improved

## Next Steps

1. **Phase 1 Implementation:** Start with low-risk configuration and utility modules
2. **Incremental Testing:** Test each module immediately after extraction
3. **Regular Validation:** Run full test suite after each phase
4. **Documentation:** Document each module as it's created
5. **Team Review:** Review architecture with team before proceeding