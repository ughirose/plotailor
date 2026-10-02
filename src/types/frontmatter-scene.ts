export interface SceneFrontmatter {
  pov?: string;
  date?: string;
  location?: string;
  characters?: string[];
  status?: string;
  scalarTime?: number;
  [key: string]: unknown;
}

export interface TimelineSyncEvent {
  type: 'timeline_sync';
  sceneId: string;
  scalarTime: number; // objective continuous ticks (milliseconds)
}
