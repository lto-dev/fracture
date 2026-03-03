// ============================================================================
// HTTP Plugin Types
// ============================================================================

/**
 * HTTP Response Data Structure
 * This is what gets stored in ProtocolResponse.data
 */
export interface HttpResponseData {
  status: number;
  statusText: string;
  headers: Record<string, string | string[]>;
  body: string;
}

/**
 * HTTP Body Mode Types
 */
export type HttpBodyMode = 'none' | 'raw' | 'binary' | 'urlencoded' | 'formdata';

/**
 * Key-Value pair for urlencoded and formdata bodies
 */
export interface HttpBodyKV {
  key: string;
  value: string;
  type?: 'text' | 'binary';  // Only used for formdata
  description?: string;
}

/**
 * HTTP Body Data Structure
 * Uses unified kv array for both urlencoded and formdata modes
 */
export interface HttpBodyData {
  mode: HttpBodyMode;
  raw?: string;        // Used when mode is 'raw' or 'binary' (binary expects base64)
  /** MIME type for raw mode body. Automatically set as Content-Type header if not overridden by user. */
  language?: string;
  kv?: HttpBodyKV[];   // Used when mode is 'urlencoded' or 'formdata'
}

/**
 * HTTP Request Data Structure
 */
export interface HttpRequestData {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';
  url: string;
  headers?: Record<string, string>;
  params?: Array<{ key: string; value: string; description?: string }>;
  body?: string | HttpBodyData;
}
