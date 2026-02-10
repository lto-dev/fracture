import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get plugin directories for CLI
 * Returns an array of directories to scan for plugins
 */
export function getPluginDirectories(): string[] {
  const dirs: string[] = [];

  // 1. Development packages folder
  // The CLI dist is at packages/cli/dist, so __dirname/../../ gets us to workspace packages
  const devPackagesDir = path.resolve(__dirname, '../../..');
  
  // Check if packages folder exists (we're in dev workspace)
  if (fs.existsSync(devPackagesDir) && fs.statSync(devPackagesDir).isDirectory()) {
    // Verify it's the packages folder by checking for multiple @apiquest packages
    const entries = fs.readdirSync(devPackagesDir);
    const hasPluginAuth = entries.includes('plugin-auth');
    const hasPluginHttp = entries.includes('plugin-http');
    
    if (hasPluginAuth && hasPluginHttp) {
      console.debug(`[CLI] DEV MODE: Loading plugins from ${devPackagesDir}`);
      dirs.push(devPackagesDir);
    }
  }

  // 2. Global npm packages (@apiquest scope)
  try {
    const globalNodeModules = execSync('npm root -g', { encoding: 'utf-8' }).trim();
    const globalApiquestDir = path.join(globalNodeModules, '@apiquest');
    dirs.push(globalApiquestDir);
  } catch (error) {
    console.warn('[CLI] Could not determine global npm directory:', error);
  }

  return dirs;
}
