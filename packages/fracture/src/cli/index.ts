#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { CollectionRunner } from '../CollectionRunner.js';
import { ConsoleReporter } from '../ConsoleReporter.js';
import type { Collection, Environment, IterationData, RuntimeOptions, EventPayloads, ValidationResult } from '@apiquest/types';
import { LogLevel } from '@apiquest/types';
import { getPluginDirectories } from './plugin-discovery.js';
import { addPluginCommands } from './plugin-commands.js';

interface CLIOptions {
  config?: string;
  logLevel?: string;
  environment?: string;
  envVar?: Record<string, string>;
  global?: Record<string, string>;
  data?: string;
  iterations?: number;
  filter?: string;
  excludeDeps?: boolean;
  parallel?: boolean;
  concurrency?: number;
  bail?: boolean;
  delay?: number;
  timeout?: number;
  sslCert?: string;
  sslKey?: string;
  sslKeyPassphrase?: string;
  sslCa?: string;
  insecure?: boolean;
  proxy?: string;
  proxyAuth?: string;
  noProxy?: string;
  followRedirects?: boolean;
  maxRedirects?: number;
  cookie?: string | string[];
  cookieJar?: boolean;
  cookieJarPersist?: boolean;
  silent?: boolean;
  color?: boolean;
  strictMode?: boolean;
  reporters?: string;
  out?: string;
  pluginsDir?: string[];
}

/**
 * Load configuration from a JSON file
 */
function loadConfigFile(configPath: string): Partial<CLIOptions> {
  try {
    const configContent = readFileSync(configPath, 'utf-8');
    return JSON.parse(configContent) as Partial<CLIOptions>;
  } catch (error) {
    console.error(`Error loading config file '${configPath}':`, error instanceof Error ? error.message : String(error));
    process.exit(4);
  }
}

/**
 * Merge config file options with CLI options
 * CLI options take precedence over config file options
 */
function mergeOptions(configOptions: Partial<CLIOptions>, cliOptions: CLIOptions): CLIOptions {
  // Create a merged options object
  // CLI options override config file options
  const merged: CLIOptions = { ...configOptions, ...cliOptions };
  
  // Special handling for objects that should be merged rather than replaced
  if (configOptions.envVar !== undefined && cliOptions.envVar !== undefined) {
    merged.envVar = { ...configOptions.envVar, ...cliOptions.envVar };
  }
  
  if (configOptions.global !== undefined && cliOptions.global !== undefined) {
    merged.global = { ...configOptions.global, ...cliOptions.global };
  }
  
  // Arrays that should be merged
  if (configOptions.cookie !== undefined && cliOptions.cookie !== undefined) {
    const configCookies = Array.isArray(configOptions.cookie) ? configOptions.cookie : [configOptions.cookie];
    const cliCookies = Array.isArray(cliOptions.cookie) ? cliOptions.cookie : [cliOptions.cookie];
    merged.cookie = [...configCookies, ...cliCookies];
  }
  
  return merged;
}

const program = new Command();

// Get command name from process.argv[1] (the bin script name)
const commandName = process.argv[1]?.split(/[\\/]/).pop()?.replace('.js', '') ?? 'fracture';

program
  .name(commandName)
  .description('ApiQuest/Fracture - API testing tool')
  .version('1.0.0');

// Add plugin management commands
addPluginCommands(program);

program
  .command('run')
  .description('Run a collection')
  .argument('<collection>', 'Path to collection JSON file')
  // Variables & Environment
  .option('-g, --global <key=value...>', 'Set global variable (repeatable)', collectKeyValue, {} as Record<string, string>)
  .option('-e, --environment <file>', 'Environment JSON file')
  .option('--env-var <key=value...>', 'Set environment variable (repeatable)', collectKeyValue, {} as Record<string, string>)
  // Data & Iterations
  .option('-d, --data <file>', 'Iteration data file (CSV/JSON)')
  .option('-n, --iterations <count>', 'Limit number of iterations', parseInt)
  // Filtering & Selection
  .option('--filter <pattern>', 'Filter requests by path using regex pattern')
  .option('--exclude-deps', 'Exclude dependencies when filtering')
  // Execution Control
  .option('--parallel', 'Enable parallel execution')
  .option('--concurrency <number>', 'Max concurrent requests', parseInt)
  .option('--bail', 'Stop on first test failure')
  .option('--delay <ms>', 'Delay between requests in milliseconds', parseInt)
  // Timeouts
  .option('--timeout <ms>', 'Request timeout in milliseconds', parseInt)
  // SSL/TLS
  .option('--ssl-cert <path>', 'Client certificate file (PEM format)')
  .option('--ssl-key <path>', 'Client private key file')
  .option('--ssl-key-passphrase <password>', 'Client key passphrase')
  .option('--ssl-ca <path>', 'CA certificate bundle')
  .option('--insecure', 'Disable SSL certificate validation')
  // Proxy
  .option('--proxy <url>', 'HTTP/HTTPS proxy URL (http://host:port)')
  .option('--proxy-auth <user:pass>', 'Proxy authentication credentials')
  .option('--no-proxy <hosts>', 'Bypass proxy for hosts (comma-separated)')
  // Redirects
  .option('--follow-redirects', 'Follow HTTP redirects (default: true)')
  .option('--no-follow-redirects', 'Don\'t follow HTTP redirects')
  .option('--max-redirects <count>', 'Maximum redirects to follow (default: 20)', parseInt)
  // Cookies
  .option('--cookie <name=value>', 'Set cookie for requests (repeatable)')
  .option('--cookie-jar', 'Enable persistent cookie jar')
  .option('--cookie-jar-persist', 'Persist cookies across runs')
  // Output & Reporting
  .option('-r, --reporters <types>', 'Output reporters (comma-separated)', 'cli')
  .option('-o, --out <directory>', 'Output directory for reports')
  .option('--no-color', 'Disable colored output')
  .option('--silent', 'Suppress console output')
  .option('--log-level <level>', 'Log level: error, warn, info, debug, trace (default: info)')
  // Validation & Testing
  .option('--no-strict-mode', 'Disable strict validation mode')
  // Plugins
  .option('--plugin-dir <path>', 'Plugin directory to scan (repeatable, appended to auto-discovered paths)', collectArray, [] as string[])
  // Configuration
  .option('--config <file>', 'Load options from config file')
  .action(async (collectionPath: string, cliOptions: CLIOptions) => {
    // Load and merge config file if specified
    let options = cliOptions;
    if (cliOptions.config !== undefined) {
      const configOptions = loadConfigFile(cliOptions.config);
      options = mergeOptions(configOptions, cliOptions);
    }
    
    // Validate log level if provided
    const validLogLevels = ['error', 'warn', 'info', 'debug', 'trace'];
    if (options.logLevel !== undefined && !validLogLevels.includes(options.logLevel)) {
      console.error(`Error: Invalid log level '${options.logLevel}'. Valid levels: ${validLogLevels.join(', ')}`);
      process.exit(2);
    }
    try {
      // Load collection
      const collectionContent = readFileSync(collectionPath, 'utf-8');
      const collection: Collection = JSON.parse(collectionContent) as Collection;

      // Load environment if specified
      let environment: Environment | undefined;
      if (options.environment !== undefined) {
        const envContent = readFileSync(options.environment, 'utf-8');
        environment = JSON.parse(envContent) as Environment;
      }

      // Merge env-var options into environment
      if (options.envVar !== undefined && Object.keys(options.envVar).length > 0) {
        environment ??= { name: 'CLI Environment', variables: {} };
        environment.variables = { ...environment.variables, ...options.envVar };
      }

      // Load iteration data if specified
      let iterationData: IterationData[] | undefined;
      if (options.data !== undefined) {
        const dataContent = readFileSync(options.data, 'utf-8');
        if (options.data.endsWith('.json')) {
          iterationData = JSON.parse(dataContent) as IterationData[];
        } else if (options.data.endsWith('.csv')) {
          iterationData = parseCSV(dataContent);
        }
      }

      // Configure HTTP plugin for SSL validation
      if (options.insecure === true) {
        // This will be passed to axios config in the HTTP plugin
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
      }

      // Get plugin directories for auto-discovery
      const pluginDirs = getPluginDirectories();
      
      // Append user-specified plugin directories (if any)
      if (options.pluginsDir !== undefined && options.pluginsDir.length > 0) {
        pluginDirs.push(...options.pluginsDir);
      }
      
      // Convert string log level to LogLevel enum
      let logLevel: LogLevel | undefined;
      if (options.logLevel !== undefined) {
        const levelMap: Record<string, LogLevel> = {
          'error': LogLevel.ERROR,
          'warn': LogLevel.WARN,
          'info': LogLevel.INFO,
          'debug': LogLevel.DEBUG,
          'trace': LogLevel.TRACE
        };
        logLevel = levelMap[options.logLevel];
      }
      
      // Create runner with plugin auto-discovery and log level
      const runner = new CollectionRunner({ 
        pluginsDir: pluginDirs,
        logLevel
      });

      // Set up console reporter
      const silent = options.silent;
      const color = options.color;  // --no-color sets this to false
      
      if (silent !== true) {
        const reporter = new ConsoleReporter({
          logLevel,
          color,
          runner
        });
        
        // Wire up reporter to runner events
        runner.on('beforeRun', (payload: EventPayloads['beforeRun']) => {
          reporter.onRunStarted(collection, payload.options as Record<string, unknown>);
          
          // Show expected test count if available
          if (payload.expectedTestCount !== undefined && payload.expectedTestCount >= 0) {
            console.log(`Expected tests: ${payload.expectedTestCount}`);
            console.log('');
          }
          
          // Show validation errors if any (shouldn't reach here but defensive)
          if (payload.validationResult?.valid === false && payload.validationResult.errors !== undefined) {
            console.error('\nValidation errors detected:');
            for (const error of payload.validationResult.errors) {
              console.error(`  ${error.location}: ${error.message}`);
            }
            console.error('');
          }
        });
        
        runner.on('beforeRequest', (payload: EventPayloads['beforeRequest']) => {
          reporter.onBeforeRequest?.(payload);
        });
        
        runner.on('afterRequest', (payload: EventPayloads['afterRequest']) => {
          reporter.onAfterRequest?.(payload);
        });
        
        runner.on('assertion', (payload: EventPayloads['assertion']) => {
          reporter.onAssertion?.(payload);
        });
        
        runner.on('afterRun', (payload: EventPayloads['afterRun']) => {
          reporter.onRunCompleted(payload.result);
        });
      }

      // Build RuntimeOptions from CLI options
      const runOptions: Record<string, unknown> = {
        // CLI-specific options
        environment,
        globalVariables: options.global,
        data: iterationData,
        iterations: options.iterations,
        filter: options.filter,
        excludeDeps: options.excludeDeps,
        
        // RuntimeOptions - Execution
        execution: {
          ...(options.parallel !== undefined ? { allowParallel: options.parallel } : {}),
          ...(options.concurrency !== undefined ? { maxConcurrency: options.concurrency } : {}),
          ...(options.bail !== undefined ? { bail: options.bail } : {}),
          ...(options.delay !== undefined ? { delay: options.delay } : {})
        },
        
        // RuntimeOptions - Timeout
        ...(options.timeout !== undefined ? {
          timeout: { request: options.timeout }
        } : {}),
        
        // RuntimeOptions - SSL
        ...(options.sslCert !== undefined || options.sslKey !== undefined || options.sslCa !== undefined || options.insecure !== undefined ? {
          ssl: {
            ...(options.insecure !== undefined ? { validateCertificates: options.insecure === false } : {}),
            ...(options.sslCert !== undefined || options.sslKey !== undefined ? {
              clientCertificate: {
                ...(options.sslCert !== undefined ? { cert: readFileSync(options.sslCert, 'utf-8') } : {}),
                ...(options.sslKey !== undefined ? { key: readFileSync(options.sslKey, 'utf-8') } : {}),
                ...(options.sslKeyPassphrase !== undefined ? { passphrase: options.sslKeyPassphrase } : {})
              }
            } : {}),
            ...(options.sslCa !== undefined ? { ca: readFileSync(options.sslCa, 'utf-8') } : {})
          }
        } : {}),
        
        // RuntimeOptions - Proxy
        ...(options.proxy !== undefined ? {
          proxy: {
            enabled: true,
            ...parseProxyUrl(options.proxy)!,
            ...(options.proxyAuth !== undefined ? { auth: parseProxyAuth(options.proxyAuth)! } : {}),
            ...(options.noProxy !== undefined ? { bypass: parseNoProxy(options.noProxy) } : {})
          }
        } : {}),
        
        // RuntimeOptions - Cookies
        ...(options.cookie !== undefined ? {
          cookies: (Array.isArray(options.cookie) ? options.cookie : [options.cookie]).map(parseCookie).filter((c): c is { name: string; value: string } => c !== null)
        } : {}),
        
        // RuntimeOptions - Cookie Jar
        ...(options.cookieJar !== undefined || options.cookieJarPersist !== undefined ? {
          jar: {
            enabled: options.cookieJar ?? false,
            ...(options.cookieJarPersist !== undefined ? { persist: options.cookieJarPersist } : {})
          }
        } : {}),
        
        // RuntimeOptions - Redirects
        ...(options.followRedirects !== undefined ? { followRedirects: options.followRedirects } : {}),
        ...(options.maxRedirects !== undefined ? { maxRedirects: options.maxRedirects } : {}),
        
        // RuntimeOptions - Validation
        strictMode: options.strictMode !== false  // --no-strict-mode sets this to false, default is true
      };
      
      // Run collection
      const result = await runner.run(collection, runOptions);

      // Check for validation errors (pre-run validation failed)
      if (result.validationErrors !== undefined && result.validationErrors.length > 0) {
        if (silent !== true) {
          console.error('\nPre-run validation failed:\n');
          for (const error of result.validationErrors) {
            console.error(`  ${error.location}: ${error.message}`);
            if (error.details?.line !== undefined) {
              console.error(`    at line ${error.details.line}${error.details.column !== undefined ? `:${error.details.column}` : ''}`);
            }
            if (error.details?.suggestion !== undefined) {
              console.error(`    > ${error.details.suggestion}`);
            }
          }
        }
        process.exit(3);  // Exit code 3 for validation failures
      }

      // Results are displayed by the reporter
      // Determine exit code based on TEST results because request errors may be expected
      const hasErrors = result.failedTests > 0;
      process.exit(hasErrors ? 1 : 0);

    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : String(error));
      process.exit(4);
    }
  });

program.parse();

function collectKeyValue(value: string, previous: Record<string, string>): Record<string, string> {
  const [key, val] = value.split('=');
  if (key === undefined || key === '' || val === undefined) {
    throw new Error(`Invalid key=value format: ${value}`);
  }
  return { ...previous, [key.trim()]: val.trim() };
}

function collectArray(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseCSV(content: string): IterationData[] {
  const lines = content.split('\n').filter(line => line.trim() !== '');
  if (lines.length === 0) return [];

  const headers = lines[0].split(',').map(h => h.trim());
  const data: IterationData[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row: IterationData = {};
    
    headers.forEach((header, index) => {
      const value = values[index];
      // Try to parse as number
      const numValue = Number(value);
      if (Number.isNaN(numValue) === false && value !== '') {
        row[header] = numValue;
      } else if (value === 'true') {
        row[header] = true;
      } else if (value === 'false') {
        row[header] = false;
      } else {
        row[header] = value;
      }
    });
    
    data.push(row);
  }

  return data;
}

/**
 * Parse proxy URL string into ProxyOptions
 * Format: http://host:port or https://host:port
 */
function parseProxyUrl(proxyUrl: string): { host: string; port: number } | null {
  try {
    const url = new URL(proxyUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port) > 0 ? parseInt(url.port) : (url.protocol === 'https:' ? 443 : 80)
    };
  } catch {
    console.error(`Error: Invalid proxy URL format: ${proxyUrl}`);
    console.error('Expected format: http://host:port or https://host:port');
    process.exit(2);
  }
}

/**
 * Parse proxy auth string into username/password
 * Format: username:password
 */
function parseProxyAuth(authString: string): { username: string; password: string } | null {
  const parts = authString.split(':');
  if (parts.length !== 2) {
    console.error(`Error: Invalid proxy auth format: ${authString}`);
    console.error('Expected format: username:password');
    process.exit(2);
  }
  return {
    username: parts[0],
    password: parts[1]
  };
}

/**
 * Parse comma-separated host list for proxy bypass
 */
function parseNoProxy(noProxyString: string): string[] {
  return noProxyString.split(',').map(h => h.trim()).filter(h => h.length > 0);
}

/**
 * Parse cookie string into Cookie object
 * Format: name=value
 */
function parseCookie(cookieString: string): { name: string; value: string } | null {
  const index = cookieString.indexOf('=');
  if (index === -1) {
    console.error(`Error: Invalid cookie format: ${cookieString}`);
    console.error('Expected format: name=value');
    process.exit(2);
  }
  return {
    name: cookieString.substring(0, index).trim(),
    value: cookieString.substring(index + 1).trim()
  };
}
