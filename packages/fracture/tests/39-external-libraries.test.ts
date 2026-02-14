// Section 39: External Libraries Tests
// Tests that external libraries can be loaded and used in scripts

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { CollectionRunner } from '../src/CollectionRunner.js';
import type { Collection } from '@apiquest/types';
import { mockOptionsPlugin } from './test-helpers.js';
import { writeFile, mkdir, rm, mkdtemp } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { isNullOrEmpty } from '../src/utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Section 39: External Libraries', () => {
  let runner: CollectionRunner;
  let testTempDir: string;
  const testTempDirPrefix = path.join(__dirname, 'test-libs-temp-');
  
  beforeEach(async () => {
    runner = new CollectionRunner();
    runner.registerPlugin(mockOptionsPlugin);
    testTempDir = await mkdtemp(testTempDirPrefix);
  });
  
  afterEach(async () => {
    if (isNullOrEmpty(testTempDir)) {
      return;
    }
    
    try {
      await rm(testTempDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });
  
  describe('39.1 Security Guard', () => {
    test('should reject collection with external libraries when flag not enabled', async () => {
      const collection: Collection = {
        info: { id: 'lib-test-1', name: 'Library Test', version: '1.0.0' },
        protocol: 'mock-options',
        options: {
          libraries: [
            {
              name: 'testlib',
              source: { type: 'npm', package: 'lodash' },
              version: '^4.17.21'
            }
          ]
        },
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test',
          data: { method: 'GET', url: 'http://example.com' }
        }]
      };
      
      await expect(runner.run(collection, { 
        allowExternalLibraries: false 
      })).rejects.toThrow('Collection defines external libraries but --allow-external-libraries flag is not enabled');
    });
    
    test('should reject collection with external libraries when flag missing', async () => {
      const collection: Collection = {
        info: { id: 'lib-test-2', name: 'Library Test', version: '1.0.0' },
        protocol: 'mock-options',
        options: {
          libraries: [
            {
              name: 'testlib',
              source: { type: 'npm', package: 'lodash' }
            }
          ]
        },
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test',
          data: { method: 'GET', url: 'http://example.com' }
        }]
      };
      
      // Not passing allowExternalLibraries at all
      await expect(runner.run(collection)).rejects.toThrow('Collection defines external libraries but --allow-external-libraries flag is not enabled');
    });
    
    test('should allow collection without external libraries even without flag', async () => {
      const collection: Collection = {
        info: { id: 'lib-test-3', name: 'No Library Test', version: '1.0.0' },
        protocol: 'mock-options',
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test',
          data: { method: 'GET', url: 'http://example.com' }
        }]
      };
      
      const result = await runner.run(collection);
      expect(result).toBeDefined();
      expect(result.totalTests).toBeGreaterThanOrEqual(0);
    });
  });
  
  describe('39.2 File Library Loading', () => {
    test('should load library from file source', async () => {
      // Create a simple test library file
      const libPath = path.join(testTempDir, 'testlib.js');
      await writeFile(libPath, `
        module.exports = {
          add: (a, b) => a + b,
          multiply: (a, b) => a * b
        };
      `);
      
      const collection: Collection = {
        info: { id: 'lib-file-1', name: 'File Library Test', version: '1.0.0' },
        protocol: 'mock-options',
        options: {
          libraries: [
            {
              name: 'testlib',
              source: { type: 'file', path: libPath }
            }
          ]
        },
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test',
          data: { method: 'GET', url: 'http://example.com' },
          postRequestScript: `
            const lib = require('testlib');
            quest.test('Library loaded', () => {
              expect(lib).to.exist;
              expect(lib.add).to.be.a('function');
            });
            quest.test('Library function works', () => {
              expect(lib.add(2, 3)).to.equal(5);
              expect(lib.multiply(4, 5)).to.equal(20);
            });
          `
        }]
      };
      
      const result = await runner.run(collection, { 
        allowExternalLibraries: true 
      });
      
      expect(result.passedTests).toBe(2);
      expect(result.failedTests).toBe(0);
    });
    
    test('should fail when file library does not exist', async () => {
      const collection: Collection = {
        info: { id: 'lib-file-2', name: 'Missing File Test', version: '1.0.0' },
        protocol: 'mock-options',
        options: {
          libraries: [
            {
              name: 'missing',
              source: { type: 'file', path: '/nonexistent/path/lib.js' }
            }
          ]
        },
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test',
          data: { method: 'GET', url: 'http://example.com' }
        }]
      };
      
      await expect(runner.run(collection, { 
        allowExternalLibraries: true 
      })).rejects.toThrow('Failed to load external library');
    });
  });
  
  describe('39.3 Built-in Library Priority', () => {
    test('should use built-in libraries before external libraries with same name', async () => {
      // Create a fake lodash that would return wrong values
      const fakeLodashPath = path.join(testTempDir, 'fakelodash.js');
      await writeFile(fakeLodashPath, `
        module.exports = {
          chunk: () => 'FAKE'
        };
      `);
      
      const collection: Collection = {
        info: { id: 'lib-priority-1', name: 'Priority Test', version: '1.0.0' },
        protocol: 'mock-options',
        options: {
          libraries: [
            {
              name: 'lodash',
              source: { type: 'file', path: fakeLodashPath }
            }
          ]
        },
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test',
          data: { method: 'GET', url: 'http://example.com' },
          postRequestScript: `
            const _ = require('lodash');
            quest.test('Uses built-in lodash, not external', () => {
              // Built-in lodash should work correctly
              const result = _.chunk([1, 2, 3, 4], 2);
              expect(result).to.deep.equal([[1, 2], [3, 4]]);
              // Should NOT be the fake version
              expect(result).not.to.equal('FAKE');
            });
          `
        }]
      };
      
      const result = await runner.run(collection, { 
        allowExternalLibraries: true 
      });
      
      expect(result.passedTests).toBe(1);
      expect(result.failedTests).toBe(0);
    });
    
    test('should use external library when name does not conflict with built-ins', async () => {
      const customLibPath = path.join(testTempDir, 'custom.js');
      await writeFile(customLibPath, `
        module.exports = {
          greet: (name) => 'Hello, ' + name + '!'
        };
      `);
      
      const collection: Collection = {
        info: { id: 'lib-custom-1', name: 'Custom Library Test', version: '1.0.0' },
        protocol: 'mock-options',
        options: {
          libraries: [
            {
              name: 'custom',
              source: { type: 'file', path: customLibPath }
            }
          ]
        },
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test',
          data: { method: 'GET', url: 'http://example.com' },
          postRequestScript: `
            const custom = require('custom');
            quest.test('Custom library works', () => {
              expect(custom.greet('World')).to.equal('Hello, World!');
            });
          `
        }]
      };
      
      const result = await runner.run(collection, { 
        allowExternalLibraries: true 
      });
      
      expect(result.passedTests).toBe(1);
    });
  });
  
  describe('39.4 Error Messages', () => {
    test('should provide clear error message when allowExternalLibraries is false', async () => {
      const collection: Collection = {
        info: { id: 'lib-error-1', name: 'Error Test', version: '1.0.0' },
        protocol: 'mock-options',
        options: {
          libraries: [
            { name: 'lib1', source: { type: 'npm', package: 'test-package' } }
          ]
        },
        items: [{
          type: 'request',
          id: 'req-1',
          name: 'Test',
          data: { method: 'GET', url: 'http://example.com' }
        }]
      };
      
      try {
        await runner.run(collection, { allowExternalLibraries: false });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain('--allow-external-libraries');
        expect((error as Error).message).toContain('security risks');
      }
    });
  });
});
