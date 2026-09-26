export interface StateDeltaEvent {
  id?: string;
  type?: string;
  payload?: any;
  timestamp?: number;
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
  locationId?: string;
}
