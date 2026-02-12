import type { IProtocolPlugin, Request, ExecutionContext, ProtocolResponse, ValidationResult, ValidationError, RuntimeOptions, ILogger } from '@apiquest/types';

// Helper functions for string validation
function isNullOrEmpty(value: string | null | undefined): boolean {
  return value === null || value === undefined || value === '';
}

function isNullOrWhitespace(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === '';
}

interface SSEMessage {
  data: string;
  event?: string;
  id?: string;
  retry?: number;
}

export const ssePlugin: IProtocolPlugin = {
  name: 'SSE Client',
  version: '1.0.0',
  description: 'Server-Sent Events (SSE) protocol support',
  
  // What protocols this plugin provides
  protocols: ['sse'],

  // Supported authentication types
  supportedAuthTypes: ['bearer', 'basic', 'apikey', 'none'],
  
  // Accept additional auth plugins beyond the listed types
  strictAuthList: false,

  // Data schema for SSE requests
  dataSchema: {
    type: 'object',
    required: ['url'],
    properties: {
      url: {
        type: 'string',
        description: 'SSE endpoint URL'
      },
      timeout: {
        type: 'number',
        description: 'Connection timeout in milliseconds',
        default: 30000
      },
      headers: {
        type: 'object',
        description: 'HTTP headers',
        additionalProperties: { type: 'string' }
      }
    }
  },

  // Options schema for runtime configuration
  optionsSchema: {
    timeout: {
      type: 'number',
      default: 30000,
      description: 'Request timeout in milliseconds'
    }
  },

  // Plugin events
  events: [
    {
      name: 'onMessage',
      description: 'Fired when an SSE message is received',
      canHaveTests: true,
      required: false
    },
    {
      name: 'onError',
      description: 'Fired when an error occurs during streaming',
      canHaveTests: false,
      required: false
    },
    {
      name: 'onComplete',
      description: 'Fired when the SSE stream completes',
      canHaveTests: true,
      required: false
    }
  ],

  async execute(request: Request, context: ExecutionContext, options: RuntimeOptions, emitEvent?: (eventName: string, eventData: unknown) => Promise<void>, logger?: ILogger): Promise<ProtocolResponse> {
    const startTime = Date.now();
    const url = String(request.data.url ?? '');

    if (isNullOrWhitespace(url)) {
      logger?.error('SSE request missing URL');
      throw new Error('URL is required for SSE requests');
    }

    const headers: Record<string, string> = typeof request.data.headers === 'object' && request.data.headers !== null
      ? Object.fromEntries(
          Object.entries(request.data.headers as Record<string, unknown>).map(([k, v]) => [k, String(v)])
        )
      : {};

    const sseOptions: Record<string, unknown> = (options.plugins?.sse as Record<string, unknown> | null | undefined) ?? {};
    const sseTimeout = typeof sseOptions.timeout === 'number' ? sseOptions.timeout : null;
    const timeout = (typeof request.data.timeout === 'number' ? request.data.timeout : null) ?? options.timeout?.request ?? sseTimeout ?? 30000;

    logger?.debug('SSE request starting', { url, timeout });

    const messages: SSEMessage[] = [];
    let messageCount = 0;

    return new Promise<ProtocolResponse>((resolve, reject) => {
      const controller = new AbortController();
      
      const timeoutId = setTimeout(() => {
        controller.abort();
        logger?.debug('SSE connection timeout', { url, messageCount, duration: Date.now() - startTime });
        
        resolve({
          status: 200,
          statusText: 'Stream Complete (Timeout)',
          body: JSON.stringify({ messages, count: messageCount }),
          headers: {},
          duration: Date.now() - startTime,
          messageCount,
          messages
        } as ProtocolResponse & { messageCount: number; messages: SSEMessage[] });
      }, timeout);

      try {
        // Use fetch with streaming which is more universally supported in Node.js
        const signal = context.abortSignal ?? controller.signal;

        // Handle abort signal
        if (context.abortSignal !== undefined && context.abortSignal !== null) {
          context.abortSignal.addEventListener('abort', () => {
            controller.abort();
            clearTimeout(timeoutId);
            logger?.debug('SSE request aborted', { url, messageCount, duration: Date.now() - startTime });
            resolve({
              status: 0,
              statusText: 'Aborted',
              body: JSON.stringify({ messages, count: messageCount }),
              headers: {},
              duration: Date.now() - startTime,
              error: 'Request aborted',
              messageCount,
              messages
            } as ProtocolResponse & { messageCount: number; messages: SSEMessage[] });
          });
        }

        // Use fetch with streaming
        fetch(url, {
          method: 'GET',
          headers: {
            ...headers,
            'Accept': 'text/event-stream',
            'Cache-Control': 'no-cache'
          },
          signal
        }).then(async (response) => {
          if (!response.ok) {
            clearTimeout(timeoutId);
            logger?.warn('SSE connection failed', { status: response.status, statusText: response.statusText });
            resolve({
              status: response.status,
              statusText: response.statusText,
              body: await response.text(),
              headers: Object.fromEntries(response.headers.entries()),
              duration: Date.now() - startTime,
              messageCount: 0,
              messages: []
            } as ProtocolResponse & { messageCount: number; messages: SSEMessage[] });
            return;
          }

          if (response.body === null || response.body === undefined) {
            clearTimeout(timeoutId);
            logger?.error('SSE response has no body');
            resolve({
              status: response.status,
              statusText: 'No Body',
              body: '',
              headers: Object.fromEntries(response.headers.entries()),
              duration: Date.now() - startTime,
              messageCount: 0,
              messages: []
            } as ProtocolResponse & { messageCount: number; messages: SSEMessage[] });
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = '';
          
          // Temporary message fields that get compiled when we hit an empty line
          let currentEventType: string | undefined;
          let currentEventId: string | undefined;
          let currentRetry: number | undefined;
          const currentDataLines: string[] = [];

          const dispatchCurrentMessage = async (): Promise<void> => {
            if (currentDataLines.length > 0) {
              const message: SSEMessage = {
                data: currentDataLines.join('\n'),
                event: currentEventType,
                id: currentEventId,
                retry: currentRetry
              };
              
              messages.push(message);
              messageCount++;

              logger?.trace('SSE message received', { messageCount, data: message.data.slice(0, 100) });

              // Emit onMessage event
              if (emitEvent !== undefined && emitEvent !== null) {
                try {
                  await emitEvent('onMessage', {
                    index: messageCount,
                    data: message
                  });
                } catch (err) {
                  logger?.error('SSE onMessage event error', { error: err instanceof Error ? err.message : String(err) });
                }
              }

              // Reset temporary fields
              currentEventType = undefined;
              currentEventId = undefined;
              currentRetry = undefined;
              currentDataLines.length = 0;
            }
          };

          const processLine = async (line: string): Promise<void> => {
            // Empty line signals the end of an event
            if (line === '') {
              await dispatchCurrentMessage();
            } else if (line.startsWith('data:')) {
              // Can have multiple data lines
              const data = line.slice(5);
              // Trim only the leading space if present (per spec)
              currentDataLines.push(data.startsWith(' ') ? data.slice(1) : data);
            } else if (line.startsWith('event:')) {
              currentEventType = line.slice(6).trim();
            } else if (line.startsWith('id:')) {
              currentEventId = line.slice(3).trim();
            } else if (line.startsWith('retry:')) {
              const retryValue = parseInt(line.slice(6).trim(), 10);
              if (!isNaN(retryValue)) {
                currentRetry = retryValue;
              }
            }
            // Lines starting with ':' are comments and should be ignored
            // Other lines are ignored as well per spec
          };

          try {
            while (true) {
              const result = await reader.read();
              const done = result.done;
              const value: Uint8Array | undefined = result.value as Uint8Array | undefined;
              
              if (done) {
                // Process remaining buffer
                const lines = buffer.split('\n');
                for (const line of lines) {
                  await processLine(line);
                }
                // Flush any pending message
                await dispatchCurrentMessage();
                
                clearTimeout(timeoutId);
                logger?.debug('SSE stream complete', { messageCount, duration: Date.now() - startTime });
                
                // Emit onComplete event
                if (emitEvent !== undefined && emitEvent !== null) {
                  try {
                    await emitEvent('onComplete', { messageCount, messages });
                  } catch (err) {
                    logger?.error('SSE onComplete event error', { error: err instanceof Error ? err.message : String(err) });
                  }
                }
                
                resolve({
                  status: response.status,
                  statusText: 'Stream Complete',
                  body: JSON.stringify({ messages, count: messageCount }),
                  headers: Object.fromEntries(response.headers.entries()),
                  duration: Date.now() - startTime,
                  messageCount,
                  messages
                } as ProtocolResponse & { messageCount: number; messages: SSEMessage[] });
                break;
              }

              // Decode chunk and add to buffer
              if (value !== undefined) {
                buffer += decoder.decode(value, { stream: true });
              }
              
              // Process complete lines
              const lines = buffer.split('\n');
              buffer = lines.pop() ?? ''; // Keep incomplete line in buffer
              
              for (const line of lines) {
                await processLine(line);
              }
            }
          } catch (err) {
            clearTimeout(timeoutId);
            
            // Check if it was aborted
            if (signal.aborted) {
              logger?.debug('SSE stream aborted', { messageCount, duration: Date.now() - startTime });
              resolve({
                status: 0,
                statusText: 'Aborted',
                body: JSON.stringify({ messages, count: messageCount }),
                headers: {},
                duration: Date.now() - startTime,
                error: 'Request aborted',
                messageCount,
                messages
              } as ProtocolResponse & { messageCount: number; messages: SSEMessage[] });
            } else {
              logger?.error('SSE stream error', { error: err instanceof Error ? err.message : String(err) });
              
              // Emit onError event
              if (emitEvent !== undefined && emitEvent !== null) {
                try {
                  await emitEvent('onError', { error: err instanceof Error ? err.message : String(err) });
                } catch (emitErr) {
                  logger?.error('SSE onError event error', { error: emitErr instanceof Error ? emitErr.message : String(emitErr) });
                }
              }
              
              resolve({
                status: 0,
                statusText: 'Stream Error',
                body: JSON.stringify({ messages, count: messageCount }),
                headers: {},
                duration: Date.now() - startTime,
                error: err instanceof Error ? err.message : String(err),
                messageCount,
                messages
              } as ProtocolResponse & { messageCount: number; messages: SSEMessage[] });
            }
          }
        }).catch((err) => {
          clearTimeout(timeoutId);
          logger?.error('SSE fetch error', { error: err instanceof Error ? err.message : String(err) });
          
          // Emit onError event
          if (emitEvent !== undefined && emitEvent !== null) {
            emitEvent('onError', { error: err instanceof Error ? err.message : String(err) }).catch((emitErr) => {
              logger?.error('SSE onError event error', { error: emitErr instanceof Error ? emitErr.message : String(emitErr) });
            });
          }
          
          resolve({
            status: 0,
            statusText: 'Connection Error',
            body: '',
            headers: {},
            duration: Date.now() - startTime,
            error: err instanceof Error ? err.message : String(err),
            messageCount: 0,
            messages: []
          } as ProtocolResponse & { messageCount: number; messages: SSEMessage[] });
        });
      } catch (err) {
        clearTimeout(timeoutId);
        logger?.error('SSE unexpected error', { error: err instanceof Error ? err.message : String(err) });
        resolve({
          status: 0,
          statusText: 'Error',
          body: '',
          headers: {},
          duration: Date.now() - startTime,
          error: err instanceof Error ? err.message : String(err),
          messageCount: 0,
          messages: []
        } as ProtocolResponse & { messageCount: number; messages: SSEMessage[] });
      }
    });
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

    if (errors.length > 0) {
      return {
        valid: false,
        errors
      };
    }

    return { valid: true };
  }
};

export default ssePlugin;
