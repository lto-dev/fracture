/**
 * Shared npm registry querying functionality for plugin discovery
 * Uses types from @apiquest/types
 */

import type { PluginPackageJson } from '@apiquest/types';

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
  versions?: Record<string, PluginPackageJson>;
}

/**
 * Default npm registry URL
 */
export const DEFAULT_REGISTRY_URL = 'https://registry.npmjs.org';

/**
 * Fetch all available @apiquest/plugin-* packages from npm registry
 * Filters for fracture runtime
 * 
 * @param registryUrl - Base registry URL (default: https://registry.npmjs.org)
 */
export async function fetchAvailablePlugins(registryUrl: string = DEFAULT_REGISTRY_URL): Promise<PluginPackageJson[]> {
  const searchUrl = new URL(`${registryUrl}/-/v1/search`);
  searchUrl.searchParams.set('text', '@apiquest/plugin');
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
      return await fetchRegistryPluginInfo(name, registryUrl);
    } catch {
      return null;
    }
  }));

  return pluginResults
    .filter((plugin): plugin is PluginPackageJson => plugin !== null)
    .filter(plugin => {
      const runtime = plugin.apiquest?.runtime;
      if (Array.isArray(runtime)) {
        return runtime.includes('fracture');
      }
      return runtime === 'fracture';
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Fetch package.json metadata for a specific plugin from npm registry
 * 
 * @param name - Package name (e.g., @apiquest/plugin-http)
 * @param registryUrl - Base registry URL (default: https://registry.npmjs.org)
 */
async function fetchRegistryPluginInfo(name: string, registryUrl: string = DEFAULT_REGISTRY_URL): Promise<PluginPackageJson | null> {
  const response = await fetch(`${registryUrl}/${encodeURIComponent(name)}`, {
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

  if (latest === undefined || versionData?.apiquest === undefined) {
    return null;
  }

  return {
    ...versionData,
    name: data.name,
    version: latest
  };
}
