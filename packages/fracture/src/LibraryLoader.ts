import { exec } from 'child_process';
import { promisify } from 'util';
import { mkdir, access, readFile, writeFile } from 'fs/promises';
import { join, resolve, dirname } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import type { ExternalLibrary } from '@apiquest/types';
import type { Logger } from './Logger.js';

const execAsync = promisify(exec);

export interface LoadedLibrary {
  name: string;
  module: unknown;
}

/**
 * Loader for external libraries (npm, file, cdn)
 * Handles per-collection library loading
 */
export class LibraryLoader {
  private cache: Map<string, unknown> = new Map();
  private tempDir: string;
  private logger: Logger;
  
  constructor(logger: Logger) {
    this.logger = logger.createLogger('LibraryLoader');
    // Create temp directory for this session
    this.tempDir = join(tmpdir(), `fracture-libs-${randomUUID()}`);
  }
  
  /**
   * Load all libraries and return map of name → module
   */
  async loadLibraries(libraries: ExternalLibrary[]): Promise<Map<string, unknown>> {
    const loaded = new Map<string, unknown>();
    
    for (const library of libraries) {
      try {
        this.logger.debug(`Loading library: ${library.name} from ${library.source.type}`);
        const module = await this.loadLibrary(library);
        loaded.set(library.name, module.module);
        this.logger.debug(`Loaded library: ${library.name}`);
      } catch (error) {
        this.logger.error(`Failed to load library ${library.name}:`, error);
        throw new Error(`Failed to load external library '${library.name}': ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    return loaded;
  }
  
  /**
   * Load single library based on source type
   */
  private async loadLibrary(library: ExternalLibrary): Promise<LoadedLibrary> {
    // Check cache first
    const cacheKey = this.getCacheKey(library);
    if (this.cache.has(cacheKey)) {
      this.logger.debug(`Using cached library: ${library.name}`);
      return {
        name: library.name,
        module: this.cache.get(cacheKey)
      };
    }
    
    let module: unknown;
    
    switch (library.source.type) {
      case 'npm':
        module = await this.loadNpmLibrary(library);
        break;
      case 'file':
        module = await this.loadFileLibrary(library);
        break;
      case 'cdn':
        module = await this.loadCdnLibrary(library);
        break;
      default:
        throw new Error(`Unknown library source type: ${(library.source as { type: string }).type}`);
    }
    
    // Cache the module
    this.cache.set(cacheKey, module);
    
    return {
      name: library.name,
      module
    };
  }
  
  /**
   * Load NPM package to temp directory
   */
  private async loadNpmLibrary(library: ExternalLibrary): Promise<unknown> {
    if (library.source.type !== 'npm') {
      throw new Error('Invalid source type');
    }
    
    // Ensure temp directory exists
    await mkdir(this.tempDir, { recursive: true });
    
    const packageName = library.source.package;
    const version = library.version ?? 'latest';
    const packageSpec = `${packageName}@${version}`;
    
    this.logger.debug(`Installing NPM package: ${packageSpec} to ${this.tempDir}`);
    
    try {
      // Install to temp directory
      await execAsync(`npm install --no-save --prefix "${this.tempDir}" ${packageSpec}`, {
        timeout: 120000 // 2 minute timeout
      });
      
      // Import library from temp directory
      const tempRequire = createRequire(join(this.tempDir, 'package.json'));
      const module = tempRequire(packageName) as unknown;
      
      return module;
    } catch (error) {
      throw new Error(`Failed to install NPM package ${packageSpec}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Load from local file path
   */
  private async loadFileLibrary(library: ExternalLibrary): Promise<unknown> {
    if (library.source.type !== 'file') {
      throw new Error('Invalid source type');
    }
    
    // Resolve path relative to current working directory
    const filePath = resolve(process.cwd(), library.source.path);
    
    this.logger.debug(`Loading file library: ${filePath}`);
    
    try {
      // Check if file exists
      await access(filePath);
      
      // Dynamic import - convert to file:// URL for cross-platform ESM compatibility
      const module = await import(pathToFileURL(filePath).href) as { default?: unknown; [key: string]: unknown };
      
      return module.default ?? module;
    } catch (error) {
      throw new Error(`Failed to load file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Download from CDN and cache
   */
  private async loadCdnLibrary(library: ExternalLibrary): Promise<unknown> {
    if (library.source.type !== 'cdn') {
      throw new Error('Invalid source type');
    }
    
    // Ensure temp directory exists
    await mkdir(this.tempDir, { recursive: true });
    
    const url = library.source.url;
    const filename = `${library.name}-${this.hashUrl(url)}.js`;
    const cachedPath = join(this.tempDir, filename);
    
    this.logger.debug(`Loading CDN library: ${url}`);
    
    try {
      // Check if already cached
      try {
        await access(cachedPath);
        this.logger.debug(`Using cached CDN file: ${cachedPath}`);
      } catch {
        // Not cached, download
        this.logger.debug(`Downloading from ${url}`);
        const response = await fetch(url);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const content = await response.text();
        await writeFile(cachedPath, content, 'utf-8');
        this.logger.debug(`Cached to ${cachedPath}`);
      }
      
      // Import from cache - convert to file:// URL for cross-platform ESM compatibility
      const module = await import(pathToFileURL(cachedPath).href) as { default?: unknown; [key: string]: unknown };
      
      return module.default ?? module;
    } catch (error) {
      throw new Error(`Failed to load CDN library from ${url}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Generate cache key for library
   */
  private getCacheKey(library: ExternalLibrary): string {
    if (library.source.type === 'npm') {
      return `npm:${library.source.package}@${library.version ?? 'latest'}`;
    } else if (library.source.type === 'file') {
      return `file:${library.source.path}`;
    } else if (library.source.type === 'cdn') {
      return `cdn:${library.source.url}`;
    }
    return `${library.name}`;
  }
  
  /**
   * Simple URL hash for cache filename
   */
  private hashUrl(url: string): string {
    // Simple hash - just use base64 of URL (truncated)
    return Buffer.from(url).toString('base64').substring(0, 16).replace(/[/+=]/g, '_');
  }
  
  /**
   * Clean up temp directory
   */
  async cleanup(): Promise<void> {
    try {
      const { rm } = await import('fs/promises');
      await rm(this.tempDir, { recursive: true, force: true });
      this.logger.debug(`Cleaned up temp directory: ${this.tempDir}`);
    } catch (error) {
      this.logger.warn(`Failed to cleanup temp directory: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
