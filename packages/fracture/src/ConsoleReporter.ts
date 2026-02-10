import type {
  IReporter,
  Collection,
  RunOptions,
  Request,
  RequestResult,
  TestResult,
  RunResult,
  LogLevel,
  EventPayloads
} from '@apiquest/types';
import { LogLevel as LogLevelEnum } from '@apiquest/types';
import type { EventEmitter } from 'events';

export class ConsoleReporter implements IReporter {
  name = 'console';
  version: string = '1.0.0';
  description: string = 'Pretty CLI output for quest runs';
  reportTypes: string[] = ['console'];

  private logLevel: LogLevel;
  private color: boolean;
  private runner?: EventEmitter;

  constructor(options?: { logLevel?: LogLevel; color?: boolean; runner?: EventEmitter }) {
    this.logLevel = options?.logLevel ?? LogLevelEnum.INFO;
    this.color = options?.color ?? true;  // Color enabled by default
    this.runner = options?.runner;
    
    // Subscribe to console events for logger output
    if (this.runner !== null && this.runner !== undefined) {
      this.setupConsoleLogging();
    }
  }
  
  private setupConsoleLogging(): void {
    if (this.runner === null || this.runner === undefined) return;
    
    // Log levels are hierarchical using LogLevel enum values
    this.runner.on('console', ({ level, levelName, message }: EventPayloads['console']) => {
      // Only show if message level is <= configured level (lower number = higher priority)
      if (level <= this.logLevel) {
        const tag = `[${(levelName !== null && levelName !== undefined && levelName.length > 0) ? levelName.toUpperCase() : 'LOG'}]`;
        if (level === LogLevelEnum.ERROR) {
          console.error(`${tag} ${message}`);
        } else if (level === LogLevelEnum.WARN) {
          console.warn(`${tag} ${message}`);
        } else {
          console.log(`${tag} ${message}`);
        }
      }
    });
  }
  
  private colorize(text: string, colorCode: string): string {
    if (!this.color) return text;
    return `${colorCode}${text}\x1b[0m`;
  }

  onRunStarted(collection: Collection, options: RunOptions): void {
    console.log('============================================================');
    console.log(`  Quest v1.0.0`);
    console.log(`  Collection: ${collection.info.name}`);
    console.log('============================================================');
    console.log('');
  }

  onBeforeRequest(payload: EventPayloads['beforeRequest']): void {
    console.log('');
    console.log(`${this.colorize('>', '\x1b[36m')} ${payload.request.name}`);
    
    const requestData = payload.request.data as Record<string, unknown> | null | undefined;
    if (requestData !== null && requestData !== undefined) {
      const method = (typeof requestData.method === 'string' && requestData.method.length > 0) ? requestData.method : 'GET';
      const url = (typeof requestData.url === 'string' && requestData.url.length > 0) ? requestData.url : '';
      console.log(`  ${method} ${url}`);
    }
  }

  onAfterRequest(payload: EventPayloads['afterRequest']): void {
    if (payload.response.error !== null && payload.response.error !== undefined && payload.response.error.length > 0) {
      console.log(`  ${this.colorize('[FAIL]', '\x1b[31m')} ERROR: ${payload.response.error}`);
    } else {
      const statusColor = payload.response.status >= 400 ? '\x1b[31m' : '\x1b[32m';
      console.log(`  ${this.colorize('<', statusColor)} ${payload.response.status} ${payload.response.statusText} (${payload.duration}ms)`);
    }
  }

  onAssertion(payload: EventPayloads['assertion']): void {
    const test = payload.test;
    if (test.skipped) {
      console.log(`  ${this.colorize('[SKIP]', '\x1b[90m')} ${test.name}`);
    } else if (test.passed) {
      console.log(`  ${this.colorize('[PASS]', '\x1b[32m')} ${test.name}`);
    } else {
      console.log(`  ${this.colorize('[FAIL]', '\x1b[31m')} ${test.name}`);
      if (test.error !== null && test.error !== undefined && test.error.length > 0) {
        console.log(`    Error: ${test.error}`);
      }
    }
  }

  onRunCompleted(result: RunResult): void {
    console.log('');
    console.log('------------------------------------------------------------');
    console.log('');
    console.log('RESULTS:');
    console.log(`  Collection: ${result.collectionName}`);
    console.log(`  Duration: ${(result.duration / 1000).toFixed(2)}s`);
    console.log(`  Requests: ${result.requestResults.length}`);
    
    const successful = result.requestResults.filter(r => r.success).length;
    const failed = result.requestResults.filter(r => !r.success).length;
    
    if (successful > 0) {
      console.log(`    - Successful: ${successful}`);
    }
    if (failed > 0) {
      console.log(`    - Failed: ${failed}`);
    }
    
    if (result.totalTests > 0) {
      console.log(`  Tests: ${result.totalTests}`);
      console.log(`    - Passed: ${result.passedTests}`);
      if (result.failedTests > 0) {
        console.log(`    - Failed: ${result.failedTests}`);
      }
      if (result.skippedTests > 0) {
        console.log(`    - Skipped: ${result.skippedTests}`);
      }
    }
    
    console.log('');
    
    // if any TEST results failed end with error exit code 1
    // Request failures are OK if tests expect and handle them
    if (result.failedTests > 0) {
      console.log(`${this.colorize('[FAIL]', '\x1b[31m')} Collection run completed with errors`);  // Red
    } else {
      console.log(`${this.colorize('[PASS]', '\x1b[32m')} Collection run completed successfully`);  // Green
    }
  }
}
