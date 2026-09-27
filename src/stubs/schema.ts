export interface StateDeltaEvent {
  type: string;
  payload?: unknown;
  timestamp?: number;
  [key: string]: unknown;
}

export interface SubgraphSlice {
  id: string;
  rootNodeId?: string;
  depth?: number;
  nodes?: Record<string, unknown>;
  edges?: Array<{ id?: string; source?: string; target?: string; relation?: string; [key: string]: unknown }>;
  version?: number;
  [key: string]: unknown;
}

export interface NarrativeContext {
  characterIds?: string[];
  activePlots?: string[];
  locationId?: string;
  [key: string]: unknown;
}
