export interface StateDeltaEvent {
  id?: string;
  type?: string;
  payload?: any;
}

export interface SubgraphSlice {
  id: string;
  rootNodeId?: string;
  nodes?: Record<string, any> | any[];
  edges?: any[];
  [key: string]: any;
}

export interface NarrativeContext {
  id?: string;
  slice?: SubgraphSlice;
  state?: any;
  characterIds?: string[];
  locationId?: string;
  activePlots?: any[];
  [key: string]: any;
}
