import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { ssePlugin } from '../src/index.js';
import type { Request, ExecutionContext, RuntimeOptions, ICookieJar, CookieSetOptions } from '@apiquest/types';
import http, { type IncomingMessage, type ServerResponse } from 'http';

// Simple cookie jar implementation for testing
class TestCookieJar implements ICookieJar {
  get(_name: string, _domain?: string, _path?: string): string | null {
    return null;
  }
  set(_name: string, _value: string, _options: CookieSetOptions): void {
    // noop
  }
  has(_name: string, _domain?: string, _path?: string): boolean {
    return false;
  }
  remove(_name: string, _domain?: string, _path?: string): void {
    // noop
  }
  clear(): void {
    // noop
  }
  toObject(): Record<string, string> {
    return {};
  }
  getCookieHeader(_url: string): string | null {
    return null;
  }
  store(_setCookieHeaders: string | string[] | null | undefined, _requestUrl: string): void {
    // noop
  }
}

// Mock execution context
function createMockContext(abortSignal?: AbortSignal): ExecutionContext {
  return {
    collectionInfo: {
      id: 'test-collection',
      name: 'Test Collection'
    },
    protocol: 'sse',
    collectionVariables: {},
    globalVariables: {},
    scopeStack: [],
    iterationCurrent: 0,
    iterationCount: 1,
    iterationSource: 'none',
    executionHistory: [],
    options: {},
    cookieJar: new TestCookieJar(),
    protocolPlugin: ssePlugin,
    abortSignal: abortSignal ?? new AbortController().signal
  };
}

// SSE test server
class TestSSEServer {
  private server: http.Server | null = null;
  private port = 0;
  private connections: Set<ServerResponse> = new Set();

  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req: IncomingMessage, res: ServerResponse) => {
        const url = req.url ?? '/';

        // /sse - Basic SSE endpoint with a few messages
        if (url === '/sse') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });

          // Send a few messages then close
          res.write('data: Message 1\n\n');
          setTimeout(() => {
            res.write('data: Message 2\n\n');
            setTimeout(() => {
              res.write('data: Message 3\n\n');
              setTimeout(() => {
                res.end();
              }, 50);
            }, 50);
          }, 50);
          return;
        }

        // /sse-with-event - SSE with event types
        if (url === '/sse-with-event') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });

          res.write('event: custom\ndata: Event message 1\n\n');
          setTimeout(() => {
            res.write('data: Regular message\n\n');
            setTimeout(() => {
              res.end();
            }, 50);
          }, 50);
          return;
        }

        // /sse-with-id - SSE with message IDs
        if (url === '/sse-with-id') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });

          res.write('id: 1\ndata: Message with ID 1\n\n');
          setTimeout(() => {
            res.write('id: 2\ndata: Message with ID 2\n\n');
            setTimeout(() => {
              res.end();
            }, 50);
          }, 50);
          return;
        }

        // /sse-long - Long-running SSE for timeout testing
        if (url === '/sse-long') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });

          // Track this connection so we can close it later
          this.connections.add(res);
          res.on('close', () => {
            this.connections.delete(res);
          });

          // Send one message and keep connection open
          res.write('data: Initial message\n\n');
          
          // Keep connection alive but don't close
          // This will trigger timeout in the test
          return;
        }

        // /sse-empty - SSE that closes immediately
        if (url === '/sse-empty') {
          res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
          });
          res.end();
          return;
        }

        // /not-sse - Not an SSE endpoint
        if (url === '/not-sse') {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('Regular HTTP response');
          return;
        }

        // /error - Error endpoint
        if (url === '/error') {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Server Error');
          return;
        }

        // 404 fallback
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      });

      this.server.listen(0, 'localhost', () => {
        const address = this.server?.address();
        if (address !== null && typeof address === 'object') {
          this.port = address.port;
          resolve(`http://localhost:${this.port}`);
        } else {
          reject(new Error('Failed to get server address'));
        }
      });

      this.server.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    // Close all open connections first
    for (const conn of this.connections) {
      try {
        conn.end();
      } catch {
        // Ignore errors when closing connections
      }
    }
    this.connections.clear();

    return new Promise((resolve, reject) => {
      if (this.server !== null) {
        // Force close all sockets
        this.server.closeAllConnections?.();
        
        this.server.close((err?: Error | null) => {
          if (err !== null && err !== undefined) {
            reject(err);
          } else {
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  }
}

describe('SSE Plugin', () => {
  describe('Plugin Metadata', () => {
    test('should have correct plugin identity', () => {
      expect(ssePlugin.name).toBe('SSE Client');
      expect(ssePlugin.version).toBe('1.0.0');
      expect(ssePlugin.description).toBe('Server-Sent Events (SSE) protocol support');
    });

    test('should declare sse protocol', () => {
      expect(ssePlugin.protocols).toContain('sse');
      expect(ssePlugin.protocols).toHaveLength(1);
    });

    test('should declare supported auth types', () => {
      expect(ssePlugin.supportedAuthTypes).toContain('bearer');
      expect(ssePlugin.supportedAuthTypes).toContain('basic');
      expect(ssePlugin.supportedAuthTypes).toContain('apikey');
      expect(ssePlugin.supportedAuthTypes).toContain('none');
    });

    test('should not use strict auth list', () => {
      expect(ssePlugin.strictAuthList).toBe(false);
    });

    test('should have data schema', () => {
      expect(ssePlugin.dataSchema).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      expect((ssePlugin.dataSchema as any).properties.url).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      expect((ssePlugin.dataSchema as any).properties.timeout).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      expect((ssePlugin.dataSchema as any).properties.headers).toBeDefined();
    });

    test('should have options schema', () => {
      expect(ssePlugin.optionsSchema).toBeDefined();
      expect(ssePlugin.optionsSchema?.timeout).toBeDefined();
    });

    test('should have defined events', () => {
      expect(ssePlugin.events).toBeDefined();
      expect(ssePlugin.events).toHaveLength(3);
      
      const eventNames = ssePlugin.events?.map(e => e.name) ?? [];
      expect(eventNames).toContain('onMessage');
      expect(eventNames).toContain('onError');
      expect(eventNames).toContain('onComplete');
    });
  });

  describe('Validation', () => {
    test('should pass validation for valid SSE request', () => {
      const request: Request = {
        type: 'request',
        id: 'test-1',
        name: 'Test Request',
        data: {
          url: 'http://localhost:3000/sse'
        }
      };

      const result = ssePlugin.validate(request, {});
      expect(result.valid).toBe(true);
    });

    test('should pass validation with timeout', () => {
      const request: Request = {
        type: 'request',
        id: 'test-2',
        name: 'Test Request',
        data: {
          url: 'http://localhost:3000/sse',
          timeout: 5000
        }
      };

      const result = ssePlugin.validate(request, {});
      expect(result.valid).toBe(true);
    });

    test('should pass validation with headers', () => {
      const request: Request = {
        type: 'request',
        id: 'test-3',
        name: 'Test Request',
        data: {
          url: 'http://localhost:3000/sse',
          headers: {
            'Authorization': 'Bearer token123'
          }
        }
      };

      const result = ssePlugin.validate(request, {});
      expect(result.valid).toBe(true);
    });

    test('should fail validation for missing URL', () => {
      const request: Request = {
        type: 'request',
        id: 'test-4',
        name: 'Test Request',
        data: {}
      };

      const result = ssePlugin.validate(request, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0].message).toContain('URL is required');
    });

    test('should fail validation for empty URL', () => {
      const request: Request = {
        type: 'request',
        id: 'test-5',
        name: 'Test Request',
        data: {
          url: '   '
        }
      };

      const result = ssePlugin.validate(request, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('Request Execution', () => {
    let server: TestSSEServer;
    let baseUrl: string;

    beforeEach(async () => {
      server = new TestSSEServer();
      baseUrl = await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    test('should receive SSE messages', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-6',
        name: 'Test Request',
        data: {
          url: `${baseUrl}/sse`
        }
      };

      const context = createMockContext();
      const response = await ssePlugin.execute(request, context, {});

      expect(response.status).toBe(200);
      expect(response.statusText).toBe('Stream Complete');
      
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const body = JSON.parse(response.body);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(body.count).toBe(3);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(body.messages).toHaveLength(3);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(body.messages[0].data).toBe('Message 1');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(body.messages[1].data).toBe('Message 2');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(body.messages[2].data).toBe('Message 3');
    }, 10000);

    test('should handle SSE with event types', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-7',
        name: 'Test Request',
        data: {
          url: `${baseUrl}/sse-with-event`
        }
      };

      const context = createMockContext();
      const response = await ssePlugin.execute(request, context, {});

      expect(response.status).toBe(200);
      
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const body = JSON.parse(response.body);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(body.count).toBe(2);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(body.messages[0].event).toBe('custom');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(body.messages[0].data).toBe('Event message 1');
    }, 10000);

    test('should handle SSE with message IDs', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-8',
        name: 'Test Request',
        data: {
          url: `${baseUrl}/sse-with-id`
        }
      };

      const context = createMockContext();
      const response = await ssePlugin.execute(request, context, {});

      expect(response.status).toBe(200);
      
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const body = JSON.parse(response.body);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(body.count).toBe(2);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(body.messages[0].id).toBe('1');
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(body.messages[1].id).toBe('2');
    }, 10000);

    test('should handle empty SSE stream', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-9',
        name: 'Test Request',
        data: {
          url: `${baseUrl}/sse-empty`
        }
      };

      const context = createMockContext();
      const response = await ssePlugin.execute(request, context, {});

      expect(response.status).toBe(200);
      
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const body = JSON.parse(response.body);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(body.count).toBe(0);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(body.messages).toHaveLength(0);
    }, 10000);

    test('should timeout long-running streams', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-10',
        name: 'Test Request',
        data: {
          url: `${baseUrl}/sse-long`,
          timeout: 500
        }
      };

      const context = createMockContext();
      const response = await ssePlugin.execute(request, context, {});

      expect(response.status).toBe(200);
      expect(response.statusText).toBe('Stream Complete (Timeout)');
      
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const body = JSON.parse(response.body);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(body.count).toBe(1);
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(body.messages[0].data).toBe('Initial message');
    }, 10000);

    test('should handle non-OK responses', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-11',
        name: 'Test Request',
        data: {
          url: `${baseUrl}/error`
        }
      };

      const context = createMockContext();
      const response = await ssePlugin.execute(request, context, {});

      expect(response.status).toBe(500);
    }, 10000);

    test('should respect timeout from options', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-12',
        name: 'Test Request',
        data: {
          url: `${baseUrl}/sse-long`
        }
      };

      const context = createMockContext();
      const options: RuntimeOptions = {
        timeout: {
          request: 500
        }
      };
      
      const response = await ssePlugin.execute(request, context, options);

      expect(response.status).toBe(200);
      expect(response.statusText).toBe('Stream Complete (Timeout)');
    }, 10000);

    test('should respect timeout from plugin options', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-13',
        name: 'Test Request',
        data: {
          url: `${baseUrl}/sse-long`
        }
      };

      const context = createMockContext();
      const options: RuntimeOptions = {
        plugins: {
          sse: {
            timeout: 500
          }
        }
      };
      
      const response = await ssePlugin.execute(request, context, options);

      expect(response.status).toBe(200);
      expect(response.statusText).toBe('Stream Complete (Timeout)');
    }, 10000);

    test('should handle abort signal', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-14',
        name: 'Test Request',
        data: {
          url: `${baseUrl}/sse-long`
        }
      };

      const abortController = new AbortController();
      const context = createMockContext(abortController.signal);

      // Start the request
      const responsePromise = ssePlugin.execute(request, context, {});

      // Abort after a short delay
      setTimeout(() => {
        abortController.abort();
      }, 200);

      const response = await responsePromise;

      expect(response.status).toBe(0);
      expect(response.statusText).toBe('Aborted');
    }, 10000);

    test('should emit onMessage events', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-15',
        name: 'Test Request',
        data: {
          url: `${baseUrl}/sse`
        }
      };

      const context = createMockContext();
      const events: Array<{ name: string; data: unknown }> = [];
      
      const emitEvent = async (eventName: string, eventData: unknown): Promise<void> => {
        events.push({ name: eventName, data: eventData });
      };

      const response = await ssePlugin.execute(request, context, {}, emitEvent);

      expect(response.status).toBe(200);
      expect(events.length).toBeGreaterThan(0);
      
      const messageEvents = events.filter(e => e.name === 'onMessage');
      expect(messageEvents).toHaveLength(3);
      
      const completeEvents = events.filter(e => e.name === 'onComplete');
      expect(completeEvents).toHaveLength(1);
    }, 10000);

    test('should include custom headers', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-16',
        name: 'Test Request',
        data: {
          url: `${baseUrl}/sse`,
          headers: {
            'Authorization': 'Bearer test-token',
            'Custom-Header': 'custom-value'
          }
        }
      };

      const context = createMockContext();
      const response = await ssePlugin.execute(request, context, {});

      expect(response.status).toBe(200);
    }, 10000);
  });
});
