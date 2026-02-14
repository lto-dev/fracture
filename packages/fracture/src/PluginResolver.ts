import type { PluginPackageJson } from '@apiquest/types';
import { Logger } from './Logger.js';

export interface ResolvedPlugin {
  name: string;
  version: string;
  type: 'protocol' | 'auth' | 'value';
  path: string;
  entryPoint: string;
  protocols?: string[];
  authTypes?: string[];
  valueTypes?: string[];
}

export class PluginResolver {
  private resolved: Map<string, ResolvedPlugin> = new Map();
  private logger: Logger;

  constructor(baseLogger?: Logger) {
    this.logger = baseLogger?.createLogger('PluginResolver') ?? new Logger('PluginResolver');
  }

  /**
   * Scan multiple directories and resolve all available plugins
   * This is fast - just file I/O, no module loading
   */
  async scanDirectories(dirs: string[]): Promise<ResolvedPlugin[]> {
    const scanPromises = dirs.map(dir =>
      this.scanDirectory(dir).catch(err => {
        this.logger.error('Plugin scanning failed:', err);
      })
    );

    await Promise.all(scanPromises);

    return Array.from(this.resolved.values());
  }

  /**
   * Scan single directory for plugins
   */
  private async scanDirectory(pluginsDir: string): Promise<void> {
    const { readdir, readFile, access } = await import('fs/promises');
    const path = await import('path');

    this.logger.debug(`Scanning plugins: ${pluginsDir}`);

    // Check if directory exists
    try {
      await access(pluginsDir);
    } catch {
      this.logger.debug(`Plugins directory does not exist: ${pluginsDir}`);
      return;
    }

    const entries = await readdir(pluginsDir, { withFileTypes: true });

    for (const entry of entries) {
      // Only process plugin-* directories
      if (!entry.isDirectory() || !entry.name.startsWith('plugin-')) {
        continue;
      }

      const pluginPath = path.join(pluginsDir, entry.name);
      await this.resolvePlugin(pluginPath);
    }
  }

  /**
   * Resolve a single plugin - read metadata but don't load module
   */
  private async resolvePlugin(pluginPath: string): Promise<void> {
    const { readFile } = await import('fs/promises');
    const path = await import('path');

    const packageJsonPath = path.join(pluginPath, 'package.json');

    try {
      // Read package.json
      const pkgContent = await readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(pkgContent) as PluginPackageJson;

      // Check if plugin is for fracture runtime
      const runtime = pkg.apiquest?.runtime;
      const runtimeArray = Array.isArray(runtime) ? runtime : [runtime];
      if (pkg.apiquest === null || pkg.apiquest === undefined || !runtimeArray.includes('fracture')) {
        this.logger.debug(`Skipping ${pkg.name} (runtime: ${runtime ?? 'undefined'})`);
        return;
      }

      // Extract metadata from package.json
      const type = pkg.apiquest.type;
      if (!['protocol', 'auth', 'value'].includes(type)) {
        this.logger.warn(`Unknown plugin type: ${type} (${pkg.name})`);
        return;
      }

      // Resolve entry point
      const entryPoint = pkg.main ?? 'dist/index.js';
      const fullEntryPath = path.join(pluginPath, entryPoint);

      // Extract capabilities from apiquest.capabilities.provides
      const provides = pkg.apiquest.capabilities?.provides ?? {};

      // Create resolved plugin info
      const resolved: ResolvedPlugin = {
        name: pkg.name,
        version: pkg.version,
        type: type as 'protocol' | 'auth' | 'value',
        path: pluginPath,
        entryPoint: fullEntryPath,
        protocols: provides.protocols,
        authTypes: provides.authTypes,
        valueTypes: provides.valueTypes,
      };

      // Check for version conflicts
      const existing = this.resolved.get(pkg.name);
      if (existing !== null && existing !== undefined) {
        if (this.compareVersions(pkg.version, existing.version) > 0) {
          this.logger.debug(`Upgrading ${pkg.name} from v${existing.version} to v${pkg.version}`);
          this.resolved.set(pkg.name, resolved);
        } else {
          this.logger.debug(`Skipping ${pkg.name} v${pkg.version} (v${existing.version} already resolved)`);
        }
      } else {
        this.logger.debug(`Resolved ${pkg.name} v${pkg.version} (${type})`);
        this.resolved.set(pkg.name, resolved);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to resolve plugin at ${pluginPath}:`, errorMsg);
    }
  }

  /**
   * Compare semantic versions
   * Returns: 1 if a > b, -1 if a < b, 0 if equal
   */
  private compareVersions(a: string, b: string): number {
    const aParts = a.split('.').map(Number);
    const bParts = b.split('.').map(Number);

    for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
      const aNum = aParts[i] ?? 0;
      const bNum = bParts[i] ?? 0;

      if (aNum > bNum) return 1;
      if (aNum < bNum) return -1;
    }

    return 0;
  }
}
