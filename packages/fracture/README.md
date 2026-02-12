# @apiquest/fracture

Core collection runner engine for ApiQuest with integrated CLI. Executes JSON-based API test collections with support for multiple protocols via plugins.

## Installation

```bash
npm install -g @apiquest/fracture
```

### Plugins

The runner requires protocol plugins to execute requests. Install at least one:

```bash
# HTTP/REST APIs
npm install -g @apiquest/plugin-http

# Authentication (Bearer, Basic, OAuth2, API Key)
npm install -g @apiquest/plugin-auth

# File-based vault for secrets
npm install -g @apiquest/plugin-vault-file
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

## Documentation

- [Fracture Documentation](https://apiquest.net/docs/fracture)
- [Schema Specification](https://apiquest.net/schemas/collection-v1.0.json)

## License

Dual-licensed under AGPL-3.0-or-later and commercial license. See [LICENSE](./LICENSE.txt) for details.
