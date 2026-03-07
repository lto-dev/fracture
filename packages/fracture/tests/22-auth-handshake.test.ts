import { describe, test, expect, beforeEach, vi } from 'vitest';
import { PluginManager } from '../src/PluginManager.js';
import type {
  Request,
  Auth,
  ExecutionContext,
  IAuthPlugin,
  IProtocolPlugin,
  AuthExecutor,
  ProtocolResponse
} from '@apiquest/types';
import { mockOptionsPlugin, mockAuthPlugin, mockNegotiatePlugin, FakeJar } from './test-helpers.js';

// ============================================================================
// Helpers
// ============================================================================

function makeRequest(overrides: Partial<Request> = {}): Request {
  return {
    type: 'request',
    id: 'test-req',
    name: 'Test Request',
    data: { method: 'GET', url: 'mock://api.example.com/data' },
    ...overrides
  };
}

function okResponse(): ProtocolResponse {
  return {
    data: { status: 200, statusText: 'OK', body: '{}', headers: {} },
    summary: { outcome: 'success', code: 200, label: 'OK', duration: 10 }
  };
}

function makeContext(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  return {
    collectionInfo: { id: 'col-1', name: 'Test Collection' },
    protocol: 'mock-options',
    collectionVariables: {},
    globalVariables: {},
    scope: { level: 'collection', id: 'col-1', vars: {} },
    iterationCurrent: 0,
    iterationCount: 1,
    iterationSource: 'none',
    executionHistory: [],
    options: {},
    cookieJar: FakeJar,
    protocolPlugin: mockOptionsPlugin,
    abortSignal: new AbortController().signal,
    ...overrides
  };
}

/**
 * Minimal protocol plugin that accepts any auth type.
 * Used in tests that need custom auth type names without fighting supportedAuthTypes validation.
 */
function makeOpenProtocolPlugin(extraAuthTypes: string[] = []): IProtocolPlugin {
  return {
    ...mockOptionsPlugin,
    protocols: ['open-protocol'],
    name: 'Open Protocol Plugin',
    supportedAuthTypes: [...mockOptionsPlugin.supportedAuthTypes, ...extraAuthTypes],
    strictAuthList: false
  };
}

// ============================================================================
// Section 22: Auth Handshake Architecture
// ============================================================================

describe('Section 22: Auth Handshake Architecture', () => {
  let pluginManager: PluginManager;

  beforeEach(() => {
    pluginManager = new PluginManager();
    pluginManager.registerPlugin(mockOptionsPlugin);
    pluginManager.registerAuthPlugin(mockAuthPlugin);
    pluginManager.registerAuthPlugin(mockNegotiatePlugin);
  });

  // --------------------------------------------------------------------------
  // 22.1 PluginManager dispatch — negotiate() takes precedence
  // --------------------------------------------------------------------------

  describe('22.1 Dispatch: negotiate() is called when present', () => {
    test('should call negotiate() when auth plugin has negotiate() (using mock-negotiate)', async () => {
      // mockNegotiatePlugin has negotiate() — after execution context.currentRequest has X-Mock-Negotiate set
      const request = makeRequest({ auth: { type: 'mock-negotiate', data: { token: 'test-token' } } });
      const context = makeContext();
      await pluginManager.execute('mock-options', request, context, {});

      const currentReq = context.currentRequest;
      expect(currentReq).toBeDefined();
      const headers = currentReq!.data.headers as Record<string, string>;
      expect(headers['X-Mock-Negotiate']).toBe('test-token');
    });

    test('should pass AuthExecutor to negotiate()', async () => {
      let capturedExecutor: AuthExecutor | undefined;

      // Override the registered mockNegotiatePlugin with a spy version
      const pm = new PluginManager();
      pm.registerPlugin(mockOptionsPlugin);

      const capturePlugin: IAuthPlugin = {
        name: 'Capture Plugin',
        version: '1.0.0',
        description: 'Captures the executor',
        authTypes: ['mock-negotiate'],
        protocols: ['mock-options'],
        dataSchema: {},
        async negotiate(req, auth, options, executor) {
          capturedExecutor = executor;
          return req;
        },
        validate() { return { valid: true }; }
      };

      pm.registerAuthPlugin(capturePlugin);

      const request = makeRequest({ auth: { type: 'mock-negotiate', data: { token: 'x' } } });
      await pm.execute('mock-options', request, makeContext(), {});

      expect(capturedExecutor).toBeDefined();
      expect(typeof capturedExecutor!.send).toBe('function');
    });

    test('should not call apply() when auth plugin only has negotiate()', async () => {
      // mockNegotiatePlugin has no apply() — verify neither apply nor a fallback modifies the wrong header
      const request = makeRequest({ auth: { type: 'mock-negotiate', data: { token: 'negotiate-test' } } });
      const context = makeContext();
      await pluginManager.execute('mock-options', request, context, {});

      const headers = context.currentRequest?.data.headers as Record<string, string> | undefined;
      // X-Mock-Negotiate set by negotiate() — not X-Mock-Auth set by apply()
      expect(headers?.['X-Mock-Negotiate']).toBe('negotiate-test');
      expect(headers?.['X-Mock-Auth']).toBeUndefined();
    });

    test('should call negotiate() and NOT apply() when plugin has both', async () => {
      const pm = new PluginManager();
      pm.registerPlugin(mockOptionsPlugin);

      const applySpy = vi.fn().mockImplementation(async (req: Request) => req);
      const negotiateSpy = vi.fn().mockImplementation(async (req: Request) => req);

      const dualPlugin: IAuthPlugin = {
        name: 'Dual Method Plugin',
        version: '1.0.0',
        description: 'Has both apply and negotiate',
        authTypes: ['mock-negotiate'],
        protocols: ['mock-options'],
        dataSchema: {},
        apply: applySpy,
        negotiate: negotiateSpy,
        validate() { return { valid: true }; }
      };

      pm.registerAuthPlugin(dualPlugin);

      const request = makeRequest({ auth: { type: 'mock-negotiate', data: {} } });
      await pm.execute('mock-options', request, makeContext(), {});

      expect(negotiateSpy).toHaveBeenCalledOnce();
      expect(applySpy).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // 22.2 Dispatch falls back to apply() when negotiate() is absent
  // --------------------------------------------------------------------------

  describe('22.2 Dispatch: apply() is used when negotiate() is absent', () => {
    test('should call apply() when auth plugin only has apply() (using mock-auth)', async () => {
      const request = makeRequest({ auth: { type: 'mock-auth', data: { token: 'bearer-token' } } });
      const context = makeContext();
      await pluginManager.execute('mock-options', request, context, {});

      // mockAuthPlugin.apply sets X-Mock-Auth
      const headers = context.currentRequest?.data.headers as Record<string, string> | undefined;
      expect(headers?.['X-Mock-Auth']).toBe('bearer-token');
    });

    test('apply() result should be set on context.currentRequest', async () => {
      const request = makeRequest({ auth: { type: 'mock-auth', data: { token: 'apply-test' } } });
      const context = makeContext();
      await pluginManager.execute('mock-options', request, context, {});

      expect(context.currentRequest).toBeDefined();
      const headers = context.currentRequest?.data.headers as Record<string, string>;
      expect(headers['X-Mock-Auth']).toBe('apply-test');
    });
  });

  // --------------------------------------------------------------------------
  // 22.3 Error: auth plugin has neither apply nor negotiate
  // --------------------------------------------------------------------------

  describe('22.3 Dispatch error: neither apply() nor negotiate()', () => {
    test('should throw when auth plugin has neither apply nor negotiate', async () => {
      const openPlugin = makeOpenProtocolPlugin(['empty-auth']);
      const pm = new PluginManager();
      pm.registerPlugin(openPlugin);

      const emptyPlugin: IAuthPlugin = {
        name: 'Empty Plugin',
        version: '1.0.0',
        description: 'Has neither apply nor negotiate',
        authTypes: ['empty-auth'],
        protocols: ['open-protocol'],
        dataSchema: {},
        validate() { return { valid: true }; }
      };

      pm.registerAuthPlugin(emptyPlugin);

      const request = makeRequest({ auth: { type: 'empty-auth', data: {} } });
      const context = { ...makeContext(), protocol: 'open-protocol', protocolPlugin: openPlugin };
      await expect(
        pm.execute('open-protocol', request, context, {})
      ).rejects.toThrow(/must implement either apply\(\) or negotiate\(\)/);
    });
  });

  // --------------------------------------------------------------------------
  // 22.4 AuthExecutor.send() wraps protocol plugin execute
  // --------------------------------------------------------------------------

  describe('22.4 AuthExecutor wraps protocol plugin execute()', () => {
    test('executor.send() calls the protocol plugin execute with the given request', async () => {
      const executeSpy = vi.fn().mockResolvedValue(okResponse());

      const spyPlugin: IProtocolPlugin = {
        ...mockOptionsPlugin,
        protocols: ['spy-protocol'],
        name: 'Spy Protocol Plugin',
        supportedAuthTypes: ['mock-negotiate'],
        execute: executeSpy
      };

      const pm = new PluginManager();
      pm.registerPlugin(spyPlugin);

      let sentViaExecutor: Request | undefined;
      const executorCapturePlugin: IAuthPlugin = {
        name: 'Executor Capture Auth',
        version: '1.0.0',
        description: 'Captures sent requests via executor',
        authTypes: ['mock-negotiate'],
        protocols: ['spy-protocol'],
        dataSchema: {},
        async negotiate(req, auth, options, executor) {
          const modified: Request = {
            ...req,
            data: { ...req.data, headers: { Authorization: 'test-header' } }
          };
          sentViaExecutor = modified;
          await executor.send(modified);
          return modified;
        },
        validate() { return { valid: true }; }
      };

      pm.registerAuthPlugin(executorCapturePlugin);

      const request = makeRequest({ auth: { type: 'mock-negotiate', data: {} } });
      const context: ExecutionContext = {
        ...makeContext(),
        protocol: 'spy-protocol',
        protocolPlugin: spyPlugin
      };

      await pm.execute('spy-protocol', request, context, {});

      // execute() called at least once via executor.send() (and then again via PluginManager for the official request)
      expect(executeSpy).toHaveBeenCalled();
      // The request sent through executor has the Authorization header
      expect(sentViaExecutor).toBeDefined();
      const authHeader = (sentViaExecutor!.data.headers as Record<string, string>)['Authorization'];
      expect(authHeader).toBe('test-header');
    });
  });

  // --------------------------------------------------------------------------
  // 22.5 negotiate() error is wrapped with clear message
  // --------------------------------------------------------------------------

  describe('22.5 negotiate() errors are wrapped', () => {
    test('should rethrow negotiate() errors with auth type in message', async () => {
      const openPlugin = makeOpenProtocolPlugin(['error-negotiate']);
      const pm = new PluginManager();
      pm.registerPlugin(openPlugin);

      const errorPlugin: IAuthPlugin = {
        name: 'Error Negotiate Plugin',
        version: '1.0.0',
        description: 'Throws during negotiate',
        authTypes: ['error-negotiate'],
        protocols: ['open-protocol'],
        dataSchema: {},
        async negotiate() {
          throw new Error('challenge server unreachable');
        },
        validate() { return { valid: true }; }
      };

      pm.registerAuthPlugin(errorPlugin);

      const request = makeRequest({ auth: { type: 'error-negotiate', data: {} } });
      const context = { ...makeContext(), protocol: 'open-protocol', protocolPlugin: openPlugin };
      await expect(
        pm.execute('open-protocol', request, context, {})
      ).rejects.toThrow(/Auth negotiate error.*error-negotiate.*challenge server unreachable/);
    });
  });

  // --------------------------------------------------------------------------
  // 22.6 context.currentRequest is updated after negotiate()
  // --------------------------------------------------------------------------

  describe('22.6 context.currentRequest is updated after negotiate()', () => {
    test('should set context.currentRequest to the result of negotiate()', async () => {
      const request = makeRequest({ auth: { type: 'mock-negotiate', data: { token: 'ctx-test' } } });
      const context = makeContext();
      await pluginManager.execute('mock-options', request, context, {});

      // mockNegotiatePlugin sets X-Mock-Negotiate
      expect(context.currentRequest?.data.headers).toBeDefined();
      const headers = context.currentRequest?.data.headers as Record<string, string>;
      expect(headers['X-Mock-Negotiate']).toBe('ctx-test');
    });
  });

  // --------------------------------------------------------------------------
  // 22.7 Protocol plugin createAuthExecutor() is used when present
  // --------------------------------------------------------------------------

  describe('22.7 Protocol plugin createAuthExecutor() is used when present', () => {
    test('should use createAuthExecutor() from protocol plugin when available', async () => {
      const customExecutorSend = vi.fn().mockResolvedValue(okResponse());
      const customExecutor: AuthExecutor = { send: customExecutorSend };

      const customProtocolPlugin: IProtocolPlugin = {
        ...mockOptionsPlugin,
        protocols: ['custom-protocol'],
        name: 'Custom Executor Protocol',
        supportedAuthTypes: ['mock-negotiate'],
        createAuthExecutor() {
          return customExecutor;
        }
      };

      const pm = new PluginManager();
      pm.registerPlugin(customProtocolPlugin);

      const customAuthPlugin: IAuthPlugin = {
        ...mockNegotiatePlugin,
        authTypes: ['mock-negotiate'],
        protocols: ['custom-protocol'],
        async negotiate(req, auth, options, executor) {
          await executor.send(req);
          return req;
        }
      };

      pm.registerAuthPlugin(customAuthPlugin);

      const request = makeRequest({ auth: { type: 'mock-negotiate', data: { token: 'custom' } } });
      const context: ExecutionContext = {
        ...makeContext(),
        protocol: 'custom-protocol',
        protocolPlugin: customProtocolPlugin
      };

      await pm.execute('custom-protocol', request, context, {});

      // The custom executor's send() was called during negotiate()
      expect(customExecutorSend).toHaveBeenCalledOnce();
    });
  });

  // --------------------------------------------------------------------------
  // 22.8 auth.type 'none' and 'inherit' skip auth dispatch entirely
  // --------------------------------------------------------------------------

  describe('22.8 Skip dispatch for auth.type none and inherit', () => {
    test('should not call negotiate() when auth.type is none', async () => {
      const pm = new PluginManager();
      pm.registerPlugin(mockOptionsPlugin);

      const negotiateSpy = vi.fn().mockImplementation(async (req: Request) => req);
      const noneNegotiatePlugin: IAuthPlugin = {
        ...mockNegotiatePlugin,
        authTypes: ['none'],
        negotiate: negotiateSpy
      };

      pm.registerAuthPlugin(noneNegotiatePlugin);

      const request = makeRequest({ auth: { type: 'none' } });
      await pm.execute('mock-options', request, makeContext(), {});

      expect(negotiateSpy).not.toHaveBeenCalled();
    });

    test('should not call apply() when auth.type is inherit', async () => {
      const pm = new PluginManager();
      pm.registerPlugin(mockOptionsPlugin);

      const applySpy = vi.fn().mockImplementation(async (req: Request) => req);
      const inheritPlugin: IAuthPlugin = {
        ...mockAuthPlugin,
        authTypes: ['inherit'],
        apply: applySpy
      };

      pm.registerAuthPlugin(inheritPlugin);

      const request = makeRequest({ auth: { type: 'inherit' } });
      await pm.execute('mock-options', request, makeContext(), {});

      expect(applySpy).not.toHaveBeenCalled();
    });
  });
});
