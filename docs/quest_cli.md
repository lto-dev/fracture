# Quest CLI Architecture - @apiquest/fracture

## Overview

`@apiquest/fracture` is the core collection runner engine for ApiQuest with an integrated command-line interface. It provides CLI commands for running API test collections from the terminal, CI/CD pipelines, and automated workflows.

---

## Package Information

**NPM Package:** `@apiquest/fracture`  
**Command Names:** `quest`, `apiquest`, or `fracture`  
**Language:** TypeScript  
**Runtime:** Node.js 18+  
**License:** AGPL-3.0-or-later

---

## Installation

### Global Installation

```bash
# Install globally
npm install -g @apiquest/fracture

# Now `quest` command is available (also `apiquest` or `fracture`)
quest --version
quest run collection.json
```

### Local Project Installation

```bash
# Install as dev dependency
npm install --save-dev @apiquest/fracture

# Use via npx
npx quest run collection.json

# Or via package.json scripts
{
  "scripts": {
    "test:api": "quest run tests/api.json -e prod"
  }
}
```

### Zero-Install Usage

```bash
# Run without installing
npx @apiquest/fracture run collection.json

# Or use any of the command aliases
npx quest run collection.json
```

---

## CLI Commands

### `fracture run`

Execute a collection with full control over iterations, environment, and output.

**Syntax:**
```bash
fracture run <collection> [options]
```

**Arguments:**
- `<collection>` - Path to collection JSON file (required)

**Options:**

#### Variables & Environment
```bash
-g, --global <key=value>          Set global variable (repeatable)
-e, --environment <file>          Environment JSON file
    --env-var <key=value>         Set environment variable (repeatable)
```

#### Data & Iterations
```bash
-d, --data <file>                 Iteration data file (CSV/JSON)
-n, --iterations <count>          Limit number of iterations
```

#### Filtering & Selection
```bash
    --filter <pattern>            Filter by path using regex pattern (JavaScript RegExp)
                                  Matches against full path: "request:/FolderA/RequestName"
    --exclude-deps                Exclude dependencies when filtering
```

#### Execution Control
```bash
    --parallel                    Enable parallel execution
    --concurrency <number>        Max concurrent requests (default: 5)
    --bail                        Stop on first test failure (any failed assertion)
    --delay <ms>                  Delay between requests in milliseconds (sequential mode only)
```

**Parallel Execution:**
- `--parallel` enables DAG-based parallel execution, running dependency-free requests concurrently
- Default `--concurrency` is 5; use `--concurrency 1` for sequential mode without `--parallel` flag
- Scripts remain serialized to maintain state consistency (no variable race conditions)
- Respects `dependsOn` fields on requests and folders for explicit dependencies
- Folder-level dependencies: can make a folder depend on completion of another folder/request
- **Incompatible with `--cookie-jar-persist`** (cookies are cleared after each request in parallel mode)
- DAG construction is deterministic (children sorted alphabetically within each folder)

**Note:** `--bail` stops execution immediately when any `quest.test()` assertion fails, even within post-request or plugin event scripts. Enables fast-fail behavior in CI/CD pipelines.

#### Timeouts
```bash
    --timeout <ms>                Request timeout in milliseconds
```

#### SSL/TLS
```bash
    --ssl-cert <path>             Client certificate file (PEM format)
    --ssl-key <path>              Client private key file
    --ssl-key-passphrase <pass>   Client key passphrase
    --ssl-ca <path>               CA certificate bundle
    --insecure                    Disable SSL certificate validation
```

#### Proxy
```bash
    --proxy <url>                 HTTP/HTTPS proxy URL (http://host:port)
    --proxy-auth <user:pass>      Proxy authentication credentials
    --no-proxy <hosts>            Bypass proxy for hosts (comma-separated)
```

#### Redirects
```bash
    --follow-redirects            Follow HTTP redirects (default: true)
    --no-follow-redirects         Don't follow HTTP redirects
    --max-redirects <count>       Maximum redirects to follow (default: 20)
```

#### Cookies
```bash
    --cookie <name=value>         Set cookie for requests (repeatable)
    --cookie-jar-persist          Persist cookies across requests (default: false)
```

#### Output & Reporting
```bash
-r, --reporters <types>           Output reporters (comma-separated)
                                  Options: cli, json, html, junit (default: cli)
-o, --out <directory>             Output directory for reports
    --no-color                    Disable colored output
    --silent                      Suppress console output
    --log-level <level>           Log level: error, warn, info, debug, trace (default: info)
```

#### Validation & Testing
```bash
    --no-strict-mode              Disable strict validation mode
```

#### Configuration
```bash
    --config <file>               Load options from config file
```

---

## Usage Examples

### Basic Execution

```bash
# Run collection
fracture run api-tests.json

# With environment
fracture run api-tests.json -e production.json

# With iteration data
fracture run api-tests.json --data test-users.csv
```

### Global Variables

```bash
# Set single variable
fracture run api-tests.json -g authToken=abc123

# Set multiple variables
fracture run api-tests.json \
  -g authToken=abc123 \
  -g baseUrl=https://api.example.com
```

### Iteration Control

The `--iterations` flag controls how many times requests execute:

```bash
# Limit CLI data to first 10 rows
fracture run api-tests.json --data users.csv --iterations 10

# Limit collection testData to first 10 rows
fracture run api-tests.json --iterations 10

# Collection repetition (no testData anywhere)
fracture run api-tests.json --iterations 10
```

**How `--iterations` Works:**

1. **With Data (Global Cap):**
   - Limits ALL testData sources to first N rows
   - Each folder/request with testData runs min(N, testData.length) iterations
   
   ```bash
   # Collection has:
   # - Folder A: testData with 100 rows
   # - Folder B: testData with 30 rows
   
   fracture run collection.json --iterations 5
   
   # Result:
   # - Folder A runs 5 times (min(5, 100))
   # - Folder B runs 5 times (min(5, 30))
   ```

2. **Without Data (Repetition Mode):**
   - Runs entire collection N times
   - No iteration data available
   
   ```bash
   # No testData in collection
   fracture run collection.json --iterations 3
   
   # Result: Entire collection runs 3 times
   ```

3. **With CLI Data:**
   - `--data` overrides ALL testData in collection
   - `--iterations` limits the data file
   
   ```bash
   fracture run collection.json --data users.csv --iterations 10
   
   # Uses first 10 rows from users.csv
   # All collection testData ignored
   ```

**Priority:**
```
CLI --data + --iterations  →  Override all, use first N rows
Collection testData        →  Override folder/request, limit to N
Folder testData           →  Use in folder only, limit to N
Request testData          →  Use in request only, limit to N
No data + --iterations    →  Repeat collection N times
```

### Filtering

```bash
# Filter by path - all requests in "User API" folder
fracture run api-tests.json --filter "request:/User API/"

# Filter by request name pattern
fracture run api-tests.json --filter "request:.*/test_.*"

# Multiple folders using regex alternation
fracture run api-tests.json --filter "request:/(Auth|Users)/"

# Exclude a folder (negation)
fracture run api-tests.json --filter "^(?!.*Slow Tests).*"

# Filter with dependencies excluded
fracture run api-tests.json --filter "request:/Critical/" --exclude-deps
```

### Reporting

```bash
# CLI output only (default)
fracture run api-tests.json

# Generate JSON report
fracture run api-tests.json -r json -o ./reports

# Multiple reporters
fracture run api-tests.json -r cli,json,html,junit -o ./reports

# Silent mode (no console output, only files)
fracture run api-tests.json -r json,html --silent -o ./reports
```

### CI/CD Examples

```bash
# GitHub Actions / GitLab CI
fracture run api-tests.json \
  -e ci.json \
  -g buildId=$CI_BUILD_ID \
  -r junit \
  -o test-results \
  --bail

# Exit code: 0 = all tests passed, 1 = failures
```

---

## CLI Output

### Console Reporter (Default)

```
╔════════════════════════════════════════════════════════════╗
║  Quest v2.0.0                                              ║
║  Collection: User API Tests                               ║
╚════════════════════════════════════════════════════════════╝

→ Iteration 1/3 (userId=1)

  GET /users/1
  ✓ Status is 200                              245ms
  ✓ User exists
  ✓ Email is valid

  POST /users
  ✓ User created                               189ms
  ✓ Returns user ID

→ Iteration 2/3 (userId=2)
  ...

╔════════════════════════════════════════════════════════════╗
║  Test Results                                              ║
╠════════════════════════════════════════════════════════════╣
║  Total:    15 tests                                        ║
║  Passed:   14 tests  ✓                                     ║
║  Failed:   1 test    ✗                                     ║
║  Skipped:  0 tests                                         ║
║  Duration: 2.34s                                           ║
╚════════════════════════════════════════════════════════════╝

✗ 1 test failed
```

### Log Levels

```bash
# Error only
fracture run api-tests.json --log-level error

# Warnings and errors
fracture run api-tests.json --log-level warn

# Info (default), warnings and errors
fracture run api-tests.json --log-level info

# Debug output - shows detailed execution
fracture run api-tests.json --log-level debug

# Trace output - extremely detailed, shows all execution steps
fracture run api-tests.json --log-level trace
```

### Silent Mode

```bash
fracture run api-tests.json --silent -r json -o ./reports

# No console output
# Exit code indicates success/failure
# Reports written to files
```

---

## Reporters

### CLI Reporter (Default)

**Output:** Console with colors and formatting  
**File:** None  
**Use:** Interactive development

```bash
fracture run collection.json
# or
fracture run collection.json -r cli
```

### JSON Reporter

**Output:** Machine-readable JSON  
**File:** `quest-report.json`  
**Use:** Integration with other tools, custom processing

```bash
fracture run collection.json -r json -o ./reports
```

**Format:**
```json
{
  "collection": {
    "id": "col-123",
    "name": "User API Tests"
  },
  "summary": {
    "total": 15,
    "passed": 14,
    "failed": 1,
    "skipped": 0,
    "duration": 2340
  },
  "iterations": [
    {
      "iteration": 1,
      "data": { "userId": 1 },
      "requests": [
        {
          "name": "GET /users/1",
          "duration": 245,
          "tests": [
            { "name": "Status is 200", "passed": true }
          ]
        }
      ]
    }
  ]
}
```

### HTML Reporter

**Output:** Standalone HTML file  
**File:** `quest-report.html`  
**Use:** Shareable visual report

```bash
fracture run collection.json -r html -o ./reports
```

**Features:**
- Interactive test results
- Request/response viewer
- Filtering and search
- Timeline view
- Shareable (single file, no dependencies)

### JUnit Reporter

**Output:** JUnit XML format  
**File:** `quest-junit.xml`  
**Use:** CI/CD integration (Jenkins, GitLab, GitHub Actions)

```bash
fracture run collection.json -r junit -o ./test-results
```

**Format:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<testsuites name="Quest Tests" tests="15" failures="1" time="2.34">
  <testsuite name="User API Tests" tests="5" failures="0" time="0.67">
    <testcase name="Status is 200" time="0.245" classname="GET /users/1"/>
    <testcase name="User exists" time="0.002" classname="GET /users/1"/>
  </testsuite>
</testsuites>
```

---

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | All tests passed |
| 1 | One or more tests failed |
| 2 | Script error (syntax, runtime) |
| 3 | Invalid arguments/options/Pre-run validation failed |
| 4 | File not found |
| 5 | Network error |

**Usage in CI/CD:**
```bash
#!/bin/bash
fracture run api-tests.json -e prod.json

if [ $? -eq 0 ]; then
  echo "✓ All tests passed"
  exit 0
else
  echo "✗ Tests failed"
  exit 1
fi
```

---

## Configuration File

### quest.config.json

Optional configuration file for project defaults.

**Location:** Project root or `~/.quest/config.json`

```json
{
  "collections": "./tests/collections",
  "environments": "./tests/environments",
  "data": "./tests/data",
  "reporters": ["cli", "json"],
  "out": "./test-results",
  "timeout": 30000,
  "bail": false,
  "color": true
}
```

**Usage:**
```bash
# Uses config file defaults
fracture run api-tests.json

# Override config
fracture run api-tests.json -r html --timeout 60000
```

---

## CI/CD Integration

### GitHub Actions

```yaml
name: API Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install Fracture
        run: npm install -g @apiquest/fracture
      
      - name: Run Tests
        run: |
          fracture run tests/api-tests.json \
            -e tests/ci.json \
            -g apiKey=${{ secrets.API_KEY }} \
            -r junit,html \
            -o test-results \
            --bail
      
      - name: Publish Test Results
        uses: EnricoMi/publish-unit-test-result-action@v2
        if: always()
        with:
          files: test-results/quest-junit.xml
      
      - name: Upload Report
        uses: actions/upload-artifact@v3
        if: always()
        with:
          name: test-report
          path: test-results/quest-report.html
```

### GitLab CI

```yaml
api-tests:
  stage: test
  image: node:18
  script:
    - npm install -g @apiquest/fracture
    - |
      fracture run tests/api-tests.json \
        -e tests/ci.json \
        -g apiKey=$API_KEY \
        -r junit \
        -o test-results
  artifacts:
    when: always
    reports:
      junit: test-results/quest-junit.xml
```

### Jenkins

```groovy
pipeline {
    agent any
    
    stages {
        stage('Install') {
            steps {
                sh 'npm install -g @apiquest/fracture'
            }
        }
        
        stage('Test') {
            steps {
                sh '''
                    fracture run tests/api-tests.json \
                      -e tests/ci.json \
                      -r junit \
                      -o test-results
                '''
            }
        }
    }
    
    post {
        always {
            junit 'test-results/quest-junit.xml'
        }
    }
}
```

---


### Command Implementation

The CLI is integrated directly into the `@apiquest/fracture` package using Commander.js:

```typescript
// bin/cli.js (conceptual)
import { Command } from 'commander';
import { CollectionRunner } from '../dist/index.js';
import { ConsoleReporter } from '../dist/ConsoleReporter.js';

export const runCommand = new Command('run')
    .argument('<collection>', 'Collection file path')
    .option('-e, --environment <file>', 'Environment file')
    .option('-d, --data <file>', 'Iteration data file')
    .option('-n, --iterations <count>', 'Limit iterations')
    .option('-r, --reporters <types>', 'Reporters', 'cli')
    .option('-o, --out <dir>', 'Output directory')
    .action(async (collectionPath, options) => {
        const collection = loadCollection(collectionPath);
        const environment = options.environment 
            ? loadEnvironment(options.environment) 
            : undefined;
        const data = options.data 
            ? loadData(options.data) 
            : undefined;
        
        const runner = new CollectionRunner();
        const reporter = new ConsoleReporter();
        
        // Listen to events
        runner.on('requestCompleted', (result) => {
            reporter.onRequestCompleted(result);
        });
        
        runner.on('testCompleted', (test) => {
            reporter.onTestCompleted(test);
        });
        
        // Run collection
        const result = await runner.run(collection, {
            environment,
            data,
            iterations: options.iterations
        });
        
        // Show summary
        reporter.showSummary(result);
        
        // Exit with appropriate code
        process.exit(result.failedTests > 0 ? 1 : 0);
    });
```

### Reporter Interface

```typescript
export interface IReporter {
    name: string;
    
    onRunStarted(collection: Collection): void;
    onRequestStarted(request: Request): void;
    onRequestCompleted(result: RequestResult): void;
    onTestCompleted(test: TestResult): void;
    onRunCompleted(result: RunResult): void;
    
    // Generate output file (if applicable)
    generate?(result: RunResult, outputPath: string): Promise<void>;
}
```

---

## Programmatic Usage

`@apiquest/fracture` can also be used programmatically:

```typescript
import { CollectionRunner } from '@apiquest/fracture';

const runner = new CollectionRunner();
const result = await runner.run(collection, options);
```

For more information on programmatic usage, see the [Quest Runner documentation](quest_runner.md).

---

## Debugging

### Debug/Trace Output

```bash
# Use --log-level debug for detailed output
fracture run collection.json --log-level debug

# Use --log-level trace for extremely detailed output
fracture run collection.json --log-level trace

# Shows:
# - Variable resolution steps
# - Script execution
# - Request/response details
# - Plugin loading
```

---

## Troubleshooting

### Common Issues

**Collection not found:**
```bash
fracture run api-tests.json
# Error: ENOENT: no such file or directory

# Solution: Use correct path
fracture run ./tests/api-tests.json
```

**Environment variables not working:**
```bash
fracture run collection.json -g token={{TOKEN}}
# Variable not resolved

# Solution: Use quotes
fracture run collection.json -g "token=$TOKEN"
```

**CSV parsing errors:**
```bash
fracture run collection.json --data users.csv
# Error: Malformed CSV

# Solution: Check CSV format, encoding (UTF-8)
```

**All tests skipped:**
```bash
# When using both --data and JSON testData
# CLI --data overrides JSON testData

# Solution: Remove --data flag to use JSON testData
```

---

## Performance Tips

### Parallel Execution

```bash
# Enable parallel execution for better performance
fracture run collection.json --parallel --concurrency 5
```

### Selective Execution

```bash
# Run only specific folder (faster)
fracture run collection.json --filter "request:/Critical Tests/"

# Skip slow tests (negation)
fracture run collection.json --filter "^(?!.*Slow).*"

# Run only requests matching pattern
fracture run collection.json --filter "request:.*/Health.*"
```

