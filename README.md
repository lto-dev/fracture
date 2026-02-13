# ApiQuest Fracture

Fracture ([`@apiquest/fracture`](packages/fracture/)) is the core runner engine for ApiQuest. It provides both a CLI and programmatic API to run JSON-based test collections with support for multiple protocols (HTTP, gRPC, GraphQL, WebSocket, SQL) via its plugin architecture

## Key Features

- **Deterministic DAG-based parallel execution** — Explicit dependency graphs (`dependsOn`) ensure stable, reproducible parallel runs
- **Pre-run validation** — AST-based script analysis validates test syntax before execution, fails fast on invalid collections
- **Deterministic test counting** — Test counts are known before execution starts (critical for CI reporting)
- **Plugin architecture** — Protocol plugins (HTTP, gRPC, GraphQL, WebSocket), auth plugins, and value providers (vaults)
- **Collection-level iterations** — Data-driven testing with CSV/JSON iteration data, CLI overrides entire collection
- **Programmatic API** — Full TypeScript library with event-based reporters

## Requirements

- Node.js 20+ (LTS)

## CLI Runner

The CLI is packaged inside `@apiquest/fracture` and exposes the `quest`, `fracture`, and `apiquest` commands.

### Install

```bash
npm install -g @apiquest/fracture
```

### Run a Collection

```bash
fracture run ./examples/basic-api.json
```

### Environment + Globals

```bash
fracture run ./examples/basic-api.json \
  -e ./examples/test-environment.json \
  -g baseUrl=https://jsonplaceholder.apiquest.net \
  -g apiVersion=v1
```

### Iteration Data

```bash
fracture run ./examples/iteration-cli-data-test.json \
  --data ./examples/users-data.csv \
  --iterations 5
```

### Filtering + Parallel Execution

```bash
fracture run ./examples/basic-api.json \
  --filter "request:/Get" \
  --parallel \
  --concurrency 5
```

### CI/CD Usage (Exit Codes)

The CLI exits based on test results and validation status:

- `0` — All tests passed
- `1` — One or more tests failed
- `2` — Invalid CLI input (bad flag values)
- `3` — Pre-run validation failed
- `4` — Unhandled error (missing files, runtime failure)

Example GitHub Actions step:

```yaml
- name: Run API tests
  run: |
    fracture run ./examples/basic-api.json \
      -e ./examples/test-environment.json \
      -g buildId=${{ github.run_id }} \
      --bail
```

## Library Integration

`@apiquest/fracture` exposes the core `CollectionRunner` and a convenience `run()` helper.

### Minimal Runner Usage

```ts
import { readFileSync } from 'node:fs';
import { CollectionRunner } from '@apiquest/fracture';
import type { Collection } from '@apiquest/types';

const collection = JSON.parse(
  readFileSync('./examples/basic-api.json', 'utf-8')
) as Collection;

const runner = new CollectionRunner({
  // Optional: plugin discovery directories
  pluginsDir: ['./plugins']
});

const result = await runner.run(collection, {
  globalVariables: {
    baseUrl: 'https://jsonplaceholder.apiquest.net'
  }
});

if (result.failedTests > 0) {
  process.exit(1);
}
```

### Convenience Helper

```ts
import { readFileSync } from 'node:fs';
import { run } from '@apiquest/fracture';
import type { Collection, Environment } from '@apiquest/types';

const collection = JSON.parse(
  readFileSync('./examples/basic-api.json', 'utf-8')
) as Collection;

const environment = JSON.parse(
  readFileSync('./examples/test-environment.json', 'utf-8')
) as Environment;

const result = await run({
  collection,
  environment,
  globalVariables: {
    baseUrl: 'https://jsonplaceholder.apiquest.net'
  }
});

if (result.failedTests > 0) {
  process.exit(1);
}
```

## Collection Schema

Collections are JSON files that follow the ApiQuest schema. See:

- `docs/quest_schema_spec.md`
- `docs/collection-schema-v1.0.json`

## CLI Options (Core)

The CLI exposes the following core options used by the runner:

- `-g, --global <key=value>` — set global variables (repeatable)
- `-e, --environment <file>` — environment JSON file
- `--env-var <key=value>` — additional environment variables (repeatable)
- `-d, --data <file>` — iteration data (CSV or JSON)
- `-n, --iterations <count>` — limit iterations
- `--filter <pattern>` — regex filter by request path
- `--filter-exclude-deps` — exclude dependencies when filtering
- `--parallel` — enable parallel execution
- `--concurrency <number>` — max concurrent requests
- `--bail` — stop on first failing test
- `--delay <ms>` — delay between requests (sequential mode)
- `--timeout <ms>` — request timeout
- `--ssl-cert <path>` / `--ssl-key <path>` / `--ssl-key-passphrase <pass>` / `--ssl-ca <path>` / `--insecure`
- `--proxy <url>` / `--proxy-auth <user:pass>` / `--no-proxy <hosts>`
- `--follow-redirects` / `--no-follow-redirects` / `--max-redirects <count>`
- `--cookie <name=value>` — repeatable
- `--cookie-jar-persist` — persist cookies across runs
- `--log-level <level>` — error | warn | info | debug | trace
- `--no-strict-mode` — disable strict validation

## Why Fracture? (vs Newman/Bruno/Insomnia CLI)

### Deterministic & Parallel Execution

**Newman/Bruno/Insomnia CLI**: Sequential-only or non-deterministic parallel (race conditions possible)

**Fracture**: DAG-based execution with explicit `dependsOn` graphs
- Parallel runs produce identical results across machines
- No implicit ordering assumptions
- Per-folder and per-request dependency declarations

```json
{
  "items": [
    { "id": "auth", "name": "Get Auth Token" },
    { "id": "user", "name": "Get User", "dependsOn": ["auth"] },
    { "id": "products", "name": "Get Products", "dependsOn": ["auth"] }
  ]
}
```

### Pre-Run Validation

**Newman/Bruno/Insomnia CLI**: Runtime failures only (discover syntax errors during execution)

**Fracture**: AST-based validation before any requests execute
- Script syntax validation (catches `quest.test()` in wrong script types)
- Protocol/auth plugin validation (fails if required plugins missing)
- Condition expression validation (in strict mode)
- **Result**: Fail-fast in CI, no wasted request execution

### Deterministic Test Counting

**Newman/Bruno/Insomnia CLI**: Test count known only after execution completes

**Fracture**: Test count known before execution starts
- AST parses all `quest.test()` calls
- Streaming protocols use `quest.expectMessages()` hints
- **Result**: Accurate CI reporting (e.g., "Expected 50 tests, got 50")

### Plugin Architecture

**Newman/Bruno/Insomnia CLI**: HTTP-only or tightly coupled protocols

**Fracture**: Plugin-based multi-protocol
- HTTP, gRPC, GraphQL, WebSocket even SQL via plugins
- Auth plugins (bearer, basic, OAuth2, custom)
- Value provider plugins (AWS Secrets, Azure KeyVault, file-based vaults)
- Selective loading (only required plugins loaded for faster startup)

### Collection-Level Iterations

**Newman**: Supports data files via `-d`, iterations run entire collection

**Bruno/Insomnia**: Limited or no iteration support

**Fracture**: Collection-level iteration model with CLI override
- `--data users.csv` replaces all testData in collection
- `--iterations 10` limits to first 10 rows
- Each iteration runs entire collection with one data row
- Consistent iteration context across all requests

```bash
# Run collection 10 times with first 10 users from CSV
fracture run api.json --data users.csv --iterations 10
```

## Documentation

- [CLI Reference](./docs/quest_cli.md) — Complete CLI options and usage
- [Runner Architecture](./docs/quest_runner.md) — CollectionRunner internals and APIs
- [Schema Specification](./docs/quest_schema_spec.md) — Collection JSON format
- [JavaScript API](./docs/api_reference.md) — quest.* API in scripts

## Notes

- Plugin auto-discovery scans shared user directories and global npm scope for `@apiquest` packages
- Runner emits lifecycle events (`beforeRequest`, `afterRequest`, `assertion`) for custom reporters
- All examples use `fracture` command (aliases: `quest`, `apiquest`)

## Contributing

We welcome contributions! Before submitting a pull request, please:

1. Review our [Contributing Guide](./CONTRIBUTING.md)
2. **Sign the [Contributor License Agreement (CLA)](./CLA.md)** - Required for all contributions

The CLA enables dual licensing and keeps the project sustainable. It's a simple one-time process automated through our CLA bot. [Learn more about why we need a CLA](./CLA.md).

## License

ApiQuest Fracture is dual-licensed:

- **Open Source**: [GNU Affero General Public License v3.0 or later (AGPL-3.0-or-later)](./LICENSE)
- **Commercial**: Alternative licensing available for businesses - contact us at sales@HumanHub.io

This dual-licensing model allows us to:
- Keep the project freely available for the open-source community
- Offer flexible licensing terms for commercial use
- Sustain ongoing development and support
