export interface StateDeltaEvent {
  id?: string;
  type?: string;
  payload?: unknown;
  timestamp?: number;
  [key: string]: unknown;
}

export interface SubgraphSlice {
  id: string;
  rootNodeId?: string;
  depth?: number;
  nodes?: Record<string, unknown> | unknown[];
  edges?: unknown[];
  version?: number;
  [key: string]: unknown;
}

export interface NarrativeContext {
  id?: string;
  sliceId?: string;
  characterIds?: string[];
  activePlots?: string[];
  locationId?: string;
  [key: string]: unknown;
}
