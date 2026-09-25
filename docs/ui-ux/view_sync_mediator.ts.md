# view_sync_mediator.ts

/**
 * ViewSyncMediator: Multi-view Epistemic and Temporal Synchronization Store
 * Synchronizes Editor, Map, Timeline, and Inspector views with Epistemic Snapshots.
 */

export interface EpistemicFact {
  factId: string;
  predicate: string;
  subjectEntityId: string;
  objectEntityId?: string;
  validTimeStart: number; // Continuous absolute day
  validTimeEnd?: number;
  focalizerVisibility: Record<string, "KNOWN" | "UNKNOWN" | "SECRET">;
}

export interface EpistemicSnapshot {
  currentDay: number;
  activeFocalizerId: string;
  knownFacts: EpistemicFact[];
  secretFacts: EpistemicFact[];
  activeForeshadowings: Array<{
    arcId: string;
    plantedSceneId: string;
    status: "PLANTED" | "RESOLVED" | "DANGLING";
  }>;
}

export class ViewSyncMediator {
  private snapshot: EpistemicSnapshot;

  constructor(initialFocalizerId: string) {
    this.snapshot = {
      currentDay: 0,
      activeFocalizerId: initialFocalizerId,
      knownFacts: [],
      secretFacts: [],
      activeForeshadowings: []
    };
  }

  public setTimeCursor(absoluteDay: number) {
    this.snapshot.currentDay = absoluteDay;
  }

  public setFocalizer(focalizerId: string) {
    this.snapshot.activeFocalizerId = focalizerId;
  }

  public getVisibleState(): { visibleFacts: EpistemicFact[]; isPovViolated: (fact: EpistemicFact) => boolean } {
    const focalizer = this.snapshot.activeFocalizerId;
    return {
      visibleFacts: this.snapshot.knownFacts.filter(f => f.focalizerVisibility[focalizer] === "KNOWN"),
      isPovViolated: (fact: EpistemicFact) => fact.focalizerVisibility[focalizer] === "UNKNOWN" || fact.focalizerVisibility[focalizer] === "SECRET"
    };
  }
}
