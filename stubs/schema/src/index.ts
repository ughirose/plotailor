export interface StateDeltaEvent {
  id?: string;
  type?: string;
  payload?: any;
  [key: string]: any;
}

export interface SubgraphSlice {
  id: string;
  rootNodeId?: string;
  depth?: number;
  nodes?: Record<string, any> | any[];
  edges?: any[];
  version?: number;
  [key: string]: any;
}

export interface NarrativeContext {
  id?: string;
  characterIds?: string[];
  activePlots?: string[];
  [key: string]: any;
}
