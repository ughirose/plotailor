export interface StateDeltaEvent {
  id?: string;
  type?: string;
  [key: string]: unknown;
}

export interface SubgraphSlice {
  id: string;
  rootNodeId?: string;
  depth?: number;
  nodes?: Record<string, unknown> | unknown[];
  edges?: Array<{ id?: string; source?: string; target?: string; relation?: string }>;
  version?: number;
  [key: string]: unknown;
}

export interface NarrativeContext {
  id?: string;
  characterIds?: string[];
  activePlots?: string[];
  locationId?: string;
  [key: string]: unknown;
}
