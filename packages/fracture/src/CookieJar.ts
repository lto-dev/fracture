import { CookieJar as ToughCookieJar, Cookie } from 'tough-cookie';
import type { ICookieJar, CookieJarOptions, Cookie as ICookie, CookieSetOptions } from '@apiquest/types';

/**
 * CookieJar implementation using tough-cookie for production-quality cookie management.
 * Wraps tough-cookie's CookieJar to provide ICookieJar interface.
 */
export class CookieJar implements ICookieJar {
  private jar: ToughCookieJar;
  private options: CookieJarOptions;

  constructor(options?: CookieJarOptions) {
    this.options = options ?? { persist: false };
    this.jar = new ToughCookieJar();
  }

  /**
   * Store cookies from Set-Cookie headers
   * @param setCookieHeaders - Single header string or array of header strings
   * @param requestUrl - URL the cookies came from (REQUIRED for domain/path matching)
   */
  store(setCookieHeaders: string | string[] | null | undefined, requestUrl: string): void {
    if (setCookieHeaders === null || setCookieHeaders === undefined) {
      return;
    }

    const headers = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];

    for (const header of headers) {
      try {
        this.jar.setCookieSync(header, requestUrl);
      } catch (error) {
        // Ignore invalid cookies (tough-cookie throws on malformed cookies)
        // Silent failure is fine here
      }
    }
  }

  /**
   * Get cookie value by name
   * When called without domain, searches ALL cookies (across all domains)
   * 
   * @param name - Cookie name
   * @param domain - Optional domain to filter (not commonly used)
   * @param path - Optional path to filter (not commonly used)
   * @returns Cookie value or null if not found
   */
  get(name: string, domain?: string, path?: string): string | null {
    // Use toJSON to get ALL cookies, then manually filter for expiration only
    const allCookiesJson = this.jar.toJSON();
    if (allCookiesJson?.cookies === undefined) {
      return null;
    }

    // Search for cookie by name
    for (const cookieData of allCookiesJson.cookies) {
      // Use Cookie.fromJSON for proper typing
      const cookie = Cookie.fromJSON(cookieData);
      if (cookie === null || cookie === undefined) {
        continue;
      }

      if (cookie.key !== name) {
        continue;
      }

      // Check expiration
      const expiryTime = cookie.expiryTime();
      if (expiryTime !== null && expiryTime !== undefined && expiryTime < Date.now()) {
        continue; // Skip expired cookies
      }

      // If domain filter specified, check it
      if (domain !== null && domain !== undefined && domain !== '') {
        if (cookie.domain === null) {
          continue;
        }
        if (cookie.domain !== domain && !cookie.domain.endsWith(domain)) {
          continue;
        }
      }

      // If path filter specified, check it
      if (path !== null && path !== undefined && path !== '') {
        if (cookie.path === null || cookie.path !== path) {
          continue;
        }
      }

      return cookie.value;
    }

    return null;
  }

  /**
   * Check if cookie exists
   * @param name - Cookie name
   * @param domain - Optional domain filter
   * @param path - Optional path filter
   * @returns true if cookie exists
   */
  has(name: string, domain?: string, path?: string): boolean {
    return this.get(name, domain, path) !== null;
  }

  /**
   * Remove a cookie by name
   * @param name - Cookie name
   * @param domain - Optional domain
   * @param path - Optional path
   */
  remove(name: string, domain?: string, path?: string): void {
    const allCookiesJson = this.jar.toJSON();
    if (allCookiesJson?.cookies === undefined) {
      return;
    }

    // Find matching cookies using Cookie.fromJSON for proper typing
    const cookiesToRemove: Cookie[] = [];
    for (const cookieData of allCookiesJson.cookies) {
      const cookie = Cookie.fromJSON(cookieData);
      if (cookie === null || cookie === undefined) {
        continue;
      }
      
      if (cookie.key !== name) {
        continue;
      }

      // Check domain filter
      if (domain !== null && domain !== undefined && domain !== '') {
        if (cookie.domain === null) {
          continue;
        }
        if (cookie.domain !== domain && !cookie.domain.endsWith(domain)) {
          continue;
        }
      }

      // Check path filter
      if (path !== null && path !== undefined && path !== '') {
        if (cookie.path === null || cookie.path !== path) {
          continue;
        }
      }
      
      cookiesToRemove.push(cookie);
    }

    // Remove each matching cookie
    for (const cookie of cookiesToRemove) {
      // Domain should always be present in cookies from tough-cookie
      const cookieDomain = cookie.domain;
      if (cookieDomain === null || cookieDomain === undefined) {
        continue; // Skip cookies without domain
      }
      const cookiePath = cookie.path ?? '/';
      try {
        this.jar.store.removeCookie(cookieDomain, cookiePath, cookie.key, () => {
          // Callback required by tough-cookie API
        });
      } catch {
        // Ignore errors
      }
    }
  }

  /**
   * Set a cookie manually
   * Constructs URL from cookie's domain for RFC 6265 validation
   * @param name - Cookie name
   * @param value - Cookie value
   * @param options - Cookie options
   */
  set(name: string, value: string, options: CookieSetOptions): void {
    let cookieStr = `${name}=${value}; Domain=${options.domain}; Path=${options.path ?? '/'}`;
    
    if (options.expires !== null && options.expires !== undefined) {
      cookieStr += `; Expires=${options.expires}`;
    }
    if (options.httpOnly === true) {
      cookieStr += '; HttpOnly';
    }
    if (options.secure === true) {
      cookieStr += '; Secure';
    }
    if (options.sameSite !== null && options.sameSite !== undefined) {
      cookieStr += `; SameSite=${options.sameSite}`;
    }
    
    const protocol = options.secure === true ? 'https' : 'http';
    const url = `${protocol}://${options.domain}${options.path ?? '/'}`;
    
    this.jar.setCookieSync(cookieStr, url);
  }

  /**
   * Clear all cookies
   */
  clear(): void {
    this.jar.removeAllCookiesSync();
  }

  /**
   * Get all cookies as an object
   * Returns non-expired cookies from ALL domains
   * @returns Object with cookie names as keys and values
   */
  toObject(): Record<string, string> {
    const result: Record<string, string> = {};
    
    // Use toJSON to get all cookies, filter expired manually
    const allCookiesJson = this.jar.toJSON();
    if (allCookiesJson?.cookies === undefined) {
      return result;
    }

    // Add all non-expired cookies
    for (const cookieData of allCookiesJson.cookies) {
      try {
        const cookie = Cookie.fromJSON(cookieData);
        if (cookie === null || cookie === undefined) {
          continue;
        }

        const expiryTime = cookie.expiryTime();
        // Not expired if: no expiry time OR expiry time is in the future
        const isExpired = expiryTime !== null && expiryTime !== undefined && expiryTime < Date.now();
        if (!isExpired) {
          result[cookie.key] = cookie.value;
        }
      } catch {
        // Skip cookies that can't be parsed
      }
    }
    
    return result;
  }

  /**
   * Get Cookie header string for a URL
   * This is the main method used by HTTP plugin to send cookies with requests
   * @param url - URL to get cookies for
   * @returns Cookie header string in "name1=value1; name2=value2" format, or null if no cookies
   */
  getCookieHeader(url: string): string | null {
    try {
      const cookieString = this.jar.getCookieStringSync(url);
      if (cookieString === null || cookieString === undefined || cookieString === '') {
        return null;
      }
      return cookieString;
    } catch {
      return null;
    }
  }
}
