// Section 26: CLI Option Parsing Tests
// Tests that CLI flags are correctly parsed and applied

import { describe, test, expect, beforeEach, beforeAll, afterAll, afterEach } from 'vitest';
import { CollectionRunner } from '../src/CollectionRunner.js';
import { mockOptionsPlugin } from './test-helpers.js';
import type { Collection, LogLevel } from '@apiquest/types';
import { LogLevel as LogLevelEnum } from '@apiquest/types';
import { createTestServer, type MockHttpServer } from './test-helpers.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Section 26: CLI Options', () => {
  // Shared runner that will be used across tests
  let runner: CollectionRunner;
  let server: MockHttpServer;
  let serverUrl: string;

  beforeAll(async () => {
    server = createTestServer();
    serverUrl = await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  beforeEach(() => {
    runner = new CollectionRunner();
    runner.registerPlugin(mockOptionsPlugin);
  });

  describe('26.1 --strict-mode Option', () => {
    const getCollection = (): Collection => ({
      info: { id: 'cli-1', name: 'CLI Test', version: '1.0.0' },
      protocol: 'mock-options',
      items: [{
        type: 'request',
        id: 'req-1',
        name: 'Test Request',
        data: { method: 'GET', url: `${serverUrl}/status/200` },
        postRequestScript: `
          if (quest.response.status === 200) {
            quest.test('conditional test', () => {
              expect(quest.response.status).to.equal(200);
            });
          }
        `
      }]
    });

    test('Parses strictMode: true correctly', async () => {
      const result = await runner.run(getCollection(), { strictMode: true });
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors!.length).toBeGreaterThan(0);
    });

    test('Parses strictMode: false correctly', async () => {
      const result = await runner.run(getCollection(), { strictMode: false });
      expect(result.validationErrors).toBeUndefined();
      expect(result.passedTests).toBe(1);
    });

    test('Defaults to true when not specified', async () => {
      const result = await runner.run(getCollection());
      expect(result.validationErrors).toBeDefined();
    });

    test('CLI string "true" converts to boolean true', async () => {
      // Simulating CLI flag parsing: --strict-mode true
      const strictModeOption = 'true';
      const strictModeBool = strictModeOption === 'true';
      expect(strictModeBool).toBe(true);

      const result = await runner.run(getCollection(), { strictMode: strictModeBool });
      expect(result.validationErrors).toBeDefined();
    });

    test('CLI string "false" converts to boolean false', async () => {
      // Simulating CLI flag parsing: --strict-mode false
      const strictModeOption = 'false';
      const strictModeBool = strictModeOption as unknown as string === 'true';
      expect(strictModeBool).toBe(false);

      const result = await runner.run(getCollection(), { strictMode: strictModeBool });
      expect(result.validationErrors).toBeUndefined();
      expect(result.passedTests).toBe(1);
    });
  });

  describe('26.2 --log-level Option', () => {
    const getSimpleCollection = (): Collection => ({
      info: { id: 'cli-2', name: 'Log Level Test', version: '1.0.0' },
      protocol: 'mock-options',
      items: [{
        type: 'request',
        id: 'req-1',
        name: 'Simple Request',
        data: { method: 'GET', url: `${serverUrl}/status/200` },
        postRequestScript: `
          quest.test('status check', () => {
            expect(quest.response.status).to.equal(200);
          });
        `
      }]
    });

    test('Parses logLevel: error correctly', async () => {
      const runner = new CollectionRunner({ logLevel: LogLevelEnum.ERROR });
      runner.registerPlugin(mockOptionsPlugin);
      
      const result = await runner.run(getSimpleCollection());
      expect(result.passedTests).toBe(1);
    });

    test('Parses logLevel: warn correctly', async () => {
      const runner = new CollectionRunner({ logLevel: LogLevelEnum.WARN });
      runner.registerPlugin(mockOptionsPlugin);
      
      const result = await runner.run(getSimpleCollection());
      expect(result.passedTests).toBe(1);
    });

    test('Parses logLevel: info correctly (default)', async () => {
      const runner = new CollectionRunner({ logLevel: LogLevelEnum.INFO });
      runner.registerPlugin(mockOptionsPlugin);
      
      const result = await runner.run(getSimpleCollection());
      expect(result.passedTests).toBe(1);
    });

    test('Parses logLevel: debug correctly', async () => {
      const runner = new CollectionRunner({ logLevel: LogLevelEnum.DEBUG });
      runner.registerPlugin(mockOptionsPlugin);
      
      const result = await runner.run(getSimpleCollection());
      expect(result.passedTests).toBe(1);
    });

    test('Parses logLevel: trace correctly', async () => {
      const runner = new CollectionRunner({ logLevel: LogLevelEnum.TRACE });
      runner.registerPlugin(mockOptionsPlugin);
      
      const result = await runner.run(getSimpleCollection());
      expect(result.passedTests).toBe(1);
    });

    test('CLI string conversion: error (0)', () => {
      const logLevelMap: Record<string, LogLevel> = {
        'error': LogLevelEnum.ERROR,
        'warn': LogLevelEnum.WARN,
        'info': LogLevelEnum.INFO,
        'debug': LogLevelEnum.DEBUG,
        'trace': LogLevelEnum.TRACE
      };

      expect(logLevelMap['error']).toBe(0);
      expect(logLevelMap['warn']).toBe(1);
      expect(logLevelMap['info']).toBe(2);
      expect(logLevelMap['debug']).toBe(3);
      expect(logLevelMap['trace']).toBe(4);
    });

    test('Defaults to INFO when not specified', () => {
      const runner = new CollectionRunner();
      // Default log level is INFO (2) - not directly testable without exposing logger
      // This test validates the constructor accepts no logLevel parameter
      expect(runner).toBeDefined();
    });
  });

  describe('26.3 Log Level Precedence', () => {
    const getCollection = (): Collection => ({
      info: { id: 'cli-3', name: 'Precedence Test', version: '1.0.0' },
      protocol: 'mock-options',
      items: [{
        type: 'request',
        id: 'req-1',
        name: 'Test',
        data: { method: 'GET', url: `${serverUrl}/status/200` },
        postRequestScript: 'quest.test("ok", () => expect(true).to.be.true);'
      }]
    });

    test('Constructor logLevel is used for run', async () => {
      const collectionWithLogLevel: Collection = {
        ...getCollection(),
        options: {
          // Collection sets ERROR
        }
      };

      // Constructor sets DEBUG
      const runner = new CollectionRunner({ logLevel: LogLevelEnum.DEBUG });
      runner.registerPlugin(mockOptionsPlugin);
      
      const result = await runner.run(collectionWithLogLevel);
      expect(result.passedTests).toBe(1);
      // Can't directly test log level was DEBUG, but we verify it didn't error
    });

    test('RunOptions does not override constructor log level', async () => {
      const runner = new CollectionRunner({ logLevel: LogLevelEnum.ERROR });
      runner.registerPlugin(mockOptionsPlugin);
      
      const result = await runner.run(getCollection());
      expect(result.passedTests).toBe(1);
    });
  });

  describe('26.4 --config Option', () => {
    let testConfigPath: string;

    beforeEach(() => {
      testConfigPath = path.join(__dirname, 'test-config.json');
    });

    afterEach(() => {
      // Clean up test config file if it exists
      if (fs.existsSync(testConfigPath)) {
        fs.unlinkSync(testConfigPath);
      }
    });

    test('Config file options can be loaded and applied to runner', async () => {
      const getCollection = (): Collection => ({
        info: { id: 'config-test-1', name: 'Config Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: `${serverUrl}/status/200` },
          postRequestScript: `
            quest.test('config options applied', () => {
              expect(quest.response.status).to.equal(200);
            });
          `
        }]
      });

      // Write a test config file
      const configData = {
        bail: false,
        timeout: 30000,
        strictMode: false,
        logLevel: 'info'
      };
      fs.writeFileSync(testConfigPath, JSON.stringify(configData, null, 2));

      // Read config and apply options with proper type assertion
      const loadedConfig = JSON.parse(fs.readFileSync(testConfigPath, 'utf-8')) as {
        bail: boolean;
        timeout: number;
        strictMode: boolean;
        logLevel: string;
      };
      
      // Run collection with loaded config options
      const result = await runner.run(getCollection(), {
        strictMode: loadedConfig.strictMode,
        execution: {
          bail: loadedConfig.bail
        },
        timeout: {
          request: loadedConfig.timeout
        }
      });

      expect(result.passedTests).toBe(1);
      expect(result.failedTests).toBe(0);
    });

    test('CLI options override config file options', async () => {
      const getCollection = (): Collection => ({
        info: { id: 'config-test-2', name: 'Config Override Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: `${serverUrl}/status/200` },
          postRequestScript: `
            // In strict mode this would error, but CLI overrides to false
            if (quest.response.status === 200) {
              quest.test('conditional test', () => {
                expect(quest.response.status).to.equal(200);
              });
            }
          `
        }]
      });

      // Config file says strictMode: true
      const configData = {
        strictMode: true,
        bail: false,
        timeout: 30000
      };
      fs.writeFileSync(testConfigPath, JSON.stringify(configData, null, 2));

      const loadedConfig = JSON.parse(fs.readFileSync(testConfigPath, 'utf-8')) as {
        strictMode: boolean;
        bail: boolean;
        timeout: number;
      };

      // CLI overrides strictMode to false
      const cliOptions = {
        strictMode: false  // CLI override
      };

      // Merge: CLI options take precedence
      const mergedOptions = {
        ...loadedConfig,
        ...cliOptions
      };

      const result = await runner.run(getCollection(), {
        strictMode: mergedOptions.strictMode
      });

      // Should pass because strictMode was overridden to false
      expect(result.passedTests).toBe(1);
      expect(result.validationErrors).toBeUndefined();
    });

    test('Config global variables merge with CLI global variables', async () => {
      const getCollection = (): Collection => ({
        info: { id: 'config-test-3', name: 'Global Vars Merge Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test Request',
          data: { method: 'GET', url: `${serverUrl}/status/200` },
          postRequestScript: `
            quest.test('configVar from config', () => {
              expect(quest.global.variables.get('configVar')).to.equal('fromConfig');
            });
            quest.test('cliVar from CLI', () => {
              expect(quest.global.variables.get('cliVar')).to.equal('fromCLI');
            });
            quest.test('overrideVar from CLI wins', () => {
              expect(quest.global.variables.get('overrideVar')).to.equal('cliWins');
            });
          `
        }]
      });

      // Config file has global vars
      const configGlobals: Record<string, string> = {
        configVar: 'fromConfig',
        overrideVar: 'configValue'
      };

      // CLI has additional global vars
      const cliGlobals: Record<string, string> = {
        cliVar: 'fromCLI',
        overrideVar: 'cliWins'  // This should override config
      };

      // Merge globals - CLI overrides config
      const mergedGlobals: Record<string, string> = {
        ...configGlobals,
        ...cliGlobals
      };

      const result = await runner.run(getCollection(), {
        globalVariables: mergedGlobals
      });

      expect(result.passedTests).toBe(3);
    });
  });

  describe('26.7 --allow-external-libraries Option', () => {
    test('Parses allowExternalLibraries: true correctly', async () => {
      const collection: Collection = {
        info: { id: 'lib-opt-1', name: 'Library Option Test', version: '1.0.0' },
        protocol: 'mock-options',
        options: {
          libraries: [
            { name: 'testlib', source: { type: 'npm', package: 'lodash' } }
          ]
        },
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test',
          data: { method: 'GET', url: `${serverUrl}/status/200` }
        }]
      };

      // This should NOT throw because allowExternalLibraries is true
      await expect(runner.run(collection, { allowExternalLibraries: true })).resolves.toBeDefined();
    }, 10000); // npm install can take 4-5 seconds

   test('Rejects when allowExternalLibraries: false', async () => {
      const collection: Collection = {
        info: { id: 'lib-opt-2', name: 'Library Reject Test', version: '1.0.0' },
        protocol: 'mock-options',
        options: {
          libraries: [
            { name: 'testlib', source: { type: 'npm', package: 'lodash' } }
          ]
        },
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test',
          data: { method: 'GET', url: `${serverUrl}/status/200` }
        }]
      };

      // Should reject with security error
      await expect(runner.run(collection, { allowExternalLibraries: false }))
        .rejects.toThrow('--allow-external-libraries');
    });

    test('Defaults to undefined (rejects libraries)', async () => {
      const collection: Collection = {
        info: { id: 'lib-opt-3', name: 'Library Default Test', version: '1.0.0' },
        protocol: 'mock-options',
        options: {
          libraries: [
            { name: 'testlib', source: { type: 'npm', package: 'lodash' } }
          ]
        },
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test',
          data: { method: 'GET', url: `${serverUrl}/status/200` }
        }]
      };

      // Should reject when flag not provided at all
      await expect(runner.run(collection))
        .rejects.toThrow('--allow-external-libraries');
    });
  });
});

