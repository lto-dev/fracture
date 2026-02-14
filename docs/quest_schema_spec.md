# ApiQuest Collection Schema Specification v1.0

**Schema:** https://apiquest.net/schemas/collection-v1.0.json

## Overview

ApiQuest collections are JSON files that define API test suites with support for:
- **Multi-protocol** requests (HTTP, gRPC, GraphQL, WebSocket)
- **Nested folder** organization
- **Script execution** at multiple levels
- **Data iteration** at collection level (or via CLI --data)
- **Request dependencies** for parallel execution
- **Plugin-based** authentication and protocols
- **Plugin-based** variable provider (vault,kv,etc)
---

## Complete Schema

```typescript
interface Collection {
  // Schema metadata
  $schema?: string;
  
  // Collection information
  info: {
    id: string;
    name: string;
    version?: string;
    description?: string;
  };
  
  // Protocol (collection-level)
  protocol: string;  // "http", "graphql", "grpc", "websocket", etc.
  
  // Authentication (plugin-based)
  // Auth types are validated against protocol.supportedAuthTypes
  auth?: {
    type: string;            // Plugin name: "bearer", "basic", "oauth2", etc.
    data: Record<string, any>;  // Plugin-specific configuration
  };
  
  // Variables
  variables?: Record<string, string | Variable>;
  
  // Collection-level scripts
  collectionPreScript?: string;   // Runs ONCE at collection start
  collectionPostScript?: string;  // Runs ONCE at collection end
  preRequestScript?: string;      // Runs before EACH request
  postRequestScript?: string;     // Runs after EACH request
  
  // Iteration data
  testData?: IterationData[];
  
  // Runtime options (passed to all plugins)
  options?: RuntimeOptions;
  
  // Items (requests and folders)
  items: CollectionItem[];
}

interface RuntimeOptions {
  // Validation
  strictMode?: boolean;  // Enable strict validation mode (default: true)
  
  // Execution control
  execution?: {
    allowParallel?: boolean;    // Enable parallel execution (default: false)
    maxConcurrency?: number;    // Max parallel requests (default: 5)
    bail?: boolean;             // Stop on first failure (default: false)
    delay?: number;             // Delay between requests in ms (default: 0)
  };
  
  // Log level control
  logLevel?: 'error' | 'warn' | 'info' | 'debug' | 'trace';  // Default: 'info'
  
  // External libraries (requires --allow-external-libraries flag)
  // Built-in libraries (lodash, moment, chai) always available via require()
  libraries?: ExternalLibrary[];
  
  // Explicit cookies to send
  cookies?: Cookie[];
  
  // Cookie jar settings  
  jar?: {
    persist: boolean;  // default: false - If true, cookies persist across requests; if false, cleared after each request
  };
  
  // SSL/TLS Options
  ssl?: {
    validateCertificates?: boolean;
    clientCertificate?: {
      cert: string;  // Path or PEM
      key: string;   // Path or PEM
      passphrase?: string;
    };
    ca?: string;  // CA certificate
  };
  
  // Proxy Options
  proxy?: {
    enabled: boolean;
    host: string;
    port: number;
    auth?: {
      username: string;
      password: string;
    };
    bypass?: string[];  // Hosts to bypass proxy
  };
  
  // Timeout Options
  timeout?: {
    request?: number;      // Per-request timeout (ms)
    connection?: number;   // Connection timeout (ms)
    response?: number;     // Response timeout (ms)
  };
  
  // Redirect Options
  followRedirects?: boolean;
  maxRedirects?: number;
  
  // Plugin-specific options
  plugins?: {
    [pluginName: string]: Record<string, any>;
  };
}

interface ExternalLibrary {
  name: string;              // Variable name in script context
  source: LibrarySource;
  version?: string;          // For npm sources
}

type LibrarySource = 
  | { type: "npm"; package: string }      // npm package
  | { type: "cdn"; url: string }          // CDN URL  
  | { type: "file"; path: string };       // Local file path

// Example usage:
// "libraries": [
//   { "name": "validator", "source": { "type": "npm", "package": "validator" }, "version": "^13.11.0" },
//   { "name": "myutils", "source": { "type": "file", "path": "./utils.cjs" } },
//   { "name": "remote", "source": { "type": "cdn", "url": "https://cdn.jsdelivr.net/npm/lodash@4/lodash.min.js" } }
// ]
// Script usage: const validator = require('validator');
// IMPORTANT: Requires --allow-external-libraries CLI flag

interface Cookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: string;  // ISO 8601 date
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
}

interface Variable {
  value: string;
  enabled?: boolean;
  type?: "string" | "number" | "boolean";
  isSecret?: boolean;
  isRequired?: boolean;
  provider?: string;     // "env", "vault:aws-secrets", etc.
  description?: string;
}

interface IterationData {
  [key: string]: string | number | boolean;
}

type CollectionItem = Folder | Request;

interface Folder {
  type: "folder";
  id?: string;
  name: string;
  description?: string;
  
  // Execution control
  dependsOn?: string[];       // IDs of folders/requests that must execute first
  condition?: string;         // JavaScript expression, default: true
  
  // Auth override
  auth?: Auth;
  
  // Folder lifecycle scripts
  folderPreScript?: string;   // Runs ONCE when entering folder
  folderPostScript?: string;  // Runs ONCE when leaving folder
  preRequestScript?: string;  // Runs before EACH request in folder
  postRequestScript?: string; // Runs after EACH request in folder
  
  // Runtime options (overrides collection options)
  options?: RuntimeOptions;
  
  // Nested items
  items: CollectionItem[];
}

interface Request {
  type: "request";
  id: string;
  name: string;
  description?: string;
  
  // Execution control
  dependsOn?: string[];       // IDs of folders/requests that must execute first
  condition?: string;         // JavaScript expression, default: true
  
  // Auth override
  auth?: Auth;
  
  // Protocol-specific data
  // Protocol is inherited from collection.protocol
  data: {
    [key: string]: any;
    scripts?: ProtocolScript[];  // Protocol-specific event scripts
  };
  
  // Scripts
  preRequestScript?: string;
  postRequestScript?: string;  // Includes tests
  
  // Runtime options (overrides folder/collection options)
  options?: RuntimeOptions;
  
  // Response examples
  examples?: ResponseExample[];
}

interface Auth {
  type: string | "inherit" | "none";
  data?: Record<string, any>;
}

interface ProtocolScript {
  event: string;     // "onMessage", "onError", "onComplete", etc.
  script: string;    // JavaScript code
}

interface ResponseExample {
  name: string;
  description?: string;
  protocol: string;
  data: any;  // Protocol-specific response data
}

interface ValidationError {
  message: string;              // "quest.test() cannot be called in collectionPreScript"
  location: string;             // "/FolderA/Request1" or "/collection"
  source: 'script' | 'protocol' | 'auth' | 'vault' | 'schema';
  scriptType?: ScriptType;      // For script validation errors
  details?: any;                // Line numbers, suggestions, etc.
}

interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];   // All validation errors (collected, not fail-fast)
}
```

---

## Collection Structure

### **1. Collection Root**

```json
{
  "$schema": "https://apiquest.net/schemas/collection-v1.0.json",
  "info": {
    "id": "col-abc123",
    "name": "User API Test Suite",
    "version": "1.0.0",
    "description": "Complete test suite for user management APIs"
  }
}
```

**Fields:**
- `$schema` - (Optional) JSON Schema URL for validation
- `info.id` - Unique collection identifier
- `info.name` - Display name
- `info.version` - Semantic version
- `info.description` - Markdown-supported description

---

### **2. Variables**

Variables support type annotation and secret providers:

```json
{
  "variables": {
    "baseUrl": {
      "value": "https://api.example.com",
      "type": "string",
      "description": "Base API URL for all requests"
    },
    "authToken": {
      "value": "",
      "isSecret": true,
      "provider": "vault:aws-secrets",
      "description": "OAuth 2.0 Bearer token"
    },
    "timeout": {
      "value": "30000",
      "type": "number",
      "description": "Request timeout in milliseconds"
    }
  }
}
```

**Variable Types:**
- `string` - Default text value
- `number` - Numeric value
- `boolean` - true/false

**Secret Handling:**
- `isSecret: true` marks a variable as sensitive (masked in UI)

**Variable Providers:**
- `env` - Load from environment variable
- `vault:aws-secrets` - AWS Secrets Manager
- `vault:azure-keyvault` - Azure Key Vault
- Custom providers via plugins

**Resolution Priority:**
1. Iteration data (testData)
2. Local variables (request-scoped)
3. Collection variables
4. Environment variables
5. Global variables (CLI --global)

---

### **3. Authentication**

Plugin-based authentication with inheritance:

```json
{
  "auth": {
    "type": "bearer",
    "data": {
      "token": "{{authToken}}"
    }
  }
}
```

**Common Auth Types:**

**Bearer Token:**
```json
{"type": "bearer", "data": {"token": "{{token}}"}}
```

**Basic Auth:**
```json
{"type": "basic", "data": {"username": "user", "password": "{{pass}}"}}
```

**OAuth 2.0:**
```json
{
  "type": "oauth2",
  "data": {
    "grantType": "client_credentials",
    "accessTokenUrl": "https://auth.example.com/token",
    "clientId": "{{clientId}}",
    "clientSecret": "{{clientSecret}}"
  }
}
```

**API Key:**
```json
{
  "type": "apikey",
  "data": {
    "key": "X-API-Key",
    "value": "{{apiKey}}",
    "in": "header"
  }
}
```

**Auth Inheritance:**
```json
{
  "auth": {"type": "bearer", "data": {"token": "collection-token"}},
  "items": [
    {
      "type": "folder",
      "auth": {"type": "inherit"},  // Uses collection auth
      "items": [
        {
          "type": "request",
          "auth": {"type": "none"}  // Override: no auth
        },
        {
          "type": "request",
          "auth": {"type": "inherit"}  // Uses folder auth (→ collection)
        }
      ]
    }
  ]
}
```

---

### **4. Scripts**

Scripts execute at different lifecycle stages:

#### **Collection-Level Scripts**

```json
{
  "collectionPreScript": "
    // Runs ONCE when collection starts
    console.log('Collection starting...');
    quest.global.variables.set('startTime', Date.now());
  ",
  
  "collectionPostScript": "
    // Runs ONCE when collection ends
    const duration = Date.now() - parseInt(quest.global.variables.get('startTime'));
    console.log(`Collection completed in ${duration}ms`);
    console.log(`Total requests: ${quest.history.requests.all().length}`);
  ",
  
  "preRequestScript": "
    // Runs before EACH request in collection
    console.log(`Executing: ${quest.request.info.name}`);
  ",
  
  "postRequestScript": "
    // Runs after EACH request in collection
    console.log(`Status: ${quest.response.status.code}`);
  "
}
```

#### **Folder-Level Scripts**

```json
{
  "type": "folder",
  "name": "User Management",
  
  "folderPreScript": "
    // Runs ONCE when entering this folder
    console.log('Starting user management tests');
    quest.global.variables.set('folderStart', Date.now());
  ",
  
  "folderPostScript": "
    // Runs ONCE when exiting this folder
    const duration = Date.now() - parseInt(quest.global.variables.get('folderStart'));
    console.log(`Folder completed in ${duration}ms`);
  ",
  
  "preRequestScript": "
    // Runs before EACH request in this folder
  ",
  
  "postRequestScript": "
    // Runs after EACH request in this folder
  "
}
```

#### **Request-Level Scripts**

```json
{
  "type": "request",
  "preRequestScript": "
    // Runs before THIS request
    const timestamp = Date.now();
    quest.scope.variables.set('requestStart', timestamp.toString());
  ",
  
  "postRequestScript": "
    // Runs after THIS request (includes tests)
    quest.test('Response time under 200ms', () => {
      expect(quest.response.time).to.be.below(200);
    });
    
    quest.test('Status is 200', () => {
      expect(quest.response.status.code).to.equal(200);
    });
  "
}
```

#### **Script Execution Order**

```
Collection Start
  ↓
collectionPreScript (ONCE)
  ↓
  Folder Start
    ↓
  folderPreScript (ONCE)
    ↓
    Request 1:
      Collection preRequestScript
      Folder preRequestScript
      Request preRequestScript
      >>> HTTP/gRPC/GraphQL EXECUTION <<<
      Request postRequestScript (tests)
      Folder postRequestScript
      Collection postRequestScript
    ↓
    Request 2:
      (same pattern)
    ↓
  folderPostScript (ONCE)
  ↓
collectionPostScript (ONCE)
  ↓
Collection End
```

---

### **5. Iteration Data (testData)**

Iteration data is defined at the **collection level**. Each iteration executes the entire collection with different data.

#### **Collection-Level Iteration**

```json
{
  "testData": [
    {"env": "dev", "userId": 1, "baseUrl": "https://dev.api.com"},
    {"env": "staging", "userId": 2, "baseUrl": "https://staging.api.com"},
    {"env": "prod", "userId": 3, "baseUrl": "https://api.com"}
  ],
  "items": [
    {"name": "Get Auth Token"},
    {"name": "Get User"},
    {"name": "Get Products"}
  ]
}
// Iteration 1: All requests run with env=dev, userId=1, baseUrl=dev.api.com
// Iteration 2: All requests run with env=staging, userId=2, baseUrl=staging.api.com
// Iteration 3: All requests run with env=prod, userId=3, baseUrl=api.com
// Total: 9 executions (3 requests × 3 iterations)
```

**Key Points:**
- testData or cli --data parameter drives iteration for the entire collection
- All requests in an iteration share the same test data
- Dependencies (`dependsOn`) are respected within each iteration
- Each iteration is self-contained with its own execution context

#### **CLI --data Override**

The CLI `--data` flag provides testData from an external file:

```bash
# Override collection testData with CSV file
fracture run collection.json --data users.csv

# Override collection testData with JSON file
fracture run collection.json --data test-data.json
```

**Iteration Rules:**
1. **CLI `--data`** - Completely replaces collection testData
2. **Collection testData** - Used if no CLI --data provided
3. **No testData** - Collection runs once with no iteration data

#### **--iterations Flag**

The `--iterations N` flag limits the number of iterations:

```bash
# Limit to first 5 iterations
fracture run collection.json --iterations 5

# With --data: limit external data
fracture run collection.json --data users.csv --iterations 10
```

**Behavior Matrix:**

| Scenario | --data | --iterations | Collection testData | Result |
|----------|--------|--------------|---------------------|--------|
| A | users.csv (100 rows) | 10 | - | Use first 10 CSV rows |
| B | - | 5 | 50 rows | Use first 5 collection testData rows |
| C | - | - | 50 rows | Use all 50 collection testData rows |
| D | users.csv (100 rows) | - | - | Use all 100 CSV rows |
| E | - | 10 | - | Run collection 10 times (repetition mode) |

**Key Benefits:**
- **Simpler mental model**: One iteration = one complete collection run
- **Clear dependencies**: All requests in iteration share same data context
- **Better for parallel execution**: Dependency graph is consistent per iteration
- **Easier debugging**: Iteration N = complete execution with data[N]

---

### **6. Request Dependencies**

Enable parallel execution with dependency graphs:

```json
{
  "items": [
    {
      "id": "req-auth",
      "name": "Get Auth Token",
      "dependsOn": []  // No dependencies, can run immediately
    },
    {
      "id": "req-users",
      "name": "Get Users",
      "dependsOn": ["req-auth"]  // Waits for auth
    },
    {
      "id": "req-products",
      "name": "Get Products",
      "dependsOn": ["req-auth"]  // Waits for auth
    },
    {
      "id": "req-orders",
      "name": "Get Orders",
      "dependsOn": ["req-auth"]  // Waits for auth
    },
    {
      "id": "req-report",
      "name": "Generate Report",
      "dependsOn": ["req-users", "req-products", "req-orders"]
    }
  ]
}
```

**Execution Plan:**
```
Time 0: req-auth executes
Time 1: req-users, req-products, req-orders execute IN PARALLEL
Time 2: req-report executes (after all 3 complete)
```

**Benefits:**
- ✅ Parallel execution of independent requests
- ✅ Topological sort at collection parse time
- ✅ Visual dependency graph
- ✅ Deterministic execution order

---

### **7. Conditional Execution**

Skip requests based on runtime conditions:

```json
{
  "id": "req-create-user",
  "name": "Create User",
  "condition": "quest.global.variables.get('userExists') === 'false'",
  "dependsOn": ["req-check-user"]
}
```

**Evaluation:**
- If `condition` is missing: Request runs (default `true`)
- If `condition` evaluates to `false`: Request skipped
- If `condition` evaluates to `true`: Request executes

**Example Workflow:**
```json
{
  "items": [
    {
      "id": "check",
      "postRequestScript": "
        if (quest.response.status.code === 404) {
          quest.global.variables.set('needsCreate', 'true');
        }
      "
    },
    {
      "id": "create",
      "condition": "quest.global.variables.get('needsCreate') === 'true'",
      "dependsOn": ["check"]
    }
  ]
}
```

---

### **8. Folders**

Organize requests with nested folder structure:

```json
{
  "items": [
    {
      "type": "folder",
      "id": "folder-auth",
      "name": "Authentication",
      "description": "Authentication and authorization tests",
      "auth": {"type": "none"},
      "folderPreScript": "console.log('Testing authentication...');",
      "items": [
        {
          "type": "request",
          "name": "Login"
        },
        {
          "type": "request",
          "name": "Refresh Token"
        }
      ]
    },
    {
      "type": "folder",
      "name": "User Management",
      "items": [
        {
          "type": "folder",
          "name": "CRUD Operations",
          "items": [
            {"type": "request", "name": "Create User"},
            {"type": "request", "name": "Read User"},
            {"type": "request", "name": "Update User"},
            {"type": "request", "name": "Delete User"}
          ]
        }
      ]
    }
  ]
}
```

**Folder Features:**
- Infinite nesting depth
- Auth inheritance
- Script inheritance

---

### **9. Protocol-Specific Data**

Each protocol plugin defines its `data` structure:

#### **HTTP Request**

```json
{
  "protocol": "http",
  "data": {
    "method": "POST",
    "url": "{{baseUrl}}/users",
    "headers": {
      "Content-Type": "application/json",
      "Authorization": "Bearer {{token}}"
    },
    "body": {
      "mode": "raw",
      "raw": "{\"name\": \"Alice\", \"email\": \"alice@example.com\"}"
    },
    "scripts": []
  }
}
```

#### **gRPC Request**

```json
{
  "protocol": "grpc",
  "data": {
    "service": "UserService",
    "method": "StreamUsers",
    "message": {
      "filter": "active",
      "limit": 100
    },
    "metadata": {
      "authorization": "Bearer {{token}}"
    },
    "scripts": [
      {
        "event": "onMessage",
        "script": "
          console.log('Received user:', message);
          quest.test('Valid user ID', () => {
            expect(message.id).to.be.a('number');
          });
        "
      },
      {
        "event": "onError",
        "script": "console.error('Stream error:', error);"
      },
      {
        "event": "onComplete",
        "script": "console.log('Stream completed');"
      }
    ]
  }
}
```

#### **GraphQL Request**

```json
{
  "protocol": "graphql",
  "data": {
    "endpoint": "{{baseUrl}}/graphql",
    "query": "
      query GetUser($id: ID!) {
        user(id: $id) {
          id
          name
          posts {
            id
            title
          }
        }
      }
    ",
    "variables": {
      "id": "{{userId}}"
    },
    "headers": {
      "Authorization": "Bearer {{token}}"
    },
    "scripts": []
  }
}
```

#### **WebSocket Request**

```json
{
  "protocol": "websocket",
  "data": {
    "url": "wss://api.example.com/events",
    "messages": [
      "{\"type\": \"subscribe\", \"channel\": \"users\"}",
      "{\"type\": \"ping\"}"
    ],
    "scripts": [
      {
        "event": "onOpen",
        "script": "console.log('WebSocket connected');"
      },
      {
        "event": "onMessage",
        "script": "
          console.log('Received:', message);
          quest.test('Valid event', () => {
            const event = JSON.parse(message);
            expect(event.type).to.exist;
          });
        "
      },
      {
        "event": "onClose",
        "script": "console.log('WebSocket closed:', closeCode);"
      }
    ]
  }
}
```

---

### **10. Response Examples**

Save example responses for documentation and mocking:

#### **HTTP Response Example**

```json
{
  "type": "request",
  "protocol": "http",
  "examples": [
    {
      "name": "Success - 200 OK",
      "description": "Successful user retrieval",
      "protocol": "http",
      "data": {
        "status": 200,
        "statusText": "OK",
        "headers": {
          "content-type": "application/json",
          "x-request-id": "abc-123"
        },
        "body": "{\"id\": 1, \"name\": \"Alice\", \"email\": \"alice@example.com\"}"
      }
    },
    {
      "name": "Not Found - 404",
      "description": "User does not exist",
      "protocol": "http",
      "data": {
        "status": 404,
        "statusText": "Not Found",
        "headers": {
          "content-type": "application/json"
        },
        "body": "{\"error\": \"User not found\"}"
      }
    },
    {
      "name": "Unauthorized - 401",
      "protocol": "http",
      "data": {
        "status": 401,
        "statusText": "Unauthorized",
        "body": "{\"error\": \"Invalid or expired token\"}"
      }
    }
  ]
}
```

#### **gRPC Response Example**

```json
{
  "protocol": "grpc",
  "examples": [
    {
      "name": "Successful Stream",
      "protocol": "grpc",
      "data": {
        "messages": [
          {"id": 1, "name": "Alice", "status": "active"},
          {"id": 2, "name": "Bob", "status": "active"},
          {"id": 3, "name": "Charlie", "status": "inactive"}
        ],
        "metadata": {
          "stream-id": "stream-abc-123",
          "total-count": "3"
        }
      }
    },
    {
      "name": "Permission Denied",
      "protocol": "grpc",
      "data": {
        "error": {
          "code": 7,
          "message": "PERMISSION_DENIED",
          "details": "User lacks permission to access this resource"
        }
      }
    }
  ]
}
```

#### **GraphQL Response Example**

```json
{
  "protocol": "graphql",
  "examples": [
    {
      "name": "Successful Query",
      "protocol": "graphql",
      "data": {
        "data": {
          "user": {
            "id": "1",
            "name": "Alice",
            "posts": [
              {"id": "10", "title": "My First Post"},
              {"id": "11", "title": "Another Post"}
            ]
          }
        }
      }
    },
    {
      "name": "Field Error",
      "protocol": "graphql",
      "data": {
        "errors": [
          {
            "message": "Cannot query field 'invalidField' on type 'User'",
            "locations": [{"line": 3, "column": 5}],
            "path": ["user", "invalidField"]
          }
        ]
      }
    }
  ]
}
```

**Use Cases:**
- **Documentation** - Show expected responses
- **Mock Server** - Return example responses in offline mode
- **IDE IntelliSense** - Auto-complete response fields
- **Validation** - Compare actual vs expected responses

---

## Complete Example

```json
{
  "$schema": "https://apiquest.net/schemas/collection-v1.0.json",
  
  "info": {
    "id": "col-user-api",
    "name": "User Management API",
    "version": "2.1.0",
    "description": "Complete test suite for user management"
  },
  
  "protocol": "http",
  
  "auth": {
    "type": "bearer",
    "data": {
      "token": "{{authToken}}"
    }
  },
  
  "variables": {
    "baseUrl": {
      "value": "https://api.example.com",
      "type": "string",
      "provider": "env",
      "description": "Base API URL"
    },
    "authToken": {
      "value": "",
      "isSecret": true,
      "provider": "vault:aws-secrets",
      "description": "OAuth access token"
    }
  },
  
  "collectionPreScript": "
    console.log('Starting collection...');
    quest.global.variables.set('startTime', Date.now());
  ",
  
  "collectionPostScript": "
    const duration = Date.now() - parseInt(quest.global.variables.get('startTime'));
    console.log(`Collection completed in ${duration}ms`);
  ",
  
  "preRequestScript": "
    console.log(`Executing: ${quest.request.info.name}`);
  ",
  
  "postRequestScript": "
    console.log(`Response: ${quest.response.status.code}`);
  ",
  
  "testData": [
    {"env": "dev", "baseUrl": "https://dev.api.com"},
    {"env": "prod", "baseUrl": "https://api.com"}
  ],
  
  "items": [
    {
      "type": "folder",
      "id": "folder-auth",
      "name": "Authentication",
      "description": "Auth and token management",
      "auth": {"type": "none"},
      
      "folderPreScript": "console.log('Testing auth...');",
      "folderPostScript": "console.log('Auth tests complete');",
      
      "items": [
        {
          "type": "request",
          "id": "req-token",
          "name": "Get Token",
          "dependsOn": [],
          
          "data": {
            "method": "POST",
            "url": "{{baseUrl}}/oauth/token",
            "body": {
              "mode": "urlencoded",
              "urlencoded": [
                {"key": "grant_type", "value": "client_credentials"}
              ]
            }
          },
          
          "postRequestScript": "
            const token = quest.response.json().access_token;
            quest.global.variables.set('authToken', token);
            
            quest.test('Token received', () => {
              expect(token).to.be.a('string');
            });
          ",
          
          "examples": [
            {
              "name": "Success",
              "protocol": "http",
              "data": {
                "status": 200,
                "body": "{\"access_token\": \"eyJhbG...\", \"expires_in\": 3600}"
              }
            }
          ]
        }
      ]
    },
    
    {
      "type": "folder",
      "name": "Users",

      "items": [
        {
          "type": "request",
          "id": "req-get-user",
          "name": "Get User",
          "dependsOn": ["req-token"],
          
          "data": {
            "method": "GET",
            "url": "{{baseUrl}}/users/{{userId}}"
          },
          
          "postRequestScript": "
            quest.test('Status is 200', () => {
              expect(quest.response.status.code).to.equal(200);
            });
          "
        }
      ]
    }
  ]
}
```

---

## ApiQuest Feature Highlights

- Multi-protocol support (HTTP, gRPC, GraphQL, WebSocket)
- Nested folders with lifecycle hooks
- Variables with metadata (type, provider)
- Request dependencies via `dependsOn[]`
- Parallel execution via dependency graph
- Conditional execution via `condition`
- Collection-level iteration data
- Protocol-specific scripts via `data.scripts[]`
- Response examples for multiple protocols
- Plugin architecture for auth, protocols, and value providers

---

## Best Practices

### 1. **Use Folders for Organization**
Group related requests into logical folders.

### 2. **Leverage Dependencies**
Use `dependsOn` to enable parallel execution where possible.

### 3. **Keep Scripts Focused**
- Collection scripts: Setup/teardown, statistics
- Folder scripts: Shared context for related tests
- Request scripts: Specific test assertions

### 4. **Use Iteration Data**
Define testData in your collection to run the entire test suite with different data sets.

### 5. **Document with Examples**
Add response examples for common scenarios (success, errors, edge cases).

### 6. **Secret Management**
Use `type: "secret"` and vault providers for sensitive data.

### 7. **Modular Collections**
Break large test suites into multiple collections and use CLI orchestration.

---

### **11. Runtime Options**

Runtime options configure how the runner and plugins execute requests. Options cascade from collection → folder → request.

#### **Options Inheritance (Deep Merge Pattern)**

Options merge from collection → folder → request, with **lower levels overriding individual options**:

```
Final Options = Collection options (base)
                + Folder options (override individual keys)
                + Request options (override individual keys)
```

**Key Rule:** Individual options at lower levels override the same option at upper levels, but other options are inherited.

#### **Complete Options Example**

```json
{
  "options": {
    "cookies": [
      {
        "name": "session_id",
        "value": "{{sessionId}}",
        "domain": ".example.com",
        "path": "/",
        "secure": true,
        "httpOnly": true,
        "sameSite": "Strict"
      }
    ],
    "jar": {
      "enabled": true,
      "persist": false
    },
    "ssl": {
      "validateCertificates": true,
      "clientCertificate": {
        "cert": "/path/to/client.crt",
        "key": "/path/to/client.key",
        "passphrase": "{{certPass}}"
      },
      "ca": "/path/to/ca.pem"
    },
    "proxy": {
      "enabled": true,
      "host": "proxy.corp.com",
      "port": 8080,
      "auth": {
        "username": "{{proxyUser}}",
        "password": "{{proxyPass}}"
      },
      "bypass": ["localhost", "127.0.0.1", "*.internal.com"]
    },
    "timeout": {
      "request": 30000,
      "connection": 5000,
      "response": 25000
    },
    "followRedirects": true,
    "maxRedirects": 5,
    "plugins": {
      "http": {
        "keepAlive": true,
        "maxSockets": 10
      },
      "grpc": {
        "compression": "gzip"
      }
    }
  }
}
```

#### **Options at Different Levels**

```json
{
  "options": {
    "ssl": {"validateCertificates": true},
    "timeout": {"request": 30000}
  },
  "items": [
    {
      "type": "folder",
      "name": "Secure APIs",
      "options": {
        "ssl": {"validateCertificates": false},
        "cookies": [
          {"name": "test_cookie", "value": "test"}
        ]
      },
      "items": [
        {
          "type": "request",
          "name": "Test Request",
          "options": {
            "timeout": {"request": 5000}
          }
        }
      ]
    }
  ]
}
```

**Final merged options for "Test Request" (deep merge):**
```javascript
{
  // From collection options (base)
  ssl: { validateCertificates: false },  // Overridden by folder
  timeout: { request: 5000 },            // Overridden by request
  
  // From folder options (adds new + overrides collection)
  cookies: [...]                         // Added by folder
  
  // Request options override happens on individual option level
  // Request has timeout.request = 5000, this overrides collection's timeout.request = 30000
  // But request doesn't have ssl or cookies, so those come from folder
}
```

**Merge Algorithm:**
```
1. Start with collection options
2. Deep merge folder options (folder values override collection on key-by-key basis)
3. Deep merge request options (request values override on key-by-key basis)
4. Pass final merged options to all plugins
```
