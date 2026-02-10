# ApiQuest JavaScript API Reference v1.0

Complete specification for the `quest` global object available in all scripts.

---

## quest.collection

### Info Properties
```javascript
quest.collection.info.name           // "My Collection" - Collection display name
quest.collection.info.id             // "col-abc123" - Unique collection identifier
quest.collection.info.version        // "1.0.0" - Collection version (optional)
quest.collection.info.description    // "API test suite" - Collection description (optional)
```

### Variables
```javascript
quest.collection.variables.get('key')              // Get collection variable
quest.collection.variables.set('key', 'value')     // Set collection variable
quest.collection.variables.has('key')              // Check if variable exists
quest.collection.variables.remove('key')           // Remove variable
quest.collection.variables.clear()                 // Clear all variables
quest.collection.variables.toObject()              // Get all as object {key: value}
```

---

## quest.iteration

### Current Iteration
```javascript
quest.iteration.current         // 2 - Current iteration number (1-indexed)
quest.iteration.count           // 5 - Total number of iterations
```

### Iteration Data
```javascript
quest.iteration.data.get('userId')                 // Get value from current row
quest.iteration.data.has('userId')                 // Check if column exists
quest.iteration.data.toObject()                    // Current row as object
quest.iteration.data.keys()                        // Array of column names
quest.iteration.data.all()                         // All rows (all iterations data)
```

**Iteration Behavior:**
- Data comes from collection `testData` array OR CLI `--data file.csv`
- CLI `--data` completely replaces collection `testData`
- Each iteration runs entire collection with one row of data
- All requests in iteration share the same data row

---

## quest.request

### Info
```javascript
quest.request.info.name         // "Get User" - Request name
quest.request.info.id           // "req-456" - Request ID
quest.request.info.description  // "Fetches user by ID" - Request description
quest.request.info.protocol     // "http" | "grpc" | "graphql" | "websocket"
```

### Execution Control
```javascript
quest.request.dependsOn         // ["req-auth", "req-setup"] - Request dependencies (array of IDs)
quest.request.condition         // "quest.variables.get('env') === 'dev'" - JS expression string
```

### Properties (HTTP)
```javascript
quest.request.url               // "https://api.com/users/123" - Request URL
quest.request.method            // "GET" - HTTP method
```

### Headers
```javascript
quest.request.headers.get('Authorization')                     // Get header value
quest.request.headers.add({key: 'X-Custom', value: 'value'})   // Add header
quest.request.headers.remove('X-Old')                          // Remove header
quest.request.headers.upsert({key: 'User-Agent', value: '...'}) // Add or update header
quest.request.headers.toObject()                               // All headers as object
```

### Body
```javascript
quest.request.body.get()                        // Get body content as string
quest.request.body.set('{"key": "value"}')      // Set body content
quest.request.body.mode                         // 'raw' | 'urlencoded' | 'formdata'
```

---

## quest.response

### Status
```javascript
quest.response.status           // 200 - HTTP status code
quest.response.statusText       // "OK" - HTTP status text
```

### Body
```javascript
quest.response.body             // Raw response body string
quest.response.json()           // Parse body as JSON (returns {} if invalid)
quest.response.text()           // Alias for .body
```

### Headers
```javascript
quest.response.headers.get('content-type')     // Get header value (case-insensitive)
                                                // Returns string | string[] | null
                                                // (headers like 'set-cookie' can have multiple values)
quest.response.headers.has('content-type')     // Check if header exists
quest.response.headers.toObject()              // All headers as object: Record<string, string | string[]>
```

**Important:** Some HTTP headers (notably `set-cookie`) can have multiple values. When this occurs:
- `get()` returns an array of strings: `['cookie1=value1', 'cookie2=value2']`
- Single-value headers return a string: `'application/json'`
- Missing headers return `null`

**Example:**
```javascript
// Single value header
const contentType = quest.response.headers.get('content-type');
// → "application/json"

// Multiple value header (set-cookie)
const cookies = quest.response.headers.get('set-cookie');
// → ["sessionId=abc123; Path=/", "userId=xyz; Path=/"]

// Check if header exists
if (quest.response.headers.has('set-cookie')) {
  const cookies = quest.response.headers.get('set-cookie');
  if (Array.isArray(cookies)) {
    console.log(`Received ${cookies.length} cookies`);
  }
}
```

### Metrics
```javascript
quest.response.time             // 145 - Response time in milliseconds
quest.response.size             // 1234 - Response body size in bytes
```

### Assertion Helpers
```javascript
quest.response.to.be.ok                        // true if status === 200
quest.response.to.be.success                   // true if status 2xx
quest.response.to.be.clientError               // true if status 4xx
quest.response.to.be.serverError               // true if status 5xx
quest.response.to.have.status(200)             // true if status matches
quest.response.to.have.header('content-type')  // true if header exists
quest.response.to.have.jsonBody('userId')      // true if JSON body has field
```

---

## quest.scope

### Variables (Hierarchical Scope)
```javascript
quest.scope.variables.get('tempToken')         // Get scope variable
quest.scope.variables.set('tempToken', 'xyz')  // Set scope variable
quest.scope.variables.has('tempToken')         // Check if exists
quest.scope.variables.remove('tempToken')      // Remove variable
quest.scope.variables.clear()                  // Clear all
quest.scope.variables.toObject()               // Get all as object
```

**Scope:** Variables persist through script inheritance chain (collection → folder → request), cleared after each request completes

---

## quest.global

### Variables (Collection Run-Scoped)
```javascript
quest.global.variables.get('authToken')        // Get global variable
quest.global.variables.set('authToken', 'xyz') // Set global variable
quest.global.variables.has('authToken')        // Check if exists
quest.global.variables.remove('authToken')     // Remove variable
quest.global.variables.clear()                 // Clear all
quest.global.variables.toObject()              // Get all as object
```

**Scope:** Persists for entire collection run (all iterations, all requests)  
**Source:** Passed via CLI `--global name=value`

---

## quest.environment

### Properties
```javascript
quest.environment.name          // "Development" - Environment name
```

### Variables
```javascript
quest.environment.variables.get('apiUrl')          // Get environment variable
quest.environment.variables.set('apiUrl', 'xyz')   // Set environment variable
quest.environment.variables.has('apiUrl')          // Check if exists
quest.environment.variables.remove('apiUrl')       // Remove variable
quest.environment.variables.clear()                // Clear all
quest.environment.variables.toObject()             // Get all as object
```

**Source:** Environment JSON file passed via CLI `--environment dev.json`

---

## quest.variables

### Cascading Variable Resolution
```javascript
quest.variables.get('key')                     // Get from any scope (cascading)
quest.variables.set('key', 'value')            // Set in local scope
quest.variables.has('key')                     // Check any scope
quest.variables.replaceIn('{{baseUrl}}/{{userId}}')  // Replace {{vars}} in string
```

**Resolution Priority (stops at first match):**
1. `quest.iteration.data` - Current iteration row
2. `quest.scope.variables` - Hierarchical scope
3. `quest.collection.variables` - Collection JSON
4. `quest.environment.variables` - Environment file
5. `quest.global.variables` - Collection run
6. Return `null`

**Examples:**
```javascript
// Replace variables in string
quest.variables.replaceIn('{{baseUrl}}/users/{{userId}}')
// → "https://api.com/users/123"

// Missing variables left as-is
quest.variables.replaceIn('{{baseUrl}}/{{missing}}/path')
// → "https://api.com/{{missing}}/path"
```

---

## quest.history

### Execution History
```javascript
quest.history.requests.all()                   // All execution records (array)
quest.history.requests.count()                 // Total execution count
quest.history.requests.get('req-id')           // First match by ID or name
quest.history.requests.last()                  // Most recent execution

quest.history.requests.filter({                // Filter executions
  path: "/Users/Get User",                     // By path
  iteration: 3                                 // By iteration
})

quest.history.requests.filter({
  id: "req-123",                               // By ID
  iteration: 2
})

quest.history.requests.filter({
  name: "Get User"                             // By name (all paths)
})

quest.history.requests.filter({
  path: "/Users/*"                             // Wildcard paths
})
```

**Execution Record Structure:**
```javascript
{
  id: "req-123",                               // Request ID
  name: "Get User",                            // Request name
  path: "/Folder/Subfolder/Get User",          // Full path
  iteration: 3,                                // Which iteration
  response: {                                  // Response object
    status: 200,                               // HTTP status code
    statusText: "OK",                          // HTTP status text
    body: "...",                               // Response body
    headers: {...},                            // Response headers
    duration: 145                              // Duration in ms
  },
  tests: [...],                                // Test results
  timestamp: "2026-01-05T19:00:00.000Z"        // ISO timestamp
}
```

**Examples:**
```javascript
// Get previous iteration
const prev = quest.history.requests.filter({
  path: "/Users/Get User",
  iteration: quest.iteration.current - 1
})[0];

// Compare response times across iterations
const executions = quest.history.requests.filter({name: "Health Check"});
const avg = executions.reduce((s, e) => s + e.response.time, 0) / executions.length;
```

---

## quest.test

### Test Registration
```javascript
quest.test('User ID matches', () => {
  expect(quest.response.json().id).to.equal(123);
});
```

### Allowed Contexts

`quest.test()` is only valid in:
- `postRequestScript` (request-level scripts)
- plugin event scripts (where the plugin event has `canHaveTests: true`)

Calling it in collection/folder/pre-request scripts is not allowed and will fail validation in any mode.

### Test Control (Inside Test Callback Only)
```javascript
quest.skip('Skipping because API is down');    // Skip current test
quest.fail('Custom failure message');          // Force test failure
```

---

## quest.sendRequest

Make HTTP requests from within scripts. Supports both async/await and callback patterns.

### Async/Await Pattern (Recommended)
```javascript
const res = await quest.sendRequest({
  url: 'https://auth.api.com/token',
  method: 'POST',
  header: {
    'Content-Type': 'application/x-www-form-urlencoded'
  },
  body: {
    mode: 'urlencoded',
    urlencoded: [
      {key: 'client_id', value: quest.environment.variables.get('clientId')},
      {key: 'client_secret', value: quest.environment.variables.get('secret')}
    ]
  }
});

// Access response
const token = res.json().access_token;
quest.global.variables.set('authToken', token);
```

### Callback Pattern
```javascript
quest.sendRequest({
  url: 'https://api.com/data',
  method: 'GET',
  header: {
    'Authorization': 'Bearer ' + quest.global.variables.get('token')
  }
}, (err, res) => {
  if (err) {
    console.error('Request failed:', err);
    return;
  }
  
  const data = res.json();
  quest.global.variables.set('dataId', data.id);
});
```

### Request Configuration
```javascript
{
  url: string,                    // Required
  method: string,                 // GET, POST, PUT, DELETE, etc.
  header: {...},                  // Request headers object
  body: {                         // Request body (optional)
    mode: 'raw' | 'urlencoded' | 'formdata',
    raw: string,                  // For mode: 'raw'
    urlencoded: [{key, value}],   // For mode: 'urlencoded'
    formdata: [{key, value}]      // For mode: 'formdata'
  }
}
```

### Response Object
```javascript
res.status               // Status code (200, 404, etc.)
res.statusText           // Status text ("OK", "Not Found")
res.body                 // Raw response body
res.headers              // Headers object
res.time                 // Duration in ms
res.json()               // Parse body as JSON (returns null if invalid)
res.text()               // Body as text (alias for .body)
```

---

## quest.cookies

### Cookie Access
```javascript
quest.cookies.get(name: string): string | null
quest.cookies.set(name: string, value: string, options?: CookieOptions): void
quest.cookies.has(name: string): boolean
quest.cookies.remove(name: string): void
quest.cookies.clear(): void
quest.cookies.toObject(): Record<string, string>
```

**Cookie Options (for set()):**
```typescript
{
  path?: string;
  domain?: string;
  expires?: string;
  maxAge?: number;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}
```

**Source:** Cookies from `set-cookie` response headers

---

## quest.wait

### Delay Execution
```javascript
await quest.wait(1000);                        // Wait 1000ms (1 second)
```

**Use Cases:**
- Rate limiting between requests
- Waiting for async operations to complete
- Simulating real-world timing

**Example:**
```javascript
// Rate limit: 2 requests per second
quest.test('Make first request', async () => {
  const res = await quest.sendRequest({url: '...'});
  expect(res.code).to.equal(200);
  
  await quest.wait(500);  // Wait 500ms before next request
});
```

---

## quest.expectMessages

### Hint Expected Event Count

Provides a performance hint for streaming protocols about how many plugin events to expect.

```javascript
quest.expectMessages(count, timeout?);
```

**Parameters:**
- `count` (number): Expected number of events (must be non-negative integer)
- `timeout` (number, optional): Max wait time in milliseconds

**Restrictions:**
- Only callable in `preRequestScript` (not post, collection, folder scripts)
- Only valid for protocols with plugin events where `canHaveTests === true`
- Throws error if called in wrong context

**Purpose:**
1. **Test Counting**: Enables deterministic test count (count × tests per event)
2. **Plugin Optimization**: Plugins can use hint to set timeouts or buffer sizes
3. **Better UX**: Shows accurate test count before execution

**Example:**
```javascript
// preRequestScript for WebSocket request
quest.expectMessages(10, 5000);  // Expect 10 messages within 5 seconds

// postRequestScript is NOT executed here (wrong context)

// data.scripts (plugin event scripts):
{
  "event": "onMessage",
  "script": `
    quest.test(\`Message \${quest.event.index + 1} valid\`, () => {
      expect(quest.event.data).to.exist;
    });
  `
}

// Result: 10 messages × 1 test = 10 tests (deterministic count)
```

**Without hint:**
```javascript
// No quest.expectMessages() call

// data.scripts (plugin event):
{
  "event": "onMessage",
  "script": "quest.test('Valid', () => ...);"
}

// Result: "1+ tests (dynamic)" - unknown count
```

---

## Strict Mode

Collection validation control.

**Configuration:**
```bash
fracture run collection.json --strict-mode true   # default
fracture run collection.json --strict-mode false
```

```typescript
runner.run(collection, { strictMode: boolean })
```

**strictMode = true (default):**
- Conditional test declarations not allowed
- Tests wrapped in try/catch not allowed
- Deterministic test counting required

**strictMode = false:**
- Conditional tests allowed
- Dynamic test count

**Examples:**

```javascript
// Disallowed in strict mode
if (quest.response.status === 200) {
  quest.test('Valid', () => {
    expect(quest.response.json()).to.exist;
  });
}

try {
  quest.test('Test', () => { /* ... */ });
} catch (e) {
  // Tests in try/catch are not deterministically countable
}

// Allowed
quest.test('Test', () => { 
  try {
  } catch (e) {
    quest.fail('...');
  }
});

// Allowed - use quest.skip()
quest.test('Valid', () => {
  if (quest.response.status !== 200) {
    quest.skip('Status not 200');
    return;
  }
  expect(quest.response.json()).to.exist;
});

// Allowed - use request condition
{
  "condition": "quest.variables.get('env') === 'prod'",
  "postRequestScript": "quest.test('Test', () => ...);"
}
```

---

## Plugin Event Context

Available only in plugin event scripts (`data.scripts[]`).

### quest.event

Plugin event details.

```javascript
quest.event: {
  name: string,
  timestamp: string,
  data: any | { json(): object | null },
  index: number
} | null
```

**Properties:**
- `name` - Event name ("onMessage", "onError", "onComplete")
- `timestamp` - ISO timestamp
- `data` - Event payload (raw data)
- `data.json()` - Helper to parse JSON (returns null if invalid)
- `index` - Sequence number (0-based, per event type)

**Examples:**

```javascript
// WebSocket onMessage event script
// This script executes for EACH message received

const msg = quest.event.data.json();
console.log(`Message ${quest.event.index + 1}:`, msg);

quest.test(`Message ${quest.event.index + 1} has valid type`, () => {
  expect(msg).to.have.property('type');
  expect(msg.type).to.be.oneOf(['ping', 'data', 'close']);
});

quest.test(`Message ${quest.event.index + 1} timestamp is recent`, () => {
  const msgTime = new Date(quest.event.timestamp);
  const now = new Date();
  expect(now - msgTime).to.be.below(5000); // Within 5 seconds
});

// Access raw data if needed
console.log('Raw:', quest.event.data);  // String or object depending on protocol
```

```javascript
// WebSocket onError event script
console.error('WebSocket error:', quest.event.data);
quest.fail(`Connection failed: ${quest.event.data.message}`);
```

```javascript
// WebSocket onClose event script
console.log('Connection closed:', quest.event.data.code, quest.event.data.reason);

quest.test('Graceful close', () => {
  expect(quest.event.data.code).to.equal(1000);
});
```

**Non-plugin scripts:**
```javascript
quest.event  // null (not available in collection/folder/request scripts)
```

---

## console

User script output.

```javascript
console.log(message: string): void
console.error(message: string): void
console.warn(message: string): void
console.info(message: string): void
```

Output captured and displayed in results. Separate from runner logging controlled by `logLevel`.

---

## Chai Assertions

All test callbacks have Chai assertion library available:

```javascript
quest.test('Example', () => {
  // Equality
  expect(actual).to.equal(expected);
  expect(actual).to.deep.equal({...});
  
  // Type checks
  expect(value).to.be.a('string');
  expect(value).to.be.a('number');
  expect(value).to.be.an('array');
  
  // Boolean
  expect(value).to.be.true;
  expect(value).to.be.false;
  expect(value).to.be.null;
  expect(value).to.be.undefined;
  
  // Existence
  expect(value).to.exist;
  expect(obj).to.have.property('key');
  
  // Arrays
  expect(array).to.include('item');
  expect(array).to.have.length(5);
  
  // Numbers
  expect(num).to.be.above(5);
  expect(num).to.be.below(10);
  expect(num).to.be.within(5, 10);
  
  // Strings
  expect(str).to.contain('substring');
  expect(str).to.match(/pattern/);
});
```

---

## Built-in Libraries

Available via `require()`:

```javascript
const _ = require('lodash');                   // Lodash utility library
const moment = require('moment');              // Date/time manipulation
const chai = require('chai');                  // Assertion library
```

---

## Script Execution Lifecycle

Scripts execute at different lifecycle stages and in a fixed inheritance order:

```
Collection Start
  ↓
collectionPreScript (ONCE - before any iterations)
  ↓
  Iteration 1 Start
    ↓
    Folder Start
      ↓
    folderPreScript (ONCE per iteration when entering folder)
      ↓
      Request 1:
        preRequestScript (collection)
        preRequestScript (folder)
        preRequestScript (request)
        >>> PROTOCOL EXECUTION (HTTP/gRPC/etc; plugins may emit events) <<<
        postRequestScript (request)   // tests allowed here
        postRequestScript (folder)
        postRequestScript (collection)
      ↓
      Request 2:
        (same pattern)
      ↓
    folderPostScript (ONCE per iteration when leaving folder)
    ↓
  Iteration 1 End
  ↓
  Iteration 2 Start
    ↓
    (same pattern as Iteration 1)
    ↓
  Iteration 2 End
  ↓
collectionPostScript (ONCE - after all iterations)
  ↓
Collection End
```

**Key Points:**
- `collectionPreScript` / `collectionPostScript`: Run ONCE for entire collection (before/after all iterations)
- `folderPreScript` / `folderPostScript`: Run ONCE per iteration when entering/leaving folder
- Pre-request scripts run in order: collection → folder → request
- Post-request scripts run in order: request → folder → collection
- Scripts inherit scope: collection → folder → request

---

## CLI Usage & Data Iteration

### Iteration Behavior

**Data Source:**
- Collection `testData: []` OR CLI `--data file.csv`/`--data file.json`
- CLI `--data` **completely replaces** collection `testData`

**Accessing Iteration Data:**
- In scripts: `quest.iteration.data.get('columnName')`
- In request data (URL, headers, body, variables): `{{columnName}}`

**CLI Examples:**

```bash
# Use external CSV data
fracture run users.json --data test-users.csv

# Use external JSON data
fracture run users.json --data test-users.json

# Limit iterations (must be <= number of data rows)
fracture run users.json --data test-users.csv --iterations 100

# With environment and global variables
fracture run users.json --data test-users.csv -e dev.json --global apiKey=abc123
```

**How It Works:**
- Each iteration = one complete run of entire collection
- All requests in an iteration use the same data row
- `{{columnName}}` in URLs, headers, body automatically resolves to iteration data

---

## Complete Real-World Example

### User API Testing with CSV Data

**test-users.csv:**
```csv
userId,expectedName,expectedStatus,shouldExist
1,Alice Smith,200,true
2,Bob Jones,200,true
999,Invalid User,404,false
```

**user-tests.json:**
```json
{
  "info": {
    "id": "col-users",
    "name": "User API Tests"
  },
  "collectionPreScript": "... (see below) ...",
  "items": [{
    "type": "request",
    "id": "req-get-user",
    "name": "Get User Details",
    "protocol": "http",
    "data": {
      "method": "GET",
      "url": "{{baseUrl}}/users/{{userId}}"
    },
    "postRequestScript": "... (see below) ..."
  }]
}
```

**dev.json (environment):**
```json
{
  "name": "Development",
  "values": {
    "baseUrl": "https://api.dev.example.com",
    "authUrl": "https://auth.dev.example.com/token",
    "clientId": "dev-client-123",
    "clientSecret": "dev-secret-xyz"
  }
}
```

**collectionPreScript (runs ONCE before all iterations):**
```javascript
// Authenticate once for entire collection run
const res = await quest.sendRequest({
  url: quest.environment.variables.get('authUrl'),
  method: 'POST',
  header: {'Content-Type': 'application/x-www-form-urlencoded'},
  body: {
    mode: 'urlencoded',
    urlencoded: [
      {key: 'client_id', value: quest.environment.variables.get('clientId')},
      {key: 'client_secret', value: quest.environment.variables.get('clientSecret')}
    ]
  }
});

quest.global.variables.set('authToken', res.json().access_token);
console.log('Authentication successful');
```

**preRequestScript (runs before EACH request):**
```javascript
const userId = quest.iteration.data.get('userId');
console.log(`Testing user ${userId} (iteration ${quest.iteration.current}/${quest.iteration.count})`);

// Add auth header to every request
quest.request.headers.add({
  key: 'Authorization',
  value: 'Bearer ' + quest.global.variables.get('authToken')
});
```

**postRequestScript (runs after EACH request, includes tests):**
```javascript
const shouldExist = quest.iteration.data.get('shouldExist') === 'true';
const expectedName = quest.iteration.data.get('expectedName');
const expectedStatus = parseInt(quest.iteration.data.get('expectedStatus'));

if (shouldExist) {
  quest.test('User exists with correct status', () => {
    expect(quest.response.status).to.equal(expectedStatus);
  });
  
  quest.test('User name matches', () => {
    expect(quest.response.json().name).to.equal(expectedName);
  });
} else {
  quest.test('User not found', () => {
    expect(quest.response.status).to.equal(404);
  });
}
```

**Run:**
```bash
fracture run user-tests.json --data test-users.csv -e dev.json
```

**Expected Output:**
```
ApiQuest v1.0.0

Loading collection: user-tests.json
Loading data: test-users.csv (3 rows)
Loading environment: dev.json

Collection Pre-Script:
  Authentication successful

Starting collection run: User API Tests

→ Iteration 1/3
  
  Get User Details
  Testing user 1 (iteration 1/3)
  GET https://api.dev.example.com/users/1
  Status: 200 OK (142ms)
  
  Tests:
    [PASS] User exists with correct status
    [PASS] User name matches

→ Iteration 2/3
  
  Get User Details
  Testing user 2 (iteration 2/3)
  GET https://api.dev.example.com/users/2
  Status: 200 OK (98ms)
  
  Tests:
    [PASS] User exists with correct status
    [PASS] User name matches

→ Iteration 3/3
  
  Get User Details
  Testing user 999 (iteration 3/3)
  GET https://api.dev.example.com/users/999
  Status: 404 Not Found (87ms)
  
  Tests:
    [PASS] User not found

┌─────────────────────────┬──────────┬─────────┐
│                         │ executed │  failed │
├─────────────────────────┼──────────┼─────────┤
│          iterations     │        3 │       0 │
│            requests     │        3 │       0 │
│               tests     │        5 │       0 │
└─────────────────────────┴──────────┴─────────┘

Total run duration: 1.2s
All tests passed!
```

---

### Timeout Configuration
Per-request timeout control:
```javascript
quest.request.timeout.set(5000);               // Set 5 second timeout for this request
quest.request.timeout.get();                   // Get current timeout
```

**Status:** Not implemented yet (documented API only).

Collection/folder level timeouts via `options.timeout`:
```javascript
{
  timeout: {
    request: 30000,      // Max time for entire request (ms)
    connection: 5000,    // Max time to establish connection (ms)
    response: 25000      // Max time to receive response (ms)
  }
}
```

### Data Transformation Helpers
```javascript
quest.transform.base64Encode(str)              // Encode to base64
quest.transform.base64Decode(str)              // Decode from base64
quest.transform.md5(str)                       // MD5 hash
quest.transform.sha256(str)                    // SHA256 hash
quest.transform.uuid()                         // Generate UUID
quest.transform.randomInt(min, max)            // Random integer
quest.transform.xmlToJson(xml)                 // Parse XML to JSON
quest.transform.jsonToXml(json)                // Convert JSON to XML
```

**Status:** Not implemented yet (documented API only).

### Collection Control Flow
With `dependsOn` and `condition` properties:
```javascript
{
  "id": "req-create-user",
  "dependsOn": ["req-auth"],                   // Waits for req-auth to complete
  "condition": "quest.variables.get('env') === 'dev'", // Only runs in dev
  ...
}
```

This provides declarative control flow without script-based execution control.

**Status:** Not implemented yet (documented API only).

### 4. Error Handling
- Uncaught errors in scripts fail the current request and stop collection execution
- Use try/catch for custom error handling  
- `quest.fail()` provides controlled test failures
- `quest.skip()` provides controlled test skipping

### 5. Performance Patterns
```javascript
// Track individual request performance
const start = Date.now();
const res = await quest.sendRequest({...});
const duration = Date.now() - start;
quest.scope.variables.set('requestDuration', duration.toString());

// Track average performance across iterations
const records = quest.history.requests.filter({name: quest.request.info.name});
const avgTime = records.reduce((sum, r) => sum + r.response.time, 0) / records.length;
console.log(`Average response time: ${avgTime}ms`);
```

### 6. Authentication Workflows

**Auth Inheritance:**
- Request without `auth` property inherits from parent folder
- Folder without `auth` property inherits from parent folder or collection
- If auth is missing at all levels, no authentication is applied
- Use `"auth": {"type": "none"}` to explicitly disable inherited auth
- Use `"auth": {"type": "inherit"}` to explicitly inherit from parent (default)

**Collection-level auth:**
```javascript
{
  "auth": {
    "type": "bearer",
    "data": {"token": "{{authToken}}"}
  },
  "items": [...]  // All requests inherit bearer auth
}
```

**Request-level override:**
```javascript
{
  "type": "request",
  "auth": {"type": "none"},  // Disables collection auth for this request
  ...
}
```

**Dynamic auth in scripts:**
```javascript
// OAuth 2.0 flow
const tokenRes = await quest.sendRequest({
  url: '{{authUrl}}/token',
  method: 'POST',
  body: {
    mode: 'urlencoded',
    urlencoded: [
      {key: 'grant_type', value: 'client_credentials'},
      {key: 'client_id', value: '{{clientId}}'},
      {key: 'client_secret', value: '{{clientSecret}}'}
    ]
  }
});

const token = tokenRes.json().access_token;
quest.global.variables.set('accessToken', token);
quest.request.headers.add({
  key: 'Authorization',
  value: `Bearer ${token}`
});
```

### 7. External Libraries
Load additional libraries via collection options:
```javascript
{
  "options": {
    "libraries": [
      {
        "name": "crypto",
        "source": {"type": "npm", "package": "crypto-js"},
        "version": "^4.0.0"
      },
      {
        "name": "validator",
        "source": {"type": "cdn", "url": "https://cdn.com/validator.js"}
      }
    ]
  }
}
```

Then use in scripts:
```javascript
const CryptoJS = require('crypto');
const hash = CryptoJS.SHA256(quest.request.body.get());
```

### 8. Parallel Execution

**Collection options define the capability:**
```javascript
{
  "options": {
    "execution": {
      "allowParallel": true,      // REQUIRED: Allows parallel execution
      "maxConcurrency": 5,        // Default max concurrent requests
      "bail": false,              // Continue on failures
      "delay": 100                // Delay between requests (ms)
    }
  }
}
```

**CLI activates parallel execution:**
```bash
# Run in parallel (requires allowParallel: true in collection)
fracture run collection.json --parallel

# Override max concurrency
fracture run collection.json --parallel --concurrency 10
```

**How it works:**
- Collection must have `allowParallel: true` to enable parallel capability
- CLI `--parallel` flag activates parallel execution
- CLI `--concurrency N` overrides collection's `maxConcurrency`
- Without CLI `--parallel`, requests run sequentially regardless of `allowParallel`
- Requests execute in parallel based on `dependsOn` dependency graph
