export interface StateDeltaEvent {
  id?: string;
  type?: string;
  payload?: any;
}

export interface SubgraphSlice {
  id: string;
  rootNodeId?: string;
  depth?: number;
  nodes?: Record<string, any>;
  edges?: Array<{ id: string; source: string; target: string; relation: string }>;
  version?: number;
}

export interface NarrativeContext {
  characterIds?: string[];
  activePlots?: string[];
  locationId?: string;
}
