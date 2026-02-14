import vm from 'vm';
import { expect } from 'chai';
import * as chai from 'chai';
import * as lodash from 'lodash';
import * as moment from 'moment';
import type { ExecutionContext, ScriptResult, TestResult } from '@apiquest/types';
import { ScriptType } from '@apiquest/types';
import { Logger } from './Logger.js';
import { createQuestAPI } from './QuestAPI.js';
import { isNullOrWhitespace } from './utils.js';

interface ConsoleAPI {
  log(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export class ScriptEngine {
  private tests: TestResult[] = [];
  private consoleOutput: string[] = [];
  private logger: Logger;
  private externalLibraries: Map<string, unknown> = new Map();

  constructor(baseLogger?: Logger, externalLibraries?: Map<string, unknown>) {
    this.logger = baseLogger?.createLogger('ScriptEngine') ?? new Logger('ScriptEngine');
    this.externalLibraries = externalLibraries ?? new Map<string, unknown>();
  }

  /**
   * Execute a script in VM context with quest API
   */
  async execute(
    script: string,
    context: ExecutionContext,
    scriptType: ScriptType,
    emitAssertion: (test: TestResult) => void
  ): Promise<ScriptResult> {
    if (isNullOrWhitespace(script)) {
      this.logger.trace('Empty script, skipping execution');
      return {
        success: true,
        tests: [],
        consoleOutput: []
      };
    }

    const scriptPreview = script.length > 100 ? script.substring(0, 100) + '...' : script;
    this.logger.debug(`Executing ${scriptType} script (${script.length} chars)`);
    this.logger.trace(`Script preview: ${scriptPreview}`);

    this.tests = [];
    this.consoleOutput = [];

    try {
      this.logger.trace('Creating quest API sandbox');
      const questAPI = createQuestAPI(context, scriptType, this.tests, emitAssertion);

      const sandbox = {
        quest: questAPI,
        expect,
        console: this.createConsoleAPI(),
        require: this.createRequire(),
        setTimeout,
        setInterval,
        clearTimeout,
        clearInterval,
        Promise,
        Buffer,
        AbortController,
        AbortSignal,
        signal: context.abortSignal
      };

      const vmContext = vm.createContext(sandbox);
      this.logger.trace('VM context created');

      // Wrap script in async function to support top-level await
      const wrappedScript = `
        (async () => {
          ${script}
        })()
      `;

      // Execute script and get the promise
      const startTime = Date.now();
      const result = vm.runInContext(wrappedScript, vmContext, {
        timeout: 30000,
        displayErrors: true
      }) as unknown;

      // If result is a promise, wait for it
      if (result !== null && result !== undefined && typeof (result as { then?: unknown }).then === 'function') {
        await (result as Promise<void>);
      }

      // Wait for any other pending promises
      await new Promise(resolve => setImmediate(resolve));

      const duration = Date.now() - startTime;
      this.logger.debug(`Script executed successfully in ${duration}ms`);
      this.logger.trace(`Tests collected: ${this.tests.length}, Console output: ${this.consoleOutput.length} lines`);

      return {
        success: true,
        tests: this.tests,
        consoleOutput: this.consoleOutput
      };
    } catch (error: unknown) {
      const errorMsg = (error as { message?: string }).message ?? String(error);
      const errorStack = (error as { stack?: string }).stack;
      const errorName = (error as { name?: string }).name;
      
      // Check if this was an abort
      if (errorName === 'AbortError' || errorMsg.includes('abort') || errorMsg.includes('Abort')) {
        this.logger.debug('Script execution interrupted by abort signal');
        return {
          success: false,
          tests: this.tests,
          error: 'Script aborted',
          consoleOutput: this.consoleOutput
        };
      }
      
      this.logger.error(`Script execution failed: ${errorMsg}`);
      if (errorStack !== undefined) {
        this.logger.trace(`Error stack: ${errorStack}`);
      }
      return {
        success: false,
        tests: this.tests,
        error: errorMsg,
        consoleOutput: this.consoleOutput
      };
    }
  }

  /**
   * Create console API that captures output
   */
  private createConsoleAPI(): ConsoleAPI {
    const self = this;
    
    const safeStringify = (value: unknown): string => {
      if (typeof value === 'string') return value;
      if (value === null || value === undefined) return String(value);
      if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
      if (typeof value === 'symbol') return value.toString();
      if (typeof value === 'function') return '[Function]';

      try {
        const seen = new WeakSet<object>();
        return JSON.stringify(
          value,
          (_key, val: unknown) => {
            if (typeof val === 'bigint') {
              return val.toString();
            }
            if (typeof val === 'function') {
              return '[Function]';
            }
            if (typeof val === 'symbol') {
              return val.toString();
            }
            if (typeof val === 'object' && val !== null) {
              if (seen.has(val)) {
                return '[Circular]';
              }
              seen.add(val);
            }
            return val as string | number | boolean | null;
          },
          2
        );
      } catch {
        return String(value);
      }
    };

    return {
      log(...args: unknown[]) {
        const message = args.map(safeStringify).join(' ');
        self.consoleOutput.push(message);
        console.log(message);
      },
      info(...args: unknown[]) {
        const message = args.map(safeStringify).join(' ');
        self.consoleOutput.push(`[INFO] ${message}`);
        console.info(message);
      },
      warn(...args: unknown[]) {
        const message = args.map(safeStringify).join(' ');
        self.consoleOutput.push(`[WARN] ${message}`);
        console.warn(message);
      },
      error(...args: unknown[]) {
        const message = args.map(safeStringify).join(' ');
        self.consoleOutput.push(`[ERROR] ${message}`);
        console.error(message);
      }
    };
  }

  /**
   * Create minimal require function
   */
  private createRequire() {
    const externalLibs = this.externalLibraries;
    
    const allowedModules: Record<string, unknown> = {
      'chai': chai as unknown,
      'lodash': lodash as unknown,
      'moment': moment as unknown
    };
    
    return (moduleName: string) => {
      if (moduleName in allowedModules) {
        return allowedModules[moduleName];
      }
      
      if (externalLibs.has(moduleName)) {
        return externalLibs.get(moduleName);
      }

      throw new Error(`Module '${moduleName}' is not allowed in scripts`);
    };
  }
}
