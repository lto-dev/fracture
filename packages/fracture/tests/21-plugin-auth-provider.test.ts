import { describe, test, expect, beforeEach } from 'vitest';
import { PluginManager } from '../src/PluginManager.js';
import { Logger } from '../src/Logger.js';
import { LogLevel } from '@apiquest/types';
import { mockAuthPlugin } from './test-helpers.js';
import type { Request, Auth, RuntimeOptions, IAuthPlugin, ValidationError } from '@apiquest/types';

describe('Section 21: Auth Provider Plugin Integration', () => {
  let pluginManager: PluginManager;

  beforeEach(() => {
    pluginManager = new PluginManager();
    pluginManager.registerAuthPlugin(mockAuthPlugin);
  });

  describe('21.1 Plugin Registration', () => {
    test('should register mock auth plugin', () => {
      const plugin = pluginManager.getAuthPlugin('mock-auth');
      expect(plugin).toBeDefined();
      expect(plugin?.authTypes).toContain('mock-auth');
    });

    test('should handle multiple auth types in one plugin', () => {
      const plugin1 = pluginManager.getAuthPlugin('mock-auth');
      const plugin2 = pluginManager.getAuthPlugin('mock-auth1');
      const plugin3 = pluginManager.getAuthPlugin('mock-auth2');
      
      expect(plugin1).toBeDefined();
      expect(plugin2).toBeDefined();
      expect(plugin3).toBeDefined();
      expect(plugin1).toBe(plugin2); // Same plugin handles multiple types
      expect(plugin2).toBe(plugin3);
    });

    test('should list all registered auth plugins', () => {
      const plugins = pluginManager.getAllAuthPlugins();
      expect(plugins.length).toBeGreaterThanOrEqual(1);
      
      const mockAuthPlugin = plugins.find(p => p.name === 'Mock Auth Plugin');
      expect(mockAuthPlugin).toBeDefined();
      expect(mockAuthPlugin?.authTypes).toEqual(['mock-auth', 'mock-auth1', 'mock-auth2', 'mock-auth3']);
    });

    test('should return undefined for unregistered auth type', () => {
      const plugin = pluginManager.getAuthPlugin('unknown-type');
      expect(plugin).toBeUndefined();
    });
  });

  describe('21.2 Request Modification (Apply)', () => {
    test('should apply auth token to request headers', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-1',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'mock://api.example.com/data'
        }
      };

      const auth: Auth = {
        type: 'mock-auth',
        data: {
          token: 'my-secret-token-123'
        }
      };

      const plugin = pluginManager.getAuthPlugin('mock-auth');
      const modifiedRequest = await plugin!.apply!(request, auth, {});

      expect(modifiedRequest.data.headers).toBeDefined();
      const headers = modifiedRequest.data.headers as Record<string, string>;
      expect(headers['X-Mock-Auth']).toBe('my-secret-token-123');
    });

    test('should preserve existing headers when applying auth', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-2',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'mock://api.example.com/data',
          headers: {
            'X-Custom-Header': 'custom-value',
            'Content-Type': 'application/json'
          }
        }
      };

      const auth: Auth = {
        type: 'mock-auth1',
        data: {
          token: 'token-456'
        }
      };

      const plugin = pluginManager.getAuthPlugin('mock-auth1');
      const modifiedRequest = await plugin!.apply!(request, auth, {});

      const headers = modifiedRequest.data.headers as Record<string, string>;
      expect(headers['X-Custom-Header']).toBe('custom-value');
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-Mock-Auth']).toBe('token-456');
    });

    test('should handle different auth types with same plugin', async () => {
      const auth1: Auth = { type: 'mock-auth', data: { token: 'token-a' } };
      const auth2: Auth = { type: 'mock-auth2', data: { token: 'token-b' } };
      const auth3: Auth = { type: 'mock-auth3', data: { token: 'token-c' } };

      const plugin = pluginManager.getAuthPlugin('mock-auth');
      
      // Create separate request objects to avoid mutation issues
      const request1: Request = {
        type: 'request',
        id: 'test-3a',
        name: 'Test Request 1',
        data: { method: 'POST', url: 'mock://api.example.com/data' }
      };
      
      const request2: Request = {
        type: 'request',
        id: 'test-3b',
        name: 'Test Request 2',
        data: { method: 'POST', url: 'mock://api.example.com/data' }
      };
      
      const request3: Request = {
        type: 'request',
        id: 'test-3c',
        name: 'Test Request 3',
        data: { method: 'POST', url: 'mock://api.example.com/data' }
      };
      
      const result1 = await plugin!.apply!(request1, auth1, {});
      const result2 = await plugin!.apply!(request2, auth2, {});
      const result3 = await plugin!.apply!(request3, auth3, {});

      const headers1 = result1.data.headers as Record<string, string>;
      const headers2 = result2.data.headers as Record<string, string>;
      const headers3 = result3.data.headers as Record<string, string>;
      expect(headers1['X-Mock-Auth']).toBe('token-a');
      expect(headers2['X-Mock-Auth']).toBe('token-b');
      expect(headers3['X-Mock-Auth']).toBe('token-c');
    });

    test('should create headers object if not present', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-4',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'mock://api.example.com/data'
          // No headers property
        }
      };

      const auth: Auth = {
        type: 'mock-auth',
        data: { token: 'new-token' }
      };

      const plugin = pluginManager.getAuthPlugin('mock-auth');
      const modifiedRequest = await plugin!.apply!(request, auth, {});

      expect(modifiedRequest.data.headers).toBeDefined();
      const headers = modifiedRequest.data.headers as Record<string, string>;
      expect(headers['X-Mock-Auth']).toBe('new-token');
    });
  });

  describe('21.3 Validation', () => {
    test('should validate auth with valid token', () => {
      const auth: Auth = {
        type: 'mock-auth',
        data: { token: 'valid-token' }
      };

      const plugin = pluginManager.getAuthPlugin('mock-auth');
      const result = plugin!.validate(auth, {});

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    test('should fail validation when token is missing', () => {
      const auth: Auth = {
        type: 'mock-auth',
        data: {}
      };

      const plugin = pluginManager.getAuthPlugin('mock-auth');
      const result = plugin!.validate(auth, {});

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].message).toContain('token');
      expect(result.errors![0].source).toBe('auth');
    });

    test('should fail validation when data is undefined', () => {
      const auth: Auth = {
        type: 'mock-auth1',
        data: undefined
      };

      const plugin = pluginManager.getAuthPlugin('mock-auth1');
      const result = plugin!.validate(auth, {});

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    test('should fail validation with empty token string', () => {
      const auth: Auth = {
        type: 'mock-auth2',
        data: { token: '' }
      };

      const plugin = pluginManager.getAuthPlugin('mock-auth2');
      const result = plugin!.validate(auth, {});

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    test('should have dataSchema defined', () => {
      const plugin = pluginManager.getAuthPlugin('mock-auth');
      expect(plugin?.dataSchema).toBeDefined();
    });
  });

  describe('21.4 Error Handling in Apply', () => {
    test('should handle errors thrown during apply', async () => {
      // Create a plugin that throws an error
      const errorPlugin: IAuthPlugin = {
        name: 'Error Auth Plugin',
        version: '1.0.0',
        description: 'Throws error in apply',
        authTypes: ['error-auth'],
        protocols: ['mock-options'],
        dataSchema: {},
        
        async apply(request: Request, auth: Auth): Promise<Request> {
          throw new Error('Auth plugin error during apply');
        },
        
        validate(auth: Auth): { valid: true } | { valid: false; errors: ValidationError[] } {
          return { valid: true };
        }
      };

      pluginManager.registerAuthPlugin(errorPlugin);

      const request: Request = {
        type: 'request',
        id: 'test-5',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'mock://api.example.com/data'
        }
      };

      const auth: Auth = {
        type: 'error-auth',
        data: { token: 'token' }
      };

      const plugin = pluginManager.getAuthPlugin('error-auth');
      await expect(plugin!.apply!(request, auth, {})).rejects.toThrow('Auth plugin error during apply');
    });

    test('should handle async errors in apply', async () => {
      const asyncErrorPlugin: IAuthPlugin = {
        name: 'Async Error Auth Plugin',
        version: '1.0.0',
        description: 'Throws async error in apply',
        authTypes: ['async-error-auth'],
        protocols: ['mock-options'],
        dataSchema: {},
        
        async apply(request: Request, auth: Auth): Promise<Request> {
          await new Promise(resolve => setTimeout(resolve, 10));
          throw new Error('Async auth error');
        },
        
        validate(auth: Auth): { valid: true } | { valid: false; errors: ValidationError[] } {
          return { valid: true };
        }
      };

      pluginManager.registerAuthPlugin(asyncErrorPlugin);

      const request: Request = {
        type: 'request',
        id: 'test-6',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'mock://api.example.com/data'
        }
      };

      const auth: Auth = {
        type: 'async-error-auth',
        data: { token: 'token' }
      };

      const plugin = pluginManager.getAuthPlugin('async-error-auth');
      await expect(plugin!.apply!(request, auth, {})).rejects.toThrow('Async auth error');
    });

    test('should handle validation errors in validate method', () => {
      const validationErrorPlugin: IAuthPlugin = {
        name: 'Validation Error Plugin',
        version: '1.0.0',
        description: 'Returns validation errors',
        authTypes: ['validation-error-auth'],
        protocols: ['mock-options'],
        dataSchema: {
          type: 'object',
          properties: {
            requiredField: { type: 'string' }
          },
          required: ['requiredField']
        },
        
        async apply(request: Request, auth: Auth): Promise<Request> {
          return request;
        },
        
        validate(auth: Auth): { valid: true } | { valid: false; errors: ValidationError[] } {
          const errors: ValidationError[] = [];
          const data = auth.data as { requiredField?: string } | undefined;
          const requiredField = data?.requiredField ?? '';
          
          if (requiredField === '') {
            errors.push({
              message: 'requiredField is required',
              location: 'auth.data.requiredField',
              source: 'auth'
            });
          }
          
          if (errors.length > 0) {
            return { valid: false, errors };
          }
          
          return { valid: true };
        }
      };

      pluginManager.registerAuthPlugin(validationErrorPlugin);

      const auth: Auth = {
        type: 'validation-error-auth',
        data: {}
      };

      const plugin = pluginManager.getAuthPlugin('validation-error-auth');
      const result = plugin!.validate(auth, {});

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors![0].message).toBe('requiredField is required');
      expect(result.errors![0].location).toBe('auth.data.requiredField');
      expect(result.errors![0].source).toBe('auth');
    });
  });

  describe('21.5 Protocol Compatibility', () => {
    test('should restrict auth plugins to supported protocols', () => {
      const plugin = pluginManager.getAuthPlugin('mock-auth');
      expect(plugin?.protocols).toBeDefined();
      expect(plugin?.protocols).toContain('mock-options');
      expect(plugin?.protocols).toContain('http');
    });

    test('should allow auth plugin for multiple protocols', () => {
      const multiProtocolPlugin: IAuthPlugin = {
        name: 'Multi Protocol Auth',
        version: '1.0.0',
        description: 'Works with multiple protocols',
        authTypes: ['multi-auth'],
        protocols: ['http', 'https', 'grpc', 'mock-options'],
        dataSchema: {},
        
        async apply(request: Request, auth: Auth): Promise<Request> {
          request.data.headers = request.data.headers ?? {};
          (request.data.headers as Record<string, string>)['Authorization'] = 'multi';
          return request;
        },
        
        validate(auth: Auth): { valid: true } | { valid: false; errors: ValidationError[] } {
          return { valid: true };
        }
      };

      pluginManager.registerAuthPlugin(multiProtocolPlugin);
      const plugin = pluginManager.getAuthPlugin('multi-auth');
      
      expect(plugin?.protocols).toHaveLength(4);
      expect(plugin?.protocols).toContain('http');
      expect(plugin?.protocols).toContain('grpc');
    });
  });

  describe('21.6 Missing Auth Plugin', () => {
    test('should handle missing auth plugin gracefully', () => {
      const plugin = pluginManager.getAuthPlugin('non-existent-auth');
      expect(plugin).toBeUndefined();
    });

    test('should not apply auth when plugin is not found', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-7',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'mock://api.example.com/data'
        }
      };

      const auth: Auth = {
        type: 'non-existent-auth',
        data: { token: 'token' }
      };

      const plugin = pluginManager.getAuthPlugin('non-existent-auth');
      expect(plugin).toBeUndefined();
      
      // Without a plugin, request should remain unmodified
      // This test verifies PluginManager behavior, not apply behavior
    });
  });

  describe('21.7 Auth Plugin Metadata', () => {
    test('should expose plugin name and version', () => {
      const plugin = pluginManager.getAuthPlugin('mock-auth');
      expect(plugin?.name).toBe('Mock Auth Plugin');
      expect(plugin?.version).toBe('1.0.0');
    });

    test('should expose plugin description', () => {
      const plugin = pluginManager.getAuthPlugin('mock-auth');
      expect(plugin?.description).toBe('Mock auth for testing fracture orchestration');
    });

    test('should expose supported auth types', () => {
      const plugin = pluginManager.getAuthPlugin('mock-auth');
      expect(plugin?.authTypes).toBeDefined();
      expect(plugin?.authTypes).toHaveLength(4);
    });
  });

  describe('21.8 Schema Validation', () => {
    test('should validate against dataSchema', () => {
      const plugin = pluginManager.getAuthPlugin('mock-auth');
      expect(plugin?.dataSchema).toBeDefined();
      
      // Mock auth plugin dataSchema should be an object
      expect(typeof plugin?.dataSchema).toBe('object');
    });

    test('should handle auth with extra properties', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-8',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'mock://api.example.com/data'
        }
      };

      const auth: Auth = {
        type: 'mock-auth',
        data: {
          token: 'valid-token',
          extraProperty: 'should-be-ignored',
          anotherExtra: 123
        }
      };

      const plugin = pluginManager.getAuthPlugin('mock-auth');
      const modifiedRequest = await plugin!.apply!(request, auth, {});

      const headers = modifiedRequest.data.headers as Record<string, string>;
      expect(headers['X-Mock-Auth']).toBe('valid-token');
    });

    test('should handle invalid property types gracefully', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-9',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'mock://api.example.com/data'
        }
      };

      const auth: Auth = {
        type: 'mock-auth',
        data: {
          token: 12345 as unknown as string  // Wrong type but plugin should handle it
        }
      };

      const plugin = pluginManager.getAuthPlugin('mock-auth');
      const modifiedRequest = await plugin!.apply!(request, auth, {});

      const headers = modifiedRequest.data.headers as Record<string, string>;
      expect(headers['X-Mock-Auth']).toBe(12345);  // Plugin doesn't type-check
    });
  });

  describe('21.9 Edge Cases', () => {
    test('should handle empty auth data object', () => {
      const auth: Auth = {
        type: 'mock-auth',
        data: {}
      };

      const plugin = pluginManager.getAuthPlugin('mock-auth');
      const result = plugin!.validate(auth, {});

      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    test('should handle auth with whitespace-only token', () => {
      const auth: Auth = {
        type: 'mock-auth',
        data: { token: '   ' }
      };

      const plugin = pluginManager.getAuthPlugin('mock-auth');
      const result = plugin!.validate(auth, {});

      // mockAuthPlugin checks Boolean(token), so whitespace passes
      expect(result.valid).toBe(true);
    });

    test('should handle numeric token values', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-10',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'mock://api.example.com/data'
        }
      };

      const auth: Auth = {
        type: 'mock-auth',
        data: { token: 999 as unknown as string }
      };

      const plugin = pluginManager.getAuthPlugin('mock-auth');
      const modifiedRequest = await plugin!.apply!(request, auth, {});

      const headers = modifiedRequest.data.headers as Record<string, string>;
      expect(headers['X-Mock-Auth']).toBe(999);
    });
  });

  describe('21.10 Collection-Level Integration', () => {
    test('should apply auth in collection context with multiple requests', async () => {
      const { CollectionRunner } = await import('../src/CollectionRunner.js');
      const { mockOptionsPlugin } = await import('./test-helpers.js');
      
      const runner = new CollectionRunner();
      runner.registerPlugin(mockOptionsPlugin);
      runner.registerAuthPlugin(mockAuthPlugin);

      const collection = {
        info: { id: 'col-auth-1', name: 'Auth Collection', version: '1.0.0' },
        protocol: 'mock-options',
        auth: { type: 'mock-auth', data: { token: 'collection-token' } },
        items: [
          {
            type: 'request' as const,
            id: 'req-1',
            name: 'Request 1',
            data: { method: 'GET', url: 'mock://api.example.com/endpoint1' },
            postRequestScript: `
              quest.test('Auth header applied', () => {
                expect(quest.request.headers.get('X-Mock-Auth')).toBe('collection-token');
              });
            `
          },
          {
            type: 'request' as const,
            id: 'req-2',
            name: 'Request 2',
            data: { method: 'POST', url: 'mock://api.example.com/endpoint2' },
            postRequestScript: `
              quest.test('Auth header applied to POST', () => {
                expect(quest.request.headers.get('X-Mock-Auth')).toBe('collection-token');
              });
            `
          },
          {
            type: 'request' as const,
            id: 'req-3',
            name: 'Request 3',
            data: { method: 'GET', url: 'mock://api.example.com/endpoint3' },
            postRequestScript: `
              quest.test('Auth persists across requests', () => {
                expect(quest.request.headers.get('X-Mock-Auth')).toBe('collection-token');
              });
            `
          }
        ]
      };

      const result = await runner.run(collection);
      
      expect(result.requestResults).toHaveLength(3);
      expect(result.totalTests).toBe(3);
      expect(result.passedTests).toBe(3);
      expect(result.failedTests).toBe(0);
    });

    test('should handle auth inheritance through folder hierarchy', async () => {
      const { CollectionRunner } = await import('../src/CollectionRunner.js');
      const { mockOptionsPlugin } = await import('./test-helpers.js');
      
      const runner = new CollectionRunner();
      runner.registerPlugin(mockOptionsPlugin);
      runner.registerAuthPlugin(mockAuthPlugin);

      const collection = {
        info: { id: 'col-auth-2', name: 'Auth Inheritance', version: '1.0.0' },
        protocol: 'mock-options',
        auth: { type: 'mock-auth', data: { token: 'collection-token' } },
        items: [
          {
            type: 'folder' as const,
            id: 'folder-1',
            name: 'Folder 1',
            items: [
              {
                type: 'request' as const,
                id: 'req-2',
                name: 'Request 2 in Folder 1',
                data: { method: 'GET', url: 'mock://api.example.com/test' },
                postRequestScript: `
                  quest.test('Inherits collection auth', () => {
                    expect(quest.request.headers.get('X-Mock-Auth')).toBe('collection-token');
                  });
                `
              },
              {
                type: 'folder' as const,
                id: 'folder-2',
                name: 'Folder 2',
                items: [
                  {
                    type: 'request' as const,
                    id: 'req-3',
                    name: 'Request 3 in Folder 2',
                    data: { method: 'GET', url: 'mock://api.example.com/test' },
                    postRequestScript: `
                      quest.test('Inherits collection auth through nested folders', () => {
                        expect(quest.request.headers.get('X-Mock-Auth')).toBe('collection-token');
                      });
                    `
                  }
                ]
              },
              {
                type: 'folder' as const,
                id: 'folder-3',
                name: 'Folder 3',
                auth: { type: 'mock-auth1', data: { token: 'folder3-token' } },
                items: [
                  {
                    type: 'request' as const,
                    id: 'req-4',
                    name: 'Request 4 in Folder 3',
                    data: { method: 'GET', url: 'mock://api.example.com/test' },
                    postRequestScript: `
                      quest.test('Inherits folder auth', () => {
                        expect(quest.request.headers.get('X-Mock-Auth')).toBe('folder3-token');
                      });
                    `
                  },
                  {
                    type: 'request' as const,
                    id: 'req-5',
                    name: 'Request 5 in Folder 3',
                    data: { method: 'GET', url: 'mock://api.example.com/test' },
                    auth: { type: 'mock-auth2', data: { token: 'request5-token' } },
                    postRequestScript: `
                      quest.test('Overrides folder auth with request auth', () => {
                        expect(quest.request.headers.get('X-Mock-Auth')).toBe('request5-token');
                      });
                    `
                  }
                ]
              }
            ]
          }
        ]
      };

      const result = await runner.run(collection);

      expect(result.requestResults).toHaveLength(4);
      expect(result.totalTests).toBe(4);
      expect(result.passedTests).toBe(4);
      expect(result.failedTests).toBe(0);
    });

    test('should validate auth before executing collection', async () => {
      const { CollectionRunner } = await import('../src/CollectionRunner.js');
      const { mockOptionsPlugin } = await import('./test-helpers.js');
      
      const runner = new CollectionRunner();
      runner.registerPlugin(mockOptionsPlugin);
      runner.registerAuthPlugin(mockAuthPlugin);

      const collection = {
        info: { id: 'col-auth-3', name: 'Invalid Auth', version: '1.0.0' },
        protocol: 'mock-options',
        auth: { type: 'mock-auth', data: {} },  // Missing token
        items: [
          {
            type: 'request' as const,
            id: 'req-1',
            name: 'Request',
            data: { method: 'GET', url: 'mock://api.example.com/test' }
          }
        ]
      };

      const result = await runner.run(collection);
      
      expect(result.validationErrors).toBeDefined();
      expect(result.validationErrors!.length).toBeGreaterThanOrEqual(1);
      const authError = result.validationErrors!.find(e => e.source === 'auth');
      expect(authError).toBeDefined();
      expect(authError?.message).toContain('token');
      expect(result.requestResults).toHaveLength(0);  // Should not execute any requests
    });
  });
});

