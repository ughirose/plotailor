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
  nodes?: Record<string, any>;
  edges?: Array<Record<string, any>>;
  version?: number;
  [key: string]: any;
}

export interface NarrativeContext {
  characterIds?: string[];
  activePlots?: string[];
  locationId?: string;
  [key: string]: any;
}
