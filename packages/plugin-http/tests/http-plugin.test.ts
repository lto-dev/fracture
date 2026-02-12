import { describe, test, expect, beforeEach, afterEach, beforeAll} from 'vitest';
import { httpPlugin } from '../src/index.js';
import type { Request, ExecutionContext, RuntimeOptions, ICookieJar, CookieSetOptions } from '@apiquest/types';
import http from 'http';
import { readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { TestHttpsServer, TestProxyServer } from './test-helpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
function createMockContext(): ExecutionContext {
  return {
    collectionInfo: {
      id: 'test-collection',
      name: 'Test Collection'
    },
    protocol: 'http',
    collectionVariables: {},
    globalVariables: {},
    scopeStack: [],
    iterationCurrent: 0,
    iterationCount: 1,
    iterationSource: 'none',
    executionHistory: [],
    options: {},
    cookieJar: new TestCookieJar(),
    protocolPlugin: httpPlugin,
    abortSignal: new AbortController().signal
  };
}

// Simple mock HTTP server for testing
class TestServer {
  private server: http.Server | null = null;
  private port = 0;

  async start(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => {
        const url = req.url ?? '/';

        // Helper to read body
        const readBody = (callback: (body: string) => void): void => {
          let body = '';
          req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
          req.on('end', () => { callback(body); });
        };

        // GET /test - Basic endpoint
        if (req.method === 'GET' && url === '/test') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ message: 'success' }));
          return;
        }

        // /echo - Echo body for all methods (including GET)
        if (url === '/echo') {
          readBody((body) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              method: req.method,
              received: body
            }));
          });
          return;
        }

        // /headers - Return request headers
        if (url === '/headers') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(req.headers));
          return;
        }

        // /methods/:method - Test specific HTTP methods
        const methodMatch = url.match(/^\/methods\/(\w+)$/);
        if (methodMatch !== null) {
          readBody((body) => {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
              method: req.method,
              expectedMethod: methodMatch[1].toUpperCase(),
              body: body.length > 0 ? body : null
            }));
          });
          return;
        }

        // /status/:code - Return specific status
        const statusMatch = url.match(/^\/status\/(\d+)$/);
        if (statusMatch !== null) {
          const code = parseInt(statusMatch[1], 10);
          res.writeHead(code);
          res.end(JSON.stringify({ status: code }));
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
    return new Promise((resolve, reject) => {
      if (this.server !== null) {
        this.server.close((err) => {
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

describe('HTTP Plugin', () => {
  describe('Plugin Metadata', () => {
    test('should have correct plugin identity', () => {
      expect(httpPlugin.name).toBe('HTTP Client');
      expect(httpPlugin.version).toBe('1.0.0');
      expect(httpPlugin.description).toBe('HTTP/HTTPS protocol support for REST APIs');
    });

    test('should declare http protocol', () => {
      expect(httpPlugin.protocols).toContain('http');
      expect(httpPlugin.protocols).toHaveLength(1);
    });

    test('should declare supported auth types', () => {
      expect(httpPlugin.supportedAuthTypes).toContain('bearer');
      expect(httpPlugin.supportedAuthTypes).toContain('basic');
      expect(httpPlugin.supportedAuthTypes).toContain('oauth2');
      expect(httpPlugin.supportedAuthTypes).toContain('apikey');
    });

    test('should not use strict auth list', () => {
      expect(httpPlugin.strictAuthList).toBe(false);
    });

    test('should have data schema', () => {
      expect(httpPlugin.dataSchema).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(httpPlugin.dataSchema.properties.method).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(httpPlugin.dataSchema.properties.url).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(httpPlugin.dataSchema.properties.headers).toBeDefined();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      expect(httpPlugin.dataSchema.properties.body).toBeDefined();
    });

    test('should have options schema', () => {
      expect(httpPlugin.optionsSchema).toBeDefined();
      expect(httpPlugin.optionsSchema?.keepAlive).toBeDefined();
      expect(httpPlugin.optionsSchema?.timeout).toBeDefined();
      expect(httpPlugin.optionsSchema?.followRedirects).toBeDefined();
      expect(httpPlugin.optionsSchema?.maxRedirects).toBeDefined();
      expect(httpPlugin.optionsSchema?.validateCertificates).toBeDefined();
    });
  });

  describe('Validation', () => {
    test('should pass validation for valid GET request', () => {
      const request: Request = {
        type: 'request',
        id: 'test-1',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'https://api.example.com/users'
        }
      };

      const result = httpPlugin.validate(request, {});
      expect(result.valid).toBe(true);
    });

    test('should pass validation for valid POST request', () => {
      const request: Request = {
        type: 'request',
        id: 'test-2',
        name: 'Test Request',
        data: {
          method: 'POST',
          url: 'https://api.example.com/users',
          body: { name: 'John' }
        }
      };

      const result = httpPlugin.validate(request, {});
      expect(result.valid).toBe(true);
    });

    test('should fail validation for missing URL', () => {
      const request: Request = {
        type: 'request',
        id: 'test-3',
        name: 'Test Request',
        data: {
          method: 'GET'
        }
      };

      const result = httpPlugin.validate(request, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0].message).toContain('URL is required');
    });

    test('should fail validation for empty URL', () => {
      const request: Request = {
        type: 'request',
        id: 'test-4',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: '   '
        }
      };

      const result = httpPlugin.validate(request, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
    });

    test('should fail validation for invalid method', () => {
      const request: Request = {
        type: 'request',
        id: 'test-5',
        name: 'Test Request',
        data: {
          method: 'INVALID',
          url: 'https://api.example.com/users'
        }
      };

      const result = httpPlugin.validate(request, {});
      expect(result.valid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors?.[0].message).toContain('Invalid HTTP method');
    });

    test('should pass validation for all valid HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
      
      methods.forEach(method => {
        const request: Request = {
          type: 'request',
          id: `test-${method}`,
          name: 'Test Request',
          data: {
            method,
            url: 'https://api.example.com/users'
          }
        };

        const result = httpPlugin.validate(request, {});
        expect(result.valid).toBe(true);
      });
    });

    test('should pass validation for lowercase methods', () => {
      const request: Request = {
        type: 'request',
        id: 'test-6',
        name: 'Test Request',
        data: {
          method: 'get',
          url: 'https://api.example.com/users'
        }
      };

      const result = httpPlugin.validate(request, {});
      expect(result.valid).toBe(true);
    });
  });

  describe('Request Execution', () => {
    let server: TestServer;
    let baseUrl: string;

    beforeEach(async () => {
      server = new TestServer();
      baseUrl = await server.start();
    });

    afterEach(async () => {
      await server.stop();
    });

    test('should execute simple GET request', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-7',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: `${baseUrl}/test`
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});

      expect(response.status).toBe(200);
      expect(response.body).toBe(JSON.stringify({ message: 'success' }));
    });

    test('should execute POST request with body', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-8',
        name: 'Test Request',
        data: {
          method: 'POST',
          url: `${baseUrl}/echo`,
          body: 'test data'
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});

      expect(response.status).toBe(200);
      expect(response.body).toContain('test data');
    });

    test('should handle custom headers', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-9',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: `${baseUrl}/headers`,
          headers: {
            'X-Custom-Header': 'custom-value'
          }
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});

      expect(response.status).toBe(200);
      const headers = JSON.parse(response.body) as Record<string, unknown>;
      expect(headers['x-custom-header']).toBe('custom-value');
    });

    test('should handle different status codes', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-10',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: `${baseUrl}/status/404`
        }
      };

      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});

      expect(response.status).toBe(404);
    });

    test('should handle network errors', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-11',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: 'http://invalid-domain-that-does-not-exist-12345.com'
        }
      };

      const context = createMockContext();
      const options: RuntimeOptions = {
        timeout: { request: 1000 }
      };

      const response = await httpPlugin.execute(request, context, options);
      
      expect(response.status).toBe(0);
      expect(response.statusText).toBe('Network Error');
      expect(response.error).toBeDefined();
    });

    test('should handle missing URL error', async () => {
      const request: Request = {
        type: 'request',
        id: 'test-12',
        name: 'Test Request',
        data: {
          method: 'GET',
          url: ''
        }
      };

      const context = createMockContext();
      
      const response = await httpPlugin.execute(request, context, {});
      expect(response.status).toBe(0);
      expect(response.statusText).toBe('Error');
      expect(response.error).toContain('URL is required');
    });
  });

  describe('SSL/TLS Behavior', () => {
    let httpsServer: TestHttpsServer;
    let baseUrl: string;

    beforeEach(async () => {
      httpsServer = new TestHttpsServer();
      baseUrl = await httpsServer.start();
    });

    afterEach(async () => {
      await httpsServer.stop();
    });

    test('Self-signed cert with validation enabled fails', async () => {
      const request: Request = {
        type: 'request',
        id: 'ssl-1',
        name: 'SSL Test',
        data: {
          method: 'GET',
          url: `${baseUrl}/test`
        }
      };
      
      const context = createMockContext();
      const options: RuntimeOptions = {
        ssl: { validateCertificates: true }
      };
      
      const response = await httpPlugin.execute(request, context, options);
      
      // Self-signed cert should fail validation
      expect(response.status).toBe(0);
      expect(response.error).toBeDefined();
      expect(response.error?.toLowerCase()).toContain('certificate');
    });

    test('Self-signed cert with validation disabled succeeds', async () => {
      const request: Request = {
        type: 'request',
        id: 'ssl-2',
        name: 'SSL Test',
        data: {
          method: 'GET',
          url: `${baseUrl}/test`
        }
      };
      
      const context = createMockContext();
      const options: RuntimeOptions = {
        ssl: { validateCertificates: false }
      };
      
      const response = await httpPlugin.execute(request, context, options);
      
      expect(response.status).toBe(200);
      const body = JSON.parse(response.body) as { message: string };
      expect(body.message).toBe('HTTPS OK');
    });

    test('mTLS with valid client certificate succeeds', async () => {
      // Start server that requires client cert
      await httpsServer.stop();
      baseUrl = await httpsServer.start({ requireClientCert: true });
      
      const request: Request = {
        type: 'request',
        id: 'ssl-3',
        name: 'mTLS Test',
        data: {
          method: 'GET',
          url: `${baseUrl}/test`
        }
      };
      
      const context = createMockContext();
      const options: RuntimeOptions = {
        ssl: {
          validateCertificates: false, // Self-signed server cert
          clientCertificate: {
            cert: readFileSync(join(__dirname, 'test-fixtures/client-cert.pem'), 'utf8'),
            key: readFileSync(join(__dirname, 'test-fixtures/client-key.pem'), 'utf8')
          }
        }
      };
      
      const response = await httpPlugin.execute(request, context, options);
      
      expect(response.status).toBe(200);
      const body = JSON.parse(response.body) as { clientCertProvided: boolean };
      expect(body.clientCertProvided).toBe(true);
    });

    test('Custom CA certificate validates server cert', async () => {
      const request: Request = {
        type: 'request',
        id: 'ssl-4',
        name: 'CA Test',
        data: {
          method: 'GET',
          url: `${baseUrl}/test`
        }
      };
      
      const context = createMockContext();
      const options: RuntimeOptions = {
        ssl: {
          validateCertificates: true,
          ca: readFileSync(join(__dirname, 'test-fixtures/server-cert.pem'), 'utf8')
        }
      };
      
      const response = await httpPlugin.execute(request, context, options);
      
      // With proper CA, validation should pass
      expect(response.status).toBe(200);
    });
  });

  describe('Proxy Behavior', () => {
    let proxyServer: TestProxyServer;
    let targetServer: TestServer;
    let proxyPort: number;
    let targetUrl: string;

    beforeEach(async () => {
      proxyServer = new TestProxyServer();
      targetServer = new TestServer();
      proxyPort = await proxyServer.start();
      targetUrl = await targetServer.start();
    });

    afterEach(async () => {
      await proxyServer.stop();
      await targetServer.stop();
    });

    test('Routes request through proxy', async () => {
      const request: Request = {
        type: 'request',
        id: 'proxy-1',
        name: 'Proxy Test',
        data: {
          method: 'GET',
          url: targetUrl + '/test'
        }
      };
      
      const context = createMockContext();
      const options: RuntimeOptions = {
        proxy: {
          enabled: true,
          host: 'localhost',
          port: proxyPort
        }
      };
      
      const response = await httpPlugin.execute(request, context, options);
      
      // Request should go through proxy
      expect(proxyServer.requestLog.length).toBeGreaterThan(0);
    });

    test('Proxy authentication with credentials', async () => {
      // Stop and restart with auth
      await proxyServer.stop();
      proxyPort = await proxyServer.start({
        requireAuth: true,
        username: 'testuser',
        password: 'testpass'
      });
      
      const request: Request = {
        type: 'request',
        id: 'proxy-2',
        name: 'Proxy Auth Test',
        data: {
          method: 'GET',
          url: targetUrl + '/test'
        }
      };
      
      const context = createMockContext();
      const options: RuntimeOptions = {
        proxy: {
          enabled: true,
          host: 'localhost',
          port: proxyPort,
          auth: {
            username: 'testuser',
            password: 'testpass'
          }
        }
      };
      
      const response = await httpPlugin.execute(request, context, options);
      
      expect(proxyServer.requestLog.length).toBeGreaterThan(0);
    });

    test('Proxy bypass for localhost', async () => {
      const request: Request = {
        type: 'request',
        id: 'proxy-3',
        name: 'Bypass Test',
        data: {
          method: 'GET',
          url: targetUrl + '/test' // Targets localhost
        }
      };
      
      const context = createMockContext();
      const options: RuntimeOptions = {
        proxy: {
          enabled: true,
          host: 'proxy.example.com',
          port: 8080,
          bypass: ['localhost', '127.0.0.1']
        }
      };
      
      const response = await httpPlugin.execute(request, context, options);
      
      // Should bypass proxy (direct connection) - proxy log should be empty
      expect(proxyServer.requestLog).toHaveLength(0);
      expect(response.status).toBe(200);
    });
  });

  describe('Environment Variable Support', () => {
    let proxyServer: TestProxyServer;
    let targetServer: TestServer;
    let proxyPort: number;
    let targetUrl: string;
    const originalEnv = { ...process.env };

    beforeEach(async () => {
      proxyServer = new TestProxyServer();
      targetServer = new TestServer();
      proxyPort = await proxyServer.start();
      targetUrl = await targetServer.start();
    });

    afterEach(async () => {
      await proxyServer.stop();
      await targetServer.stop();
      // Restore original env vars
      process.env = { ...originalEnv };
    });

    test('HTTP_PROXY env var sets proxy for HTTP requests', async () => {
      process.env.HTTP_PROXY = `http://localhost:${proxyPort}`;
      
      const request: Request = {
        type: 'request',
        id: 'env-1',
        name: 'HTTP_PROXY Test',
        data: {
          method: 'GET',
          url: targetUrl + '/test'
        }
      };
      
      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      
      // Request should go through proxy from env var
      expect(proxyServer.requestLog.length).toBeGreaterThan(0);
    });

    test('HTTPS_PROXY env var sets proxy for HTTPS requests', async () => {
      process.env.HTTPS_PROXY = `http://localhost:${proxyPort}`;
      
      const httpsServer = new TestHttpsServer();
      const httpsUrl = await httpsServer.start();
      
      const request: Request = {
        type: 'request',
        id: 'env-2',
        name: 'HTTPS_PROXY Test',
        data: {
          method: 'GET',
          url: `${httpsUrl}/test`
        }
      };
      
      const context = createMockContext();
      const options: RuntimeOptions = {
        ssl: { validateCertificates: false }
      };
      
      const response = await httpPlugin.execute(request, context, options);
      
      // Request should go through proxy from env var
      expect(proxyServer.requestLog.length).toBeGreaterThan(0);
      
      await httpsServer.stop();
    });

    test('NO_PROXY env var bypasses proxy for specified hosts', async () => {
      process.env.HTTP_PROXY = `http://localhost:${proxyPort}`;
      process.env.NO_PROXY = 'localhost,127.0.0.1';
      
      const request: Request = {
        type: 'request',
        id: 'env-3',
        name: 'NO_PROXY Test',
        data: {
          method: 'GET',
          url: targetUrl + '/test'
        }
      };
      
      const context = createMockContext();
      const response = await httpPlugin.execute(request, context, {});
      
      // Should bypass proxy due to NO_PROXY
      expect(proxyServer.requestLog).toHaveLength(0);
      expect(response.status).toBe(200);
    });

    test('Explicit proxy options override env vars', async () => {
      process.env.HTTP_PROXY = `http://wrong-host:9999`;
      
      const request: Request = {
        type: 'request',
        id: 'env-4',
        name: 'Override Test',
        data: {
          method: 'GET',
          url: targetUrl + '/test'
        }
      };
      
      const context = createMockContext();
      const options: RuntimeOptions = {
        proxy: {
          enabled: true,
          host: 'localhost',
          port: proxyPort
        }
      };
      
      const response = await httpPlugin.execute(request, context, options);
      
      // Should use explicit proxy, not env var
      expect(proxyServer.requestLog.length).toBeGreaterThan(0);
    });
  });
});
