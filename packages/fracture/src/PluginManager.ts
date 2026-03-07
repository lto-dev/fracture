import type { IProtocolPlugin, IAuthPlugin, IValueProviderPlugin, Request, ExecutionContext, ProtocolResponse, RuntimeOptions, Auth, AuthExecutor } from '@apiquest/types';
import { Logger } from './Logger.js';

export class PluginManager {
  private plugins: Map<string, IProtocolPlugin> = new Map();
  private authPlugins: Map<string, IAuthPlugin> = new Map();
  private variableProviders: Map<string, IValueProviderPlugin> = new Map();
  private logger: Logger;

  constructor(baseLogger?: Logger) {
    this.logger = baseLogger?.createLogger('PluginManager') ?? new Logger('PluginManager');
  }

  /**
   * Register a protocol plugin
   */
  registerPlugin(plugin: IProtocolPlugin): void {
    // Register plugin for each protocol it provides
    for (const protocol of plugin.protocols) {
      this.plugins.set(protocol, plugin);
      this.logger.debug(`Registered protocol plugin: ${plugin.name} for protocol '${protocol}'`);
    }
  }

  /**
   * Register an auth plugin
   */
  registerAuthPlugin(plugin: IAuthPlugin): void {
    // Register plugin for each auth type it provides
    for (const authType of plugin.authTypes) {
      this.authPlugins.set(authType, plugin);
      this.logger.debug(`Registered auth plugin: ${plugin.name} for type '${authType}'`);
    }
  }

  /**
   * Register a variable provider plugin
   */
  registerVariableProvider(plugin: IValueProviderPlugin): void {
    this.variableProviders.set(plugin.provider, plugin);
    this.logger.debug(`Registered vault provider: ${plugin.name} (${plugin.provider})`);
  }

  /**
   * Get plugin for a protocol
   */
  getPlugin(protocol: string): IProtocolPlugin | undefined {
    return this.plugins.get(protocol);
  }

  /**
   * Get auth plugin for a type
   */
  getAuthPlugin(type: string): IAuthPlugin | undefined {
    return this.authPlugins.get(type);
  }

  /**
   * Apply preemptive auth to request (bearer, basic, apikey, oauth2, etc.)
   */
  private async applyAuth(request: Request, auth: Auth, options: RuntimeOptions): Promise<Request> {
    if (auth.type === 'none' || auth.type === 'inherit') {
      return request;
    }

    const authPlugin = this.authPlugins.get(auth.type);
    if (authPlugin === null || authPlugin === undefined) {
      this.logger.error(`No auth plugin registered for type: ${auth.type}`);
      throw new Error(`No auth plugin registered for type: ${auth.type}`);
    }

    if (typeof authPlugin.apply !== 'function') {
      this.logger.error(`Auth plugin '${auth.type}' has no apply() method`);
      throw new Error(`Auth plugin '${auth.type}' has no apply() method`);
    }

    this.logger.debug(`Applying auth: ${auth.type} (plugin: ${authPlugin.name})`);
    
    try {
      const pluginLogger = this.logger.createLogger(`Auth:${authPlugin.name}`);
      return await authPlugin.apply(request, auth, options, pluginLogger);
    } catch (error: unknown) {
      const errorMsg = (error as { message?: string }).message ?? 'Unknown error';
      this.logger.error(`Auth plugin error (${auth.type}): ${errorMsg}`);
      throw new Error(`Auth plugin error (${auth.type}): ${errorMsg}`);
    }
  }

  /**
   * Build an AuthExecutor for the given protocol plugin.
   * Uses the protocol plugin's createAuthExecutor() if available,
   * otherwise wraps plugin.execute() directly (works for HTTP, SOAP, GraphQL).
   */
  private buildAuthExecutor(
    plugin: IProtocolPlugin,
    context: ExecutionContext,
    options: RuntimeOptions,
    emitEvent?: (eventName: string, eventData: unknown) => Promise<void>
  ): AuthExecutor {
    if ('createAuthExecutor' in plugin && typeof plugin.createAuthExecutor === 'function') {
      return plugin.createAuthExecutor(context, options, emitEvent);
    }
    return {
      send: async (req: Request) => {
        return await plugin.execute(req, context, options, emitEvent);
      }
    };
  }

  /**
   * Execute request using appropriate plugin
   * @param protocol - Protocol name from collection.protocol
   * @param emitEvent - Optional callback for plugin events (e.g., WebSocket onMessage)
   */
  async execute(
    protocol: string,
    request: Request,
    context: ExecutionContext,
    options: RuntimeOptions,
    emitEvent?: (eventName: string, eventData: unknown) => Promise<void>
  ): Promise<ProtocolResponse> {
    // Check abort signal before execution
    if ((context.abortSignal as AbortSignal | undefined)?.aborted === true) {
      this.logger.debug('Plugin execution aborted before start');
      return {
        data: null,
        summary: {
          outcome: 'error',
          code: 'aborted',
          label: 'Aborted',
          message: 'Request aborted',
          duration: 0
        }
      };
    }
    
    const plugin = this.plugins.get(protocol);

    if (plugin === null || plugin === undefined) {
      this.logger.error(`No plugin registered for protocol: ${protocol}`);
      throw new Error(`No plugin registered for protocol: ${protocol}`);
    }

    this.logger.debug(`Executing request using ${protocol} plugin: ${plugin.name}`);

    // Validate auth compatibility with protocol
    if (request.auth !== null && request.auth !== undefined && request.auth.type !== 'none' && request.auth.type !== 'inherit') {
      if (!plugin.supportedAuthTypes.includes(request.auth.type)) {
        this.logger.error(`Protocol '${protocol}' does not support auth type '${request.auth.type}'`);
        throw new Error(
          `Protocol '${protocol}' does not support auth type '${request.auth.type}'. ` +
          `Supported types: ${plugin.supportedAuthTypes.join(', ')}`
        );
      }
    }

    // Dispatch to negotiate() or apply() based on which method the auth plugin provides.
    // negotiate() drives multi-round handshakes (Digest, NTLM).
    // apply() handles preemptive one-shot auth (Bearer, Basic, ApiKey, OAuth2).
    let modifiedRequest = request;
    if (request.auth !== null && request.auth !== undefined && request.auth.type !== 'none' && request.auth.type !== 'inherit') {
      const authPlugin = this.authPlugins.get(request.auth.type);

      if (authPlugin === null || authPlugin === undefined) {
        this.logger.error(`No auth plugin registered for type: ${request.auth.type}`);
        throw new Error(`No auth plugin registered for type: ${request.auth.type}`);
      }

      const hasNegotiate = typeof authPlugin.negotiate === 'function';
      const hasApply = typeof authPlugin.apply === 'function';

      if (!hasNegotiate && !hasApply) {
        throw new Error(
          `Auth plugin '${request.auth.type}' must implement either apply() or negotiate(). ` +
          `Plugin '${authPlugin.name}' has neither.`
        );
      }

      const authPluginLogger = this.logger.createLogger(`Auth:${authPlugin.name}`);

      if (hasNegotiate) {
        // Handshake path: auth plugin drives the full challenge/response exchange.
        this.logger.debug(`Negotiating auth: ${request.auth.type} (plugin: ${authPlugin.name})`);
        try {
          const executor = this.buildAuthExecutor(plugin, context, options, emitEvent);
          modifiedRequest = await authPlugin.negotiate!(modifiedRequest, request.auth, options, executor, authPluginLogger);
        } catch (error: unknown) {
          const errorMsg = (error as { message?: string }).message ?? 'Unknown error';
          this.logger.error(`Auth negotiate error (${request.auth.type}): ${errorMsg}`);
          throw new Error(`Auth negotiate error (${request.auth.type}): ${errorMsg}`);
        }
      } else {
        // Preemptive path: existing behavior, unchanged.
        modifiedRequest = await this.applyAuth(modifiedRequest, request.auth, options);
      }

      // Update context.currentRequest to reflect auth modifications
      context.currentRequest = modifiedRequest;
    } else if (request.auth !== null && request.auth !== undefined) {
      // auth.type is 'none' or 'inherit' — no auth applied, still update context
      context.currentRequest = modifiedRequest;
    }

    // Validate request
    this.logger.trace('Validating request with plugin');
    const validation = plugin.validate(modifiedRequest, options);
    if (validation.valid === false) {
      const errorMessages = validation.errors?.map(e => e.message).join(', ') ?? 'Unknown error';
      this.logger.error(`Request validation failed: ${errorMessages}`);
      throw new Error(`Request validation failed: ${errorMessages}`);
    }

    // Execute plugin with merged runtime options, event emitter, and logger
    const pluginLogger = this.logger.createLogger(`Protocol:${plugin.name}`);
    const response = await plugin.execute(modifiedRequest, context, options, emitEvent, pluginLogger);
    
    const duration = response.summary?.duration ?? 0;
    const code = response.summary?.code ?? 'n/a';
    this.logger.debug(`Plugin execution completed in ${duration}ms (code: ${code})`);
    
    return response;
  }

  /**
   * Get all registered plugins
   */
  getAllPlugins(): IProtocolPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get all registered auth plugins
   */
  getAllAuthPlugins(): IAuthPlugin[] {
    return Array.from(this.authPlugins.values());
  }

  /**
   * Get variable provider plugin
   */
  getVariableProvider(provider: string): IValueProviderPlugin | undefined {
    return this.variableProviders.get(provider);
  }

  /**
   * Get all registered variable providers
   */
  getAllVariableProviders(): IValueProviderPlugin[] {
    return Array.from(this.variableProviders.values());
  }

  /**
   * Resolve variable value using provider plugin
   * Called when a variable has a provider specified
   */
  async resolveVariableProvider(
    provider: string,
    key: string,
    config?: Record<string, unknown>,
    context?: ExecutionContext
  ): Promise<string | null> {
    const providerPlugin = this.variableProviders.get(provider);

    if (providerPlugin === null || providerPlugin === undefined) {
      throw new Error(`No variable provider plugin registered for: ${provider}`);
    }

    try {
      const providerLogger = this.logger.createLogger(`Vault:${providerPlugin.name}`);
      return await providerPlugin.getValue(key, config, context, providerLogger);
    } catch (error: unknown) {
      const errorMsg = (error as { message?: string }).message ?? 'Unknown error';
      throw new Error(`Variable provider error (${provider}): ${errorMsg}`);
    }
  }
}
