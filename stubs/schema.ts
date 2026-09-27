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
  edges?: any[];
  version?: number;
}

export interface NarrativeContext {
  id?: string;
  storyId?: string;
  characterIds?: string[];
  activePlots?: string[];
  locationId?: string;
  metadata?: Record<string, any>;
}
