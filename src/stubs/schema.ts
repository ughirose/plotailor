export interface StateDeltaEvent {
  id?: string;
  type?: string;
  payload?: unknown;
  [key: string]: unknown;
}

export interface SubgraphSlice {
  id: string;
  nodes?: Record<string, unknown>;
  edges?: unknown[];
  [key: string]: unknown;
}

export interface NarrativeContext {
  id?: string;
  characterIds?: string[];
  locationId?: string;
  [key: string]: unknown;
}
