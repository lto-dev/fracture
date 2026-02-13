/**
 * Test Plan Section 31: Request Filtering, Conditions, and Dependencies
 * Tests for --filter, condition evaluation, and dependsOn
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { CollectionRunner } from '../src/CollectionRunner.js';
import type { Collection } from '@apiquest/types';
import { mockOptionsPlugin } from './test-helpers.js';

describe('Section 31: Filtering, Conditions, and Dependencies', () => {
  let runner: CollectionRunner;

  beforeEach(() => {
    runner = new CollectionRunner();
    runner.registerPlugin(mockOptionsPlugin);
  });

  // ========================================================================
  // Section 31.1: Path-based filtering
  // ========================================================================
  
  describe('31.1 Path-based filtering (--filter)', () => {
    test('Filter by exact request path', async () => {
      const collection: Collection = {
        info: { id: 'col-1', name: 'Filter Test' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Request 1',
            data: { url: 'mock://status/200' },
            postRequestScript: 'quest.test("R1", () => expect(true).to.be.true);'
          },
          {
            type: 'request',
            id: 'req-2',
            name: 'Request 2',
            data: { url: 'mock://status/200' },
            postRequestScript: 'quest.test("R2", () => expect(true).to.be.true);'
          }
        ]
      };

      const result = await runner.run(collection, {
        filter: 'request:/Request 1'
      });

      expect(result.requestResults).toHaveLength(1);
      expect(result.requestResults[0].requestId).toBe('req-1');
      expect(result.totalTests).toBe(1);
    });

    test('Filter requests in a specific folder', async () => {
      const collection: Collection = {
        info: { id: 'col-2', name: 'Folder Filter' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Folder A',
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'In A',
                data: { url: 'mock://status/200' },
                postRequestScript: 'quest.test("FA", () => expect(true).to.be.true);'
              }
            ]
          },
          {
            type: 'folder',
            id: 'folder-2',
            name: 'Folder B',
            items: [
              {
                type: 'request',
                id: 'req-2',
                name: 'In B',
                data: { url: 'mock://status/200' },
                postRequestScript: 'quest.test("FB", () => expect(true).to.be.true);'
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection, {
        filter: 'request:/Folder A/'
      });

      expect(result.requestResults).toHaveLength(1);
      expect(result.requestResults[0].requestId).toBe('req-1');
    });
    
    test('Filter matches request or folder paths', async () => {
      const collection: Collection = {
        info: { id: 'col-2b', name: 'Path Types' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Target 1',
            items: [
              {
                type: 'request',
                id: 'req-1-1',
                name: 'Request 1-1',
                data: { url: 'mock://status/200' }
              },
              {
                type: 'request',
                id: 'req-1-2',
                name: 'Request 1-2',
                data: { url: 'mock://status/200' }
              }
            ]
          },
        {
            type: 'folder',
            id: 'folder-2',
            name: 'Target 2',
            items: [
              {
                type: 'request',
                id: 'req-2-1',
                name: 'Request 2-1',
                data: { url: 'mock://status/200' }
              },
              {
                type: 'request',
                id: 'req-2-2',
                name: 'Request 2-2',
                data: { url: 'mock://status/200' }
              }
            ]
          }        ]
      };

      // Both patterns should work (request path contains /Target/)
      const result1 = await runner.run(collection, { filter: 'request:/Target 1/' });
      const result2 = await runner.run(collection, { filter: 'folder:/Target 2' });
      const result3 = await runner.run(collection, { filter: 'request:/Target 1/' });
      const result4 = await runner.run(collection, { filter: 'folder:/Target 2' });
      const result5 = await runner.run(collection, { filter: '/Target 1/' });
      const result6 = await runner.run(collection, { filter: '/Target 2/' });
      const result7 = await runner.run(collection, { filter: '/Target [12]' });
      const result8 = await runner.run(collection, { filter: '/Target [12]/' });
      const result9 = await runner.run(collection, { filter: '/Target \\d/' });

      expect(result1.requestResults).toHaveLength(2);
      expect(result2.requestResults).toHaveLength(2);
      expect(result3.requestResults).toHaveLength(2);
      expect(result4.requestResults).toHaveLength(2);
      expect(result5.requestResults).toHaveLength(2);
      expect(result6.requestResults).toHaveLength(2);
      expect(result7.requestResults).toHaveLength(4);
      expect(result8.requestResults).toHaveLength(4);
      expect(result9.requestResults).toHaveLength(4);
    });
    
    test('Combined filter with alternation (folder OR specific request)', async () => {
      const collection: Collection = {
        info: { id: 'col-2c', name: 'Combined Filter' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Target 1',
            items: [
              {
                type: 'request',
                id: 'req-1-1',
                name: 'Request 1-1',
                data: { url: 'mock://status/200' }
              },
              {
                type: 'request',
                id: 'req-1-2',
                name: 'Request 1-2',
                data: { url: 'mock://status/200' }
              }
            ]
          },
          {
            type: 'folder',
            id: 'folder-2',
            name: 'Target 2',
            items: [
              {
                type: 'request',
                id: 'req-2-1',
                name: 'Request 2-1',
                data: { url: 'mock://status/200' }
              },
              {
                type: 'request',
                id: 'req-2-2',
                name: 'Request 2-2',
                data: { url: 'mock://status/200' }
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection, {
        filter: 'folder:/Target 1|request:/Target 2/Request 2-1'
      });

      expect(result.requestResults).toHaveLength(3);
      expect(result.requestResults[0].requestId).toBe('req-1-1');
      expect(result.requestResults[1].requestId).toBe('req-1-2');
      expect(result.requestResults[2].requestId).toBe('req-2-1');
    });

    test('Filter by request name pattern', async () => {
      const collection: Collection = {
        info: { id: 'col-3', name: 'Name Pattern' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Get User',
            data: { url: 'mock://status/200' }
          },
          {
            type: 'request',
            id: 'req-2',
            name: 'Get Posts',
            data: { url: 'mock://status/200' }
          },
          {
            type: 'request',
            id: 'req-3',
            name: 'Delete User',
            data: { url: 'mock://status/200' }
          }
        ]
      };

      const result = await runner.run(collection, {
        filter: 'request:.*/Get.*'
      });

      expect(result.requestResults).toHaveLength(2);
      expect(result.requestResults[0].requestName).toBe('Get User');
      expect(result.requestResults[1].requestName).toBe('Get Posts');
    });

    test('Empty filter result skips execution', async () => {
      const collection: Collection = {
        info: { id: 'col-4', name: 'No Match' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Request',
            data: { url: 'mock://status/200' }
          }
        ]
      };

      const result = await runner.run(collection, {
        filter: 'request:/NonExistent/'
      });

      expect(result.requestResults).toHaveLength(0);
    });

    test('Folder scripts execute when folder has filtered requests', async () => {
      const collection: Collection = {
        info: { id: 'col-5', name: 'Folder Scripts' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Target',
            folderPreScript: 'quest.global.variables.set("folderPre", "executed");',
            folderPostScript: 'quest.global.variables.set("folderPost", "executed");',
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Request',
                data: { url: 'mock://status/200' },
                postRequestScript: `
                  quest.test("Folder pre ran", () => {
                    expect(quest.global.variables.get("folderPre")).to.equal("executed");
                  });
                `
              }
            ]
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      const result = await runner.run(collection, {
        globalVariables: globalVars,
        filter: 'request:/Target/'
      });

      expect(result.requestResults).toHaveLength(1);
      expect(result.requestResults[0].tests[0].passed).toBe(true);
      expect(globalVars.folderPost).toBe('executed');
    });

    test('Empty folders are pruned after filtering', async () => {
      const collection: Collection = {
        info: { id: 'col-6', name: 'Prune Empty' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-1',
            name: 'Empty Folder',
            folderPreScript: 'quest.global.variables.set("shouldNotRun", "bad");',
            items: [
              {
                type: 'request',
                id: 'req-1',
                name: 'Filtered Out',
                data: { url: 'mock://status/200' }
              }
            ]
          },
          {
            type: 'request',
            id: 'req-2',
            name: 'Keep This',
            data: { url: 'mock://status/200' }
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      const result = await runner.run(collection, {
        globalVariables: globalVars,
        filter: 'request:/Keep This'
      });

      expect(result.requestResults).toHaveLength(1);
      expect(result.requestResults[0].requestId).toBe('req-2');
      expect(globalVars.shouldNotRun).toBeUndefined();
    });
  });

  // ========================================================================
  // Section 31.2: Dependencies (dependsOn)
  // ========================================================================
  
  describe('31.2 Request dependencies (dependsOn)', () => {
    test('Requests with dependencies execute in order', async () => {
      const executionOrder: string[] = [];
      
      const collection: Collection = {
        info: { id: 'col-7', name: 'Dependencies' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-auth',
            name: 'Auth',
            data: { url: 'mock://status/200' },
            postRequestScript: `
              quest.global.variables.set("order", quest.global.variables.get("order") + "A");
              quest.global.variables.set("authToken", "token-123");
            `
          },
          {
            type: 'request',
            id: 'req-user',
            name: 'Get User',
            dependsOn: ['req-auth'],
            data: { url: 'mock://status/200' },
            postRequestScript: `
              quest.global.variables.set("order", quest.global.variables.get("order") + "U");
              quest.test("Auth token exists", () => {
                expect(quest.global.variables.get("authToken")).to.equal("token-123");
              });
            `
          }
        ]
      };

      const globalVars: Record<string, string> = { order: '' };
      const result = await runner.run(collection, { globalVariables: globalVars });

      expect(globalVars.order).toBe('AU');
      expect(result.requestResults).toHaveLength(2);
      expect(result.requestResults[0].requestId).toBe('req-auth');
      expect(result.requestResults[1].requestId).toBe('req-user');
      expect(result.requestResults[1].tests[0].passed).toBe(true);
    });

    test('Multiple dependencies are honored', async () => {
      const collection: Collection = {
        info: { id: 'col-8', name: 'Multi Deps' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-a',
            name: 'A',
            data: { url: 'mock://status/200' },
            postRequestScript: 'quest.global.variables.set("a", "done");'
          },
          {
            type: 'request',
            id: 'req-b',
            name: 'B',
            data: { url: 'mock://status/200' },
            postRequestScript: 'quest.global.variables.set("b", "done");'
          },
          {
            type: 'request',
            id: 'req-c',
            name: 'C',
            dependsOn: ['req-a', 'req-b'],
            data: { url: 'mock://status/200' },
            postRequestScript: `
              quest.test("Both deps ran", () => {
                expect(quest.global.variables.get("a")).to.equal("done");
                expect(quest.global.variables.get("b")).to.equal("done");
              });
            `
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      const result = await runner.run(collection, { globalVariables: globalVars });

      expect(result.requestResults).toHaveLength(3);
      expect(result.requestResults[2].tests[0].passed).toBe(true);
    });

    test('Filter includes dependencies by default', async () => {
      const collection: Collection = {
        info: { id: 'col-9', name: 'Include Deps' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-auth',
            name: 'Auth',
            data: { url: 'mock://status/200' },
            postRequestScript: 'quest.global.variables.set("token", "abc");'
          },
          {
            type: 'request',
            id: 'req-user',
            name: 'Get User',
            dependsOn: ['req-auth'],
            data: { url: 'mock://status/200' },
            postRequestScript: `
              quest.test("Token from dep", () => {
                expect(quest.global.variables.get("token")).to.equal("abc");
              });
            `
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      const result = await runner.run(collection, {
        globalVariables: globalVars,
        filter: 'request:/Get User'
      });

      expect(result.requestResults).toHaveLength(2);
      expect(result.requestResults[0].requestId).toBe('req-auth');
      expect(result.requestResults[1].requestId).toBe('req-user');
      expect(result.requestResults[1].tests[0].passed).toBe(true);
    });

    test('--filter-exclude-deps skips dependencies', async () => {
      const collection: Collection = {
        info: { id: 'col-10', name: 'Exclude Deps' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-auth',
            name: 'Auth',
            data: { url: 'mock://status/200' }
          },
          {
            type: 'request',
            id: 'req-user',
            name: 'Get User',
            dependsOn: ['req-auth'],
            data: { url: 'mock://status/200' }
          }
        ]
      };

      const result = await runner.run(collection, {
        filter: 'request:/Get User',
        excludeDeps: true
      });

      expect(result.requestResults).toHaveLength(1);
      expect(result.requestResults[0].requestId).toBe('req-user');
    });
  });

  // ========================================================================
  // Section 31.3: Conditions (condition)
  // ========================================================================
  
  describe('31.3 Runtime condition evaluation', () => {
    test('Request executes when condition is true', async () => {
      const collection: Collection = {
        info: { id: 'col-11', name: 'Condition True' },
        protocol: 'mock-options',
        variables: { env: 'dev' },
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Dev Only',
            condition: 'quest.variables.get("env") === "dev"',
            data: { url: 'mock://status/200' },
            postRequestScript: 'quest.test("Ran", () => expect(true).to.be.true);'
          }
        ]
      };

      const result = await runner.run(collection);

      expect(result.requestResults).toHaveLength(1);
      expect(result.requestResults[0].success).toBe(true);
      expect(result.totalTests).toBe(1);
    });

    test('Request skipped when condition is false', async () => {
      const collection: Collection = {
        info: { id: 'col-12', name: 'Condition False' },
        protocol: 'mock-options',
        variables: { env: 'prod' },
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Dev Only',
            condition: 'quest.variables.get("env") === "dev"',
            data: { url: 'mock://status/200' },
            postRequestScript: 'quest.test("Should not run", () => expect(true).to.be.true);'
          }
        ]
      };

      const result = await runner.run(collection);

      expect(result.requestResults).toHaveLength(1);
      expect(result.requestResults[0].scriptError).toBe('Skipped by condition');
      expect(result.totalTests).toBe(0);
    });

    test('Condition uses iteration data', async () => {
      const collection: Collection = {
        info: { id: 'col-13', name: 'Iteration Condition' },
        protocol: 'mock-options',
        testData: [
          { env: 'dev', userId: 1 },
          { env: 'prod', userId: 2 }
        ],
        items: [
          {
            type: 'request',
            id: 'req-1',
            name: 'Dev Only',
            condition: 'quest.iteration.data.get("env") === "dev"',
            data: { url: ' mock://status/200' },
            postRequestScript: 'quest.test("Ran in dev", () => expect(quest.iteration.data.get("env")).to.equal("dev"));'
          }
        ]
      };

      const result = await runner.run(collection);

      expect(result.requestResults).toHaveLength(2);
      expect(result.requestResults[0].success).toBe(true);
      expect(result.requestResults[0].tests).toHaveLength(1);
      expect(result.requestResults[1].scriptError).toBe('Skipped by condition');
    });

    test('Condition uses global variables set by previous request', async () => {
      const collection: Collection = {
        info: { id: 'col-14', name: 'Global Condition' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-setup',
            name: 'Setup',
            data: { url: 'mock://status/200' },
            postRequestScript: 'quest.global.variables.set("ready", "true");'
          },
          {
            type: 'request',
            id: 'req-conditional',
            name: 'Conditional',
            condition: 'quest.global.variables.get("ready") === "true"',
            data: { url: 'mock://status/200' },
            postRequestScript: 'quest.test("Executed", () => expect(true).to.be.true);'
          }
        ]
      };

      const result = await runner.run(collection);

      expect(result.requestResults).toHaveLength(2);
      expect(result.requestResults[1].success).toBe(true);
      expect(result.requestResults[1].tests[0].passed).toBe(true);
    });
  });

  // ========================================================================
  // Section 31.4: Combined filtering, conditions, and dependencies
  // ========================================================================
  
  describe('31.4 Combined scenarios', () => {
    test('Filter with dependencies and conditions', async () => {
      const collection: Collection = {
        info: { id: 'col-15', name: 'Complex' },
        protocol: 'mock-options',
        variables: { mode: 'test' },
        items: [
          {
            type: 'request',
            id: 'req-auth',
            name: 'Auth',
            data: { url: 'mock://status/200' },
            postRequestScript: 'quest.global.variables.set("auth", "done");'
          },
          {
            type: 'request',
            id: 'req-setup',
            name: 'Setup',
            condition: 'quest.variables.get("mode") === "test"',
            dependsOn: ['req-auth'],
            data: { url: 'mock://status/200' },
            postRequestScript: 'quest.global.variables.set("setup", "done");'
          },
          {
            type: 'request',
            id: 'req-target',
            name: 'Target',
            dependsOn: ['req-setup'],
            data: { url: 'mock://status/200' },
            postRequestScript: `
              quest.test("All deps ran", () => {
                expect(quest.global.variables.get("auth")).to.equal("done");
                expect(quest.global.variables.get("setup")).to.equal("done");
              });
            `
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      const result = await runner.run(collection, {
        globalVariables: globalVars,
        filter: 'request:/Target'
      });

      expect(result.requestResults).toHaveLength(3);
      expect(result.requestResults[0].requestId).toBe('req-auth');
      expect(result.requestResults[1].requestId).toBe('req-setup');
      expect(result.requestResults[2].requestId).toBe('req-target');
      expect(result.requestResults[2].tests[0].passed).toBe(true);
    });

    test('Nested folder filtering with conditions', async () => {
      const collection: Collection = {
        info: { id: 'col-16', name: 'Nested' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-a',
            name: 'API',
            items: [
              {
                type: 'folder',
                id: 'folder-b',
                name: 'Users',
                folderPreScript: 'quest.global.variables.set("usersFolderPre", "ran");',
                items: [
                  {
                    type: 'request',
                    id: 'req-1',
                    name: 'Get User',
                    data: { url: 'mock://status/200' },
                    postRequestScript: `
                      quest.test("Folder pre ran", () => {
                        expect(quest.global.variables.get("usersFolderPre")).to.equal("ran");
                      });
                    `
                  },
                  {
                    type: 'request',
                    id: 'req-2',
                    name: 'Update User',
                    condition: 'quest.global.variables.get("usersFolderPre") === "ran"',
                    data: { url: 'mock://status/200' },
                    postRequestScript: 'quest.test("Updated", () => expect(true).to.be.true);'
                  }
                ]
              }
            ]
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      const result = await runner.run(collection, {
        globalVariables: globalVars,
        filter: 'request:/API/Users/'
      });

      expect(result.requestResults).toHaveLength(2);
      expect(result.requestResults[0].tests[0].passed).toBe(true);
      expect(result.requestResults[1].tests[0].passed).toBe(true);
    });

    test('Filtering with filter-exclude-deps and condition', async () => {
      const collection: Collection = {
        info: { id: 'col-17', name: 'Filter No Deps' },
        protocol: 'mock-options',
        items: [
          {
            type: 'request',
            id: 'req-target',
            name: 'Target',
            dependsOn: ['req-dep'],
            condition: 'quest.global.variables.get("dep") === "ran"',
            data: { url: 'mock://status/200' },
            postRequestScript: 'quest.test("Should skip", () => expect(false).to.be.true);'
          },
          {
            type: 'request',
            id: 'req-dep',
            name: 'Dependency',
            data: { url: 'mock://status/200' },
            postRequestScript: 'quest.global.variables.set("dep", "ran");'
          }
        ]
      };

      const globalVars: Record<string, string> = {};
      const result = await runner.run(collection, {
        globalVariables: globalVars,
        filter: 'request:/Target',
        excludeDeps: true
      });

      expect(result.requestResults).toHaveLength(1);
      expect(result.requestResults[0].requestId).toBe('req-target');
      expect(result.requestResults[0].scriptError).toBe('Skipped by condition');
    });
  });

  // ========================================================================
  // Section 31.5: Negation filters
  // ========================================================================
  
  describe('31.5 Negation filters', () => {
    test('Exclude specific folder using negation', async () => {
      const collection: Collection = {
        info: { id: 'col-18', name: 'Negation' },
        protocol: 'mock-options',
        items: [
          {
            type: 'folder',
            id: 'folder-slow',
            name: 'Slow Tests',
            items: [
              {
                type: 'request',
                id: 'req-slow',
                name: 'Slow',
                data: { url: 'mock://status/200' }
              }
            ]
          },
          {
            type: 'folder',
            id: 'folder-fast',
            name: 'Fast Tests',
            items: [
              {
                type: 'request',
                id: 'req-fast',
                name: 'Fast',
                data: { url: 'mock://status/200' }
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection, {
        filter: '^(?!.*Slow).*'
      });

      expect(result.requestResults).toHaveLength(1);
      expect(result.requestResults[0].requestId).toBe('req-fast');
    });
  });
});
