import type { Variable, Auth, CollectionItem } from '@apiquest/types';

/**
 * Extract value from string | Variable
 * Respects the enabled flag
 */
export function extractValue(value: string | Variable): string {
  if (typeof value === 'string') {
    return value;
  }
  // Check if enabled (default to true if not specified)
  if (value.enabled === false) {
    return '';
  }
  return value.value;
}

/**
 * Check if a string value is null, undefined, or empty
 */
export function isNullOrEmpty(value: string | null | undefined): boolean {
  return value === null || value === undefined || value === '';
}

/**
 * Check if a string value is null, undefined, empty, or only whitespace
 */
export function isNullOrWhitespace(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === '';
}

/**
 * Check if an array has items
 */
export function hasItems(items: CollectionItem[] | null | undefined): boolean {
  return items !== null && items !== undefined && items.length > 0;
}

/**
 * Type guard to check if auth is valid (not null/undefined)
 */
export function isValidAuth(auth: Auth | null | undefined): auth is Auth {
  return auth !== null && auth !== undefined;
}

/**
 * Check if an auth type is valid for plugin lookup
 * Excludes 'none' and 'inherit' as they're not plugin types
 */
export function isValidAuthType(type: string | null | undefined): type is string {
  return type !== null && type !== undefined && type !== 'none' && type !== 'inherit';
}
