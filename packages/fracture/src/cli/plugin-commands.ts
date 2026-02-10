import { Command } from 'commander';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, readFile, access } from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';

const execAsync = promisify(exec);

/**
 * Add plugin management commands to the CLI program
 */
export function addPluginCommands(program: Command): void {
  const pluginCommand = program
    .command('plugin')
    .description('Manage ApiQuest plugins');

  // quest plugin install <name>
  pluginCommand
    .command('install')
    .description('Install a plugin')
    .argument('<names...>', 'Plugin name(s) to install')
    .action(async (names: string[]) => {
      for (const name of names) {
        const packageName = name.startsWith('@') ? name : `@apiquest/plugin-${name}`;
        
        console.log(`Installing ${packageName}...`);
        
        try {
          // Use npm to install globally
          await execAsync(`npm install -g ${packageName}`);
          console.log(`✓ ${packageName} installed`);
        } catch (error) {
          const err = error as { message?: string };
          console.error(`✗ Failed to install ${packageName}:`, err.message ?? String(error));
        }
      }
    });

  // quest plugin list
  pluginCommand
    .command('list')
    .description('List installed plugins')
    .action(async () => {
      console.log('Installed plugins:\n');
      
      // Check global npm packages
      try {
        const globalPath = execSync('npm root -g', { encoding: 'utf-8' }).trim();
        const apiquestPath = path.join(globalPath, '@apiquest');
        await listPluginsFromDir(apiquestPath, 'Global (npm)');
      } catch (error) {
        console.log('  [Global (npm)] Could not access global npm packages\n');
      }
    });

  // quest plugin available
  pluginCommand
    .command('available')
    .description('List available plugins from npm registry (fracture runtime)')
    .action(async () => {
      console.log('Available plugins (npm registry):\n');

      try {
        const plugins = await fetchAvailablePlugins();
        if (plugins.length === 0) {
          console.log('  No plugins found for fracture runtime.');
          return;
        }

        for (const plugin of plugins) {
          console.log(`  - ${plugin.name}@${plugin.version}`);
          if (plugin.type !== undefined) {
            console.log(`    Type: ${plugin.type}`);
          }
          if (plugin.runtime.length > 0) {
            console.log(`    Runtime: ${plugin.runtime.join(', ')}`);
          }
          if (plugin.description !== undefined) {
            console.log(`    Description: ${plugin.description}`);
          }
          printCapabilities(plugin.provides, '    ');
        }

        console.log('');
      } catch (error) {
        console.error('Failed to query npm registry:', error instanceof Error ? error.message : String(error));
        process.exit(4);
      }
    });

  // quest plugin remove <name>
  pluginCommand
    .command('remove')
    .description('Remove a plugin')
    .argument('<names...>', 'Plugin name(s) to remove')
    .action(async (names: string[]) => {
      for (const name of names) {
        const packageName = name.startsWith('@') ? name : `@apiquest/plugin-${name}`;
        
        console.log(`Removing ${packageName}...`);
        
        try {
          await execAsync(`npm uninstall -g ${packageName}`);
          console.log(`✓ ${packageName} removed`);
        } catch (error) {
          const err = error as { message?: string };
          console.error(`✗ Failed to remove ${packageName}:`, err.message ?? String(error));
        }
      }
    });

  // quest plugin update <name>
  pluginCommand
    .command('update')
    .description('Update plugin(s)')
    .argument('[names...]', 'Plugin name(s) to update (all if not specified)')
    .action(async (names: string[]) => {
      if (names.length === 0) {
        // Update all @apiquest plugins
        console.log('Updating all @apiquest plugins...');
        
        try {
          await execAsync('npm update -g @apiquest/*');
          console.log('✓ All plugins updated');
        } catch (error) {
          const err = error as { message?: string };
          console.error('✗ Failed to update plugins:', err.message ?? String(error));
        }
      } else {
        for (const name of names) {
          const packageName = name.startsWith('@') ? name : `@apiquest/plugin-${name}`;
          
          console.log(`Updating ${packageName}...`);
          
          try {
            await execAsync(`npm update -g ${packageName}`);
            console.log(`✓ ${packageName} updated`);
          } catch (error) {
            const err = error as { message?: string };
            console.error(`✗ Failed to update ${packageName}:`, err.message ?? String(error));
          }
        }
      }
    });
}

/**
 * List plugins from a specific directory
 */
async function listPluginsFromDir(dir: string, label: string): Promise<void> {
  try {
    await access(dir);
    const entries = await readdir(dir, { withFileTypes: true });
    const plugins = entries.filter(e => e.isDirectory() && e.name.startsWith('plugin-'));
    
    let foundAny = false;
    console.log(`  [${label}]`);
    
    for (const plugin of plugins) {
      const pluginPath = path.join(dir, plugin.name);
      const packageJsonPath = path.join(pluginPath, 'package.json');
      
      try {
        const pkgContent = await readFile(packageJsonPath, 'utf-8');
        const pkg: {
          name?: string;
          version?: string;
          apiquest?: ApiquestMetadata;
        } = JSON.parse(pkgContent) as { name?: string; version?: string; apiquest?: ApiquestMetadata };
        
        // Only list fracture runtime plugins
        if (pkg.apiquest?.runtime?.includes('fracture') !== true) {
          continue;
        }
        
        foundAny = true;
        const version = pkg.version ?? 'unknown';
        const type = pkg.apiquest?.type ?? 'unknown';
        const runtime = pkg.apiquest?.runtime?.join(', ') ?? 'unknown';
        
        console.log(`    - ${pkg.name ?? 'unknown'}@${version}`);
        console.log(`      Type: ${type}`);
        console.log(`      Runtime: ${runtime}`);
        
        printCapabilities(pkg.apiquest?.capabilities?.provides, '      ');
        
      } catch {
        // Skip invalid package.json
      }
    }
    
    if (!foundAny) {
      console.log(`    No fracture plugins found`);
    }
    console.log('');
  } catch {
    console.log(`  [${label}] Directory not found or not accessible\n`);
  }
}

interface PluginProvides {
  protocols?: string[];
  authTypes?: string[];
  reportTypes?: string[];
  importFormats?: string[];
  exportFormats?: string[];
  visualizations?: string[];
  provider?: string;
}

interface ApiquestMetadata {
  type?: string;
  runtime?: string[];
  capabilities?: {
    provides?: PluginProvides;
  };
}

interface RegistrySearchResponse {
  objects: Array<{
    package?: {
      name?: string;
    };
  }>;
}

interface RegistryPackageResponse {
  name: string;
  version?: string;
  description?: string;
  'dist-tags'?: {
    latest?: string;
  };
  versions?: Record<string, {
    description?: string;
    apiquest?: ApiquestMetadata;
  }>;
}

interface AvailablePlugin {
  name: string;
  version: string;
  description?: string;
  type?: string;
  runtime: string[];
  provides?: PluginProvides;
}

async function fetchAvailablePlugins(): Promise<AvailablePlugin[]> {
  const searchUrl = new URL('https://registry.npmjs.org/-/v1/search');
  searchUrl.searchParams.set('text', 'scope:@apiquest plugin-');
  searchUrl.searchParams.set('size', '250');

  const response = await fetch(searchUrl.toString(), {
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Registry search failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as RegistrySearchResponse;
  const names = data.objects
    .map(obj => obj.package?.name)
    .filter((name): name is string => typeof name === 'string' && name.startsWith('@apiquest/plugin-'));

  const pluginResults = await Promise.all(names.map(async (name) => {
    try {
      return await fetchRegistryPluginInfo(name);
    } catch {
      return null;
    }
  }));

  return pluginResults
    .filter((plugin): plugin is AvailablePlugin => plugin !== null)
    .filter(plugin => plugin.runtime.includes('fracture'))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchRegistryPluginInfo(name: string): Promise<AvailablePlugin | null> {
  const response = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
    headers: {
      'Accept': 'application/json'
    }
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json() as RegistryPackageResponse;
  const latest = data['dist-tags']?.latest;
  const versionData = latest !== undefined && data.versions !== undefined ? data.versions[latest] : undefined;
  const metadata = versionData?.apiquest;

  if (latest === undefined || metadata === undefined) {
    return null;
  }

  const runtime = Array.isArray(metadata.runtime) ? metadata.runtime : [];
  return {
    name: data.name,
    version: latest,
    description: versionData?.description,
    type: metadata.type,
    runtime,
    provides: metadata.capabilities?.provides
  };
}

function printCapabilities(provides?: PluginProvides, indent = '    '): void {
  if (provides === undefined) {
    return;
  }

  if (provides.protocols !== undefined && provides.protocols.length > 0) {
    console.log(`${indent}Protocols: ${provides.protocols.join(', ')}`);
  }
  if (provides.authTypes !== undefined && provides.authTypes.length > 0) {
    console.log(`${indent}Auth Types: ${provides.authTypes.join(', ')}`);
  }
  if (provides.reportTypes !== undefined && provides.reportTypes.length > 0) {
    console.log(`${indent}Report Types: ${provides.reportTypes.join(', ')}`);
  }
  if (provides.importFormats !== undefined && provides.importFormats.length > 0) {
    console.log(`${indent}Import Formats: ${provides.importFormats.join(', ')}`);
  }
  if (provides.exportFormats !== undefined && provides.exportFormats.length > 0) {
    console.log(`${indent}Export Formats: ${provides.exportFormats.join(', ')}`);
  }
  if (provides.visualizations !== undefined && provides.visualizations.length > 0) {
    console.log(`${indent}Visualizations: ${provides.visualizations.join(', ')}`);
  }
  if (provides.provider !== undefined) {
    console.log(`${indent}Provider: ${provides.provider}`);
  }
}
