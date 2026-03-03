import got, { OptionsOfTextResponseBody, Response, RequestError } from 'got';
import FormData from 'form-data';
import type { IProtocolPlugin, Request, ExecutionContext, ProtocolResponse, ValidationResult, ValidationError, RuntimeOptions, ILogger } from '@apiquest/types';
import { HttpProxyAgent, HttpsProxyAgent } from 'hpagent';
import type { HttpBodyData } from './types.js';

// Export types for external consumption
export type { HttpResponseData, HttpBodyMode, HttpBodyKV, HttpBodyData, HttpRequestData } from './types.js';

// Helper functions for string validation
function isNullOrEmpty(value: string | null | undefined): boolean {
  return value === null || value === undefined || value === '';
}

function isNullOrWhitespace(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === '';
}

/**
 * Parse proxy configuration from environment variables
 * Platform-agnostic: checks both uppercase and lowercase variants
 */
function getProxyFromEnv(targetUrl: string): { host: string; port: number; auth?: { username: string; password: string } } | null {
  // Check both uppercase and lowercase variants (platform-agnostic)
  const HTTP_PROXY = process.env.HTTP_PROXY ?? process.env.http_proxy;
  const HTTPS_PROXY = process.env.HTTPS_PROXY ?? process.env.https_proxy;
  
  // Choose proxy based on target URL protocol
  const proxyUrl = targetUrl.startsWith('https:') ? (HTTPS_PROXY ?? HTTP_PROXY) : HTTP_PROXY;
  
  if (proxyUrl === undefined || proxyUrl === '') {
    return null;
  }
  
  try {
    const parsed = new URL(proxyUrl);
    return {
      host: parsed.hostname,
      port: (parsed.port !== '' ? parseInt(parsed.port) : (parsed.protocol === 'https:' ? 443 : 80)),
      auth: parsed.username !== '' ? {
        username: decodeURIComponent(parsed.username),
        password: decodeURIComponent(parsed.password)
      } : undefined
    };
  } catch {
    return null;
  }
}

/**
 * Check if host should bypass proxy based on NO_PROXY env var
 */
function shouldBypassProxy(targetUrl: string): boolean {
  const NO_PROXY = process.env.NO_PROXY ?? process.env.no_proxy;
  
  if (NO_PROXY === undefined || NO_PROXY === '') {
    return false;
  }
  
  const bypassList = NO_PROXY.split(',').map(s => s.trim());
  const parsed = new URL(targetUrl);
  
  return bypassList.some(pattern => {
    return parsed.hostname === pattern || 
           (pattern.startsWith('*.') && parsed.hostname.endsWith(pattern.slice(1)));
  });
}

export const httpPlugin: IProtocolPlugin = {
  name: 'HTTP Client',
  version: '1.0.0',
  description: 'HTTP/HTTPS protocol support for REST APIs',
  
  // What protocols this plugin provides
  protocols: ['http'],

  // Supported authentication types
  supportedAuthTypes: ['bearer', 'basic', 'oauth2', 'apikey', 'digest', 'ntlm'],
  
  // Accept additional auth plugins beyond the listed types
  strictAuthList: false,

  protocolAPIProvider(context: ExecutionContext) {
    const data = (context.currentResponse?.data ?? {}) as {
      status?: number;
      statusText?: string;
      headers?: Record<string, string | string[]>;
      body?: string;
    };

    return {
      request: {
        url: (context.currentRequest?.data.url ?? '') as string,
        method: (context.currentRequest?.data.method ?? '') as string,
        body: {
          get() {
            if (context.currentRequest?.data.body === null || context.currentRequest?.data.body === undefined) return null;
            const body = context.currentRequest.data.body as string | Record<string, unknown>;

            if (typeof body === 'string') return body;
            if (typeof body === 'object' && 'mode' in body && (body as { mode?: string }).mode === 'raw') return (body as { raw?: string }).raw ?? null;
            if (typeof body === 'object' && 'mode' in body && (body as { mode?: string }).mode === 'urlencoded') return null;
            if (typeof body === 'object' && 'mode' in body && (body as { mode?: string }).mode === 'formdata') return null;

            return null;
          },
          set(content: string) {
            if (context.currentRequest === null || context.currentRequest === undefined) return;
            if (context.currentRequest.data.body === null || context.currentRequest.data.body === undefined) {
              context.currentRequest.data.body = { mode: 'raw', raw: content };
            } else if (typeof context.currentRequest.data.body === 'string') {
              context.currentRequest.data.body = content;
            } else if (typeof context.currentRequest.data.body === 'object') {
              (context.currentRequest.data.body as { raw?: string }).raw = content;
            }
          },
          get mode() {
            if (context.currentRequest?.data.body === null || context.currentRequest?.data.body === undefined) return null;
            const body = context.currentRequest.data.body as string | Record<string, unknown>;

            if (typeof body === 'string') return 'raw';
            return (typeof body === 'object' && 'mode' in body ? (body as { mode?: string }).mode : 'raw') as string;
          }
        },
        headers: {
          add(header: { key: string; value: string; }) {
            if (context.currentRequest === null || context.currentRequest === undefined) return;
            const headers = context.currentRequest.data.headers as Record<string, string> | undefined;
            if (headers === null || headers === undefined) {
              context.currentRequest.data.headers = {};
            }
            (context.currentRequest.data.headers as Record<string, string>)[header.key] = header.value;
          },
          remove(key: string) {
            if (context.currentRequest?.data.headers === null || context.currentRequest?.data.headers === undefined) return;
            delete (context.currentRequest.data.headers as Record<string, string>)[key];
          },
          get(key: string) {
            if (context.currentRequest?.data.headers === null || context.currentRequest?.data.headers === undefined) return null;
            const lowerKey = key.toLowerCase();
            for (const [headerKey, value] of Object.entries(context.currentRequest.data.headers as Record<string, string>)) {
              if (headerKey.toLowerCase() === lowerKey) {
                return value;
              }
            }
            return null;
          },
          upsert(header: { key: string; value: string; }) {
            if (context.currentRequest === null || context.currentRequest === undefined) return;
            const headers = context.currentRequest.data.headers as Record<string, string> | undefined;
            if (headers === null || headers === undefined) {
              context.currentRequest.data.headers = {};
            }
            (context.currentRequest.data.headers as Record<string, string>)[header.key] = header.value;
          },
          toObject() {
            return (context.currentRequest?.data.headers ?? {}) as Record<string, string>;
          }
        }
      },
      response: {
        status: data.status ?? 0,
        statusText: data.statusText ?? '',
        headers: {
          get(name: string) {
            if (data.headers === null || data.headers === undefined) return null;
            const lowerName = name.toLowerCase();
            for (const [key, value] of Object.entries(data.headers)) {
              if (key.toLowerCase() === lowerName) {
                return value;
              }
            }
            return null;
          },
          has(name: string) {
            if (data.headers === null || data.headers === undefined) return false;
            const lowerName = name.toLowerCase();
            for (const key of Object.keys(data.headers)) {
              if (key.toLowerCase() === lowerName) {
                return true;
              }
            }
            return false;
          },
          toObject() {
            return data.headers ?? {};
          }
        },
        body: data.body ?? '',
        text() {
          return data.body ?? '';
        },
        json() {
          try {
            return JSON.parse(data.body ?? '{}') as unknown;
          } catch {
            return {};
          }
        },
        duration: context.currentResponse?.summary?.duration ?? 0,
        size: data.body?.length ?? 0,
        to: {
          be: {
            ok: data.status === 200,
            success: data.status !== undefined && data.status >= 200 && data.status < 300,
            clientError: data.status !== undefined && data.status >= 400 && data.status < 500,
            serverError: data.status !== undefined && data.status >= 500 && data.status < 600
          },
          have: {
            status(code: number) {
              return data.status === code;
            },
            header(name: string) {
              if (data.headers === null || data.headers === undefined) return false;
              const lowerName = name.toLowerCase();
              for (const key of Object.keys(data.headers)) {
                if (key.toLowerCase() === lowerName) {
                  return true;
                }
              }
              return false;
            },
            jsonBody(field: string) {
              try {
                const parsed = JSON.parse(data.body ?? '{}') as Record<string, unknown>;
                return field in parsed;
              } catch {
                return false;
              }
            }
          }
        }
      }
    };
  },

  // Data schema for HTTP requests
  dataSchema: {
    type: 'object',
    required: ['method', 'url'],
    properties: {
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
        description: 'HTTP method'
      },
      url: {
        type: 'string',
        description: 'Request URL'
      },
      params: {
        type: 'array',
        description: 'Query parameters as key/value pairs',
        items: {
          type: 'object',
          required: ['key', 'value'],
          properties: {
            key: { type: 'string' },
            value: { type: 'string' },
            description: { type: 'string' }
          }
        }
      },
      headers: {
        type: 'object',
        description: 'HTTP headers',
        additionalProperties: { type: 'string' }
      },
      body: {
        description: 'Request body (string or structured object)',
        oneOf: [
          { type: 'string' },
          {
            type: 'object',
            required: ['mode'],
            properties: {
              mode: {
                type: 'string',
                enum: ['none', 'raw', 'binary', 'urlencoded', 'formdata']
              },
              raw: {
                type: 'string',
                description: 'Raw body content (used for raw and binary; binary expects base64)'
              },
              kv: {
                type: 'array',
                description: 'Unified key/value list for urlencoded or formdata bodies',
                items: {
                  type: 'object',
                  required: ['key', 'value'],
                  properties: {
                    key: { type: 'string' },
                    type: { type: 'string', enum: ['text', 'binary'] },
                    value: { type: 'string' },
                    description: { type: 'string' }
                  }
                }
              }
            },
            additionalProperties: true
          }
        ]
      }
    }
  },

  // Options schema for runtime configuration
  optionsSchema: {
    keepAlive: {
      type: 'boolean',
      default: true,
      description: 'Keep TCP connections alive between requests'
    },
    timeout: {
      type: 'number',
      default: 30000,
      description: 'Request timeout in milliseconds'
    },
    followRedirects: {
      type: 'boolean',
      default: true,
      description: 'Follow HTTP redirects automatically'
    },
    maxRedirects: {
      type: 'number',
      default: 5,
      description: 'Maximum number of redirects to follow'
    },
    validateCertificates: {
      type: 'boolean',
      default: true,
      description: 'Validate SSL/TLS certificates'
    }
  },

  async execute(request: Request, context: ExecutionContext, options: RuntimeOptions, emitEvent?: (eventName: string, eventData: unknown) => Promise<void>, logger?: ILogger): Promise<ProtocolResponse> {
    const startTime = Date.now();
    let url = String(request.data.url ?? '');

    try {
      // Request configuration
      const method = String(request.data.method ?? 'GET');
      const headers: Record<string, string> = typeof request.data.headers === 'object' && request.data.headers !== null
        ? Object.fromEntries(
            Object.entries(request.data.headers as Record<string, unknown>).map(([k, v]) => [k, String(v)])
          )
        : {};
      const body: unknown = request.data.body;

      if (isNullOrWhitespace(url)) {
        logger?.error('HTTP request missing URL');
        throw new Error('URL is required for HTTP requests');
      }

      // Handle query parameters
      const params = request.data.params as Array<{ key?: string; value?: string; }> | undefined;
      if (params !== undefined && params !== null && Array.isArray(params) && params.length > 0) {
        const urlObj = new URL(url);
        params.forEach((item) => {
          if (typeof item.key === 'string' && item.value !== undefined) {
            urlObj.searchParams.append(item.key, String(item.value));
          }
        });
        url = urlObj.toString();
        logger?.trace('Query parameters applied', { url });
      }

      const httpOptions: Record<string, unknown> = (options.plugins?.http as Record<string, unknown> | null | undefined) ?? {};
      const httpTimeout = typeof httpOptions.timeout === 'number' ? httpOptions.timeout : null;
      const timeout = options.timeout?.request ?? httpTimeout ?? 60000;
      const httpFollowRedirects = typeof httpOptions.followRedirects === 'boolean' ? httpOptions.followRedirects : null;
      const followRedirects = options.followRedirects ?? httpFollowRedirects ?? true;
      const httpMaxRedirects = typeof httpOptions.maxRedirects === 'number' ? httpOptions.maxRedirects : null;
      const maxRedirects = options.maxRedirects ?? httpMaxRedirects ?? 5;
      const httpValidateCerts = typeof httpOptions.validateCertificates === 'boolean' ? httpOptions.validateCertificates : null;
      const validateCerts = options.ssl?.validateCertificates ?? httpValidateCerts ?? true;

      logger?.debug('HTTP request options resolved', {
        method,
        timeout,
        followRedirects,
        maxRedirects,
        validateCerts
      });

      // Cookie handling
      const cookieHeader = context.cookieJar.getCookieHeader(url);
      if (cookieHeader !== null) {
        headers['Cookie'] = cookieHeader;
        logger?.trace('Cookie header applied', { url });
      }

      const gotOptions: OptionsOfTextResponseBody = {
        method: method.toUpperCase() as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS',
        headers: { ...headers },
        throwHttpErrors: false,
        timeout: { request: timeout },
        followRedirect: followRedirects,
        allowGetBody: true,
        https: {
          rejectUnauthorized: validateCerts,
          certificate: options.ssl?.clientCertificate?.cert,
          key: options.ssl?.clientCertificate?.key,
          passphrase: options.ssl?.clientCertificate?.passphrase,
          certificateAuthority: options.ssl?.ca
        },
        signal: context.abortSignal as AbortSignal | undefined
      };

      // Body encoding
      if (body !== undefined && body !== null && body !== '') {
        if (typeof body === 'string') {
          gotOptions.body = body;
        } else if (typeof body === 'object') {
          const bodyObj = body as HttpBodyData;

          if (bodyObj.mode === 'none') {
            logger?.trace('HTTP body mode set to none; skipping body');
          } else if (bodyObj.mode === 'raw' && typeof bodyObj.raw === 'string') {
            gotOptions.body = bodyObj.raw;
            // Set Content-Type from body.language if not already specified by user (case-insensitive per RFC 7230)
            if (typeof bodyObj.language === 'string' && bodyObj.language !== '') {
              const language = bodyObj.language;
              gotOptions.headers ??= {};
              const alreadySet = Object.keys(gotOptions.headers).some((k) => k.toLowerCase() === 'content-type');
              if (!alreadySet) {
                gotOptions.headers['content-type'] = language;
              }
            }
          } else if (bodyObj.mode === 'urlencoded' && Array.isArray(bodyObj.kv)) {
            const params = new URLSearchParams();
            bodyObj.kv.forEach((item) => {
              if (item.key !== '' && item.value !== '') {
                params.append(item.key, item.value);
              }
            });
            gotOptions.body = params.toString();
            gotOptions.headers ??= {};
            gotOptions.headers['content-type'] = 'application/x-www-form-urlencoded';
          } else if (bodyObj.mode === 'formdata' && Array.isArray(bodyObj.kv)) {
            const formData = new FormData();
            bodyObj.kv.forEach((item) => {
              if (item.key === '') return;
              const itemType = item.type === 'binary' ? 'binary' : 'text';
              if (itemType === 'binary') {
                const buffer = Buffer.from(item.value, 'base64');
                formData.append(item.key, buffer, { filename: item.key });
              } else {
                formData.append(item.key, item.value);
              }
            });
            gotOptions.body = formData as unknown as string;
            gotOptions.headers = {
              ...(gotOptions.headers ?? {}),
              ...formData.getHeaders()
            };
          } else if (bodyObj.mode === 'urlencoded' || bodyObj.mode === 'formdata') {
            logger?.warn('HTTP body mode requires kv array', { mode: bodyObj.mode });
          } else {
            gotOptions.json = bodyObj;
          }
        }
      }

      // Proxy setup
      let proxyConfig = options.proxy;

      if ((proxyConfig?.host === undefined) && shouldBypassProxy(url) === false) {
        const envProxy = getProxyFromEnv(url);
        if (envProxy !== null) {
          proxyConfig = {
            enabled: true,
            host: envProxy.host,
            port: envProxy.port,
            auth: envProxy.auth
          };
        }
      }

      if (proxyConfig?.enabled !== false && proxyConfig?.host !== undefined && proxyConfig.host !== '') {
        const targetUrl = new URL(url);
        const explicitBypass = proxyConfig.bypass?.some(pattern => {
          return targetUrl.hostname === pattern ||
                 (pattern.startsWith('*.') && targetUrl.hostname.endsWith(pattern.slice(1)));
        }) ?? false;

        const envBypass = shouldBypassProxy(url);
        const shouldBypass = explicitBypass || envBypass;

        if (shouldBypass === false) {
          const proxyAuth = (proxyConfig.auth !== undefined && proxyConfig.auth !== null)
            ? `${encodeURIComponent(proxyConfig.auth.username)}:${encodeURIComponent(proxyConfig.auth.password)}@`
            : '';

          const fullProxyUrl = `http://${proxyAuth}${proxyConfig.host}:${proxyConfig.port}`;

          gotOptions.agent = {
            http: new HttpProxyAgent({
              keepAlive: true,
              keepAliveMsecs: 1000,
              maxSockets: 256,
              maxFreeSockets: 256,
              scheduling: 'lifo',
              proxy: fullProxyUrl
            }),
            https: new HttpsProxyAgent({
              keepAlive: true,
              keepAliveMsecs: 1000,
              maxSockets: 256,
              maxFreeSockets: 256,
              scheduling: 'lifo',
              proxy: fullProxyUrl
            })
          };
        }
      }

      // Dispatch
      logger?.debug('HTTP request dispatch', { url, method });
      const response: Response = await got(url, gotOptions);
      const duration = Date.now() - startTime;

      // Response normalization
      const normalizedHeaders: Record<string, string | string[]> = {};
      if (typeof response.headers === 'object' && response.headers !== null) {
        Object.entries(response.headers).forEach(([key, value]) => {
          if (Array.isArray(value)) {
            normalizedHeaders[key.toLowerCase()] = value.map(item => String(item));
          } else if (value !== undefined && value !== null) {
            normalizedHeaders[key.toLowerCase()] = String(value);
          }
        });
      }

      if (normalizedHeaders['set-cookie'] !== undefined) {
        context.cookieJar.store(normalizedHeaders['set-cookie'], url);
        logger?.trace('Cookies stored from response', { url });
      }

      logger?.debug('HTTP response received', { status: response.statusCode, duration });

      return {
        data: {
          status: response.statusCode,
          statusText: (response.statusMessage !== null && response.statusMessage !== undefined && response.statusMessage.length > 0) ? response.statusMessage : '',
          headers: normalizedHeaders,
          body: String(response.body)
        },
        summary: {
          outcome: 'success',
          code: response.statusCode,
          label: (response.statusMessage !== null && response.statusMessage !== undefined && response.statusMessage.length > 0) ? response.statusMessage : '',
          duration
        }
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      const error = err as RequestError;

      if (error instanceof RequestError && error.name === 'AbortError') {
        logger?.warn('HTTP request aborted', { url, duration });
        return {
          data: {
            status: 0,
            statusText: 'Aborted',
            body: '',
            headers: {}
          },
          summary: {
            outcome: 'error',
            code: 'aborted',
            label: 'Aborted',
            message: 'Request aborted',
            duration
          }
        };
      }

      if (error instanceof RequestError) {
        if (error.response !== undefined) {
          const normalizedHeaders: Record<string, string | string[]> = {};
          if (typeof error.response.headers === 'object' && error.response.headers !== null) {
            Object.entries(error.response.headers).forEach(([key, value]) => {
              if (Array.isArray(value)) {
                normalizedHeaders[key.toLowerCase()] = value.map(item => String(item));
              } else if (value !== undefined && value !== null) {
                normalizedHeaders[key.toLowerCase()] = String(value);
              }
            });
          }

          if (normalizedHeaders['set-cookie'] !== undefined) {
            context.cookieJar.store(normalizedHeaders['set-cookie'], url);
            logger?.trace('Cookies stored from error response', { url });
          }

          logger?.debug('HTTP error response received', { status: error.response.statusCode, duration });

          return {
            data: {
              status: error.response.statusCode,
              statusText: (error.response.statusMessage !== null && error.response.statusMessage !== undefined && error.response.statusMessage.length > 0) ? error.response.statusMessage : '',
              headers: normalizedHeaders,
              body: String(error.response.body)
            },
            summary: {
              outcome: 'error',
              code: error.response.statusCode,
              label: (error.response.statusMessage !== null && error.response.statusMessage !== undefined && error.response.statusMessage.length > 0) ? error.response.statusMessage : '',
              duration
            }
          };
        } else {
          logger?.warn('HTTP network error', { message: error.message, duration });
          return {
            data: {
              status: 0,
              statusText: 'Network Error',
              headers: {},
              body: ''
            },
            summary: {
              outcome: 'error',
              code: 'network',
              label: 'Network Error',
              message: !isNullOrEmpty(error.message) ? error.message : 'Network request failed',
              duration
            }
          };
        }
      }

      logger?.error('HTTP unexpected error', { error: err instanceof Error ? err.message : String(err), duration });
      return {
        data: {
          status: 0,
          statusText: 'Error',
          headers: {},
          body: ''
        },
        summary: {
          outcome: 'error',
          code: 'unexpected',
          label: 'Error',
          message: err instanceof Error ? err.message : String(err),
          duration
        }
      };
    }
  },

  validate(request: Request, options: RuntimeOptions): ValidationResult {
    const errors: ValidationError[] = [];

    // Check URL
    if (typeof request.data.url !== 'string' || isNullOrWhitespace(request.data.url)) {
      errors.push({
        message: 'URL is required',
        location: '',
        source: 'protocol'
      });
    }

    // Check method
    const method = (typeof request.data.method === 'string' && !isNullOrEmpty(request.data.method)) ? request.data.method.toUpperCase() : 'GET';
    const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
    if (!validMethods.includes(method)) {
      errors.push({
        message: `Invalid HTTP method: ${method}`,
        location: '',
        source: 'protocol'
      });
    }

    if (errors.length > 0) {
      return {
        valid: false,
        errors
      };
    }

    return { valid: true };
  }
};

export default httpPlugin;
