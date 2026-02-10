import type { Collection, Request, CollectionItem, Auth, Variable } from '@apiquest/types';
import { isNullOrEmpty, hasItems, isValidAuth, isValidAuthType } from './utils.js';
import { Logger } from './Logger.js';

export interface PluginRequirements {
  protocols: Set<string>;
  authTypes: Set<string>;
  valueProviders: Set<string>;
}

export class CollectionAnalyzer {
  private logger: Logger;

  constructor(baseLogger?: Logger) {
    this.logger = baseLogger?.createLogger('CollectionAnalyzer') ?? new Logger('CollectionAnalyzer');
  }

  /**
   * Analyze a collection to determine which plugins are needed
   * Per schema: protocol is collection-level, auth can be at any level, variables can have providers
   */
  analyzeRequirements(collection: Collection): PluginRequirements {
    this.logger.debug(`Analyzing collection requirements: ${collection.info.name}`);
    const requirements: PluginRequirements = {
      protocols: new Set(),
      authTypes: new Set(),
      valueProviders: new Set()
    };

    // Protocol is at collection level (schema line 16-18)
    if (!isNullOrEmpty(collection.protocol)) {
      requirements.protocols.add(collection.protocol);
      this.logger.trace(`Protocol requirement: ${collection.protocol}`);
    }

    // Scan collection-level auth
    if (isValidAuth(collection.auth)) {
      this.logger.trace(`Collection auth requirement: ${collection.auth?.type}`);
      this.scanAuth(collection.auth, requirements);
    }

    // Scan all items for folder/request-level auth
    if (hasItems(collection.items)) {
      this.scanItems(collection.items, requirements);
    }

    // Scan variables for provider field (schema line 123-126)
    this.scanVariables(collection, requirements);

    this.logger.debug(
      `Requirements resolved: protocols=${requirements.protocols.size}, auth=${requirements.authTypes.size}, providers=${requirements.valueProviders.size}`
    );

    return requirements;
  }

  private scanItems(items: CollectionItem[], requirements: PluginRequirements): void {
    for (const item of items) {
      if (item.type === 'folder' && hasItems(item.items)) {
        // Scan folder-level auth
        if (isValidAuth(item.auth)) {
          this.logger.trace(`Folder auth requirement: ${item.auth?.type}`);
          this.scanAuth(item.auth, requirements);
        }
        
        // Recursively scan folder items
        this.scanItems(item.items, requirements);
      } else if (item.type === 'request') {
        const request = item;
        
        // Scan request-level auth
        if (isValidAuth(request.auth)) {
          this.logger.trace(`Request auth requirement: ${request.auth?.type}`);
          this.scanAuth(request.auth, requirements);
        }
      }
    }
  }

  private scanAuth(auth: Auth, requirements: PluginRequirements): void {
    // Skip 'none' and 'inherit' - they're not plugin types
    if (isValidAuthType(auth.type)) {
      requirements.authTypes.add(auth.type);
    }
  }

  private scanVariables(collection: Collection, requirements: PluginRequirements): void {
    // Scan collection variables for provider field (variable objects, not just strings)
    const variables = collection.variables ?? {};
    
    for (const value of Object.values(variables)) {
      // Variables can be strings OR variable objects with provider field
      if (typeof value === 'object' && value !== null) {
        const varObj = value;
        if (varObj.provider !== null && varObj.provider !== undefined && varObj.provider !== '') {
          requirements.valueProviders.add(varObj.provider);
          this.logger.trace(`Variable provider requirement: ${varObj.provider}`);
        }
      }
    }
  }
}
