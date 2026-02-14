import type { IProtocolPlugin, IAuthPlugin, IValueProviderPlugin } from '@apiquest/types';
import { Logger } from './Logger.js';
import { PluginManager } from './PluginManager.js';
import type { ResolvedPlugin } from './PluginResolver.js';
import type { PluginRequirements } from './CollectionAnalyzer.js';
import { isNullOrEmpty } from './utils.js';

export class PluginLoader {
  private logger: Logger;
  private pluginManager: PluginManager;
  private loadedPlugins: Set<string> = new Set();

  constructor(pluginManager: PluginManager, baseLogger?: Logger) {
    this.pluginManager = pluginManager;
    this.logger = baseLogger?.createLogger('PluginLoader') ?? new Logger('PluginLoader');
  }

  /**
   * Load only plugins needed by the collection
   */
  async loadRequiredPlugins(
    resolved: ResolvedPlugin[],
    requirements: PluginRequirements
  ): Promise<void> {
    const needed = this.filterNeededPlugins(resolved, requirements);
    
    this.logger.debug(`Loading ${needed.length} required plugins (${resolved.length} available)`);
    
    const loadPromises = needed.map(plugin =>
      this.loadPlugin(plugin).catch(err => {
        this.logger.error(`Failed to load ${plugin.name}:`, err);
        throw err;
      })
    );
    
    await Promise.all(loadPromises);
    this.logger.debug('Required plugins loaded');
  }

  /**
   * Filter resolved plugins to only those needed by collection
   */
  private filterNeededPlugins(
    resolved: ResolvedPlugin[],
    requirements: PluginRequirements
  ): ResolvedPlugin[] {
    const needed: ResolvedPlugin[] = [];

    for (const plugin of resolved) {
      let isNeeded = false;

      if (plugin.type === 'protocol') {
        // Check if collection uses this protocol
        if (plugin.protocols?.some(p => requirements.protocols.has(p)) === true) {
          isNeeded = true;
        }
      } else if (plugin.type === 'auth') {
        // Check if collection uses any of these auth types
        if (plugin.authTypes?.some(a => requirements.authTypes.has(a)) === true) {
          isNeeded = true;
        }
      } else if (plugin.type === 'value') {
        // Check if collection uses any of the value types this plugin provides
        const valueTypes = plugin.valueTypes ?? [];
        for (const valueType of valueTypes) {
          if (requirements.valueProviders.has(valueType)) {
            isNeeded = true;
            break;
          }
        }
      }

      if (isNeeded) {
        this.logger.debug(`Plugin needed: ${plugin.name} v${plugin.version} (${plugin.type})`);
        needed.push(plugin);
      }
    }

    return needed;
  }

  /**
   * Dynamically import and register a single plugin
   */
  private async loadPlugin(plugin: ResolvedPlugin): Promise<void> {
    const { pathToFileURL } = await import('url');

    // Skip if already loaded
    if (this.loadedPlugins.has(plugin.name)) {
      this.logger.debug(`Already loaded: ${plugin.name}`);
      return;
    }

    this.logger.debug(`Loading ${plugin.name} v${plugin.version} from ${plugin.path}`);

    // Mark as loaded
    this.loadedPlugins.add(plugin.name);

    // Convert to file:// URL for Windows compatibility
    const moduleUrl = pathToFileURL(plugin.entryPoint).href;
    const pluginModule = await import(moduleUrl) as Record<string, unknown>;

    // Handle different export patterns
    const defaultExport = pluginModule.default;
    const namedExport = pluginModule[Object.keys(pluginModule)[0]];
    const exported = defaultExport ?? namedExport;

    if (exported === null || exported === undefined) {
      throw new Error(`Plugin ${plugin.name} has no exports`);
    }

    // Register based on plugin type
    if (plugin.type === 'protocol') {
      this.pluginManager.registerPlugin(exported as IProtocolPlugin);
      this.logger.debug(`Registered protocol plugin: ${plugin.protocols?.join(', ') ?? ''}`);
    } else if (plugin.type === 'auth') {
      // Auth plugins might export array or single
      const authArray = Array.isArray(exported) ? (exported as IAuthPlugin[]) : [exported as IAuthPlugin];

      for (const authPlugin of authArray) {
        this.pluginManager.registerAuthPlugin(authPlugin);
        this.logger.debug(`Registered auth plugin: ${authPlugin.authTypes.join(', ')}`);
      }
    } else if (plugin.type === 'value') {
      this.pluginManager.registerVariableProvider(exported as IValueProviderPlugin);
      this.logger.debug(`Registered value provider: ${plugin.valueTypes?.join(', ') ?? ''}`);
    }
  }
}
