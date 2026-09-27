export interface StateDeltaEvent {
  [key: string]: any;
}

export interface SubgraphSlice {
  id: string;
  rootNodeId?: string;
  depth?: number;
  nodes?: Record<string, any>;
  edges?: Array<any>;
  version?: number;
}

export interface NarrativeContext {
  characterIds?: string[];
  activePlots?: string[];
  [key: string]: any;
}
