// Core Types and Interfaces for @apiquest/types

// ============================================================================
// Collection & Items
// ============================================================================

export interface Collection {
  $schema?: string;
  info: CollectionInfo;
  
  // Protocol (collection-level)
  protocol: string;  // "http", "graphql", "grpc", "websocket", etc.
  
  auth?: Auth;
  variables?: Record<string, string | Variable>;
  
  // Collection lifecycle scripts
  collectionPreScript?: string;
  collectionPostScript?: string;
  
  // Request lifecycle scripts (run before/after EACH request)
  preRequestScript?: string;
  postRequestScript?: string;
  
  testData?: IterationData[];
  options?: RuntimeOptions;
  items: CollectionItem[];
}

export interface CollectionInfo {
  id: string;
  name: string;
  version?: string;
  description?: string;
}

export interface Folder {
  type: 'folder';
  id: string;
  name: string;
  description?: string;
  auth?: Auth;
  
  // Execution control
  dependsOn?: string[];  // Folder/Request IDs that must execute first
  condition?: string;    // JavaScript expression to evaluate
  
  // Folder lifecycle scripts
  folderPreScript?: string;
  folderPostScript?: string;
  
  // Request lifecycle scripts
  preRequestScript?: string;
  postRequestScript?: string;
  
  options?: RuntimeOptions;
  items: CollectionItem[];
}

export interface Request {
  type: 'request';
  id: string;
  name: string;
  description?: string;
  
  // Execution control
  dependsOn?: string[];  // Request IDs that must execute first
  condition?: string;    // JavaScript expression to evaluate
  
  // Protocol is inherited from collection.protocol
  auth?: Auth;
  data: {
    // Protocol-specific data
    [key: string]: unknown;
    
    // Plugin event scripts (e.g., for WebSocket: onMessage, onError, onComplete)
    scripts?: ProtocolScript[];
  };
  
  preRequestScript?: string;
  postRequestScript?: string;  // Contains tests via quest.test()
  
  options?: RuntimeOptions;
  examples?: ResponseExample[];
}

export interface ProtocolScript {
  event: string;  // "onMessage", "onError", "onComplete", etc.
  script: string;
}

export type CollectionItem = Request | Folder;

export interface ResponseExample {
  name: string;
  description?: string;
  protocol: string;
  data: unknown;
}

// ============================================================================
// Authentication
// ============================================================================

export interface Auth {
  type: string | 'inherit' | 'none';
  data?: Record<string, unknown>;
}

// ============================================================================
// Variables
// ============================================================================

export interface Variable {
  value: string;
  enabled?: boolean;
  type?: "string" | "number" | "boolean";
  isSecret?: boolean;
  isRequired?: boolean;  // enforce presence at runtime
  provider?: string;     // "env", "vault:aws-secrets", etc., undefined for built-in
  description?: string;
}

export interface Environment {
  name: string;
  variables: Record<string, string | Variable>;
}

export interface IterationData {
  [key: string]: string | number | boolean;
}

// ============================================================================
// Runtime Options
// ============================================================================

export interface CollectionRunnerOptions {
  pluginsDir?: string | string[]; // Optional path(s) to plugins folder(s) for dynamic loading  
  logLevel?: LogLevel; // Optional log level (default: INFO)
}

export interface RuntimeOptions {
  // Validation
  strictMode?: boolean;  // Enable/disable conditional test validation (default: true)
  
  // Execution control
  execution?: ExecutionOptions;
  
  // Filtering
  filter?: string;          // Path-based regex filter
  excludeDeps?: boolean;    // Exclude dependencies when filtering
  
  // External libraries
  libraries?: ExternalLibrary[];
  
  // Cookies
  cookies?: Cookie[];
  jar?: CookieJarOptions;
  
  // SSL/TLS
  ssl?: SSLOptions;
  
  // Proxy
  proxy?: ProxyOptions;
  
  // Timeouts
  timeout?: TimeoutOptions;
  
  // Redirects
  followRedirects?: boolean;
  maxRedirects?: number;
  
  // Logging
  logLevel?: LogLevel;
  
  // Plugin-specific options
  plugins?: Record<string, unknown>;
}

export interface ExecutionOptions {
  allowParallel?: boolean;   // Enable parallel execution
  maxConcurrency?: number;   // Max parallel requests
  bail?: boolean;            // Stop on first failure
  delay?: number;            // Delay between requests (ms)
}

export interface ExternalLibrary {
  name: string;
  source: LibrarySource;
  version?: string;
}

export type LibrarySource = 
  | { type: 'npm'; package: string }
  | { type: 'cdn'; url: string }
  | { type: 'file'; path: string };

export interface Cookie {
  name: string;
  value: string;
  domain: string;
  path?: string;
  expires?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export interface CookieSetOptions {
  domain: string;
  path?: string;
  expires?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax' | 'None';
}

export interface CookieJarOptions {
  persist: boolean; //default: false
}

export interface SSLOptions {
  validateCertificates?: boolean;
  clientCertificate?: {
    cert: string;
    key: string;
    passphrase?: string;
  };
  ca?: string;
}

export interface ProxyOptions {
  enabled: boolean;
  host: string;
  port: number;
  auth?: {
    username: string;
    password: string;
  };
  bypass?: string[];
}

export interface TimeoutOptions {
  request?: number;
  connection?: number;
  response?: number;
}

// ============================================================================
// Execution History
// ============================================================================

export interface ExecutionRecord {
  // Identity
  id: string;
  name: string;
  path: string;  // "/folder1/folder2/request"
  
  // Iteration metadata
  iteration: number;
  
  // Results
  response: ProtocolResponse;
  tests: TestResult[];
  timestamp: string;
}

export interface ExecutionHistoryEntry {
  requestId: string;
  requestName: string;
  response?: ProtocolResponse;
  timestamp: Date;
  collectionIteration: number;
  requestIteration: number;
}

// ============================================================================
// Plugin Events
// ============================================================================

export interface PluginEvent {
  eventName: string;        // "onMessage", "onError", etc.
  requestId: string;        // Request that triggered the event
  timestamp: Date;
  data: unknown;            // Plugin-specific event data
  index: number;            // Event sequence number (0-based, per event type)
}

// ============================================================================
// Execution Context
// ============================================================================

export interface ScopeFrame {
  level: 'collection' | 'folder' | 'request';
  id: string;
  vars: Record<string, string>;
}

export type IterationSource = 'collection' | 'cli' | 'none';

export interface ExecutionContext {
  // Collection info
  collectionInfo: CollectionInfo;
  protocol: string;  // Collection protocol (e.g., 'http', 'graphql')
  
  // Variable scopes
  collectionVariables: Record<string, string | Variable>;
  globalVariables: Record<string, string | Variable>;
  scopeStack: ScopeFrame[];  // Hierarchical scope stack
  environment?: Environment;
  
  // Current execution state
  currentRequest?: Request;
  currentResponse?: ProtocolResponse;
  currentPath?: string;  // Current folder/request path
  
  // Plugin event tracking (for streaming protocols)
  expectedMessages?: number;  // Hint from quest.expectMessages() for plugin optimization
  currentEvent?: PluginEvent;  // Current plugin event (for eventScripts)
  
  // Iteration state
  iterationCurrent: number;
  iterationCount: number;
  iterationData?: IterationData[];
  iterationSource: IterationSource;  // Where iteration data comes from
  
  // History
  executionHistory: ExecutionRecord[];
  
  // Runtime options
  options: RuntimeOptions;
  
  // Cookie jar - ICookieJar interface for type safety
  cookieJar: ICookieJar;
  
  // Event emitter for plugin callbacks
  eventEmitter?: unknown;  // EventEmitter instance
  
  // Cached protocol plugin (loaded at collection initialization for fail-fast validation)
  protocolPlugin: IProtocolPlugin;
  
  // emitEvent - Allow plugins to emit custom events (websocket:message, sse:chunk, etc.)
  // These events are protocol-specific and streamed to the UI
  emitEvent?: (type: string, data: unknown) => void;

  // Abort signal for execution cancellation
  abortSignal: AbortSignal;
}

// ============================================================================
// Cookie Jar Interface
// ============================================================================

export interface ICookieJar {
  get(name: string, domain?: string, path?: string): string | null;
  set(name: string, value: string, options: CookieSetOptions): void;
  has(name: string, domain?: string, path?: string): boolean;
  remove(name: string, domain?: string, path?: string): void;
  clear(): void;
  toObject(): Record<string, string>;
  getCookieHeader(url: string): string | null;
  store(setCookieHeaders: string | string[] | null | undefined, requestUrl: string): void;
}

// ============================================================================
// Validation
// ============================================================================

export interface ValidationError {
  message: string;
  location: string;  // Request path (e.g., "/Folder A/Request 1")
  source: 'script' | 'protocol' | 'auth' | 'vault' | 'schema';
  scriptType?: ScriptType;
  details?: {
    line?: number;
    column?: number;
    suggestion?: string;
    [key: string]: unknown;
  };
}

// ============================================================================
// Logging
// ============================================================================

export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  DEBUG = 3,
  TRACE = 4
}

export interface ILogger {
  error(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  trace(message: string, ...args: unknown[]): void;
  setLevel(level: LogLevel): void;
  createLogger(component: string): ILogger;
}

// ============================================================================
// Run Options & Results
// ============================================================================

export interface RunOptions extends Omit<RuntimeOptions, 'logLevel'> {
  // Additional CLI/API specific options not in RuntimeOptions
  environment?: Environment;
  globalVariables?: Record<string, string | Variable>;
  data?: IterationData[];      // CLI --data override
  iterations?: number;          // Global iteration cap
  filter?: string;              // Path-based regex filter
  excludeDeps?: boolean;        // Exclude dependencies when filtering
  signal?: AbortSignal;         // External abort signal
  allowExternalLibraries?: boolean;  // Security flag: Allow loading external libraries (NOT in collection.options)
}

export interface RunResult {
  collectionId: string;
  collectionName: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  requestResults: RequestResult[];
  totalTests: number;
  passedTests: number;
  failedTests: number;
  skippedTests: number;
  validationErrors?: ValidationError[];  // Pre-run validation errors
  aborted?: boolean;
  abortReason?: string;
}

export interface RequestResult {
  requestId: string;
  requestName: string;
  path: string;
  success: boolean;
  response?: ProtocolResponse;
  tests: TestResult[];
  duration: number;
  scriptError?: string;
  iteration: number;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  skipped: boolean;
}

// ============================================================================
// Plugin Package Metadata
// ============================================================================

export interface PluginPackageJson {
  name: string;
  version: string;
  main?: string;
  description?: string;
  apiquest?: {
    runtime?: string[] | string;
    type: string;
    capabilities?: {
      provides?: {
        protocols?: string[];
        authTypes?: string[];
        valueTypes?: string[];
        reportTypes?: string[];
      };
      supports?: {
        authTypes?: string[];
        strictAuthList?: boolean;
      };
    };
  };
}

// ============================================================================
// Protocol Plugin Interface
// ============================================================================

export interface IProtocolPlugin {
  // Identity
  name: string;
  version: string;
  description: string;
  
  // What protocols does this plugin provide?
  // Single-protocol: ['http']
  // Multi-protocol bundle (rare): ['http', 'https', 'http2']
  protocols: string[];
  
  // Supported auth types for this protocol
  // Example: HTTP supports ['bearer', 'basic', 'oauth2', 'apikey']
  //          SQL might support ['integrated', 'username-password']
  supportedAuthTypes: string[];
  
  // If true, ONLY supportedAuthTypes listed above are allowed
  // If false/undefined, accept additional auth plugins that declare this protocol
  strictAuthList?: boolean;
  
  // Schema for request.data (defines what fields the UI should show)
  // Example: HTTP has method, url, headers, body
  dataSchema: unknown;  // JSON Schema or custom schema format
  
  // Schema for options.plugins[protocol] (runtime options)
  // Example: HTTP has keepAlive, compression, maxSockets
  optionsSchema?: PluginOptionsSchema;
  
  // Plugin event definitions (e.g., WebSocket: onMessage, onError, onComplete)
  events?: PluginEventDefinition[];
  
  execute(
    request: Request,
    context: ExecutionContext,
    options: RuntimeOptions,  // Receives merged options
    emitEvent?: (eventName: string, eventData: unknown) => Promise<void>,  // Optional callback for plugin events
    logger?: ILogger  // Optional logger from fracture
  ): Promise<ProtocolResponse>;
  
  validate(request: Request, options: RuntimeOptions): ValidationResult;
}

export interface PluginOptionsSchema {
  // Defines options that can be set in options.plugins[protocol]
  // Example: options.plugins.http = { keepAlive: true, compression: "gzip" }
  [optionKey: string]: {
    type: 'boolean' | 'string' | 'number';
    default?: unknown;
    enum?: unknown[];
    description?: string;
  };
}

export interface PluginEventDefinition {
  name: string;              // "onMessage", "onError", "onComplete"
  description: string;
  canHaveTests: boolean;     // Can this event script contain quest.test()?
  required: boolean;         // Is this event required or optional?
}

export interface ProtocolResponse {
  status: number;
  statusText: string;
  body: string;
  headers: Record<string, string | string[]>;  // Headers can have multiple values (e.g., set-cookie)
  duration: number;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

// ============================================================================
// Auth Plugin Interface
// ============================================================================

export interface IAuthPlugin {
  // Identity
  name: string;
  version: string;
  description: string;
  
  // What auth types does this plugin provide?
  // Single auth: ['bearer']
  // Multi-auth bundle: ['bearer', 'basic', 'apikey', 'oauth2']
  authTypes: string[];
  
  // Which protocols does this auth work with? (REQUIRED)
  // Example: ['http', 'grpc', 'graphql']
  // No universal auth - must explicitly declare protocol support
  protocols: string[];
  
  // Schema for auth.data (defines what fields the UI should show)
  // Example: bearer has { token: string }, basic has { username: string, password: string }
  dataSchema: unknown;  // JSON Schema or custom schema format
  
  apply(
    request: Request,
    auth: Auth,
    options: RuntimeOptions,
    logger?: ILogger  // Optional logger from fracture
  ): Promise<Request>;
  
  validate(auth: Auth, options: RuntimeOptions): ValidationResult;
}

// ============================================================================
// Value Provider Plugin Interface
// ============================================================================

export interface IValueProviderPlugin {
  provider: string;  // "vault:aws-secrets", "vault:azure-keyvault", "vault:file"
  name: string;
  description: string;
  
  // Configuration schema (if provider needs setup)
  configSchema?: unknown;
  
  // Retrieve a secret value by key
  // Returns null if key doesn't exist
  // Throws error if provider fails (network, auth, etc.)
  getValue(
    key: string,
    config?: unknown,
    context?: ExecutionContext,
    logger?: ILogger  // Optional logger from fracture
  ): Promise<string | null>;
  
  // Validate provider configuration
  validate(config?: unknown): ValidationResult;
}

// ============================================================================
// Script Engine
// ============================================================================

export interface ScriptResult {
  success: boolean;
  tests: TestResult[];
  error?: string;
  consoleOutput: string[];
}

export enum ScriptType {
  CollectionPre = 'collection-pre',
  CollectionPost = 'collection-post',
  FolderPre = 'folder-pre',
  FolderPost = 'folder-post',
  PreRequest = 'request-pre',
  PostRequest = 'request-post',
  PluginEvent = 'plugin-event'
}

// ============================================================================
// Reporter Interface
// ============================================================================

export interface IReporter {
  // Identity
  name: string;
  version: string;
  description: string;
  
  // What report types does this plugin provide?
  // Example: ['console'], ['json', 'json-summary'], ['html', 'junit']
  reportTypes: string[];
  
  // Reporter-specific options schema
  // Defines what options can be passed to getOptions()
  // Example: { outputFile: string, verbose: boolean, colors: boolean }
  optionsSchema?: unknown;
  
  // Get options for a specific report type
  // Called before run starts to configure the reporter
  getOptions?(reportType: string): unknown;
  
  // Lifecycle hooks
  onRunStarted(collection: Collection, options: RunOptions): void;
  
  // @deprecated Use onBeforeRequest instead
  onRequestStarted?(request: Request, path: string): void;
  // @deprecated Use onAfterRequest + onAssertion instead
  onRequestCompleted?(result: RequestResult): void;
  // @deprecated Use onAssertion instead
  onTestCompleted?(test: TestResult, request: string): void;
  
  // New event-based hooks using EventPayloads types
  onBeforeRequest?(payload: EventPayloads['beforeRequest']): void;
  onAfterRequest?(payload: EventPayloads['afterRequest']): void;
  onAssertion?(payload: EventPayloads['assertion']): void;
  
  onRunCompleted(result: RunResult): void;
}

// ============================================================================
// Events
// ============================================================================

/**
 * Path type for EventEnvelope and ExecutionNode
 */
export type NodeType = 'collection' | 'folder' | 'request';
export type PathType = 'collection:/' | `folder:/${string}` | `request:/${string}`;
/**
 * Event envelope that provides context for all events (except console)
 */
export type EventEnvelope = {
  id: string;  // Unique event ID
  path: PathType;
  pathType: NodeType;
  collectionInfo: CollectionInfo;
  iteration?: {
    current: number;
    total: number;
    source: IterationSource;
    rowIndex?: number;
    rowKeys?: string[];
    row?: Record<string, string | number | boolean>;
  };
  request?: Request;
};

export type RunnerEvent =
  // Collection lifecycle
  | 'beforeRun'
  | 'afterRun'
  | 'beforeCollectionPreScript'
  | 'afterCollectionPreScript'
  | 'beforeCollectionPostScript'
  | 'afterCollectionPostScript'
  
  // Folder lifecycle
  | 'beforeFolder'
  | 'afterFolder'
  | 'beforeFolderPreScript'
  | 'afterFolderPreScript'
  | 'beforeFolderPostScript'
  | 'afterFolderPostScript'
  
  // Iteration
  | 'beforeIteration'
  | 'afterIteration'
  
  // Request/Item
  | 'beforeItem'
  | 'afterItem'
  | 'beforePreScript'
  | 'afterPreScript'
  | 'beforeRequest'
  | 'afterRequest'
  | 'beforePostScript'
  | 'afterPostScript'
  
  // Tests (run within postRequestScript via quest.test())
  | 'assertion'
  
  // Utilities
  | 'console'
  | 'exception';

export interface EventPayloads {
  // Run Lifecycle
  beforeRun: {
    options: RunOptions;
    validationResult?: ValidationResult;
    expectedTestCount?: number;
  } & Pick<EventEnvelope, 'collectionInfo'>;
  
  afterRun: {
    result: RunResult;
  } & Pick<EventEnvelope, 'collectionInfo'>;
  
  // Collection Scripts
  beforeCollectionPreScript: EventEnvelope & { path: 'collection:/' };
  afterCollectionPreScript: EventEnvelope & { path: 'collection:/'; result: ScriptResult };
  beforeCollectionPostScript: EventEnvelope & { path: 'collection:/' };
  afterCollectionPostScript: EventEnvelope & { path: 'collection:/'; result: ScriptResult };
  
  // Iteration Lifecycle
  beforeIteration: EventEnvelope & { iteration: Required<EventEnvelope['iteration']> };
  afterIteration: EventEnvelope & { iteration: Required<EventEnvelope['iteration']>; duration: number };
  
  // Folder Lifecycle
  beforeFolder: EventEnvelope;
  afterFolder: EventEnvelope & { duration: number };
  
  // Folder Scripts
  beforeFolderPreScript: EventEnvelope;
  afterFolderPreScript: EventEnvelope & { result: ScriptResult };
  beforeFolderPostScript: EventEnvelope;
  afterFolderPostScript: EventEnvelope & { result: ScriptResult };
  
  // Item Lifecycle
  beforeItem: EventEnvelope & { request: Request; path: string };
  afterItem: EventEnvelope & { request: Request; path: string; response?: ProtocolResponse; result: RequestResult };
  
  // Pre-Request Script
  beforePreScript: EventEnvelope & { request: Request; path: string };
  afterPreScript: EventEnvelope & { request: Request; path: string; result: ScriptResult };
  
  // Request
  beforeRequest: EventEnvelope & { request: Request; path: string };
  afterRequest: EventEnvelope & { request: Request; response: ProtocolResponse; duration: number };
  
  // Post-Request Script
  beforePostScript: EventEnvelope & { request: Request; path: string; response: ProtocolResponse };
  afterPostScript: EventEnvelope & { request: Request; path: string; response: ProtocolResponse; result: ScriptResult };
  
  // Test/Assertion
  assertion: EventEnvelope & {
    test: TestResult;
    request?: Request;
    path?: string;
    response?: ProtocolResponse;
    event?: {
      name: string;
      index: number;
      timestamp: string;
      data: unknown;
    };
  };
  
  // Utility Events
  console: {
    id: string;  // Unique event ID
    message: string;
    level: LogLevel;
    levelName?: 'error' | 'warn' | 'info' | 'debug' | 'trace';
    component?: string;
    timestamp?: string;
    args?: unknown[];
  };
  
  exception: {
    id: string;  // Unique event ID
    error: Error;
    phase: 'collection-pre' | 'collection-post' | 'folder-pre' | 'folder-post' | 'prerequest' | 'postrequest' | 'request';
    request?: Request;
    path?: string;
    response?: ProtocolResponse;
  };
}
