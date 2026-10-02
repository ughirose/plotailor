export interface RevisionNode<T = unknown> {
  id: string;
  parentId: string | null;
  timestamp: number;
  commitType: string;
  diffSummary: string;
  content: T;
  childrenIds: string[];
}

export class NonDestructiveRevisionGraph<T = unknown> {
  private nodes: Map<string, RevisionNode<T>> = new Map();
  private rootId: string | null = null;
  private currentId: string | null = null;

  constructor(
    initialContent?: T,
    initialDiffSummary: string = 'Initial revision',
    initialCommitType: string = 'initial'
  ) {
    if (initialContent !== undefined) {
      this.createRootNode(initialContent, initialDiffSummary, initialCommitType);
    }
  }

  /**
   * Create the root revision node.
   */
  public createRootNode(
    content: T,
    diffSummary: string = 'Initial revision',
    commitType: string = 'initial'
  ): RevisionNode<T> {
    if (this.rootId && this.nodes.has(this.rootId)) {
      throw new Error('Root node already exists in NonDestructiveRevisionGraph');
    }
    const id = this.generateId();
    const rootNode: RevisionNode<T> = {
      id,
      parentId: null,
      timestamp: Date.now(),
      commitType,
      diffSummary,
      content,
      childrenIds: [],
    };
    this.nodes.set(id, rootNode);
    this.rootId = id;
    this.currentId = id;
    return rootNode;
  }

  /**
   * Commit a new revision under the current node.
   * If current node already has children (e.g. after rollback),
   * this automatically creates a new branch without discarding existing children/branches.
   */
  public commit(
    content: T,
    diffSummary: string,
    commitType: string = 'edit'
  ): RevisionNode<T> {
    if (!this.currentId || !this.nodes.has(this.currentId)) {
      return this.createRootNode(content, diffSummary, commitType);
    }

    const parentNode = this.nodes.get(this.currentId)!;
    const id = this.generateId();
    const newNode: RevisionNode<T> = {
      id,
      parentId: parentNode.id,
      timestamp: Date.now(),
      commitType,
      diffSummary,
      content,
      childrenIds: [],
    };

    parentNode.childrenIds.push(id);
    this.nodes.set(id, newNode);
    this.currentId = id;

    return newNode;
  }

  /**
   * Rollback / checkout to a specific past or branch revision node by ID.
   * Does NOT alter or discard any existing nodes in the graph.
   */
  public rollbackTo(nodeId: string): RevisionNode<T> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Revision node with id "${nodeId}" not found in graph`);
    }
    this.currentId = nodeId;
    return node;
  }

  /**
   * Undo action: roll back to parent of current active node.
   */
  public undo(): RevisionNode<T> | null {
    if (!this.currentId) return null;
    const current = this.nodes.get(this.currentId);
    if (!current || !current.parentId) return null;
    return this.rollbackTo(current.parentId);
  }

  /**
   * Redo action: step forward to a child node.
   * If childId is specified, moves to that child.
   * Otherwise moves to the most recently created child node.
   */
  public redo(childId?: string): RevisionNode<T> | null {
    if (!this.currentId) return null;
    const current = this.nodes.get(this.currentId);
    if (!current || current.childrenIds.length === 0) return null;

    if (childId) {
      if (!current.childrenIds.includes(childId)) {
        throw new Error(`Child revision "${childId}" is not a child of node "${current.id}"`);
      }
      return this.rollbackTo(childId);
    }

    const children = current.childrenIds
      .map((id) => this.nodes.get(id))
      .filter((n): n is RevisionNode<T> => n !== undefined);

    if (children.length === 0) return null;

    children.sort((a, b) => b.timestamp - a.timestamp);
    return this.rollbackTo(children[0].id);
  }

  /**
   * Get the current active revision node.
   */
  public getCurrentNode(): RevisionNode<T> | null {
    if (!this.currentId) return null;
    return this.nodes.get(this.currentId) || null;
  }

  /**
   * Get a node by ID.
   */
  public getNode(nodeId: string): RevisionNode<T> | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * Get the root node.
   */
  public getRootNode(): RevisionNode<T> | null {
    if (!this.rootId) return null;
    return this.nodes.get(this.rootId) || null;
  }

  /**
   * Get total count of nodes.
   */
  public get size(): number {
    return this.nodes.size;
  }

  /**
   * Return all nodes in graph.
   */
  public getAllNodes(): RevisionNode<T>[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get immediate children of a node.
   */
  public getChildren(nodeId: string): RevisionNode<T>[] {
    const node = this.nodes.get(nodeId);
    if (!node) return [];
    return node.childrenIds
      .map((id) => this.nodes.get(id))
      .filter((n): n is RevisionNode<T> => n !== undefined);
  }

  /**
   * Get path of nodes from root to specified node (defaults to current active node).
   */
  public getAncestors(targetNodeId?: string): RevisionNode<T>[] {
    const startId = targetNodeId ?? this.currentId;
    if (!startId) return [];

    const path: RevisionNode<T>[] = [];
    let curr: string | null = startId;
    const visited = new Set<string>();

    while (curr && this.nodes.has(curr) && !visited.has(curr)) {
      visited.add(curr);
      const node: RevisionNode<T> = this.nodes.get(curr)!;
      path.unshift(node);
      curr = node.parentId;
    }

    return path;
  }

  /**
   * Get path from root to specified node ID.
   */
  public getPathToNode(nodeId: string): RevisionNode<T>[] {
    return this.getAncestors(nodeId);
  }

  /**
   * Retrieve all leaf nodes (nodes with 0 children) in the graph.
   */
  public getLeafNodes(): RevisionNode<T>[] {
    return Array.from(this.nodes.values()).filter((n) => n.childrenIds.length === 0);
  }

  /**
   * Get all branches (paths from root to each leaf node).
   */
  public getBranches(): RevisionNode<T>[][] {
    const leaves = this.getLeafNodes();
    return leaves.map((leaf) => this.getPathToNode(leaf.id));
  }

  /**
   * Get the current active branch path (path from root to current active node).
   */
  public getActiveBranch(): RevisionNode<T>[] {
    return this.getAncestors(this.currentId ?? undefined);
  }

  /**
   * Identify the latest active branch.
   * Defined as the branch whose leaf node has the newest timestamp.
   */
  public getLatestActiveBranch(): RevisionNode<T>[] {
    const branches = this.getBranches();
    if (branches.length === 0) return [];

    let newestBranch = branches[0];
    let newestTime = newestBranch[newestBranch.length - 1]?.timestamp ?? 0;

    for (let i = 1; i < branches.length; i++) {
      const branch = branches[i];
      const leafTime = branch[branch.length - 1]?.timestamp ?? 0;
      if (leafTime > newestTime) {
        newestTime = leafTime;
        newestBranch = branch;
      }
    }

    return newestBranch;
  }

  /**
   * Breadth-First Search traversal of the revision graph.
   */
  public traverseBFS(visitor: (node: RevisionNode<T>) => void): void {
    if (!this.rootId) return;
    const queue: string[] = [this.rootId];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);

      const node = this.nodes.get(id);
      if (!node) continue;

      visitor(node);
      queue.push(...node.childrenIds);
    }
  }

  /**
   * Depth-First Search traversal of the revision graph.
   */
  public traverseDFS(visitor: (node: RevisionNode<T>) => void): void {
    if (!this.rootId) return;
    const visited = new Set<string>();

    const dfs = (id: string) => {
      if (visited.has(id)) return;
      visited.add(id);

      const node = this.nodes.get(id);
      if (!node) return;

      visitor(node);
      for (const childId of node.childrenIds) {
        dfs(childId);
      }
    };

    dfs(this.rootId);
  }

  /**
   * Serialize graph state to JSON object.
   */
  public toJSON(): {
    rootId: string | null;
    currentId: string | null;
    nodes: Array<RevisionNode<T>>;
  } {
    return {
      rootId: this.rootId,
      currentId: this.currentId,
      nodes: Array.from(this.nodes.values()),
    };
  }

  /**
   * Deserialize graph state from JSON object.
   */
  public static fromJSON<T>(json: {
    rootId: string | null;
    currentId: string | null;
    nodes: Array<RevisionNode<T>>;
  }): NonDestructiveRevisionGraph<T> {
    const graph = new NonDestructiveRevisionGraph<T>();
    graph.rootId = json.rootId;
    graph.currentId = json.currentId;
    graph.nodes = new Map();

    for (const node of json.nodes) {
      graph.nodes.set(node.id, {
        ...node,
        childrenIds: [...node.childrenIds],
      });
    }

    return graph;
  }

  private generateId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return `rev_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
