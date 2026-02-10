import { EventEmitter } from 'events';
import type { TaskNode } from './TaskGraph.js';
import type { ExecutionContext, RequestResult, Request, Folder, ScriptResult } from '@apiquest/types';
import { ScriptType } from '@apiquest/types';
import { isNullOrWhitespace } from './utils.js';
import { Logger } from './Logger.js';

/**
 * Callback interface for DagScheduler to call back into CollectionRunner
 */
export interface DagExecutionCallbacks {
  // Flags are passed for every node execution.
  // When skip is true: no script execution, emit skipped assertions only
  // When bail is true: suppress assertions and scripts
  // Script execution (always through queue)
  executeScript(
    script: string,
    scriptType: ScriptType,
    context: ExecutionContext,
    node: TaskNode,
    flags: { skip: boolean; bail: boolean }
  ): Promise<ScriptResult>;
  
  // Folder lifecycle (always through queue)
  executeFolderEnter(
    node: TaskNode,
    context: ExecutionContext,
    flags: { skip: boolean; bail: boolean }
  ): Promise<void>;
  
  executeFolderExit(
    node: TaskNode,
    context: ExecutionContext,
    flags: { skip: boolean; bail: boolean }
  ): Promise<void>;
  
  // Request execution (I/O only, scripts handled separately)
  executeRequestIO(
    node: TaskNode,
    context: ExecutionContext,
    flags: { skip: boolean; bail: boolean }
  ): Promise<RequestResult>;
  
  // Condition evaluation
  evaluateCondition(
    condition: string,
    context: ExecutionContext
  ): Promise<boolean>;
  
  // Abort check
  isAborted(): boolean;
}

/**
 * Async queue for workers
 */
class AsyncQueue<T> extends EventEmitter {
  private items: T[] = [];
  private waiting: Array<(value: T | null) => void> = [];
  private closed = false;

  enqueue(item: T): void {
    if (this.closed) {
      throw new Error('Queue is closed');
    }

    // If someone is waiting, give it to them immediately
    const resolver = this.waiting.shift();
    if (resolver !== undefined) {
      resolver(item);
      return;
    }

    // Otherwise, queue it
    this.items.push(item);
    this.emit('item');
  }

  async dequeue(): Promise<T | null> {
    // If items available, return immediately
    if (this.items.length > 0) {
      return this.items.shift()!;
    }

    // If closed and empty, return null
    if (this.closed) {
      return null;
    }

    // Wait for item or close
    return new Promise<T | null>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  close(): void {
    this.closed = true;
    // Resolve all waiting promises with null
    for (const resolver of this.waiting) {
      resolver(null);
    }
    this.waiting = [];
  }

  get length(): number {
    return this.items.length;
  }
}

/**
 * DagScheduler coordinates parallel execution via DAG
 */
export class DagScheduler {
  private callbacks: DagExecutionCallbacks;
  private maxConcurrency: number;
  private logger: Logger;
  
  // Tracking
  private completedNodes = new Set<string>();
  private totalNodes = 0;
  private aborted = false;
  private skippedNodes = new Set<string>();
  private graph?: import('./TaskGraph.js').TaskGraph;

  // Queues
  private scriptQueue = new AsyncQueue<TaskNode>();
  private requestQueue = new AsyncQueue<TaskNode>();

  constructor(callbacks: DagExecutionCallbacks, maxConcurrency: number, baseLogger?: Logger) {
    this.callbacks = callbacks;
    this.maxConcurrency = maxConcurrency;
    this.logger = baseLogger?.createLogger('DagScheduler') ?? new Logger('DagScheduler');
  }

  /**
   * Execute the DAG
   * Returns array of RequestResult for all requests that were executed
   */
  public async execute(
    graph: import('./TaskGraph.js').TaskGraph,
    context: ExecutionContext
  ): Promise<RequestResult[]> {
    const results: RequestResult[] = [];
    
    // Initialize tracking
    this.totalNodes = graph.getNodes().size;
    this.completedNodes.clear();
    this.skippedNodes.clear();
    this.aborted = false;
    this.graph = graph;
    
    this.logger.debug(`Starting DAG execution: ${this.totalNodes} nodes, maxConcurrency=${this.maxConcurrency}`);

    // Get initial ready nodes
    const readyNodes = graph.getReadyNodes();
    this.logger.debug(`Initial ready nodes: ${readyNodes.length}`);
    
    if (readyNodes.length === 0) {
      // Empty DAG
      return results;
    }

    // Enqueue initial ready nodes
    for (const node of readyNodes) {
      this.enqueueNode(node);
    }

    // Start workers
    const workers: Promise<void>[] = [];
    
    // Script worker (single threaded)
    workers.push(this.runScriptWorker(graph, context, results));
    
    // Request workers (parallel pool)
    for (let i = 0; i < this.maxConcurrency; i++) {
      workers.push(this.runRequestWorker(graph, context, results));
    }

    // Wait for all workers to complete
    await Promise.all(workers);
    
    return results;
  }

  private async runScriptWorker(
    graph: import('./TaskGraph.js').TaskGraph,
    context: ExecutionContext,
    results: RequestResult[]
  ): Promise<void> {
    while (true) {
      const node = await this.scriptQueue.dequeue();
      if (node === null) {
        // Queue closed, we're done
        break;
      }

      // Check abort
      if (this.aborted || this.callbacks.isAborted()) {
        this.markComplete(node.id, graph);
        continue;
      }

      // Check if node was skipped (e.g., by folder condition)
      if (this.skippedNodes.has(node.id)) {
        // Node already skipped by skipSubtree(), just mark complete
        this.markComplete(node.id, graph);
        continue;
      }

      // Execute script node
      await this.executeScriptNode(node, context, results);
      
      // Mark complete and enqueue newly-ready nodes
      this.markComplete(node.id, graph);
    }
  }

  private async runRequestWorker(
    graph: import('./TaskGraph.js').TaskGraph,
    context: ExecutionContext,
    results: RequestResult[]
  ): Promise<void> {
    while (true) {
      const node = await this.requestQueue.dequeue();
      if (node === null) {
        // Queue closed, we're done
        break;
      }

      // Check abort
      if (this.aborted || this.callbacks.isAborted()) {
        this.markComplete(node.id, graph);
        continue;
      }

      // Check if node was skipped (e.g., by folder condition)
      if (this.skippedNodes.has(node.id)) {
        // Node already skipped by skipSubtree(), just mark complete
        this.markComplete(node.id, graph);
        continue;
      }

      // Execute request node
      await this.executeRequestNode(node, context, results);
      
      // Mark complete and enqueue newly-ready nodes
      this.markComplete(node.id, graph);
    }
  }

  private async executeScriptNode(
    node: TaskNode,
    context: ExecutionContext,
    results: RequestResult[]
  ): Promise<void> {
    const flags = {
      skip: false,
      bail: this.aborted || this.callbacks.isAborted()
    };
    // Handle folder lifecycle nodes
    if (node.type === 'folder-enter') {
      if (node.condition !== undefined) {
        this.logger.debug(`Evaluating folder condition for ${node.name}: ${node.condition}`);
        const conditionPassed = await this.callbacks.evaluateCondition(node.condition, context);
        this.logger.debug(`Folder condition result for ${node.name}: ${conditionPassed}`);
        if (!conditionPassed) {
          this.logger.debug(`Skipping folder subtree for ${node.name} (condition=false)`);
          await this.skipSubtree(node.id, context, results, 'condition-false');
          return;
        }
      }

      // Execute folder enter lifecycle (PUSH scope + emit beforeFolder)
      await this.callbacks.executeFolderEnter(node, context, flags);
      return;
    }
    
    if (node.type === 'folder-exit') {
      // Execute folder exit lifecycle (POP scope + emit afterFolder)
      await this.callbacks.executeFolderExit(node, context, flags);
      return;
    }

    // Handle regular script nodes
    // Evaluate condition if present
    if (node.condition !== undefined) {
      const conditionPassed = await this.callbacks.evaluateCondition(node.condition, context);
      if (!conditionPassed) {
        // Skip this node
        return;
      }
    }

    // Execute script if present
    if (!isNullOrWhitespace(node.script) && node.scriptType !== undefined) {
      const scriptResult = await this.callbacks.executeScript(
        node.script!,
        node.scriptType,
        context,
        node,
        flags
      );
      
      // Handle test failures (trigger bail if enabled)
      // Note: callbacks.executeScript handles bail internally
    }
  }

  private async executeRequestNode(
    node: TaskNode,
    context: ExecutionContext,
    results: RequestResult[]
  ): Promise<void> {
    const flags = {
      skip: false,
      bail: this.aborted || this.callbacks.isAborted()
    };

    if (flags.bail) {
      this.logger.debug(`Bail active, skipping request ${node.id}`);
      return;
    }
    // Evaluate condition if present
    if (node.condition !== undefined) {
      const conditionPassed = await this.callbacks.evaluateCondition(node.condition, context);
      if (!conditionPassed) {
        flags.skip = true;
        this.logger.debug(`Request ${node.id} skipped by condition`);
        // Add skipped result
        const request = node.item as Request;
        const skippedResult: RequestResult = {
          requestId: request.id,
          requestName: request.name,
          path: node.path,
          success: true,
          tests: [],
          duration: 0,
          iteration: context.iterationCurrent,
          scriptError: 'Skipped by condition'
        };
        results.push(skippedResult);
        return;
      }
    }

    // Execute request I/O
    const result = await this.callbacks.executeRequestIO(node, context, flags);
    results.push(result);
  }

  private async skipSubtree(
    rootNodeId: string,
    context: ExecutionContext,
    results: RequestResult[],
    reason: string
  ): Promise<void> {
    const graph = this.graph;
    if (graph === undefined) {
      return;
    }

    const nodes = graph.getNodes();
    const childrenByFolderId = graph.getChildrenByFolderId();
    const stack: string[] = [rootNodeId];

    this.logger.debug(`Skipping subtree from node ${rootNodeId} (${reason})`);

    while (stack.length > 0) {
      const currentId = stack.pop() as string;
      if (this.skippedNodes.has(currentId)) {
        continue;
      }
      this.skippedNodes.add(currentId);

      const currentNode = nodes.get(currentId);
      if (currentNode?.type === 'request') {
        const request = currentNode.item as Request;
        const result = await this.callbacks.executeRequestIO(currentNode, context, {
          skip: true,
          bail: false
        });
        results.push(result);
      }

      const childIds = currentNode?.path !== undefined
        ? (childrenByFolderId.get(currentNode.path) ?? [])
        : [];

      for (const childId of childIds) {
        stack.push(childId);
      }

      this.markComplete(currentId, graph);
    }
  }

  private markComplete(
    nodeId: string,
    graph: import('./TaskGraph.js').TaskGraph
  ): void {
    this.completedNodes.add(nodeId);
    
    // Get newly-ready nodes
    const nowReady = graph.completeNode(nodeId);
    
    // Only enqueue new nodes if not aborted (bail stops scheduling new work)
    if (!this.aborted && !this.callbacks.isAborted()) {
      for (const readyNode of nowReady) {
        this.enqueueNode(readyNode);
      }
    } else {
      // Mark skipped nodes as complete so we can finish
      for (const readyNode of nowReady) {
        this.completedNodes.add(readyNode.id);
      }
    }

    // Check if all nodes complete OR if aborted and queues empty
    const allComplete = this.completedNodes.size === this.totalNodes;
    const abortedAndIdle = (this.aborted || this.callbacks.isAborted()) &&
                            this.scriptQueue.length === 0 &&
                            this.requestQueue.length === 0;
    
    if (allComplete || abortedAndIdle) {
      // Close queues to signal workers to exit
      this.scriptQueue.close();
      this.requestQueue.close();
    }
  }

  private enqueueNode(node: TaskNode): void {
    // folder-enter and folder-exit are lifecycle nodes, must be serialized through script queue
    if (node.type === 'folder-enter' || node.type === 'folder-exit' || node.type === 'script') {
      this.scriptQueue.enqueue(node);
    } else {
      this.requestQueue.enqueue(node);
    }
  }
}
