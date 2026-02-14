/**
 * Test Plan Section 22: Dynamic Plugin Loading
 * Tests CollectionRunner dynamic plugin loading from a directory
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { CollectionRunner } from '../src/CollectionRunner.js';
import type { Collection, EventPayloads, IProtocolPlugin, Request, RuntimeOptions } from '@apiquest/types';
import { LogLevel } from '@apiquest/types';
import { mkdir, writeFile, rm, mkdtemp } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { isNullOrEmpty } from '../src/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const waitForPluginResolution = async (runner: CollectionRunner): Promise<void> => {
  await (runner as unknown as { pluginResolutionPromise: Promise<unknown[]> }).pluginResolutionPromise;
};

const collectConsoleMessage = (logMessages: string[]) => (event: EventPayloads['console']): void => {
  logMessages.push(event.message);
};

describe('Section 22: Dynamic Plugin Loading', () => {
  let testPluginsDir: string;
  const testPluginsDirPrefix = path.join(__dirname, 'test-plugins-temp-');
  
  beforeEach(async () => {
    testPluginsDir = await mkdtemp(testPluginsDirPrefix);
  });

  afterEach(async () => {
    if (isNullOrEmpty(testPluginsDir)) {
      return;
    }

    try {
      await rm(testPluginsDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  // ========================================================================
  // Section 22.1: Plugin directory scanning
  // ========================================================================

  describe('22.1 Plugin directory scanning', () => {
    test('Runner handles non-existent plugins directory gracefully', async () => {
      const logMessages: string[] = [];
      const runner = new CollectionRunner({ 
        pluginsDir: '/nonexistent/path',
        logLevel: LogLevel.DEBUG
      });

      runner.on('console', collectConsoleMessage(logMessages));
      
      await waitForPluginResolution(runner);
      
      expect(logMessages.some(msg => msg.includes('Plugins directory does not exist'))).toBe(true);
    });

    test('Runner scans plugins directory on construction', async () => {
      const logMessages: string[] = [];
      await mkdir(testPluginsDir, { recursive: true });
      
      const runner = new CollectionRunner({ 
        pluginsDir: testPluginsDir,
        logLevel: LogLevel.DEBUG
      });
      runner.on('console', collectConsoleMessage(logMessages));

      await waitForPluginResolution(runner);
      
      expect(logMessages.some(msg => msg.includes('Scanning plugins'))).toBe(true);
    });

    test('Runner ignores non-plugin directories', async () => {
      const logMessages: string[] = [];
      await mkdir(testPluginsDir, { recursive: true });
      await mkdir(path.join(testPluginsDir, 'not-a-plugin'), { recursive: true });
      await mkdir(path.join(testPluginsDir, 'also-not-plugin'), { recursive: true });
      
      const runner = new CollectionRunner({ 
        pluginsDir: testPluginsDir,
        logLevel: LogLevel.DEBUG
      });
      runner.on('console', collectConsoleMessage(logMessages));

      await waitForPluginResolution(runner);
      
      // Should scan but not find any plugins
      expect(logMessages.some(msg => msg.includes('Scanning plugins'))).toBe(true);
      expect(logMessages.some(msg => msg.includes('Loading:'))).toBe(false);
    });
  });

  // ========================================================================
  // Section 22.2: Plugin loading and registration
  // ========================================================================

  describe('22.2 Plugin loading and registration', () => {
    test('Loads fracture protocol plugin from directory', async () => {
      const logMessages: string[] = [];
      
      // Create test plugin directory structure
      const pluginDir = path.join(testPluginsDir, 'plugin-test-protocol');
      const distDir = path.join(pluginDir, 'dist');
      await mkdir(distDir, { recursive: true });
      
      // Create package.json with fracture runtime
      const packageJson = {
        name: '@apiquest/plugin-test-protocol',
        main: 'dist/index.js',
        apiquest: {
          type: 'protocol',
          runtime: ['fracture'],
          capabilities: {
            provides: {
              protocols: ['test']
            }
          }
        }
      };
      await writeFile(
        path.join(pluginDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );
      
      // Create plugin module
      const pluginCode = `
        export default {
          name: 'Test Plugin',
          version: '1.0.0',
          description: 'Test plugin for dynamic loading',
          protocols: ['test'],
          supportedAuthTypes: [],
          dataSchema: {},
          validate(request) {
            return { valid: true };
          },
          async execute(request, context) {
            return {
              status: 200,
              statusText: 'OK',
              headers: {},
              body: 'Test plugin works',
              duration: 0
            };
          }
        };
      `;
      await writeFile(path.join(distDir, 'index.js'), pluginCode);
      
      const runner = new CollectionRunner({ 
        pluginsDir: testPluginsDir,
        logLevel: LogLevel.DEBUG
      });
      runner.on('console', collectConsoleMessage(logMessages));

      await waitForPluginResolution(runner);
      
      // Run collection to trigger plugin loading
      const collection: Collection = {
        info: { id: 'test', name: 'Test' },
        protocol: 'test',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Test Request',
            data: { url: 'test://example' }
          }
        ]
      };
      
      const result = await runner.run(collection);
      
      // Verify plugin was loaded and registered
      expect(logMessages.some(msg => msg.includes('Loading @apiquest/plugin-test-protocol'))).toBe(true);
      expect(logMessages.some(msg => msg.includes('Registered protocol plugin: test'))).toBe(true);
      
      // Verify plugin works
      expect(result.requestResults).toHaveLength(1);
      expect(result.requestResults[0].success).toBe(true);
      expect(result.requestResults[0].response?.body).toBe('Test plugin works');
    });

    test('Skips plugins without fracture runtime', async () => {
      const logMessages: string[] = [];
      
      // Create plugin directory
      const pluginDir = path.join(testPluginsDir, 'plugin-desktop-only');
      const distDir = path.join(pluginDir, 'dist');
      await mkdir(distDir, { recursive: true });
      
      // Create package.json with desktop runtime only
      const packageJson = {
        name: '@apiquest/plugin-desktop-only',
        main: 'dist/index.js',
        apiquest: {
          type: 'protocol',
          runtime: ['desktop'] // Not fracture!
        }
      };
      await writeFile(
        path.join(pluginDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );
      
      const runner = new CollectionRunner({ 
        pluginsDir: testPluginsDir,
        logLevel: LogLevel.DEBUG
      });
      runner.on('console', collectConsoleMessage(logMessages));

      await waitForPluginResolution(runner);
      
      expect(logMessages.some(msg => msg.includes('Skipping @apiquest/plugin-desktop-only'))).toBe(true);
      expect(logMessages.some(msg => msg.includes('Loading: @apiquest/plugin-desktop-only'))).toBe(false);
    });

    test('Loads auth plugin from directory', async () => {
      const logMessages: string[] = [];
      
      // Create test auth plugin
      const pluginDir = path.join(testPluginsDir, 'plugin-test-auth');
      const distDir = path.join(pluginDir, 'dist');
      await mkdir(distDir, { recursive: true });
      
      const packageJson = {
        name: '@apiquest/plugin-test-auth',
        main: 'dist/index.js',
        apiquest: {
          type: 'auth',
          runtime: ['fracture'],
          capabilities: {
            provides: {
              authTypes: ['testauth']
            }
          }
        }
      };
      await writeFile(
        path.join(pluginDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );
      
      // Create auth plugin that exports an array
      const pluginCode = `
        export default [
          {
            authTypes: ['testauth'],
            async apply(request, authConfig, context) {
              request.headers = request.headers || {};
              request.headers['X-Test-Auth'] = 'test-token';
              return request;
            }
          }
        ];
      `;
      await writeFile(path.join(distDir, 'index.js'), pluginCode);
      
      const runner = new CollectionRunner({ 
        pluginsDir: testPluginsDir,
        logLevel: LogLevel.DEBUG
      });
      runner.on('console', collectConsoleMessage(logMessages));

      await waitForPluginResolution(runner);
      
      // Create minimal protocol plugin for testing auth
      const minimalProtocolPlugin = {
        name: 'Minimal HTTP',
        version: '1.0.0',
        description: 'Minimal protocol for auth testing',
        protocols: ['http'],
        supportedAuthTypes: ['testauth'],
        dataSchema: {},
        validate() { return { valid: true }; },
        async execute() {
          return {
            status: 200,
            statusText: 'OK',
            headers: {},
            body: '',
            duration: 0
          };
        }
      };
      runner.registerPlugin(minimalProtocolPlugin);
      
      // Run collection with testauth to trigger loading
      const collection: Collection = {
        info: { id: 'test', name: 'Test' },
        protocol: 'http',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Test Request',
            auth: { type: 'testauth', data: {} },
            data: {
              url: 'http://example.com'
            }
          }
        ]
      };
      
      await runner.run(collection);
      
      expect(logMessages.some(msg => msg.includes('Loading @apiquest/plugin-test-auth'))).toBe(true);
      expect(logMessages.some(msg => msg.includes('Registered auth plugin: testauth'))).toBe(true);
    });
  });

  // ========================================================================
  // Section 22.3: Error handling
  // ========================================================================

  describe('22.3 Error handling', () => {
    test('Continues loading other plugins if one fails', async () => {
      const logMessages: string[] = [];
      
      // Create bad plugin (valid metadata, but invalid module that fails on import)
      const badPluginDir = path.join(testPluginsDir, 'plugin-bad');
      const badDistDir = path.join(badPluginDir, 'dist');
      await mkdir(badDistDir, { recursive: true });
      
      const badPackageJson = {
        name: '@apiquest/plugin-bad',
        main: 'dist/index.js',
        apiquest: {
          type: 'protocol',
          runtime: ['fracture'],
          capabilities: {
            provides: {
              protocols: ['bad']
            }
          }
        }
      };
      await writeFile(
        path.join(badPluginDir, 'package.json'),
        JSON.stringify(badPackageJson, null, 2)
      );
      
      // Invalid JavaScript that will fail on import
      const badPluginCode = `
        throw new Error('Plugin loading failed!');
      `;
      await writeFile(path.join(badDistDir, 'index.js'), badPluginCode);
      
      // Create good plugin
      const goodPluginDir = path.join(testPluginsDir, 'plugin-good');
      const distDir = path.join(goodPluginDir, 'dist');
      await mkdir(distDir, { recursive: true });
      
      const packageJson = {
        name: '@apiquest/plugin-good',
        main: 'dist/index.js',
        apiquest: {
          type: 'protocol',
          runtime: ['fracture'],
          capabilities: {
            provides: {
              protocols: ['good']
            }
          }
        }
      };
      await writeFile(
        path.join(goodPluginDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );
      
      const pluginCode = `
        export default {
          name: 'Good Plugin',
          version: '1.0.0',
          description: 'Test good plugin',
          protocols: ['good'],
          supportedAuthTypes: [],
          dataSchema: {},
          validate(request) {
            return { valid: true };
          },
          async execute() {
            return { status: 200, statusText: 'OK', headers: {}, body: '', duration: 0 };
          }
        };
      `;
      await writeFile(path.join(distDir, 'index.js'), pluginCode);
      
      const runner = new CollectionRunner({
        pluginsDir: testPluginsDir,
        logLevel: LogLevel.DEBUG
      });
      runner.on('console', collectConsoleMessage(logMessages));

      await waitForPluginResolution(runner);
      
      // First: try collection with 'bad' protocol
      const badCollection: Collection = {
        info: { id: 'test', name: 'Test Bad' },
        protocol: 'bad',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Test Request with Bad Protocol',
            data: { url: 'bad://example' }
          }
        ]
      };
      
      // Should fail because bad plugin can't load
      await expect(runner.run(badCollection)).rejects.toThrow();
      
      // Should have logged error for bad plugin
      expect(logMessages.some(msg => msg.includes('Failed') && msg.includes('@apiquest/plugin-bad'))).toBe(true);
      
      // Second: run collection with 'good' protocol
      const goodCollection: Collection = {
        info: { id: 'test', name: 'Test Good' },
        protocol: 'good',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Test Request with Good Protocol',
            data: { url: 'good://example' }
          }
        ]
      };
      
      // Good plugin should still load and work
      const result = await runner.run(goodCollection);
      expect(result.requestResults[0].success).toBe(true);
    });

    test('Handles missing or corrupted entrypoint file', async () => {
      const logMessages: string[] = [];
      
      // Create plugin with missing entrypoint
      const missingPluginDir = path.join(testPluginsDir, 'plugin-missing');
      await mkdir(missingPluginDir, { recursive: true });
      
      const missingPackageJson = {
        name: '@apiquest/plugin-missing',
        main: 'dist/index.js', // File won't exist
        apiquest: {
          type: 'protocol',
          runtime: ['fracture'],
          capabilities: {
            provides: {
              protocols: ['missing']
            }
          }
        }
      };
      await writeFile(
        path.join(missingPluginDir, 'package.json'),
        JSON.stringify(missingPackageJson, null, 2)
      );
      // Don't create dist/index.js - it's missing!
      
      // Create plugin with corrupted (non-JS) entrypoint
      const corruptedPluginDir = path.join(testPluginsDir, 'plugin-corrupted');
      const corruptedDistDir = path.join(corruptedPluginDir, 'dist');
      await mkdir(corruptedDistDir, { recursive: true });
      
      const corruptedPackageJson = {
        name: '@apiquest/plugin-corrupted',
        main: 'dist/index.js',
        apiquest: {
          type: 'protocol',
          runtime: ['fracture'],
          capabilities: {
            provides: {
              protocols: ['corrupted']
            }
          }
        }
      };
      await writeFile(
        path.join(corruptedPluginDir, 'package.json'),
        JSON.stringify(corruptedPackageJson, null, 2)
      );
      
      // Write corrupted file (not valid JavaScript)
      await writeFile(
        path.join(corruptedDistDir, 'index.js'),
        'this is not valid { javascript syntax @#$%'
      );
      
      const runner = new CollectionRunner({
        pluginsDir: testPluginsDir,
        logLevel: LogLevel.DEBUG
      });
      runner.on('console', collectConsoleMessage(logMessages));

      await waitForPluginResolution(runner);
      
      // Try to run collection requiring the corrupted plugin
      const collection: Collection = {
        info: { id: 'test', name: 'Test' },
        protocol: 'corrupted',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Test Request',
            data: { url: 'corrupted://example' }
          }
        ]
      };
      
      // Should fail during plugin loading
      await expect(runner.run(collection)).rejects.toThrow();
      
      // Should log import error
      expect(logMessages.some(msg =>
        msg.includes('Failed') && msg.includes('@apiquest/plugin-corrupted')
      )).toBe(true);
    });
  });

  // ========================================================================
  // Section 22.4: Static vs Dynamic loading compatibility
  // ========================================================================

  describe('22.4 Static vs Dynamic loading compatibility', () => {
    test('Allows static plugin registration without pluginsDir', async () => {
      // Create a simple test plugin
      const testPlugin: IProtocolPlugin = {
        name: 'Static Test Plugin',
        version: '1.0.0',
        description: 'Test static plugin',
        protocols: ['static-test'],
        supportedAuthTypes: [],
        dataSchema: {},
        validate(_request: Request, _options: RuntimeOptions) {
          return { valid: true };
        },
        async execute(request: Request, context, options, emitEvent, logger) {
          return {
            status: 200,
            statusText: 'OK',
            headers: {},
            body: 'Static plugin works',
            duration: 0
          };
        }
      };
      
      // Create runner without pluginsDir
      const runner = new CollectionRunner();
      runner.registerPlugin(testPlugin);
      
      const collection: Collection = {
        info: { id: 'test', name: 'Test' },
        protocol: 'static-test',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Test Request',
            data: { url: 'test://example' }
          }
        ]
      };
      
      const result = await runner.run(collection);
      
      expect(result.requestResults).toHaveLength(1);
      expect(result.requestResults[0].success).toBe(true);
      expect(result.requestResults[0].response?.body).toBe('Static plugin works');
    });

    test('Combines static and dynamic plugins', async () => {
      const consoleSpy = vi.spyOn(console, 'debug');
      
      // Create static plugin
      const staticPlugin: IProtocolPlugin = {
        name: 'Static Plugin',
        version: '1.0.0',
        description: 'Static plugin',
        protocols: ['static'],
        supportedAuthTypes: [],
        dataSchema: {},
        validate(_request: Request, _options: RuntimeOptions) {
          return { valid: true };
        },
        async execute(request: Request, context, options, emitEvent, logger) {
          return {
            status: 200,
            statusText: 'OK',
            headers: {},
            body: 'Static',
            duration: 0
          };
        }
      };
      
      // Create dynamic plugin in directory
      const pluginDir = path.join(testPluginsDir, 'plugin-dynamic');
      const distDir = path.join(pluginDir, 'dist');
      await mkdir(distDir, { recursive: true });
      
      const packageJson = {
        name: '@apiquest/plugin-dynamic',
        main: 'dist/index.js',
        apiquest: {
          type: 'protocol',
          runtime: ['fracture'],
          capabilities: {
            provides: {
              protocols: ['dynamic']
            }
          }
        }
      };
      await writeFile(
        path.join(pluginDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );
      
      const pluginCode = `
        export default {
          name: 'Dynamic Plugin',
          version: '1.0.0',
          description: 'Dynamic plugin',
          protocols: ['dynamic'],
          supportedAuthTypes: [],
          dataSchema: {},
          validate(request) {
            return { valid: true };
          },
          async execute() {
            return { status: 200, statusText: 'OK', headers: {}, body: 'Dynamic', duration: 0 };
          }
        };
      `;
      await writeFile(path.join(distDir, 'index.js'), pluginCode);
      
      // Create runner with both
      const runner = new CollectionRunner({ pluginsDir: testPluginsDir });
      runner.registerPlugin(staticPlugin);

      await waitForPluginResolution(runner);
      
      // Test static plugin
      const staticCollection: Collection = {
        info: { id: 'test', name: 'Test' },
        protocol: 'static',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test',
          data: { url: 'test://example' }
        }]
      };
      
      const staticResult = await runner.run(staticCollection);
      expect(staticResult.requestResults[0].response?.body).toBe('Static');
      
      // Test dynamic plugin
      const dynamicCollection: Collection = {
        info: { id: 'test', name: 'Test' },
        protocol: 'dynamic',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test',
          data: { url: 'test://example' }
        }]
      };
      
      const dynamicResult = await runner.run(dynamicCollection);
      expect(dynamicResult.requestResults[0].response?.body).toBe('Dynamic');
      
      consoleSpy.mockRestore();
    });
  });

  // ========================================================================
  // Section 22.5: PluginResolver unit tests
  // ========================================================================

  describe('22.5 PluginResolver unit tests', () => {
    test('Resolves plugin with valid capabilities metadata', async () => {
      const logMessages: string[] = [];
      
      // Create plugin with all capabilities
      const pluginDir = path.join(testPluginsDir, 'plugin-full');
      await mkdir(pluginDir, { recursive: true });
      
      const packageJson = {
        name: '@apiquest/plugin-full',
        version: '1.2.3',
        main: 'dist/index.js',
        apiquest: {
          type: 'protocol',
          runtime: ['fracture'],
          capabilities: {
            provides: {
              protocols: ['custom', 'custom2']
            }
          }
        }
      };
      await writeFile(
        path.join(pluginDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );
      
      const runner = new CollectionRunner({
        pluginsDir: testPluginsDir,
        logLevel: LogLevel.DEBUG
      });
      runner.on('console', collectConsoleMessage(logMessages));

      await waitForPluginResolution(runner);
      
      // Should log proper version and type
      expect(logMessages.some(msg =>
        msg.includes('Resolved @apiquest/plugin-full v1.2.3 (protocol)')
      )).toBe(true);
    });

    test('Handles version conflicts - newer version wins', async () => {
      const logMessages: string[] = [];
      
      // Create two versions of same plugin
      const pluginV1Dir = path.join(testPluginsDir, 'plugin-versioned-v1');
      const pluginV2Dir = path.join(testPluginsDir, 'plugin-versioned-v2');
      await mkdir(pluginV1Dir, { recursive: true });
      await mkdir(pluginV2Dir, { recursive: true });
      
      const packageJsonV1 = {
        name: '@apiquest/plugin-versioned',
        version: '1.0.0',
        main: 'dist/index.js',
        apiquest: {
          type: 'protocol',
          runtime: ['fracture'],
          capabilities: {
            provides: {
              protocols: ['versioned']
            }
          }
        }
      };
      
      const packageJsonV2 = {
        name: '@apiquest/plugin-versioned',
        version: '2.0.0',
        main: 'dist/index.js',
        apiquest: {
          type: 'protocol',
          runtime: ['fracture'],
          capabilities: {
            provides: {
              protocols: ['versioned']
            }
          }
        }
      };
      
      await writeFile(
        path.join(pluginV1Dir, 'package.json'),
        JSON.stringify(packageJsonV1, null, 2)
      );
      await writeFile(
        path.join(pluginV2Dir, 'package.json'),
        JSON.stringify(packageJsonV2, null, 2)
      );
      
      const runner = new CollectionRunner({
        pluginsDir: testPluginsDir,
        logLevel: LogLevel.DEBUG
      });
      runner.on('console', collectConsoleMessage(logMessages));

      await waitForPluginResolution(runner);
      
      // Should upgrade to v2.0.0
      expect(logMessages.some(msg =>
        msg.includes('Upgrading @apiquest/plugin-versioned from v1.0.0 to v2.0.0') ||
        msg.includes('Skipping @apiquest/plugin-versioned v1.0.0')
      )).toBe(true);
    });

    test('Handles invalid package.json during resolution', async () => {
      const logMessages: string[] = [];
      
      // Create plugin with invalid JSON
      const badPluginDir = path.join(testPluginsDir, 'plugin-bad-json');
      await mkdir(badPluginDir, { recursive: true });
      await writeFile(
        path.join(badPluginDir, 'package.json'),
        '{ invalid json syntax'
      );
      
      // Create valid plugin too
      const goodPluginDir = path.join(testPluginsDir, 'plugin-good-json');
      await mkdir(goodPluginDir, { recursive: true });
      const goodPackageJson = {
        name: '@apiquest/plugin-good-json',
        version: '1.0.0',
        main: 'dist/index.js',
        apiquest: {
          type: 'protocol',
          runtime: ['fracture'],
          capabilities: {
            provides: {
              protocols: ['good']
            }
          }
        }
      };
      await writeFile(
        path.join(goodPluginDir, 'package.json'),
        JSON.stringify(goodPackageJson, null, 2)
      );
      
      const runner = new CollectionRunner({
        pluginsDir: testPluginsDir,
        logLevel: LogLevel.DEBUG
      });
      runner.on('console', collectConsoleMessage(logMessages));

      await waitForPluginResolution(runner);
      
      // Should log error for bad plugin but continue
      expect(logMessages.some(msg =>
        msg.includes('Failed to resolve') && msg.includes('plugin-bad-json')
      )).toBe(true);
      
      // Should still resolve good plugin
      expect(logMessages.some(msg =>
        msg.includes('Resolved @apiquest/plugin-good-json')
      )).toBe(true);
    });

    test('Resolves auth plugin with authTypes in capabilities', async () => {
      const logMessages: string[] = [];
      
      // Create auth plugin with capabilities
      const pluginDir = path.join(testPluginsDir, 'plugin-bearer-auth');
      await mkdir(pluginDir, { recursive: true });
      
      const packageJson = {
        name: '@apiquest/plugin-bearer-auth',
        version: '1.0.0',
        main: 'dist/index.js',
        apiquest: {
          type: 'auth',
          runtime: ['fracture'],
          capabilities: {
            provides: {
              authTypes: ['bearer', 'token']
            }
          }
        }
      };
      await writeFile(
        path.join(pluginDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );
      
      const runner = new CollectionRunner({
        pluginsDir: testPluginsDir,
        logLevel: LogLevel.DEBUG
      });
      runner.on('console', collectConsoleMessage(logMessages));

      await waitForPluginResolution(runner);
      
      // Should resolve as auth type
      expect(logMessages.some(msg =>
        msg.includes('Resolved @apiquest/plugin-bearer-auth v1.0.0 (auth)')
      )).toBe(true);
    });

    test('Resolves value provider plugin', async () => {
      const logMessages: string[] = [];
      
      // Create value provider plugin
      const pluginDir = path.join(testPluginsDir, 'plugin-vault-custom');
      await mkdir(pluginDir, { recursive: true });
      
      const packageJson = {
        name: '@apiquest/plugin-vault-custom',
        version: '1.0.0',
        main: 'dist/index.js',
        apiquest: {
          type: 'value',
          runtime: ['fracture'],
          capabilities: {
            provides: {
              valueTypes: ['vault:custom']
            }
          }
        }
      };
      await writeFile(
        path.join(pluginDir, 'package.json'),
        JSON.stringify(packageJson, null, 2)
      );
      
      const runner = new CollectionRunner({
        pluginsDir: testPluginsDir,
        logLevel: LogLevel.DEBUG
      });
      runner.on('console', collectConsoleMessage(logMessages));

      await waitForPluginResolution(runner);
      
      // Should resolve as value type
      expect(logMessages.some(msg =>
        msg.includes('Resolved @apiquest/plugin-vault-custom v1.0.0 (value)')
      )).toBe(true);
    });
  });
});


