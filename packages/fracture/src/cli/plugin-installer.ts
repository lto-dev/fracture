import { exec } from 'child_process';
import { promisify } from 'util';
import type { PluginRequirements } from '../CollectionAnalyzer.js';
import type { ResolvedPlugin } from '../PluginResolver.js';
import type { PluginPackageJson } from '@apiquest/types';
import { fetchAvailablePlugins } from './plugin-registry.js';

const execAsync = promisify(exec);

export interface PluginInstallResult {
  installed: string[];
  failed: string[];
  skipped: string[];
}

/**
 * Cache for registry plugin data to avoid repeated queries
 */
let registryPluginsCache: PluginPackageJson[] | null = null;

/**
 * Installer for ApiQuest plugins
 * Handles global installation of missing plugins via npm
 * Uses package.json metadata from npm registry to map capabilities to packages
 */
export class PluginInstaller {
  /**
   * Find plugins that are required but not resolved
   * Queries npm registry to read package.json metadata and map capabilities to actual package names
   * 
   * @param requirements - Plugin requirements (protocols, authTypes, valueProviders)
   * @param resolved - Already resolved/installed plugins
   * @param registryUrl - Optional custom npm registry URL
   */
  static async findMissingPlugins(
    requirements: PluginRequirements,
    resolved: ResolvedPlugin[],
    registryUrl?: string
  ): Promise<Set<string>> {
    const missing = new Set<string>();
    
    // Fetch available plugins from registry (cached)
    if (registryPluginsCache === null) {
      try {
        registryPluginsCache = await fetchAvailablePlugins(registryUrl);
      } catch (error) {
        throw new Error(
          `Failed to fetch plugin registry data from ${registryUrl ?? 'default registry'}. ` +
          `Error: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    
    const registryPlugins = registryPluginsCache;
    
    // Check protocols
    for (const protocol of requirements.protocols) {
      const found = resolved.some(p => p.protocols?.includes(protocol) === true);
      if (!found) {
        const packageName = this.findPackageForProtocol(protocol, registryPlugins);
        if (packageName !== null) {
          missing.add(packageName);
        } else {
          console.warn(`Warning: No package found in registry for protocol "${protocol}"`);
        }
      }
    }
    
    // Check auth types
    for (const authType of requirements.authTypes) {
      const found = resolved.some(p => p.authTypes?.includes(authType) === true);
      if (!found) {
        const packageName = this.findPackageForAuthType(authType, registryPlugins);
        if (packageName !== null) {
          missing.add(packageName);
        } else {
          console.warn(`Warning: No package found in registry for auth type "${authType}"`);
        }
      }
    }
    
    // Check value providers
    for (const provider of requirements.valueProviders) {
      const found = resolved.some(p => p.valueTypes?.includes(provider) === true);
      if (!found) {
        const packageName = this.findPackageForProvider(provider, registryPlugins);
        if (packageName !== null) {
          missing.add(packageName);
        } else {
          console.warn(`Warning: No package found in registry for provider "${provider}"`);
        }
      }
    }
    
    return missing;
  }
  //TODO: Need to enhance this to use provides/supports .... 
  /**
   * Find which package provides a specific protocol
   * Searches registry metadata to find the correct package
   */
  private static findPackageForProtocol(protocol: string, plugins: PluginPackageJson[]): string | null {
    const plugin = plugins.find(p => 
      p.apiquest?.capabilities?.provides?.protocols?.includes(protocol) === true
    );
    return plugin?.name ?? null;
  }
  
  /**
   * Find which package provides a specific auth type
   * Searches registry metadata to find the correct package
   * Note: Multiple packages can provide the same auth type, we pick the first match
   */
  private static findPackageForAuthType(authType: string, plugins: PluginPackageJson[]): string | null {
    const plugin = plugins.find(p => 
      p.apiquest?.capabilities?.provides?.authTypes?.includes(authType) === true
    );
    return plugin?.name ?? null;
  }
  
  /**
   * Find which package provides a specific value provider
   * Searches registry metadata to find the correct package
   */
  private static findPackageForProvider(provider: string, plugins: PluginPackageJson[]): string | null {
    const plugin = plugins.find(p => 
      p.apiquest?.capabilities?.provides?.valueTypes?.includes(provider) === true
    );
    return plugin?.name ?? null;
  }
  
  /**
   * Install plugins globally via npm
   */
  static async installPlugins(packageNames: Set<string>): Promise<PluginInstallResult> {
    const result: PluginInstallResult = {
      installed: [],
      failed: [],
      skipped: []
    };
    
    for (const packageName of packageNames) {
      try {
        console.log(`Installing ${packageName}...`);
        
        // Install globally
        await execAsync(`npm install -g ${packageName}`, {
          timeout: 120000 // 2 minute timeout
        });
        
        result.installed.push(packageName);
        console.log(`Successfully installed ${packageName}`);
      } catch (error) {
        result.failed.push(packageName);
        console.error(`Failed to install ${packageName}:`, error instanceof Error ? error.message : String(error));
      }
    }
    
    return result;
  }
  
  /**
   * Clear the registry cache (useful for testing or forcing a refresh)
   */
  static clearCache(): void {
    registryPluginsCache = null;
  }
}
