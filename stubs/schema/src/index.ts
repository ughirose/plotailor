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
  [key: string]: any;
}

export interface NarrativeContext {
  id?: string;
  sceneId?: string;
  characterIds?: string[];
  characters?: any[];
  locationId?: string;
  activePlots?: string[];
  [key: string]: any;
}
