import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  Collection,
  RunOptions,
  RunResult,
  Request,
  RequestResult,
  ExecutionContext,
  RuntimeOptions,
  ExecutionRecord,
  TestResult,
  ScriptResult,
  CollectionRunnerOptions,
  ScopeFrame,
  Folder,
  EventEnvelope,
  CollectionInfo,
  Cookie,
  IProtocolPlugin,
  IAuthPlugin
} from '@apiquest/types';
import { ScriptType, LogLevel } from '@apiquest/types';
import { VariableResolver } from './VariableResolver.js';
import { PluginManager } from './PluginManager.js';
import { PluginLoader } from './PluginLoader.js';
import { PluginResolver, type ResolvedPlugin } from './PluginResolver.js';
import { CollectionAnalyzer } from './CollectionAnalyzer.js';
import { CollectionValidator } from './CollectionValidator.js';
import { TestCounter } from './TestCounter.js';
import { ScriptEngine } from './ScriptEngine.js';
import { RequestFilter } from './RequestFilter.js';
import { Logger } from './Logger.js';
import { CookieJar } from './CookieJar.js';
import { isNullOrEmpty, isNullOrWhitespace, hasItems } from './utils.js';
import type { ErrorWithPhase } from './CollectionRunner.types.js';
import { TaskGraph, type TaskNode } from './TaskGraph.js';
import { DagScheduler, type DagExecutionCallbacks } from './DagScheduler.js';
import { LibraryLoader } from './LibraryLoader.js';

export class CollectionRunner extends EventEmitter {
  private variableResolver: VariableResolver;
  private pluginManager: PluginManager;
  private pluginResolver: PluginResolver;
  private pluginLoader: PluginLoader;
  private collectionAnalyzer: CollectionAnalyzer;
  private collectionValidator: CollectionValidator;
  private testCounter: TestCounter;
  private scriptEngine: ScriptEngine;
  private scriptQueue = Promise.resolve();
  private pluginResolutionPromise: Promise<ResolvedPlugin[]>;
  private resolvedPlugins: ResolvedPlugin[] = [];
  private logger: Logger;
  private abortController?: AbortController;
  private ownsController = false;
  private bailEnabled = false;
  private abortReason?: string;
  private shouldDelayNextRequest = false;
  private libraryLoader: LibraryLoader;
  private loadedLibraries: Map<string, unknown> = new Map();

  constructor(options?: CollectionRunnerOptions) {
    super();
    const logLevel = options?.logLevel ?? LogLevel.INFO;
    
    this.logger = new Logger('CollectionRunner', logLevel, this);

    this.variableResolver = new VariableResolver(this.logger);
    this.pluginManager = new PluginManager(this.logger);
    this.pluginResolver = new PluginResolver(this.logger);
    this.pluginLoader = new PluginLoader(this.pluginManager, this.logger);
    this.collectionAnalyzer = new CollectionAnalyzer(this.logger);
    this.collectionValidator = new CollectionValidator(this.pluginManager, this.logger);
    this.testCounter = new TestCounter(this.pluginManager, this.logger);
    this.scriptEngine = new ScriptEngine(this.logger);
    this.libraryLoader = new LibraryLoader(this.logger);
    
    // Phase 1: Resolve plugins if directories provided (fast - just scans, no loading)
    if (options?.pluginsDir !== undefined) {
      const dirs = Array.isArray(options.pluginsDir)
        ? options.pluginsDir
        : [options.pluginsDir];
      
      // Start plugin resolution (but don't block constructor)
      this.pluginResolutionPromise = this.pluginResolver.scanDirectories(dirs);
    } else {
      // No plugins to resolve
      this.pluginResolutionPromise = Promise.resolve([]);
    }
  }

  /**
   * Queue script execution to ensure sequential execution (thread-safe)
   */
  private async queueScript<T>(fn: () => Promise<T>): Promise<T> {
    if (this.abortController?.signal.aborted === true) {
      throw new Error('Script execution aborted');
    }
    const resultPromise = this.scriptQueue.then(fn);
    this.scriptQueue = resultPromise.then(() => {}, () => {});
    return resultPromise;
  }

  registerPlugin(plugin: IProtocolPlugin): void {
    this.pluginManager.registerPlugin(plugin);
  }

  registerAuthPlugin(plugin: IAuthPlugin): void {
    this.pluginManager.registerAuthPlugin(plugin);
  }

  private emitConsoleOutput(messages?: string[]): void {
    if (messages === undefined || messages.length === 0) return;
    for (const message of messages) {
      let level: 'log' | 'info' | 'warn' | 'error' = 'log';
      let cleanMessage = message;
      if (message.startsWith('[INFO] ')) {
        level = 'info';
        cleanMessage = message.replace('[INFO] ', '');
      } else if (message.startsWith('[WARN] ')) {
        level = 'warn';
        cleanMessage = message.replace('[WARN] ', '');
      } else if (message.startsWith('[ERROR] ')) {
        level = 'error';
        cleanMessage = message.replace('[ERROR] ', '');
      }
      this.emit('console', { id: randomUUID(), message: cleanMessage, level });
    }
  }

  /**
   * Subscribe to ALL events emitted by the runner (including custom plugin events)
   * Overrides emit to intercept all event emissions
   */
  onAll(handler: (eventType: string, data: unknown) => void): () => void {
    // Store original emit
    const originalEmit = this.emit.bind(this);
    
    // Override emit to intercept all events
    this.emit = function(event: string | symbol, ...args: unknown[]): boolean {
      // Call original handler first
      const result = originalEmit(event, ...args);
      
      // Skip internal EventEmitter events
      if (event !== 'newListener' && event !== 'removeListener') {
        handler(String(event), args[0]);
      }
      
      return result;
    } as typeof originalEmit;
    
    // Return cleanup function
    return () => {
      // Restore original emit
      this.emit = originalEmit;
    };
  }

  /**
   * Create event envelope for all events (except console)
   */
  private createEventEnvelope(
    collectionInfo: CollectionInfo,
    path: EventEnvelope['path'],
    context?: ExecutionContext,
    request?: Request
  ): EventEnvelope {
    const pathType = path === 'collection:/' ? 'collection' : path.startsWith('folder:/') ? 'folder' : 'request';
    
    const envelope: EventEnvelope = {
      id: randomUUID(),
      path,
      pathType,
      collectionInfo
    };

    // Add iteration info if available
    if (context !== undefined) {
      const currentRow = context.iterationData?.[context.iterationCurrent - 1];
      
      envelope.iteration = {
        current: context.iterationCurrent,
        total: context.iterationCount,
        source: context.iterationSource,
        rowIndex: currentRow !== undefined ? context.iterationCurrent - 1 : undefined,
        rowKeys: currentRow !== undefined ? Object.keys(currentRow) : undefined,
        row: currentRow
      };
    }

    // Add request if provided
    if (request !== undefined) {
      envelope.request = request;
    }

    return envelope;
  }

  private abort(reason: string): void {
    this.abortReason ??= reason;
    if (this.ownsController && this.abortController?.signal.aborted === false) {
      this.abortController.abort(reason);
    }
  }

  private isAborted(): boolean {
    return this.abortController?.signal.aborted === true;
  }

  private getAbortReason(): string | undefined {
    if (this.abortReason !== undefined) {
      return this.abortReason;
    }
    const signalReason = this.abortController?.signal.reason as unknown;
    if (signalReason !== undefined) {
      return String(signalReason);
    }
    return undefined;
  }

  async run(collection: Collection, options: RunOptions = {}): Promise<RunResult> {
    const startTime = new Date();

    // Phase 1: Wait for plugin resolution
    this.resolvedPlugins = await this.pluginResolutionPromise;
    this.logger.debug(`Plugin resolution complete: ${this.resolvedPlugins.length} plugins available`);

    // Analyze collection to determine required plugins
    const requirements = this.collectionAnalyzer.analyzeRequirements(collection);
    this.logger.debug(`Collection requires: protocols=[${Array.from(requirements.protocols)}], auth=[${Array.from(requirements.authTypes)}], providers=[${Array.from(requirements.valueProviders)}]`);

    // Phase 2: Load ONLY required plugins
    await this.pluginLoader.loadRequiredPlugins(this.resolvedPlugins, requirements);
    this.logger.debug('Required plugins loaded');

    this.logger.debug(`Starting collection: ${collection.info.name}`);
    this.logger.debug(`Collection ID: ${collection.info.id}, Protocol: ${collection.protocol}`);

    // Validate and cache protocol plugin
    const protocolPlugin = this.pluginManager.getPlugin(collection.protocol);
    if (protocolPlugin === undefined) {
      throw new Error(
        `No plugin registered for protocol '${collection.protocol}'. ` +
        `Available protocols: ${this.pluginManager.getAllPlugins().flatMap(p => p.protocols).join(', ')}`
      );
    }

    // Merge runtime options (needed for validation)
    const runtimeOptions = this.mergeOptions(collection.options, options);

    // Validate external libraries flag
    if (runtimeOptions.libraries !== undefined && runtimeOptions.libraries.length > 0) {
      if (options.allowExternalLibraries !== true) {
        throw new Error(
          `Collection defines external libraries but --allow-external-libraries flag is not enabled. ` +
          `External libraries (npm/file/cdn) pose security risks and must be explicitly allowed. ` +
          `Use --allow-external-libraries to enable this feature.`
        );
      }
      this.logger.debug(`External libraries enabled: ${runtimeOptions.libraries.length} libraries to load`);
      
      // Load external libraries
      this.loadedLibraries = await this.libraryLoader.loadLibraries(runtimeOptions.libraries);
      
      // Recreate script engine with loaded libraries
      this.scriptEngine = new ScriptEngine(this.logger, this.loadedLibraries);
      this.logger.debug(`Loaded ${this.loadedLibraries.size} external libraries`);
    }

    if (options.signal !== undefined) {
      this.ownsController = false;
      this.abortController = {
        signal: options.signal,
        abort: () => {}
      } as AbortController;
      this.logger.info('Using external abort signal');
    } else {
      this.ownsController = true;
      this.abortController = new AbortController();
      this.logger.debug('Created internal abort controller');
    }

    this.abortReason = undefined;
    this.bailEnabled = runtimeOptions.execution?.bail === true;

   // Get strict mode with precedence: RunOptions > Collection.options > Default (true)
    const strictMode = options.strictMode ?? collection.options?.strictMode ?? true;

    // PRE-RUN VALIDATION
    const validationResult = await this.collectionValidator.validateCollection(collection, runtimeOptions, strictMode);

    // Additional validation: cookie-jar-persist incompatible with parallel execution
    if (runtimeOptions.execution?.allowParallel === true && runtimeOptions.jar?.persist === true) {
      validationResult.valid = false;
      validationResult.errors ??= [];
      validationResult.errors.push({
        location: '/options/execution',
        message: 'Cookie jar persistence (jar.persist=true) is not allowed with parallel execution (allowParallel=true). ' +
                 'In parallel mode, cookies are cleared after each request to prevent race conditions.',
        source: 'schema' // Using schema as this is a configuration validation error
      });
    }

   // COUNT EXPECTED TESTS (only in strict mode for deterministic counting)
    const expectedTestCount = strictMode ? this.testCounter.countTests(collection) : -1;

    let collectionToRun = collection;
    if (runtimeOptions.filter !== undefined) {
      // Filter collection
      collectionToRun = RequestFilter.filterCollection(collection, {
        filter: runtimeOptions.filter,
        excludeDeps: Boolean(runtimeOptions.excludeDeps)
      });
      
      if (collectionToRun !== collection) {
        this.logger.debug('Collection filtered');
      }
    }
    
    // Determine test data (CLI options override collection testData)
    let iterationData = options.data ?? collectionToRun.testData ?? [];
    
    // Apply --iterations limits
    // 1. With data (CLI or collection): limit to first N rows
    // 2. Without data: repeat collection N times
    let iterationCount: number;
    if (options.iterations !== undefined && options.iterations > 0) {
      if (iterationData.length > 0) {
        // With data: limit to first N rows
        iterationData = iterationData.slice(0, options.iterations);
        iterationCount = iterationData.length;
      } else {
        // Without data: repeat collection N times
        iterationCount = options.iterations;
      }
    } else {
      // No --iterations specified: use all data or run once
      iterationCount = iterationData.length > 0 ? iterationData.length : 1;
    }
    
    // Determine iteration source for event envelopes
    const iterationSource: 'collection' | 'cli' | 'none' =
      options.data !== undefined ? 'cli' : (collection.testData !== undefined ? 'collection' : 'none');

    // Emit beforeRun with validation results and expected test count
    // Note: -1 means dynamic (can't determine), undefined means not calculated
    this.emit('beforeRun', {
      collectionInfo: {
        id: collection.info.id,
        name: collection.info.name,
        version: collection.info.version,
        description: collection.info.description
      },
      options,
      validationResult,
      expectedTestCount  // Include -1 for dynamic tests
    });

    // STOP if validation failed
    if (validationResult.valid === false) {
      const endTime = new Date();
      return {
        collectionId: collection.info.id,
        collectionName: collection.info.name,
        startTime,
        endTime,
        duration: endTime.getTime() - startTime.getTime(),
        requestResults: [],
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        skippedTests: 0,
        validationErrors: validationResult.errors,
        aborted: this.isAborted(),
        abortReason: this.getAbortReason()
      };
    }

    const requestResults: RequestResult[] = [];

    // Initialize cookie jar - always create one
    // If jar.persist = true, cookies carry across requests
    // If jar.persist = false (default), each request gets cookies from response only
    const cookieJar = new CookieJar(runtimeOptions.jar ?? { persist: false });

    // Inject initial cookies if provided in options
    if (runtimeOptions.cookies !== null && runtimeOptions.cookies !== undefined && runtimeOptions.cookies.length > 0) {
      for (const cookie of runtimeOptions.cookies) {
        // Skip cookies without domain - domain is required for RFC 6265 compliance
        if (cookie.domain === null || cookie.domain === undefined) {
          continue;
        }
        cookieJar.set(cookie.name, cookie.value, {
          domain: cookie.domain,
          path: cookie.path,
          expires: cookie.expires,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: cookie.sameSite
        });
      }
    }

    // Initialize scope stack with collection scope
    const scopeStack: ScopeFrame[] = [{
      level: 'collection',
      id: collection.info.id,
      vars: {}
    }];

    // Execute collection pre-request script once before all iterations
    if (!isNullOrWhitespace(collection.collectionPreScript)) {
      // Emit event before collection pre-script execution
      const envelope = this.createEventEnvelope(collection.info, 'collection:/', undefined);
      this.emit('beforeCollectionPreScript', {
        ...envelope,
        path: 'collection:/' as const
      });

      const tempContext: ExecutionContext = {
        collectionInfo: collection.info,
        protocol: collection.protocol,
        collectionVariables: collection.variables ?? {},
        globalVariables: options.globalVariables ?? {},
        scopeStack: [...scopeStack],  // Clone scope stack
        environment: options.environment,
        iterationCurrent: 1,
        iterationCount,
        iterationData,
        iterationSource,
        executionHistory: [],
        options: this.mergeOptions(collection.options, options),
        cookieJar,
        eventEmitter: this,
        protocolPlugin,
        abortSignal: this.abortController?.signal
      };

      const preScriptResult = await this.queueScript(() =>
        this.scriptEngine.execute(
          collection.collectionPreScript!,
          tempContext,
          ScriptType.CollectionPre,
          () => {} // noop - collection pre-scripts cannot have tests
        )
      );
      this.emitConsoleOutput(preScriptResult.consoleOutput);

      // Emit event after collection pre-script completion
      const afterEnvelope = this.createEventEnvelope(collection.info, 'collection:/', tempContext);
      this.emit('afterCollectionPreScript', {
        ...afterEnvelope,
        path: 'collection:/' as const,
        result: preScriptResult
      });

      if (preScriptResult.success === false) {
        throw new Error(`Collection pre-script error: ${preScriptResult.error}`);
      }

      // Update context variables for iterations
      options.globalVariables = tempContext.globalVariables;
      options.environment = tempContext.environment;
      
      // Update collection scope with any changes from script
      Object.assign(scopeStack[0].vars, tempContext.scopeStack[0].vars);
    }

    for (let i = 0; i < iterationCount; i++) {
      if (this.isAborted()) {
        this.logger.info('Run aborted - skipping remaining iterations');
        break;
      }
      const iterationStart = Date.now();
      const context: ExecutionContext = {
        collectionInfo: collection.info,
        protocol: collection.protocol,
        collectionVariables: collection.variables ?? {},
        globalVariables: options.globalVariables ?? {},
        scopeStack: [...scopeStack],  // Clone scope stack for each iteration
        environment: options.environment,
        iterationCurrent: i + 1,
        iterationCount,
        iterationData,
        iterationSource,
        executionHistory: [],
        options: this.mergeOptions(collection.options, options),
        cookieJar,
        eventEmitter: this,
        protocolPlugin,
        abortSignal: this.abortController?.signal
      };

      // Emit beforeIteration event
      const iterationEnvelope = this.createEventEnvelope(collection.info, 'collection:/', context);
      this.emit('beforeIteration', {
        ...iterationEnvelope,
        iteration: iterationEnvelope.iteration!
      });

      // Use DAG-based execution (ALWAYS - concurrency=1 for sequential mode)
      await this.executeWithDAG(collectionToRun, context, requestResults);
      
      // Emit afterIteration event
      const iterationDuration = Date.now() - iterationStart;
      const afterIterationEnvelope = this.createEventEnvelope(collection.info, 'collection:/', context);
      this.emit('afterIteration', {
        ...afterIterationEnvelope,
        iteration: afterIterationEnvelope.iteration!,
        duration: iterationDuration
      });
      
      // Update collection scope with changes from iteration
      Object.assign(scopeStack[0].vars, context.scopeStack[0].vars);
      
      // Update global variables and environment for next iteration
      options.globalVariables = context.globalVariables;
      options.environment = context.environment;
    }

    // Execute collection post-request script once after all iterations
    if (!isNullOrWhitespace(collection.collectionPostScript)) {
      // Emit event before collection post-script execution
      const beforePostEnvelope = this.createEventEnvelope(collection.info, 'collection:/', undefined);
      this.emit('beforeCollectionPostScript', {
        ...beforePostEnvelope,
        path: 'collection:/' as const
      });

      const tempContext: ExecutionContext = {
        collectionInfo: collection.info,
        protocol: collection.protocol,
        collectionVariables: collection.variables ?? {},
        globalVariables: options.globalVariables ?? {},
        scopeStack: [...scopeStack],  // Clone scope stack
        environment: options.environment,
        iterationCurrent: iterationCount,
        iterationCount,
        iterationData,
        iterationSource,
        executionHistory: [],
        options: this.mergeOptions(collection.options, options),
        cookieJar,
        eventEmitter: this,
        protocolPlugin,
        abortSignal: this.abortController?.signal
      };

      const postScriptResult = await this.queueScript(() =>
        this.scriptEngine.execute(
          collection.collectionPostScript!,
          tempContext,
          ScriptType.CollectionPost,
          () => {} // noop - collection post-scripts cannot have tests
        )
      );
      this.emitConsoleOutput(postScriptResult.consoleOutput);

      // Emit event for collection post-script completion
      const afterPostEnvelope = this.createEventEnvelope(collection.info, 'collection:/', tempContext);
      this.emit('afterCollectionPostScript', {
        ...afterPostEnvelope,
        path: 'collection:/' as const,
        result: postScriptResult
      });

      if (postScriptResult.success === false) {
        throw new Error(`Collection post-script error: ${postScriptResult.error}`);
      }
    }

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    const totalTests = requestResults.reduce((sum, r) => sum + r.tests.length, 0);
    const passedTests = requestResults.reduce(
      (sum, r) => sum + r.tests.filter(t => t.passed && !t.skipped).length,
      0
    );
    const failedTests = requestResults.reduce(
      (sum, r) => sum + r.tests.filter(t => !t.passed && !t.skipped).length,
      0
    );
    const skippedTests = requestResults.reduce(
      (sum, r) => sum + r.tests.filter(t => t.skipped).length,
      0
    );

    const result: RunResult = {
      collectionId: collection.info.id,
      collectionName: collection.info.name,
      startTime,
      endTime,
      duration,
      requestResults,
      totalTests,
      passedTests,
      failedTests,
      skippedTests,
      aborted: this.isAborted(),
      abortReason: this.getAbortReason()
    };

    this.emit('afterRun', {
      collectionInfo: collection.info,
      result
    });
    return result;
  }

  private resolveRequest(request: Request, context: ExecutionContext): void {
    // Resolve variables in request data
    request.data = this.variableResolver.resolveAll(request.data, context) as typeof request.data;
    
    // Resolve variables in auth data
    if (request.auth?.data !== undefined) {
      request.auth.data = this.variableResolver.resolveAll(request.auth.data, context) as Record<string, unknown>;
    }
  }

  private mergeOptions(
    collectionOptions?: RuntimeOptions,
    runOptions?: RunOptions
  ): RuntimeOptions {
    // Since RunOptions extends RuntimeOptions, merge is straightforward
    // RunOptions takes precedence over collectionOptions
    const merged: RuntimeOptions = {
      ...collectionOptions,
      ...runOptions,
      // Deep merge nested objects
      execution: {
        ...(collectionOptions?.execution ?? {}),
        ...(runOptions?.execution ?? {})
      },
      // Ensure defaults
      strictMode: runOptions?.strictMode ?? collectionOptions?.strictMode ?? true,
      // Include filter options (type narrow from undefined)
      filter: (runOptions?.filter ?? collectionOptions?.filter) !== undefined
        ? String(runOptions?.filter ?? collectionOptions?.filter)
        : undefined,
      excludeDeps: ((runOptions?.excludeDeps ?? collectionOptions?.excludeDeps) !== undefined)
        ? Boolean(runOptions?.excludeDeps ?? collectionOptions?.excludeDeps)
        : undefined
    };
    
    // Conditionally merge optional nested objects
    if (collectionOptions?.timeout !== undefined || runOptions?.timeout !== undefined) {
      merged.timeout = {
        ...(collectionOptions?.timeout ?? {}),
        ...(runOptions?.timeout ?? {})
      };
    }
    
    if (collectionOptions?.ssl !== undefined || runOptions?.ssl !== undefined) {
      merged.ssl = {
        ...(collectionOptions?.ssl ?? {}),
        ...(runOptions?.ssl ?? {})
      };
    }
    
    if (collectionOptions?.jar !== undefined || runOptions?.jar !== undefined) {
      merged.jar = {
        persist: runOptions?.jar?.persist ?? collectionOptions?.jar?.persist ?? false
      };
    }
    
    if (runOptions?.proxy !== null && runOptions?.proxy !== undefined) {
      merged.proxy = runOptions.proxy;
    } else if (collectionOptions?.proxy !== null && collectionOptions?.proxy !== undefined) {
      merged.proxy = collectionOptions.proxy;
    }
    
    // Merge cookies arrays (runOptions cookies + collectionOptions cookies)
    const collectionCookies = collectionOptions?.cookies ?? [];
    const runCookies = runOptions?.cookies ?? [];
    if (collectionCookies.length > 0 || runCookies.length > 0) {
      // RunOptions cookies override collection cookies with same name
      const cookieMap = new Map<string, Cookie>();
      
      // Add collection cookies first
      for (const cookie of collectionCookies) {
        cookieMap.set(cookie.name, cookie);
      }
      
      // Then add/override with run cookies
      for (const cookie of runCookies) {
        cookieMap.set(cookie.name, cookie);
      }
      
      merged.cookies = Array.from(cookieMap.values());
    }
    
    return merged;
  }
  
  /**
   * Evaluate condition expression at runtime
   * Returns true if condition passes, false if it fails
   */
  private async evaluateCondition(condition: string, context: ExecutionContext): Promise<boolean> {
    try {
      // Use workaround: store result in global variable
      const wrappedScript = `
        const __conditionResult = (${condition});
        quest.global.variables.set('__conditionResult', String(__conditionResult === true));
      `;
      
      const result = await this.scriptEngine.execute(
        wrappedScript,
        context,
        ScriptType.PreRequest,
        () => {}
      );
      
      if (result.success === false) {
        this.logger.warn(`Condition evaluation error: ${result.error}`);
        return false;
      }
      
      // Read result from global variables
      const conditionResult = context.globalVariables.__conditionResult === 'true';
      
      // Clean up temp variable
      delete context.globalVariables.__conditionResult;
      
      return conditionResult;
    } catch (error) {
      this.logger.error(`Failed to evaluate condition: ${condition}`, error);
      return false;
    }
  }

  // ========================================================================
  // DAG Execution Methods
  // ========================================================================

  /**
   * Execute collection using DAG-based execution
   */
  private async executeWithDAG(
    collection: Collection,
    context: ExecutionContext,
    results: RequestResult[]
  ): Promise<void> {
    // Determine execution mode
    const allowParallel = context.options.execution?.allowParallel === true;
    
    // Build TaskGraph from collection (DAG structure depends on execution mode)
    this.logger.debug(`Building TaskGraph from collection (parallel=${allowParallel})`);
    const taskGraph = new TaskGraph(this.logger);
    taskGraph.build(collection, allowParallel);
    this.logger.debug(`TaskGraph built: ${taskGraph.getNodes().size} nodes, ${taskGraph.getEdges().length} edges`);

    // Determine concurrency (0 defaults to 1)
    let maxConcurrency = allowParallel
      ? (context.options.execution?.maxConcurrency ?? 5)
      : 1;  // Sequential mode uses concurrency=1
    
    // Treat 0 as 1 (invalid value)
    if (maxConcurrency === 0) {
      this.logger.warn('maxConcurrency=0 is invalid, defaulting to 1');
      maxConcurrency = 1;
    }
    
    this.logger.info(`DAG execution mode: ${maxConcurrency === 1 ? 'SEQUENTIAL' : `PARALLEL (concurrency=${maxConcurrency})`}`);

    // Create scheduler with callbacks
    const callbacks: DagExecutionCallbacks = {
      executeScript: this.executeScriptForDAG.bind(this),
      executeFolderEnter: this.executeFolderEnter.bind(this),
      executeFolderExit: this.executeFolderExit.bind(this),
      executeRequestIO: this.executeRequestIOForDAG.bind(this),
      evaluateCondition: this.evaluateCondition.bind(this),
      isAborted: this.isAborted.bind(this)
    };

    const scheduler = new DagScheduler(callbacks, maxConcurrency, this.logger);

    // Execute DAG
    this.logger.debug('Starting DAG execution');
    const dagResults = await scheduler.execute(taskGraph, context);
    this.logger.debug(`DAG execution complete: ${dagResults.length} requests executed`);
    
    results.push(...dagResults);
    
    // Check for script errors and stop execution if found
    for (const result of dagResults) {
      if (result.scriptError !== undefined && result.scriptError !== 'Skipped by condition' && result.scriptError !== 'Skipped by bail') {
        throw new Error(result.scriptError);
      }
    }
  }

  /**
   * Execute a script node (called by DagScheduler)
   */
  private async executeScriptForDAG(
    script: string,
    scriptType: ScriptType,
    context: ExecutionContext,
    node: TaskNode,
    flags: { skip: boolean; bail: boolean }
  ): Promise<ScriptResult> {
    if (flags.bail) {
      return { success: true, tests: [], consoleOutput: [] };
    }

    // Skip script execution but allow skipped assertions in post-request scripts
    if (flags.skip) {
      if (scriptType === ScriptType.FolderPre || scriptType === ScriptType.FolderPost) {
        return { success: true, tests: [], consoleOutput: [] };
      }

      // Collection scripts should not run during skip propagation
      if (scriptType === ScriptType.CollectionPre || scriptType === ScriptType.CollectionPost) {
        return { success: true, tests: [], consoleOutput: [] };
      }

      // Plugin event scripts are skipped without assertions
      if (scriptType === ScriptType.PluginEvent) {
        return { success: true, tests: [], consoleOutput: [] };
      }
    }

    // Handle different script types
    switch (scriptType) {
      case ScriptType.CollectionPre:
        return await this.executeCollectionPreScript(script, context);
      
      case ScriptType.CollectionPost:
        return await this.executeCollectionPostScript(script, context);
      
      case ScriptType.FolderPre:
        return await this.executeFolderPreScript(script, context, node, flags);
      
      case ScriptType.FolderPost:
        return await this.executeFolderPostScript(script, context, node, flags);
      
      case ScriptType.PluginEvent:
        return await this.executePluginEventScript(script, context, node);
      
      default:
        this.logger.error(`Unknown script type: ${scriptType as string}`);
        return {
          success: false,
          tests: [],
          consoleOutput: [],
          error: `Unknown script type: ${scriptType as string}`
        };
    }
  }

  private async executeCollectionPreScript(
    script: string,
    context: ExecutionContext
  ): Promise<ScriptResult> {
    const envelope = this.createEventEnvelope(context.collectionInfo, 'collection:/', undefined);
    this.emit('beforeCollectionPreScript', {
      ...envelope,
      script
    });

    const result = await this.scriptEngine.execute(
      script,
      context,
      ScriptType.CollectionPre,
      () => {} // Collection pre-scripts cannot have tests
    );
    this.emitConsoleOutput(result.consoleOutput);

    const afterEnvelope = this.createEventEnvelope(context.collectionInfo, 'collection:/', context);
    this.emit('afterCollectionPreScript', {
      ...afterEnvelope,
      result
    });

    return result;
  }

  private async executeCollectionPostScript(
    script: string,
    context: ExecutionContext
  ): Promise<ScriptResult> {
    const beforeEnvelope = this.createEventEnvelope(context.collectionInfo, 'collection:/', undefined);
    this.emit('beforeCollectionPostScript', {
      ...beforeEnvelope,
      script
    });

    const result = await this.scriptEngine.execute(
      script,
      context,
      ScriptType.CollectionPost,
      () => {} // Collection post-scripts cannot have tests
    );
    this.emitConsoleOutput(result.consoleOutput);

    const afterEnvelope = this.createEventEnvelope(context.collectionInfo, 'collection:/', context);
    this.emit('afterCollectionPostScript', {
      ...afterEnvelope,
      result
    });

    return result;
  }

  /**
   * Execute folder enter lifecycle: PUSH scope + emit beforeFolder
   * ALWAYS executes regardless of script existence
   */
  private async executeFolderEnter(
    node: TaskNode,
    context: ExecutionContext,
    flags: { skip: boolean; bail: boolean }
  ): Promise<void> {
    if (flags.skip || flags.bail) {
      return;
    }
    const folder = node.item as Folder;
    
    // PUSH folder scope
    context.scopeStack.push({
      level: 'folder',
      id: folder.id,
      vars: {}
    });

    // Emit beforeFolder event
    const beforeFolderEnvelope = this.createEventEnvelope(context.collectionInfo, node.path, context);
    this.emit('beforeFolder', beforeFolderEnvelope);
  }

  /**
   * Execute folder exit lifecycle: POP scope + emit afterFolder
   * ALWAYS executes regardless of script existence
   *
   * Note: If folder-enter was skipped due to condition, the scope was never pushed.
   * We only POP if the top of the stack matches this folder's ID.
   */
  private async executeFolderExit(
    node: TaskNode,
    context: ExecutionContext,
    flags: { skip: boolean; bail: boolean }
  ): Promise<void> {
    if (flags.skip || flags.bail) {
      return;
    }
    const folder = node.item as Folder;

    // Check if folder scope exists on stack before popping
    // (folder-enter may have been skipped due to condition)
    const topScope = context.scopeStack[context.scopeStack.length - 1];
    if (topScope?.level === 'folder' && topScope.id === folder.id) {
      // POP folder scope
      context.scopeStack.pop();

      // Emit afterFolder event
      const afterFolderEnvelope = this.createEventEnvelope(context.collectionInfo, node.path, context);
      this.emit('afterFolder', {
        ...afterFolderEnvelope,
        duration: 0
      });
    }
    // If scope doesn't match, folder-enter was skipped - no POP or event needed
  }

  private async executeFolderPreScript(
    script: string,
    context: ExecutionContext,
    node: TaskNode,
    flags: { skip: boolean; bail: boolean }
  ): Promise<ScriptResult> {
    if (flags.skip || flags.bail) {
      return { success: true, tests: [], consoleOutput: [] };
    }
    // Emit beforeFolderPreScript event
    const beforePreEnvelope = this.createEventEnvelope(context.collectionInfo, node.path, context);
    this.emit('beforeFolderPreScript', beforePreEnvelope);

    const result = await this.scriptEngine.execute(
      script,
      context,
      ScriptType.FolderPre,
      () => {} // Folder pre-scripts cannot have tests
    );
    this.emitConsoleOutput(result.consoleOutput);

    // Emit afterFolderPreScript event
    const afterPreEnvelope = this.createEventEnvelope(context.collectionInfo, node.path, context);
    this.emit('afterFolderPreScript', {
      ...afterPreEnvelope,
      result
    });

    return result;
  }

  private async executeFolderPostScript(
    script: string,
    context: ExecutionContext,
    node: TaskNode,
    flags: { skip: boolean; bail: boolean }
  ): Promise<ScriptResult> {
    if (flags.skip || flags.bail) {
      return { success: true, tests: [], consoleOutput: [] };
    }
    // Emit beforeFolderPostScript event
    const beforePostEnvelope = this.createEventEnvelope(context.collectionInfo, node.path, context);
    this.emit('beforeFolderPostScript', beforePostEnvelope);

    const result = await this.scriptEngine.execute(
      script,
      context,
      ScriptType.FolderPost,
      () => {} // Folder post-scripts cannot have tests
    );
    this.emitConsoleOutput(result.consoleOutput);

    // Emit afterFolderPostScript event
    const afterPostEnvelope = this.createEventEnvelope(context.collectionInfo, node.path, context);
    this.emit('afterFolderPostScript', {
      ...afterPostEnvelope,
      result
    });

    return result;
  }

  private async executePluginEventScript(
    script: string,
    context: ExecutionContext,
    node: TaskNode
  ): Promise<ScriptResult> {
    // Plugin event scripts should already have context.currentEvent set by the plugin
    // We just need to execute the script through the queue (THIS FIXES THE BUG!)
    
    const request = context.currentRequest!;
    const eventName = node.eventName!;

    const result = await this.scriptEngine.execute(
      script,
      context,
      ScriptType.PluginEvent,
      (test: TestResult) => {
        // Emit assertion event for plugin event test
        const eventDef = context.protocolPlugin.events?.find(e => e.name === eventName);
        if (eventDef?.canHaveTests === true) {
          const envelope = this.createEventEnvelope(context.collectionInfo, node.path, context, request);
          this.emit('assertion', {
            ...envelope,
            test,
            event: eventName
          });
        }

        // Trigger bail on failed test if enabled
        if (this.bailEnabled && this.ownsController && !test.passed && !test.skipped) {
          this.abort('Test failure (--bail)');
        }
      }
    );

    return result;
  }

  /**
   * Execute request I/O (called by DagScheduler)
   * This handles the full request lifecycle: pre-scripts → I/O → post-scripts
   */
  private async executeRequestIOForDAG(
    node: TaskNode,
    context: ExecutionContext,
    flags: { skip: boolean; bail: boolean }
  ): Promise<RequestResult> {
    const request = node.item as Request;

    // NOTE: Do NOT set context.currentRequest here in parallel mode!
    // It will be overwritten by other parallel requests before scripts execute.
    // Instead, set it inside each queued script function.
    context.currentPath = node.path;

    // Apply execution.delay between requests (not before first, not if parallel, not if skipped)
    if (!flags.skip && !flags.bail) {
      const delay = context.options?.execution?.delay ?? 0;
      const isParallel = context.options?.execution?.allowParallel ?? false;
      
      if (this.shouldDelayNextRequest && delay > 0 && !isParallel) {
        this.logger.debug(`Delaying ${delay}ms before request`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
      
      // Mark that subsequent requests should be delayed
      this.shouldDelayNextRequest = true;
    }

    if (flags.bail) {
      const skippedResult: RequestResult = {
        requestId: request.id,
        requestName: request.name,
        path: node.path,
        success: true,
        tests: [],
        duration: 0,
        iteration: context.iterationCurrent,
        scriptError: 'Skipped by bail'
      };
      return skippedResult;
    }

    if (flags.skip) {
      const skippedResult: RequestResult = {
        requestId: request.id,
        requestName: request.name,
        path: node.path,
        success: true,
        tests: [],
        duration: 0,
        iteration: context.iterationCurrent,
        scriptError: 'Skipped by condition'
      };
      return skippedResult;
    }

    // Emit beforeItem event
    const beforeItemEnvelope = this.createEventEnvelope(context.collectionInfo, node.path, context, request);
    this.emit('beforeItem', {
      ...beforeItemEnvelope,
      request,
      path: node.path
    });

    // PUSH request scope
    context.scopeStack.push({
      level: 'request',
      id: request.id,
      vars: {}
    });

    try {
      // Execute all pre-request scripts (inherited + request-level) through queue
      if (node.inheritedPreScripts !== undefined && node.inheritedPreScripts.length > 0) {
        await this.queueScript(async () => {
          // Set currentRequest inside the queued function to avoid race conditions in parallel execution
          context.currentRequest = request;
          this.logger.debug(`Executing pre-script for request: id=${request.id}, name=${request.name}`);
          for (const script of node.inheritedPreScripts!) {
            // Emit beforePreScript event
            const beforePreEnvelope = this.createEventEnvelope(context.collectionInfo, node.path, context, request);
            this.emit('beforePreScript', {
              ...beforePreEnvelope,
              request,
              path: node.path
            });

            const preScriptResult = await this.scriptEngine.execute(
              script,
              context,
              ScriptType.PreRequest,
              () => {} // Pre-request scripts cannot have tests
            );
            this.emitConsoleOutput(preScriptResult.consoleOutput);

            // Emit afterPreScript event
            const afterPreEnvelope = this.createEventEnvelope(context.collectionInfo, node.path, context, request);
            this.emit('afterPreScript', {
              ...afterPreEnvelope,
              request,
              path: node.path,
              result: preScriptResult
            });

            if (preScriptResult.success === false) {
              const error = new Error(
                `Pre-request script error: ${preScriptResult.error}`
              ) as ErrorWithPhase;
              error.phase = 'prerequest';
              throw error;
            }
          }
        });
      }

      // HTTP execution NOT queued - runs in parallel
      // Set currentRequest before I/O phase
      context.currentRequest = request;
      
      // Apply effective auth from node (collection/folder auth inheritance)
      // Request auth > Folder auth > Collection auth
      if (node.effectiveAuth !== undefined) {
        request.auth = node.effectiveAuth;
      }
      
      this.resolveRequest(request, context);
      
      // Track plugin event tests and indices
      const pluginEventTests: TestResult[] = [];
      const eventIndices = new Map<string, number>();
      
      // Create emitEvent callback for plugin event execution during I/O
      // Plugin events fire DURING request execution (e.g., WebSocket onMessage)
      // They must be queued/serialized and complete before request finishes
      const emitEvent = async (eventName: string, eventData: unknown): Promise<void> => {
        this.logger.trace(`Plugin event emitted: ${eventName}`, { hasScripts: request.data.scripts !== undefined });
        
        // Find matching script (validation ensures at most one per event type)
        const eventScript = request.data.scripts?.find(s => s.event === eventName);
        this.logger.trace(`Event script found: ${eventScript !== undefined}`);
        if (eventScript === undefined) return;
        
        // Get current event index (starts at 0, increments per event type)
        const currentIndex = eventIndices.get(eventName) ?? 0;
        
        // Set event context (wrapped in try/finally to prevent state leak)
        try {
          context.currentEvent = {
            eventName: eventName,
            requestId: request.id,
            timestamp: new Date(),
            data: eventData,
            index: currentIndex
          };
          
          // Execute plugin event script through the queue (serialized)
          const result = await this.queueScript(async () => {
            return await this.scriptEngine.execute(
              eventScript.script,
              context,
              ScriptType.PluginEvent,
              (test: TestResult) => {
                // Emit assertion event for plugin event test
                const eventDef = context.protocolPlugin.events?.find(e => e.name === eventName);
                if (eventDef?.canHaveTests === true) {
                  const envelope = this.createEventEnvelope(context.collectionInfo, node.path, context, request);
                  this.emit('assertion', {
                    ...envelope,
                    test,
                    event: eventName
                  });
                }

                // Trigger bail on failed test if enabled
                if (this.bailEnabled && this.ownsController && !test.passed && !test.skipped) {
                  this.abort('Test failure (--bail)');
                }
              }
            );
          });
          
          this.emitConsoleOutput(result.consoleOutput);
          
          // Collect test results - add directly to pluginEventTests array
          if (result.tests !== undefined && result.tests.length > 0) {
            this.logger.trace(`Plugin event tests collected: ${result.tests.length}`);
            pluginEventTests.push(...result.tests);
          } else {
            this.logger.trace('No tests in plugin event result');
          }
          
          // Handle script errors (log but don't throw - allow other events to continue)
          if (!isNullOrEmpty(result.error)) {
            this.logger.error(`Plugin event script error (${eventName}):`, result.error);
          }
        } finally {
          // Always reset event context to prevent state leak
          context.currentEvent = undefined;
          
          // Increment event index for next event of same type
          eventIndices.set(eventName, currentIndex + 1);
        }
      };
      
      // Emit beforeRequest event
      const beforeRequestEnvelope = this.createEventEnvelope(context.collectionInfo, node.path, context, request);
      this.emit('beforeRequest', {
        ...beforeRequestEnvelope,
        request,
        path: node.path
      });
      
      const response = await this.pluginManager.execute(
        context.protocol,
        request,  // Use request directly instead of context.currentRequest
        context,
        context.options,
        emitEvent
      );
      context.currentResponse = response;
      
      // Emit afterRequest event with duration from plugin (excludes delay)
      const afterRequestEnvelope = this.createEventEnvelope(context.collectionInfo, node.path, context, request);
      this.emit('afterRequest', {
        ...afterRequestEnvelope,
        request,
        response,
        duration: response.duration
      });

      // Add preliminary execution record to history
      const executionRecord: ExecutionRecord = {
        id: request.id,
        name: request.name,
        path: node.path,
        iteration: context.iterationCurrent,
        response,
        tests: [...pluginEventTests],
        timestamp: new Date().toISOString()
      };

      context.executionHistory.push(executionRecord);

      // Execute all post-request scripts (request-level + inherited) through queue
      let scriptResult: ScriptResult = { success: true, tests: [], consoleOutput: [] };
      
      this.logger.debug(`Post-scripts for ${request.id}: ${node.inheritedPostScripts?.length ?? 0}`);
      
      if (node.inheritedPostScripts !== undefined && node.inheritedPostScripts.length > 0) {
        scriptResult = await this.queueScript(async () => {
          // Set currentRequest inside the queued function to avoid race conditions in parallel execution
          context.currentRequest = request;
          const combinedResult: ScriptResult = { success: true, tests: [], consoleOutput: [] };

          for (const script of node.inheritedPostScripts!) {
            // Emit beforePostScript event
            const beforePostEnvelope = this.createEventEnvelope(context.collectionInfo, node.path, context, request);
            this.emit('beforePostScript', {
              ...beforePostEnvelope,
              request,
              path: node.path,
              response
            });

            const postScriptResult = await this.scriptEngine.execute(
              script,
              context,
              ScriptType.PostRequest,
              (test: TestResult) => {
                // Emit assertion event
                const envelope = this.createEventEnvelope(context.collectionInfo, node.path, context, request);
                this.emit('assertion', {
                  ...envelope,
                  test,
                  response
                });

                // Trigger bail on failed test
                if (this.bailEnabled && this.ownsController && !test.passed && !test.skipped) {
                  this.abort('Test failure (--bail)');
                }
              }
            );
            this.emitConsoleOutput(postScriptResult.consoleOutput);

            // Emit afterPostScript event
            const afterPostEnvelope = this.createEventEnvelope(context.collectionInfo, node.path, context, request);
            this.emit('afterPostScript', {
              ...afterPostEnvelope,
              request,
              path: node.path,
              response,
              result: postScriptResult
            });

            if (postScriptResult.success === false) {
              const error = new Error(
                `Post-request script error: ${postScriptResult.error}`
              ) as ErrorWithPhase;
              error.phase = 'postrequest';
              throw error;
            }

            combinedResult.tests.push(...postScriptResult.tests);
            combinedResult.consoleOutput.push(...postScriptResult.consoleOutput);
          }

          return combinedResult;
        });
      }

      // Update execution record with all tests
      const allTests = [...pluginEventTests, ...scriptResult.tests];
      executionRecord.tests = allTests;

      const result: RequestResult = {
        requestId: request.id,
        requestName: request.name,
        path: node.path,
        success: isNullOrEmpty(response.error),
        response,
        tests: allTests,
        duration: response.duration,
        iteration: context.iterationCurrent
      };

      // Emit afterItem event
      const afterItemEnvelope = this.createEventEnvelope(context.collectionInfo, node.path, context, request);
      this.emit('afterItem', {
        ...afterItemEnvelope,
        request,
        path: node.path,
        response,
        result
      });
      
      // Clear cookies if persist is false
      if (context.options.jar?.persist !== true) {
        context.cookieJar.clear();
      }
      
      // POP request scope
      context.scopeStack.pop();
      
      return result;
    } catch (error) {
      const err = error as ErrorWithPhase & { message?: string };

      const result: RequestResult = {
        requestId: request.id,
        requestName: request.name,
        path: node.path,
        success: false,
        tests: [],
        duration: context.currentResponse?.duration ?? 0,
        scriptError: err.message ?? String(error),
        iteration: context.iterationCurrent
      };

      const phase = err.phase ?? 'request';
      this.emit('exception', {
        id: randomUUID(),
        error,
        phase,
        request,
        path: node.path,
        response: context.currentResponse
      });
      
      // POP request scope even on error
      context.scopeStack.pop();
      
      // Abort execution to prevent further requests from running (fail-fast)
      this.abort(`Script error in ${phase}: ${result.scriptError}`);
      
      return result;
    }
  }
}
