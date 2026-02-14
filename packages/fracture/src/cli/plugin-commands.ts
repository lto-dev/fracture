import { Command } from 'commander';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, readFile, access } from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import type { PluginPackageJson } from '@apiquest/types';
import { fetchAvailablePlugins } from './plugin-registry.js';

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
      let hasErrors = false;
      for (const name of names) {
        const packageName = name.startsWith('@') ? name : `@apiquest/plugin-${name}`;
        
        console.log(`Installing ${packageName}...`);
        
        try {
          // Use npm to install globally
          await execAsync(`npm install -g ${packageName}`);
          console.log(`${packageName} installed`);
        } catch (error) {
          hasErrors = true;
          const err = error as { message?: string };
          console.error(`Failed to install ${packageName}:`, err.message ?? String(error));
        }
      }
      if (hasErrors) {
        process.exit(4);
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
          if (plugin.apiquest?.type !== undefined) {
            console.log(`    Type: ${plugin.apiquest.type}`);
          }
          const runtime = plugin.apiquest?.runtime;
          if (runtime !== undefined) {
            const runtimeArray = Array.isArray(runtime) ? runtime : [runtime];
            if (runtimeArray.length > 0) {
              console.log(`    Runtime: ${runtimeArray.join(', ')}`);
            }
          }
          if (plugin.description !== undefined) {
            console.log(`    Description: ${plugin.description}`);
          }
          printCapabilities(plugin.apiquest?.capabilities?.provides, '    ');
          console.log('');
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
      let hasErrors = false;
      for (const name of names) {
        const packageName = name.startsWith('@') ? name : `@apiquest/plugin-${name}`;
        
        console.log(`Removing ${packageName}...`);
        
        try {
          await execAsync(`npm uninstall -g ${packageName}`);
          console.log(`${packageName} removed`);
        } catch (error) {
          hasErrors = true;
          const err = error as { message?: string };
          console.error(`Failed to remove ${packageName}:`, err.message ?? String(error));
        }
      }
      if (hasErrors) {
        process.exit(4);
      }
    });

  // quest plugin update <name>
  pluginCommand
    .command('update')
    .description('Update plugin(s)')
    .argument('[names...]', 'Plugin name(s) to update (all if not specified)')
    .action(async (names: string[]) => {
      let hasErrors = false;
      if (names.length === 0) {
        // Update all @apiquest plugins
        console.log('Updating all @apiquest plugins...');
        
        try {
          await execAsync('npm update -g @apiquest/*');
          console.log('All plugins updated');
        } catch (error) {
          hasErrors = true;
          const err = error as { message?: string };
          console.error('Failed to update plugins:', err.message ?? String(error));
        }
      } else {
        for (const name of names) {
          const packageName = name.startsWith('@') ? name : `@apiquest/plugin-${name}`;
          
          console.log(`Updating ${packageName}...`);
          
          try {
            await execAsync(`npm update -g ${packageName}`);
            console.log(`${packageName} updated`);
          } catch (error) {
            hasErrors = true;
            const err = error as { message?: string };
            console.error(`Failed to update ${packageName}:`, err.message ?? String(error));
          }
        }
      }
      if (hasErrors) {
        process.exit(4);
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
        const pkg = JSON.parse(pkgContent) as Partial<PluginPackageJson>;
        
        // Only list fracture runtime plugins
        if (pkg.apiquest?.runtime?.includes('fracture') !== true) {
          continue;
        }
        
        foundAny = true;
        const version = pkg.version ?? 'unknown';
        const type = pkg.apiquest?.type ?? 'unknown';
        const runtime = pkg.apiquest?.runtime;
        const runtimeStr = Array.isArray(runtime) 
          ? runtime.join(', ') 
          : typeof runtime === 'string' 
            ? runtime 
            : 'unknown';
        
        console.log(`    - ${pkg.name ?? 'unknown'}@${version}`);
        console.log(`      Type: ${type}`);
        console.log(`      Runtime: ${runtimeStr}`);
        
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

/**
 * Print plugin capabilities (fracture runtime capabilities only)
 */
function printCapabilities(provides?: NonNullable<NonNullable<PluginPackageJson['apiquest']>['capabilities']>['provides'], indent = '    '): void {
  if (provides === undefined) {
    return;
  }

  // Fracture runtime capabilities:
  if (provides.protocols !== undefined && provides.protocols.length > 0) {
    console.log(`${indent}Protocols: ${provides.protocols.join(', ')}`);
  }
  if (provides.authTypes !== undefined && provides.authTypes.length > 0) {
    console.log(`${indent}Auth Types: ${provides.authTypes.join(', ')}`);
  }
  if (provides.reportTypes !== undefined && provides.reportTypes.length > 0) {
    console.log(`${indent}Report Types: ${provides.reportTypes.join(', ')}`);
  }
  if (provides.valueTypes !== undefined && provides.valueTypes.length > 0) {
    console.log(`${indent}Value Providers: ${provides.valueTypes.join(', ')}`);
  }
}
