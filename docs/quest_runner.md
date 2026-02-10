# Quest Runner Architecture - @apiquest/fracture v1.0

## Overview

`@apiquest/fracture` is the core collection runner engine for Quest. It's a TypeScript/Node.js package that executes API test collections with full support for scripting, iterations, variables, and plugins.

---

## Package Information

**NPM Package:** `@apiquest/fracture`
**Language:** TypeScript
**Runtime:** Node.js 18+
**License:** AGPL-3.0-or-later OR Commercial

---

## Architecture

### High-Level Design

```
@apiquest/fracture
├── CollectionRunner      - Main orchestration engine
├── ScriptEngine          - JavaScript execution (native Node.js VM)
├── VariableResolver      - Variable resolution & scoping
├── PluginManager         - Protocol plugin system
├── EventEmitter          - Real-time progress events
└── Types                 - TypeScript interfaces
```

### Core Components

#### 1. CollectionRunner

Main execution engine responsible for:
- Collection-level iteration management
- Request execution with dependencies
- Pre/post-request script execution
- Test script execution
- Plugin coordination
- Event emission

**Key Methods:**
```typescript
class CollectionRunner {
    // Register protocol plugins
    registerPlugin(plugin: IProtocolPlugin): void
    
    // Execute collection
    async run(
        collection: Collection,
        options?: RunOptions
    ): Promise<RunResult>
    
    // Event handling
    on(event: string, handler: Function): void
    off(event: string, handler: Function): void
}
```

#### 2. ScriptEngine

Executes JavaScript test/pre-request/post-request scripts using Node.js native VM module.

**Features:**
- Native JavaScript execution
- Full npm ecosystem access
- async/await support
- Promise support
- Chai assertions included
- quest.* API injection

**Key Methods:**
```typescript
class ScriptEngine {
    async execute(
        script: string,
        context: ExecutionContext,
        scriptType: ScriptType
    ): Promise<ScriptResult>
}
```

#### 3. VariableResolver

Resolves `{{variables}}` with cascading priority.

**Resolution Order:**
1. Iteration data (collection or request)
2. Local variables (request-scoped)
3. Collection variables
4. Environment variables
5. Global variables

**Key Methods:**
```typescript
class VariableResolver {
    resolve(
        template: string,
        context: ExecutionContext
    ): string
    
    resolveAll(
        values: Record<string, string>,
        context: ExecutionContext
    ): Record<string, string>
}
```

#### 4. PluginManager

Manages protocol plugins (HTTP, GraphQL, gRPC, etc.).

**Key Methods:**
```typescript
class PluginManager {
    register(plugin: IProtocolPlugin): void
    getPlugin(protocol: string): IProtocolPlugin | undefined
    async execute(
        request: Request,
        context: ExecutionContext
    ): Promise<ProtocolResponse>
}
```

#### 5. Plugin Loading Architecture

Two-phase selective loading system for optimal performance.

**Phase 1: Metadata Resolution (Background)**
- Scans plugin directories for package.json metadata
- Reads `apiquest.capabilities.provides` field
- Resolves version conflicts (newer version wins)
- Dev plugins override desktop-installed plugins
- Non-blocking background process
- Component: `PluginResolver.ts`

**Phase 2: Selective Loading (Collection Start)**
- Analyzes collection requirements (protocols, auth types, value providers)
- Loads only required plugins via dynamic import()
- Filters unused plugins for faster startup
- Fails fast if required plugin missing
- Components: `PluginLoader.ts`, `CollectionAnalyzer.ts`

**Plugin Metadata Format (package.json):**
```json
{
  "apiquest": {
    "type": "protocol" | "auth" | "value",
    "runtime": ["fracture"],
    "capabilities": {
      "provides": {
        "protocols": ["http"],
        "authTypes": ["bearer", "basic"],
        "provider": "vault:file"
      }
    }
  }
}
```

**Benefits:**
- Fast startup (background resolution, selective loading)
- Version management (newer plugins override older)
- Priority system (dev plugins override installed)
- Error handling (resolution continues on errors, loading fails fast)

---

## Execution Pipeline

### Collection Execution Flow

```
RunAsync(Collection, Options)
    ↓
1. Plugin resolution completes (Phase 1 background)
    ↓
1a. Analyze collection requirements
    ↓
1b. Load required plugins (Phase 2 selective loading)
    ↓
2. Build execution tree
    ↓
3. PRE-RUN VALIDATION (AST + Plugins)
    ├─ Validate script locations
    ├─ Validate conditional tests (strictMode only)
    ├─ Validate quest.skip/fail placement
    ├─ Validate request data against plugin schemas
    ├─ Validate auth configurations
    └─ Validate plugin options
    ↓
4. Count tests deterministically (AST scan)
    ↓
5. Emit beforeRun (with validation + testCount)
    ↓
6. STOP if validation failed (return result with errors)
    ↓
7. Load iteration data (if --data provided or collection.testData exists)
    ↓
8. Execute collection pre-request script (once, before iterations)
    ↓
9. FOR EACH iteration (collection.testData row):
    ├─ Set iteration context (current, count, data)
    ├─ FOR EACH request/folder (respecting dependencies):
    │   ├─ Execute folder pre-request script (on folder entry)
    │   ├─ Execute request (see Request Flow below)
    │   └─ Execute folder post-request script (on folder exit)
    ↓
10. Execute collection post-request script (once, after all iterations)
    ↓
11. Return RunResult
```

### Request Execution Flow

```
ExecuteRequest(Request, Context)
    ↓
1. Push request scope (reset request-level variables)
    ↓
2. Execute pre-request scripts (collection → folder → request)
    ↓
3. Resolve variables in request ({{var}})
    ↓
4. Check condition (if specified) - skip if false
    ↓
5. Get protocol plugin
    ↓
6. Execute request via plugin (plugin events may emit event scripts)
    ↓
7. Execute post-request scripts (request → folder → collection; tests allowed in request post + plugin event scripts)
    ↓
8. Record in execution history
    ↓
9. Emit events
    ↓
10. Return RequestResult
```

### Runner Event Flow (per iteration)

```
beforeRun
  beforeCollectionPreScript
  afterCollectionPreScript
  beforeIteration (1)
    beforeFolder
    beforeFolderPreScript
    afterFolderPreScript
    beforeItem
      beforePreScript (collection)
      afterPreScript
      beforePreScript (folder)
      afterPreScript
      beforePreScript (item)
      afterPreScript
      beforeRequest
        (protocol) - plugins may emit custom events here for streaming
      afterRequest
      beforePostScript (item)
      afterPostScript
        assertion (per quest.test result)
      beforePostScript (folder)
      afterPostScript
    beforePostScript (collection)
    afterPostScript
  afterItem
  ... (other items in folder or other folders in chain) ...
  beforeFolderPostScript
  afterFolderPostScript
  afterFolder
  afterIteration (1)
  beforeIteration (2..N)
    ... (same chain as iteration 1) ...
  afterIteration (2..N)
  beforeCollectionPostScript
  afterCollectionPostScript
afterRun
```

**Notes:**
- `assertion` events only appear after item post scripts or plugin event scripts.
- `console` and `exception` events can be emitted during execution for logging/errors.

---

## Data Iteration Model

### Collection-Level Iteration

Iteration data is defined at the collection level (or via CLI `--data`)

**Iteration Source:**
1. **CLI `--data file.csv`** - Completely replaces collection.testData
2. **Collection `testData: []`** - Defined in collection JSON
3. **No testData** - Collection runs once (no iteration)

**Key Principle:** Each iteration executes the ENTIRE collection with a different data row. All requests in the collection share the same iteration context.

### Example

```json
{
  "testData": [
    {"env": "dev", "userId": 1, "baseUrl": "https://dev.api.com"},
    {"env": "staging", "userId": 2, "baseUrl": "https://staging.api.com"},
    {"env": "prod", "userId": 3, "baseUrl": "https://api.com"}
  ],
  "items": [
    {"name": "Get Auth Token", "id": "auth"},
    {"name": "Get User", "id": "user", "dependsOn": ["auth"]},
    {"name": "Get Products", "id": "products", "dependsOn": ["auth"]}
  ]
}
```

**Execution:**
```
Iteration 1 (env=dev, userId=1, baseUrl=dev.api.com):
  - Get Auth Token
  - Get User
  - Get Products

Iteration 2 (env=staging, userId=2, baseUrl=staging.api.com):
  - Get Auth Token
  - Get User
  - Get Products

Iteration 3 (env=prod, userId=3, baseUrl=api.com):
  - Get Auth Token
  - Get User
  - Get Products

Total: 9 request executions (3 requests × 3 iterations)
```

### The `--iterations` Flag

**Behavior:** Limits the number of iterations to run

```bash
# Limit to first 5 iterations
fracture run collection.json --iterations 5

# With testData: uses first 5 rows
fracture run collection.json --data users.csv --iterations 5

# Without testData: runs collection 5 times (repetition mode)
fracture run collection.json --iterations 5
```

**Examples:**

| Scenario | testData | --iterations | Result |
|----------|----------|--------------|--------|
| A | 100 rows in collection | 5 | Uses first 5 rows |
| B | users.csv (50 rows) | 10 | Uses first 10 CSV rows |
| C | None | 5 | Runs collection 5 times |
| D | 10 rows | (not specified) | Uses all 10 rows |

### Iteration Access in Scripts

```javascript
// Get current iteration info
const current = quest.iteration.current;  // 1-based (1, 2, 3, ...)
const total = quest.iteration.count;     // Total iterations

// Access iteration data
const userId = quest.iteration.data.get('userId');
const env = quest.iteration.data.get('env');

// Get all iteration data rows
const allRows = quest.iteration.data.all();

// Check if iteration data exists
if (quest.iteration.data.has('userId')) {
  // Use the data
}

// Get as object
const row = quest.iteration.data.toObject();
// {userId: 1, env: 'dev', baseUrl: 'https://dev.api.com'}
```

---

## TypeScript Interfaces

### Core Types

```typescript
export interface Collection {
    id: string;
    name: string;
    variables: Record<string, string>;
    items: CollectionItem[];
    preRequestScript?: string;
    postRequestScript?: string;
    testData?: IterationData[];
}

export interface Request {
    id: string;
    name: string;
    description?: string;
    protocol: string;  // "http", "graphql", "grpc", etc.
    dependsOn?: string[];  // Request IDs that must execute first
    condition?: string;    // JavaScript expression to evaluate
    data: Record<string, unknown>;
    preRequestScript?: string;
    postRequestScript?: string;
}

export interface Folder {
    id: string;
    name: string;
    items: CollectionItem[];
    preRequestScript?: string;
    postRequestScript?: string;
}

export type CollectionItem = Request | Folder;

export interface Environment {
    name: string;
    variables: Record<string, string>;
}

export interface IterationData {
    [key: string]: string | number | boolean;
}
```

### Execution Context

```typescript
export interface ExecutionContext {
    // Collection info
    collectionName: string;
    collectionId: string;
    collectionVersion?: string;
    collectionDescription?: string;
    
    // Variable scopes
    collectionVariables: Record<string, string>;
    globalVariables: Record<string, string>;
    localVariables: Record<string, string>;
    environment?: Environment;
    
    // Current execution state
    currentRequest?: Request;
    currentResponse?: ProtocolResponse;
    
    // Iteration state (collection-level only)
    iteration: {
        current: number;  // 1-based
        count: number;    // Total iterations
        data?: IterationData;  // Current iteration's data
    };
    
    // History
    executionHistory: ExecutionHistoryEntry[];
    
    // Events
    eventBus: EventEmitter;
}
```

### Run Options & Results

```typescript
export interface RunOptions {
    environment?: Environment;
    globalVariables?: Record<string, string>;
    data?: IterationData[];  // CLI --data override
    iterations?: number;      // Limit iterations
    folder?: string;          // Filter by folder name
    filter?: string;          // Regex filter
    logLevel?: 'error' | 'warn' | 'info' | 'debug' | 'trace';  // Log level (default: 'info')
}

export interface RunResult {
    collectionId: string;
    collectionName: string;
    startTime: Date;
    endTime: Date;
    duration: number;
    requestResults: RequestResult[];
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    validationErrors?: ValidationError[];  // Present if validation failed
}

export interface RequestResult {
    requestId: string;
    requestName: string;
    success: boolean;
    response?: ProtocolResponse;
    tests: TestResult[];
    duration: number;
    scriptError?: string;
}

export interface TestResult {
    name: string;
    passed: boolean;
    error?: string;
    skipped: boolean;
}
```

---

## Plugin System

### IProtocolPlugin Interface

```typescript
export interface IProtocolPlugin {
    // Identity
    protocol: string;         // "http", "graphql", "grpc"
    name: string;             // "HTTP Client"
    description: string;
    
    // Plugin event definitions (for streaming protocols)
    events?: PluginEventDefinition[];
    
    // Execution
    execute(
        request: Request,
        context: ExecutionContext,
        options: RuntimeOptions,
        emitEvent?: (eventName: string, eventData: any) => Promise<void>,
        logger?: ILogger
    ): Promise<ProtocolResponse>;
    
    // Validation (mirrors execute signature)
    validate(
        request: Request,
        options: RuntimeOptions  // Validates both request.data AND options.plugins[protocol]
    ): ValidationResult;
    
    // Optional UI components (for desktop app)
    components?: {
        RequestEditor?: React.ComponentType<RequestEditorProps>;
        ResponseViewer?: React.ComponentType<ResponseViewerProps>;
    };
}

export interface PluginEventDefinition {
    name: string;              // "onMessage", "onError", "onComplete"
    description: string;
    canHaveTests: boolean;     // Can event scripts contain quest.test()?
    required: boolean;         // Is this event script required?
}

// Example: WebSocket plugin
events: [
    { name: "onMessage", description: "Fires for each message", canHaveTests: true, required: false },
    { name: "onError", description: "Fires on errors", canHaveTests: false, required: false },
    { name: "onComplete", description: "Fires on disconnect", canHaveTests: true, required: false }
]

export interface IAuthPlugin {
    name: string;
    version: string;
    description: string;
    authTypes: string[];          // ['bearer'], ['basic'], ['oauth2'], etc.
    protocols: string[];          // Which protocols this auth works with
    dataSchema: any;              // JSON Schema for auth.data
    
    apply(
        request: Request,
        auth: Auth,
        options: RuntimeOptions,
        logger?: ILogger
    ): Promise<Request>;
    
    validate(
        auth: Auth,
        options: RuntimeOptions  // Validates auth.data AND options if needed
    ): ValidationResult;
}

export interface IValueProviderPlugin {
    provider: string;             // "vault:file", "vault:aws", etc.
    name: string;
    description: string;
    configSchema?: any;           // JSON Schema for provider config
    
    getValue(
        key: string,
        config?: any,
        context?: ExecutionContext,
        logger?: ILogger
    ): Promise<string | null>;
    
    validate(
        config: any,              // Validates options.plugins[provider]
        options: RuntimeOptions
    ): ValidationResult;
}

export interface ProtocolResponse {
    status: number;
    statusText: string;
    body: string;
    headers: Record<string, string>;
    duration: number;
    error?: string;
}

export interface ValidationError {
    message: string;              // "quest.test() cannot be called in collectionPreScript"
    location: string;             // "/FolderA/Request1" or "/collection"
    source: 'script' | 'protocol' | 'auth' | 'vault' | 'schema';
    scriptType?: ScriptType;      // For script errors
    details?: any;                // Additional context (line numbers, suggestions)
}

export interface ValidationResult {
    valid: boolean;
    errors?: ValidationError[];   // Structured error collection
}
```

### Plugin Discovery

Plugins are auto-discovered from:
1. Built-in: `@apiquest/plugin-http`, `@apiquest/plugin-graphql`
2. npm packages: `@apiquest/plugin-*` or `apiquest-plugin-*`

**Example Plugin:**
```typescript
// @apiquest/plugin-http/index.ts
import type { IProtocolPlugin } from '@apiquest/fracture';

export const httpPlugin: IProtocolPlugin = {
    protocol: 'http',
    name: 'HTTP Client',
    description: 'REST API requests',
    
    async execute(request, context, options) {
        if (options.logLevel === 'debug' || options.logLevel === 'trace') {
            console.debug('[HTTP] Executing:', request.data.method, request.data.url);
        }
        
        const url = request.data.url as string;
        const method = request.data.method as string || 'GET';
        
        const startTime = Date.now();
        const response = await fetch(url, { method });
        const duration = Date.now() - startTime;
        
        return {
            status: response.status,
            statusText: response.statusText,
            body: await response.text(),
            headers: Object.fromEntries(response.headers),
            duration
        };
    },
    
    validate(request, options) {
        const errors: ValidationError[] = [];
        
        if (!request.data.url) {
            errors.push({ message: 'URL is required', location: request.id, source: 'protocol' });
        }
        
        // Validate options if provided
        if (options.plugins?.http?.timeout && typeof options.plugins.http.timeout !== 'number') {
            errors.push({ message: 'timeout must be a number', location: request.id, source: 'schema' });
        }
        
        return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
    }
};
```

---

## Core Runner Features

### Pre-Run Validation

Collections are validated **before** any requests execute using AST-based script analysis.

**Validation Checks:**
- `quest.test()` location (only allowed in `postRequestScript` and plugin events with `canHaveTests=true`)
- `quest.skip()` / `quest.fail()` must be inside `quest.test()` callbacks
- Conditional tests `if (x) quest.test()` are **disallowed** (use `quest.skip()` or request `condition` instead)
- Protocol request data (URL, method, etc.)
- Auth configuration (required fields from plugin `dataSchema`)
- Plugin options validation

**Technology:** Acorn AST parser for accurate JavaScript analysis

**Example validation error:**
```typescript
{
  message: "quest.test() cannot be called in collectionPreScript",
  location: "/collection",
  source: "script",
  scriptType: "collection-pre",
  details: { line: 5, column: 3 }
}
```

**Execution stops** if validation fails (no requests run). CLI exits with code 3.

### Deterministic Test Counting

Test count is **known before execution** starts using AST parsing.

**Counting Strategy:**
- Parse all scripts with Acorn
- Count `quest.test()` calls
- Multiply by iteration count
- Plugin events: use `quest.expectMessages()` hint for static count, otherwise marked dynamic

**Example output:**
```
Expected Tests: 27 static + dynamic (plugin events)
```

### Plugin Event Runtime

#### Event Execution System

**Event Emission Flow:**
```
Plugin.execute() → emitEvent('onMessage', data) → CollectionRunner callback → Execute script → Track event.index
```

**Implementation in CollectionRunner:**
```typescript
// CollectionRunner creates emitEvent callback per request
const eventIndices = new Map<string, number>();
const emitEvent = async (eventName: string, eventData: any) => {
  const eventScript = request.data.scripts?.find(s => s.event === eventName);
  if (!eventScript) return;
  
  const currentIndex = eventIndices.get(eventName) || 0;
  
  try {
    context.event.index = currentIndex;
    const result = await scriptEngine.execute(eventScript.script, context, ScriptType.PluginEvent);
    pluginEventTests.push(...result.tests);
  } finally {
    context.event.index = undefined;  // Prevent state leak
    eventIndices.set(eventName, currentIndex + 1);
  }
};

// Pass to plugin
await plugin.execute(request, context, options, emitEvent);
```

**quest.event.index** - Sequence number for plugin events:
- Increments for each event of same type (0, 1, 2...)
- Resets per request
- Separate indices for different event types  
- null for non-plugin-event scripts
- Example: `quest.event.index` returns 0, 1, 2... for successive `onMessage` events

**quest.expectMessages(count, timeout?)** - Performance hint:
- Only callable in `preRequestScript`
- Only valid for protocols with `canHaveTests` events
- Validates protocol has testable events (e.g., WebSocket onMessage)
- Validates count is positive integer
- Used for test counting and plugin optimization
- Example: `quest.expectMessages(10, 5000)` expects 10 messages within 5 seconds

**Plugin Event Design Rules:**
1. **Single script per event**: Only one script per event type allowed (validation enforces)
2. **Sequential execution**: Plugins MUST await emitEvent() for deterministic ordering
3. **State safety**: event.index wrapped in try/finally to prevent context leaks
4. **Test merging**: Plugin event tests appear before post-request script tests

**For Plugin Developers:**
```typescript
// CORRECT - Sequential, deterministic
for (let i = 0; i < count; i++) {
  await emitEvent('onMessage', { index: i });  // Wait for script completion
}

// INCORRECT - Race conditions
for (let i = 0; i < count; i++) {
  emitEvent('onMessage', { index: i });  // No await = overlapping executions
}
```

### Logging System

EventEmitter-based logging.

**Log Levels:**
```typescript
import { LogLevel } from '@apiquest/types';

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}
```

**Usage:**
```typescript
import { LogLevel } from '@apiquest/types';

const result = await runner.run(collection, {
  logLevel: LogLevel.DEBUG
});
```

**Event Emission:**
```typescript
runner.on('console', ({message, level}) => {
  console.log(`[${level.toUpperCase()}] ${message}`);
});
```

**Plugin Logging:**

Plugins receive `ILogger` interface via optional parameter:

```typescript
export interface ILogger {
  error(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  info(message: string, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
  trace(message: string, ...args: any[]): void;
  setLevel(level: LogLevel): void;
}

// Plugin implementation
async execute(request, context, options, emitEvent, logger) {
  logger?.debug('Executing request:', request.name);
  // ... execution ...
}
```

---

## Event System

### Available Events

Core lifecycle events emitted by the runner:

- `beforeRun` / `afterRun`
- `beforeCollectionPreScript` / `afterCollectionPreScript`
- `beforeCollectionPostScript` / `afterCollectionPostScript`
- `beforeIteration` / `afterIteration`
- `beforeFolderPreScript` / `afterFolderPreScript`
- `beforeFolderPostScript` / `afterFolderPostScript`
- `beforeItem` / `afterItem`
- `beforePreScript` / `afterPreScript`
- `beforeRequest` / `afterRequest`
- `beforePostScript` / `afterPostScript`
- `assertion` (per `quest.test()` result)
- `console` (runner/script log output)
- `exception` (execution errors)

Custom protocol plugin events (for streaming protocols) can also be emitted during request execution (for example `onMessage`). Subscribe by name to receive those events.

### Event Usage Example

```typescript
import { CollectionRunner } from '@apiquest/fracture';

const runner = new CollectionRunner();

runner.on('beforeRun', ({ collectionInfo }) => {
    console.log(`Starting: ${collectionInfo.name}`);
});

runner.on('afterRequest', ({ request, response, duration }) => {
    console.log(`✓ ${request.name} - ${duration}ms (${response.status})`);
});

runner.on('assertion', ({ test }) => {
    const icon = test.passed ? '✓' : '✗';
    console.log(`  ${icon} ${test.name}`);
});

runner.on('console', ({ message, level }) => {
    console.log(`[${level}] ${message}`);
});

runner.on('exception', ({ error, phase }) => {
    console.error(`Error in ${phase}:`, error.message);
});

// Example plugin event (streaming)
runner.on('onMessage', (data) => {
    console.log('Stream message:', data);
});

await runner.run(collection);
```

---

## CLI Usage

### Installation

```bash
npm install -g @apiquest/fracture
```

### Commands

All three command aliases are equivalent:

```bash
fracture run <collection.json> [options]
# Also available as:
# quest run <collection.json> [options]
# apiquest run <collection.json> [options]
```

### Options

```bash
  -e, --environment <file>      Environment file
  -d, --data <file>            Data file for iterations
  -g, --global <key=value>     Global variables
  --iterations <count>         Limit iterations
  --filter <regex>             Filter requests by path (regex against full path)
  --exclude-deps               Exclude dependencies when filtering
  --log-level <level>          error|warn|info|debug|trace
  --strict-mode <true|false>   Enable/disable strict validation (default: true)
  --bail                       Stop on first failure
  -h, --help                   Display help
  -v, --version                Display version
```

### Examples

```bash
# Basic
fracture run api-tests.json

# With environment and data
fracture run api-tests.json -e prod.json -d users.csv

# Debug logging
fracture run api-tests.json --log-level debug

# Disable strict mode
fracture run api-tests.json --strict-mode false

# Complex
fracture run api-tests.json -e prod.json -d users.csv -g apiKey=abc123 --log-level info --bail
```

---

## Programmatic Usage

### Quick Start

```typescript
import { run } from '@apiquest/fracture';

const result = await run({
    collection: require('./api-tests.json'),
    environment: require('./prod.json'),
    data: require('./test-users.json')
});

console.log(`Tests: ${result.totalTests}`);
console.log(`Passed: ${result.passedTests}`);
console.log(`Failed: ${result.failedTests}`);
```

### Advanced Usage

```typescript
import { CollectionRunner } from '@apiquest/fracture';
import { httpPlugin } from '@apiquest/plugin-http';
import { graphqlPlugin } from '@apiquest/plugin-graphql';

const runner = new CollectionRunner();

// Register plugins
runner.registerPlugin(httpPlugin);
runner.registerPlugin(graphqlPlugin);

// Listen to events
runner.on('afterItem', (result) => {
    // Custom logging, metrics, etc.
});

// Run with options
const result = await runner.run(collection, {
    environment,
    globalVariables: {
        authToken: process.env.AUTH_TOKEN
    },
    iterations: 100,
    folder: 'User API'
});

// Process results
if (result.failedTests > 0) {
    process.exit(1);
}
```

---

## Script Execution

### Native Node.js VM

The runner uses Node.js native VM module for script execution:

**Benefits:**
- ✅ Full JavaScript ES2022 support
- ✅ Native async/await
- ✅ Native Promises
- ✅ Full npm ecosystem
- ✅ No compatibility issues
- ✅ High performance

**Script Execution:**
```typescript
import vm from 'vm';
import chai from 'chai';

class ScriptEngine {
    async execute(script: string, context: ExecutionContext) {
        // Create quest API
        const quest = this.createQuestAPI(context);
        
        // Create sandbox
        const sandbox = {
            quest,
            console,
            expect: chai.expect,
            // Full Node.js environment
        };
        
        // Execute in sandbox
        const vmContext = vm.createContext(sandbox);
        vm.runInContext(script, vmContext);
        
        return {
            success: true,
            tests: this.collectTests()
        };
    }
}
```

---

## Testing

### Unit Tests (Vitest)

```typescript
import { describe, it, expect } from 'vitest';
import { CollectionRunner } from '@apiquest/fracture';

describe('CollectionRunner', () => {
    it('executes collection successfully', async () => {
        const runner = new CollectionRunner();
        const collection = {
            id: 'test',
            name: 'Test Collection',
            variables: {},
            items: []
        };
        
        const result = await runner.run(collection);
        
        expect(result.collectionId).toBe('test');
        expect(result.requestResults).toHaveLength(0);
    });
});
```

### Integration Tests

```typescript
describe('Integration: Data Iterations', () => {
    it('runs collection for each data row', async () => {
        const runner = new CollectionRunner();
        const collection = {
            /* ... */
            items: [{ /* request */ }]
        };
        const data = [
            { userId: 1 },
            { userId: 2 },
            { userId: 3 }
        ];
        
        const result = await runner.run(collection, { data });
        
        expect(result.requestResults).toHaveLength(3);
    });
});
```

---

## Error Handling

### Script Errors

**Pre-request script error:** STOPS collection execution
```typescript
// If pre-request throws
quest.test('This never runs', () => {});
// Collection execution halts
```

**Test script error:** STOPS collection execution
```typescript
quest.test('Valid test', () => {
    throw new Error('Syntax error'); // Halts collection
});
```

**Test failure:** Does NOT stop execution
```typescript
quest.test('Failing test', () => {
    expect(1).to.equal(2); // Test fails, collection continues
});
```

### Network Errors

```typescript
{
    success: false,
    response: {
        error: 'ECONNREFUSED: Connection refused'
    }
}
```

---

## Execution Control

### Parallel Execution (DAG-Based)

ApiQuest uses a Directed Acyclic Graph (DAG) scheduler for all execution, supporting both sequential and parallel modes:

**Enable via Collection Options:**
```json
{
  "options": {
    "execution": {
      "allowParallel": true,
      "maxConcurrency": 10,
      "bail": false,
      "delay": 100
    }
  }
}
```

**CLI Override:**
```bash
# Parallel mode with 10 concurrent requests
fracture run collection.json --parallel --concurrency 10 --bail

# Sequential mode (concurrency=1, no --parallel flag needed)
fracture run collection.json --bail
```

**DAG Scheduling Model:**

The collection is transformed into a DAG where:
- **Nodes**: Represent atomic tasks (script executions or request I/O)
- **Edges**: Represent dependencies (structural parent-child + explicit `dependsOn`)

**Node Types:**
1. **Script Nodes** (serialized via single-threaded queue):
   - `collection-pre` / `collection-post`
   - `folder-pre` / `folder-post` (per folder)
   - `plugin-event` (per event, per request)

2. **Request Nodes** (parallel via worker pool):
   - HTTP/WebSocket/etc I/O operations
   - Inherited pre/post scripts execute inside request through script queue
   - Worker pool size = `maxConcurrency` (default: 5)

**Edge Types:**
- **Structural**: Parent-child ordering (e.g., folder-pre → children → folder-post)
- **DependsOn**: Explicit dependencies via `dependsOn` field on requests/folders
- **Event**: Request → plugin event scripts → parent folder-post

**Execution Rules:**
- Scripts ALWAYS serialized (prevents variable race conditions)
- Requests execute in parallel (respects `dependsOn` dependencies)
- Iterations remain sequential (no parallel iterations)
- Children sorted alphabetically for deterministic DAG construction
- **Cookie jar persistence disabled in parallel mode** (cookies cleared after each request)

**Folder-Level Dependencies:**
```json
{
  "type": "folder",
  "id": "folder-b",
  "name": "Folder B",
  "dependsOn": ["folder-a", "request-setup"],
  "condition": "quest.variables.get('runFolderB') === 'true'",
  "items": [...]
}
```

**Folder Condition Handling:**
- If `condition` evaluates to `false`, folder-pre executes but skips all children
- Direct edge added: folder-pre → folder-post
- Folder-post still executes (for cleanup logic)

**Dependency Examples:**
```json
// Request depends on another request
{
  "type": "request",
  "id": "get-user-details",
  "dependsOn": ["login-request"]
}

// Folder depends on request completion
{
  "type": "folder",
  "id": "authenticated-tests",
  "dependsOn": ["login-request"]
}
```

**State Management:**
- Variable mutations only through serialized scripts (thread-safe)
- Execution history is append-only (can be updated concurrently)
- Cookie jar updates only through queued scripts

### Filtering & Dependencies

**Path-Based Filtering:**
```bash
# Filter by path - match requests in folder
fracture run collection.json --filter "request:/Users/"

# Filter by request name across all folders
fracture run collection.json --filter "request:.*/Auth.*"

# Exclude a folder (negation)
fracture run collection.json --filter "^(?!.*Slow).*"
```

**Dependency Handling:**
```bash
# By default, dependencies are included
fracture run collection.json --filter "request:/Critical/"

# Exclude dependencies (run only filtered requests)
fracture run collection.json --filter "request:/Critical/" --exclude-deps
```

### Memory Management

- Scripts executed in isolated VM contexts
- Contexts destroyed after execution
- History limited to prevent memory leaks

---

## Script Libraries

### Builtin Libraries (Always Available)

Pre-loaded in every script context:
- `lodash` - Utility functions
- `moment` - Date/time manipulation
- `axios` - HTTP requests (called by our quest.sendRequest or give direct axios access??)
- `chai.*` - Assertions

```javascript
// Available without configuration
const now = moment().format('YYYY-MM-DD');
const email = faker.internet.email();
const chunked = lodash.chunk([1,2,3,4], 2);
```

### External Libraries

Load additional libraries via collection options:

```json
{
  "options": {
    "libraries": [
      {
        "name": "customLib",
        "source": { "type": "npm", "package": "@mycompany/utils" },
        "version": "^1.0.0"
      },
      {
        "name": "myHelpers",
        "source": { "type": "file", "path": "./scripts/helpers.js" }
      },
      {
        "name": "thirdParty",
        "source": { "type": "cdn", "url": "https://cdn.example.com/lib.js" }
      }
    ]
  }
}
```

**Library Loading:**
- **NPM:** Runner installs packages using system npm (respects ~/.npmrc)
- **CDN:** Downloads and caches library files
- **File:** Loads from local path relative to collection

**Usage in Scripts:**
```javascript
// External libraries available by name
const result = customLib.doSomething();
const data = myHelpers.transform(input);
```

---

## Deployment

### As npm Package

```bash
npm install @apiquest/fracture
```

```typescript
import { run } from '@apiquest/fracture';
await run({ collection });
```

### In CI/CD

```yaml
# GitHub Actions
- name: Run API Tests
  run: |
    npm install @apiquest/fracture @apiquest/plugin-http
    node run-tests.js
```

```javascript
// run-tests.js
const { run } = require('@apiquest/fracture');
const { httpPlugin } = require('@apiquest/plugin-http');

const runner = new CollectionRunner();
runner.registerPlugin(httpPlugin);

const result = await runner.run(
    require('./api-tests.json'),
    { environment: require('./prod.json') }
);

process.exit(result.failedTests > 0 ? 1 : 0);
```

---

# ApiQuest Runner Events

Complete event system for CollectionRunner with before/after pattern.

## Event Naming Convention

All events use `before*` / `after*` pattern for consistency except assertion event:
- `before*` - Emitted just before action starts
- `after*` - Emitted after action completes

## Event Payload Envelope

All events (except `console`) include a lightweight envelope for correlation:

```typescript
type CollectionInfo = {
  id: string;
  name: string;
  version?: string;
  description?: string;
};

type EventEnvelope = {
  path: 'collection:/' | `folder:/${string}` | `request:/${string}`;
  pathType: 'collection' | 'folder' | 'request';
  collectionInfo: CollectionInfo;
  iteration?: {
    current: number;
    total: number;
    source: 'collection' | 'cli' | 'none';
    rowIndex?: number;
    rowKeys?: string[];
    row?: Record<string, string | number | boolean>;
  };
  request?: Request;
};
```

Notes:
- `path` scopes the event: `collection:/`, `folder:/f1/f2`, or `request:/f1/f2/rq1`.
- `collectionInfo` is lightweight, NOT the full Collection object
- `console` is emitted by the logger and does not include the full envelope.
- ALL other events (including `beforeRun`/`afterRun`) include EventEnvelope

Event payloads are `EventEnvelope & { ...event specific fields... }`.

### ScriptResult

```typescript
type ScriptResult = {
  success: boolean;
  tests: TestResult[];
  error?: string;
  consoleOutput: string[];
};
```

## Collection-Level Events

### Run Lifecycle
```typescript
beforeRun: EventEnvelope & {
  options: RunOptions;
  validationResult?: ValidationResult;
  expectedTestCount?: number;
}

afterRun: EventEnvelope & {
  result: RunResult;
}
```

### Collection Scripts (ApiQuest Extension)
```typescript
beforeCollectionPreScript: EventEnvelope & {
  path: 'collection:/';
}

afterCollectionPreScript: EventEnvelope & {
  path: 'collection:/';
  result: ScriptResult;
}

beforeCollectionPostScript: EventEnvelope & {
  path: 'collection:/';
}

afterCollectionPostScript: EventEnvelope & {
  path: 'collection:/';
  result: ScriptResult;
}
```

Collection-level scripts execute ONCE at the start/end of the entire run, regardless of iterations. They have access to the full execution history for statistics and reporting.

### Iteration Lifecycle
```typescript
beforeIteration: EventEnvelope & {
  iteration: Required<EventEnvelope['iteration']>;
}

afterIteration: EventEnvelope & {
  iteration: Required<EventEnvelope['iteration']>;
  duration: number;
}
```

## Folder-Level Events

### Folder Lifecycle
```typescript
beforeFolder: EventEnvelope
afterFolder: EventEnvelope & { duration }
```

### Folder Scripts
```typescript
beforeFolderPreScript: EventEnvelope
afterFolderPreScript: EventEnvelope & { result: ScriptResult }
beforeFolderPostScript: EventEnvelope
afterFolderPostScript: EventEnvelope & { result: ScriptResult }
```

## Item/Request-Level Events

### Item Lifecycle
```typescript
beforeItem: EventEnvelope & {
  request: Request;
  path: string;
}

afterItem: EventEnvelope & {
  request: Request;
  path: string;
  response?: ProtocolResponse;
  result: RequestResult;
}
```

### Pre-Request Script (per script in chain)
```typescript
beforePreScript: EventEnvelope & {
  request: Request;
  path: string;
}

afterPreScript: EventEnvelope & {
  request: Request;
  path: string;
  result: ScriptResult;
}
```

### HTTP Request
```typescript
beforeRequest: EventEnvelope & {
  request: Request;
  path: string;
}

afterRequest: EventEnvelope & {
  request: Request;
  response: ProtocolResponse;
  duration: number;
}
```

### Post-Request Script (per script in chain)
```typescript
beforePostScript: { request, path, response }
afterPostScript: { request, path, response, result: ScriptResult }
```

**Script chain order:**
- Pre-request: collection → folder → request
- Post-request: request → folder → collection

## Test/Assertion Events

### Individual Assertions
```typescript
assertion: {
  test: TestResult;
  request?: Request;
  path?: string;
  response?: ProtocolResponse;
  event?: {
    name: string;
    index: number;
    timestamp: string;
    data: any;
  };
}
```

## Utility Events

### Console Output
```typescript
console: { 
  message: string, 
  level: LogLevel,
  levelName?: 'error' | 'warn' | 'info' | 'debug' | 'trace',
  component?: string,
  timestamp?: string,
  args?: any[]
}
```

### Script Exceptions
```typescript
exception: { 
  error: Error, 
  phase: 'collection-pre' | 'collection-post' | 'folder-pre' | 'folder-post' | 'prerequest' | 'postrequest' | 'request',
  request?: Request,
  path?: string,
  response?: ProtocolResponse,
}
```

## Event Flow Example

```
beforeRun
  beforeCollectionPreScript
  afterCollectionPreScript
  beforeIteration (1)
    beforeFolderPreScript
    afterFolderPreScript
    beforeItem
      beforePreScript (script 1)
      afterPreScript (script 1)
      beforePreScript (script 2)
      afterPreScript (script 2)
      beforeRequest
        (protocol) - plugins may emit custom events here
      afterRequest
      beforePostScript (script 1)
      afterPostScript (script 1)
        assertion (per quest.test result)
      beforePostScript (script 2)
      afterPostScript (script 2)
        assertion (per quest.test result)
    afterItem
    beforeFolderPostScript
    afterFolderPostScript
  afterIteration (1)
  beforeCollectionPostScript
  afterCollectionPostScript
afterRun
```

## Use Cases

### CLI Reporter
- `beforeRequest` → Show "GET /api/users"
- `afterRequest` → Show "Status: 200 OK, Duration: 145ms"
- `assertion` → Show "✓ Status is 200"
- `afterItem` → Show "Tests: 5 passed, 0 failed"

### Desktop UI
- All `before*` events → Show progress indicators
- All `after*` events → Update results in real-time
- `assertion` → Live test results feed

### Collection-Level Statistics
- `beforeCollectionPreScript` → Initialize statistics
- `afterCollectionPostScript` → Generate summary report using execution history
  - Total requests: X
  - Successful: Y
  - Failed: Z
  - Average response time
  - Test pass rate
  - etc.

## Collection Schema Extension

```json
{
  "name": "My Collection",
  "collectionPreScript": "console.log('Collection starting...');",
  "collectionPostScript": "console.log('Total requests:', quest.history.requests.count());",
  "items": [...]
}
```
