import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PluginInstaller } from '../src/cli/plugin-installer.js';
import type { PluginRequirements } from '../src/CollectionAnalyzer.js';
import type { ResolvedPlugin } from '../src/PluginResolver.js';
import * as pluginRegistry from '../src/cli/plugin-registry.js';

describe('PluginInstaller', () => {
  // Mock registry data - matches structure returned by fetchAvailablePlugins()
  // which is PluginPackageJson with name/version at top level
  const mockRegistryPlugins = [
    {
      name: '@apiquest/plugin-http',
      version: '1.0.0',
      apiquest: {
        type: 'protocol',
        runtime: ['fracture'],
        capabilities: {
          provides: { protocols: ['http', 'https'] }
        }
      }
    },
    {
      name: '@apiquest/plugin-grpc',
      version: '1.0.0',
      apiquest: {
        type: 'protocol',
        runtime: ['fracture'],
        capabilities: {
          provides: { protocols: ['grpc'] }
        }
      }
    },
    {
      name: '@apiquest/plugin-auth',
      version: '1.0.0',
      apiquest: {
        type: 'auth',
        runtime: ['fracture'],
        capabilities: {
          provides: { authTypes: ['bearer', 'basic', 'apikey', 'oauth2'] }
        }
      }
    },
    {
      name: '@apiquest/plugin-vault-file',
      version: '1.0.0',
      apiquest: {
        type: 'value',
        runtime: ['fracture'],
        capabilities: {
          provides: { valueTypes: ['vault:file'] }
        }
      }
    },
    {
      name: '@apiquest/plugin-vault-env',
      version: '1.0.0',
      apiquest: {
        type: 'value',
        runtime: ['fracture'],
        capabilities: {
          provides: { valueTypes: ['vault:env'] }
        }
      }
    }
  ];

  beforeEach(() => {
    // Mock the registry fetch function
    vi.spyOn(pluginRegistry, 'fetchAvailablePlugins').mockResolvedValue(mockRegistryPlugins);
  });

  afterEach(() => {
    // Clear cache and restore mocks
    PluginInstaller.clearCache();
    vi.restoreAllMocks();
  });

  describe('findMissingPlugins', () => {
    it('should find missing protocol plugins', async () => {
      const requirements: PluginRequirements = {
        protocols: new Set(['http', 'grpc']),
        authTypes: new Set(),
        valueProviders: new Set()
      };
      
      const resolved: ResolvedPlugin[] = [
        {
          name: '@apiquest/plugin-http',
          version: '1.0.0',
          type: 'protocol',
          path: '/path',
          entryPoint: 'index.js',
          protocols: ['http']
        }
      ];
      
      const missing = await PluginInstaller.findMissingPlugins(requirements, resolved);
      
      expect(missing.has('@apiquest/plugin-grpc')).toBe(true);
      expect(missing.has('@apiquest/plugin-http')).toBe(false);
      expect(missing.size).toBe(1);
    });
    
    it('should find missing auth plugins', async () => {
      const requirements: PluginRequirements = {
        protocols: new Set(),
        authTypes: new Set(['bearer', 'basic']),
        valueProviders: new Set()
      };
      
      const resolved: ResolvedPlugin[] = [];
      
      const missing = await PluginInstaller.findMissingPlugins(requirements, resolved);
      
      expect(missing.has('@apiquest/plugin-auth')).toBe(true);
      expect(missing.size).toBe(1);
    });
    
    it('should find missing value provider plugins', async () => {
      const requirements: PluginRequirements = {
        protocols: new Set(),
        authTypes: new Set(),
        valueProviders: new Set(['vault:file', 'vault:env'])
      };
      
      const resolved: ResolvedPlugin[] = [
        {
          name: '@apiquest/plugin-vault-file',
          version: '1.0.0',
          type: 'value',
          path: '/path',
          entryPoint: 'index.js',
          valueTypes: ['vault:file']
        }
      ];
      
      const missing = await PluginInstaller.findMissingPlugins(requirements, resolved);
      
      expect(missing.has('@apiquest/plugin-vault-env')).toBe(true);
      expect(missing.has('@apiquest/plugin-vault-file')).toBe(false);
      expect(missing.size).toBe(1);
    });
    
    it('should return empty set when all plugins are resolved', async () => {
      const requirements: PluginRequirements = {
        protocols: new Set(['http']),
        authTypes: new Set(['bearer']),
        valueProviders: new Set()
      };
      
      const resolved: ResolvedPlugin[] = [
        {
          name: '@apiquest/plugin-http',
          version: '1.0.0',
          type: 'protocol',
          path: '/path',
          entryPoint: 'index.js',
          protocols: ['http']
        },
        {
          name: '@apiquest/plugin-auth',
          version: '1.0.0',
          type: 'auth',
          path: '/path',
          entryPoint: 'index.js',
          authTypes: ['bearer', 'basic', 'apikey']
        }
      ];
      
      const missing = await PluginInstaller.findMissingPlugins(requirements, resolved);
      
      expect(missing.size).toBe(0);
    });
    
    it('should handle multiple protocols from same plugin', async () => {
      const requirements: PluginRequirements = {
        protocols: new Set(['http', 'https']),
        authTypes: new Set(),
        valueProviders: new Set()
      };
      
      const resolved: ResolvedPlugin[] = [
        {
          name: '@apiquest/plugin-http',
          version: '1.0.0',
          type: 'protocol',
          path: '/path',
          entryPoint: 'index.js',
          protocols: ['http', 'https']
        }
      ];
      
      const missing = await PluginInstaller.findMissingPlugins(requirements, resolved);
      
      expect(missing.size).toBe(0);
    });
  });
  
  describe('Package name mapping via registry', () => {
    it('should find package for protocol from registry metadata', async () => {
      const requirements: PluginRequirements = {
        protocols: new Set(['http']),
        authTypes: new Set(),
        valueProviders: new Set()
      };
      
      const resolved: ResolvedPlugin[] = [];
      const missing = await PluginInstaller.findMissingPlugins(requirements, resolved);
      
      expect(missing.has('@apiquest/plugin-http')).toBe(true);
    });
    
    it('should find package for auth type from registry metadata', async () => {
      const requirements: PluginRequirements = {
        protocols: new Set(),
        authTypes: new Set(['bearer']),
        valueProviders: new Set()
      };
      
      const resolved: ResolvedPlugin[] = [];
      const missing = await PluginInstaller.findMissingPlugins(requirements, resolved);
      
      expect(missing.has('@apiquest/plugin-auth')).toBe(true);
    });
    
    it('should find package for value provider from registry metadata', async () => {
      const requirements: PluginRequirements = {
        protocols: new Set(),
        authTypes: new Set(),
        valueProviders: new Set(['vault:file'])
      };
      
      const resolved: ResolvedPlugin[] = [];
      const missing = await PluginInstaller.findMissingPlugins(requirements, resolved);
      
      expect(missing.has('@apiquest/plugin-vault-file')).toBe(true);
    });
  });
});
