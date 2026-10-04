export interface StateDeltaEvent {
  id?: string;
  type?: string;
  data?: unknown;
}

export interface SubgraphSlice {
  id: string;
  rootNodeId?: string;
  depth?: number;
  nodes?: Record<string, unknown> | unknown[];
  edges?: unknown[];
  version?: number;
}

export interface NarrativeContext {
  id?: string;
  context?: unknown;
  characterIds?: string[];
  activePlots?: string[];
  locationId?: string;
}
