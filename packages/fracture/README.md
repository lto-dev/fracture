# @apiquest/fracture

Core collection runner engine for ApiQuest with integrated CLI. Executes JSON-based API test collections with support for multiple protocols via plugins.

## Installation

```bash
npm install -g @apiquest/fracture
```

### Plugins

Protocol and authentication plugins extend fracture capabilities:

```bash
# Using fracture CLI (recommended)
fracture plugin install http        # HTTP/REST APIs
fracture plugin install auth        # Authentication
fracture plugin install vault-file  # File-based secrets vault
fracture plugin install graphql     # GraphQL
fracture plugin install sse         # Server-Sent Events

# Or using npm
npm install -g @apiquest/plugin-http
npm install -g @apiquest/plugin-auth
npm install -g @apiquest/plugin-vault-file
npm install -g @apiquest/plugin-graphql
npm install -g @apiquest/plugin-sse
```

## Quick Start

### CLI

```bash
# Run a collection
fracture run ./collection.json

# With environment and global variables
fracture run ./collection.json \
  -e ./environment.json \
  -g baseUrl=https://api.example.com

# With iteration data
fracture run ./collection.json \
  --data ./users.csv \
  --iterations 10

# Parallel execution
fracture run ./collection.json \
  --parallel \
  --concurrency 5

# With external libraries (npm, file, or CDN)
fracture run ./collection.json \
  --allow-external-libraries
```

### Programmatic API

```typescript
import { CollectionRunner } from '@apiquest/fracture';
import type { Collection } from '@apiquest/types';

const runner = new CollectionRunner();
const result = await runner.run(collection, {
  globalVariables: { baseUrl: 'https://api.example.com' }
});

console.log(`Tests: ${result.passedTests}/${result.totalTests} passed`);
```

## Key Features

- **Deterministic DAG-based parallel execution** - Explicit dependency graphs ensure stable, reproducible runs
- **Pre-run validation** - AST-based script analysis validates syntax before execution
- **Deterministic test counting** - Test counts known before execution starts
- **Plugin architecture** - Support for HTTP, GraphQL, gRPC, WebSocket, SSE via plugins
- **Collection-level iterations** - Data-driven testing with CSV/JSON files
- **Event-based reporting** - Real-time progress events for custom reporters
- **External libraries** - Load npm packages, local files, or CDN scripts (opt-in)

## Collection Schema

Collections are JSON files following the ApiQuest schema:

```json
{
  "$schema": "https://apiquest.net/schemas/collection-v1.0.json",
  "info": {
    "id": "basic-api",
    "name": "Basic API Test Collection",
    "version": "1.0.0"
  },
  "variables": {
    "baseUrl": "https://jsonplaceholder.typicode.com"
  },
  "protocol": "http",
  "items": [
    {
      "type": "request",
      "id": "req-1",
      "name": "Get Single Post",
      "data": {
        "method": "GET",
        "url": "{{baseUrl}}/posts/1",
        "headers": {
          "Accept": "application/json"
        }
      },
      "postRequestScript": "quest.test('Status is 200', () => {\n  expect(quest.response.status).to.equal(200);\n});\n\nquest.test('Response has userId', () => {\n  const body = quest.response.json();\n  expect(body).to.have.property('userId');\n});"
    }
  ]
}
```

## CLI Options

Key runtime options (see [full CLI reference](../../docs/quest_cli.md) for all options):

```bash
# Variables & Environment
-g, --global <key=value>      Set global variable
-e, --environment <file>      Environment file
--env-var <key=value>         Set environment variable

# Execution
--parallel                    Enable parallel execution
--concurrency <number>        Max concurrent requests
--bail                        Stop on first test failure
--delay <ms>                  Delay between requests
--timeout <ms>                Request timeout

# SSL/TLS
--ssl-cert <path>             Client certificate (PEM)
--ssl-key <path>              Client private key
--insecure                    Disable SSL validation

# Proxy
--proxy <url>                 HTTP/HTTPS proxy
--proxy-auth <user:pass>      Proxy credentials

# Plugins & Libraries
--install-plugins             Auto-install missing plugins
--allow-external-libraries    Enable external libraries (npm/file/cdn)

# Output
--silent                      Suppress output
--log-level <level>           error|warn|info|debug|trace
--no-color                    Disable colors
```

**Exit Codes:**
- `0` — All tests passed
- `1` — One or more tests failed
- `2` — Invalid CLI input
- `3` — Pre-run validation failed
- `4` — Runtime error

## External Libraries

Load npm packages, local files, or CDN scripts in your test scripts. Requires `--allow-external-libraries` flag for security.

```json
{
  "options": {
    "libraries": [
      {
        "name": "validator",
        "source": { "type": "npm", "package": "validator" },
        "version": "^13.11.0"
      },
      {
        "name": "myutils",
        "source": { "type": "file", "path": "./utils/helpers.js" }
      },
      {
        "name": "lodash",
        "source": { "type": "cdn", "url": "https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js" }
      }
    ]
  }
}
```

Use in scripts with `require()`:

```javascript
const validator = require('validator');
quest.test('Valid email', () => {
  expect(validator.isEmail('test@example.com')).to.be.true;
});
```

Run with: `fracture run collection.json --allow-external-libraries`

See [CLI documentation](../../docs/quest_cli.md#external-libraries) for details.

## Documentation

- [CLI Reference](../../docs/quest_cli.md)
- [Runner API](../../docs/quest_runner.md)
- [Schema Specification](../../docs/quest_schema_spec.md)

## License

Dual-licensed under AGPL-3.0-or-later and commercial license. See [LICENSE](./LICENSE.txt) for details.
