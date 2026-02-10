import type { Collection, CollectionItem, Folder, Request, PathType } from '@apiquest/types';

export interface FilterOptions {
  filter?: string;
  excludeDeps?: boolean;
  pruneEmptyFolders?: boolean;  // Default: true
}

interface ItemWithPath {
  item: CollectionItem;
  path: PathType;
}

export class RequestFilter {
  /**
   * Filter collection removing non-matching requests and empty folders
   * Returns filtered copy or original if no filtering
   */
  static filterCollection(collection: Collection, options: FilterOptions): Collection {
    if (options.filter === undefined) {
      return collection;
    }
    
    const filterSet = this.getFilterSet(collection, options);
    if (filterSet === null) {
      return collection;
    }
    
    const pruneEmpty = options.pruneEmptyFolders !== false;
    
    // Clone collection and filter items
    const filtered: Collection = {
      ...collection,
      items: this.filterItems(collection.items, filterSet, pruneEmpty)
    };
    
    return filtered;
  }
  
  /**
   * Recursively filter items keeping only requests in filterSet
   * Optionally prune empty folders
   */
  private static filterItems(
    items: CollectionItem[],
    filterSet: Set<string>,
    pruneEmpty: boolean
  ): CollectionItem[] {
    const filtered: CollectionItem[] = [];
    
    for (const item of items) {
      if (item.type === 'request') {
        if (filterSet.has(item.id)) {
          filtered.push(item);
        }
      } else {
        // Folder: recursively filter children
        const filteredChildren = this.filterItems(item.items, filterSet, pruneEmpty);
        
        if (!pruneEmpty || filteredChildren.length > 0) {
          filtered.push({
            ...item,
            items: filteredChildren
          });
        }
      }
    }
    
    return filtered;
  }
  
  /**
   * Get set of request IDs to execute
   * Returns null if no filtering needed
   */
  private static getFilterSet(collection: Collection, options: FilterOptions): Set<string> | null {
    if (options.filter === undefined) {
      return null;
    }
    
    // Collect requests matching filter
    const matchingIds = new Set<string>();
    try {
      const filterRegex = new RegExp(options.filter);
      
      // Walk collection structure and match paths
      this.collectMatchingRequests(collection.items, 'collection:/', filterRegex, matchingIds);
    } catch (error) {
      // Invalid regex - no filtering
      return null;
    }

    if (options.excludeDeps !== true) {
      return this.includeDependencies(collection, matchingIds);
    }
    
    return matchingIds;
  }
  
  /**
   * Build path with proper type prefix (same logic as TaskGraph.buildPath)
   */
  private static buildPath(parent: string, name: string, type: 'folder' | 'request'): PathType {
    // If parent is collection:/
    if (parent === 'collection:/') {
      return `${type}:/${name}` as PathType;
    }
    
    // Remove type prefix from parent path
    const basePath = parent.replace(/^(folder|request):\//, '');
    return `${type}:/${basePath}/${name}` as PathType;
  }
  
  /**
   * Collect requests matching path filter (regex)
   * Matches against both folder and request paths
   * If a folder matches, all requests in that folder are included
   */
  private static collectMatchingRequests(
    items: CollectionItem[],
    parentPath: string,
    filterRegex: RegExp,
    result: Set<string>
  ): void {
    for (const item of items) {
      if (item.type === 'folder') {
        const folderPath = this.buildPath(parentPath, item.name, 'folder');
        const folderMatches = filterRegex.test(folderPath);
        
        if (folderMatches) {
          // Folder matches - include ALL requests in this folder
          this.collectAllRequests(item.items, result);
        }
        
        // Always recurse to children
        this.collectMatchingRequests(item.items, folderPath, filterRegex, result);
      } else {
        // Request
        const requestPath = this.buildPath(parentPath, item.name, 'request');
        const requestMatches = filterRegex.test(requestPath);
        
        if (requestMatches) {
          result.add(item.id);
        }
      }
    }
  }
  
  /**
   * Collect all requests from items (helper for when folder matches)
   */
  private static collectAllRequests(items: CollectionItem[], result: Set<string>): void {
    for (const item of items) {
      if (item.type === 'request') {
        result.add(item.id);
      } else {
        this.collectAllRequests(item.items, result);
      }
    }
  }
  
  /**
   * Include dependencies by walking collection and resolving dependsOn
   */
  private static includeDependencies(
    collection: Collection,
    matchingIds: Set<string>
  ): Set<string> {
    const result = new Set<string>();
    const depMap = new Map<string, string[]>();
    
    // Build dependency map
    this.buildDependencyMap(collection.items, depMap);
    
    // Resolve dependencies recursively
    for (const requestId of matchingIds) {
      this.resolveDependencies(requestId, depMap, result);
    }
    
    return result;
  }
  
  /**
   * Build map of request/folder ID -> dependencies
   */
  private static buildDependencyMap(
    items: CollectionItem[],
    depMap: Map<string, string[]>
  ): void {
    for (const item of items) {
      if (item.type === 'request') {
        depMap.set(item.id, item.dependsOn ?? []);
      } else {
        // Folders can also have dependencies
        const folder = item;
        const folderDeps = folder.dependsOn;
        if (folderDeps !== undefined && folderDeps.length > 0) {
          depMap.set(folder.id, folderDeps);
        }
        
        // Recurse to children
        this.buildDependencyMap(folder.items, depMap);
      }
    }
  }
  
  /**
   * Recursively resolve dependencies for a request/folder
   */
  private static resolveDependencies(
    itemId: string,
    depMap: Map<string, string[]>,
    result: Set<string>
  ): void {
    result.add(itemId);
    
    const deps = depMap.get(itemId) ?? [];
    for (const depId of deps) {
      if (!result.has(depId)) {
        this.resolveDependencies(depId, depMap, result);
      }
    }
  }
}
