/**
 * Shelved Lore Multi-Stage Lifecycle & Archive Manager
 *
 * Complies with Plotailor Literature IDE Spec:
 * - Multi-stage lifecycle state machine: ACTIVE -> SHELVED -> ARCHIVED / TRASHED -> RESTORED
 * - Soft deletion archive/trash data structures replacing hard physical deletion
 * - Context integrity check (evacuationContext vs. restore target chapter, position, surrounding text)
 * - Restore history snapshot logging
 */

import type { LoreEntity } from './LoreEntityManager.js';

export type LoreLifecycleState =
  | 'ACTIVE'
  | 'DANGLING'
  | 'SHELVED'
  | 'ARCHIVED'
  | 'TRASHED'
  | 'RESTORED'
  | 'PURGED';

export interface EvacuationContext {
  chapterId: string;
  chapterTitle?: string;
  offset: number;
  surroundingText: string;
  timestamp: number;
  reason?: string;
  manualScore?: number;
}

export interface RestoreTargetContext {
  chapterId: string;
  chapterTitle?: string;
  offset?: number;
  text: string;
}

export interface ContextIntegrityResult {
  isValid: boolean;
  confidenceScore: number; // 0.0 to 1.0
  chapterMatched: boolean;
  anchorFound: boolean;
  matchedName?: string;
  positionDrift: number;
  surroundingTextMatchRatio: number;
  warnings: string[];
}

export interface RestoreSnapshot {
  id: string;
  timestamp: number;
  targetContext: RestoreTargetContext;
  restoredStatus: LoreLifecycleState;
  integrityResult: ContextIntegrityResult;
  entitySnapshot: LoreEntity;
}

export interface ShelvedArchiveRecord {
  entityId: string;
  entity: LoreEntity;
  currentState: LoreLifecycleState;
  evacuationContext?: EvacuationContext;
  restoreHistory: RestoreSnapshot[];
  archivedAt?: number;
  trashedAt?: number;
  restoredAt?: number;
  updatedAt: number;
}

const VALID_TRANSITIONS: Record<LoreLifecycleState, Set<LoreLifecycleState>> = {
  ACTIVE: new Set<LoreLifecycleState>(['DANGLING', 'SHELVED', 'ARCHIVED', 'TRASHED']),
  DANGLING: new Set<LoreLifecycleState>(['ACTIVE', 'SHELVED', 'PURGED', 'ARCHIVED', 'TRASHED']),
  SHELVED: new Set<LoreLifecycleState>(['ACTIVE', 'ARCHIVED', 'TRASHED', 'RESTORED']),
  ARCHIVED: new Set<LoreLifecycleState>(['RESTORED', 'TRASHED', 'SHELVED', 'ACTIVE']),
  TRASHED: new Set<LoreLifecycleState>(['RESTORED', 'ARCHIVED', 'SHELVED', 'ACTIVE', 'PURGED']),
  RESTORED: new Set<LoreLifecycleState>(['ACTIVE', 'SHELVED', 'ARCHIVED', 'TRASHED']),
  PURGED: new Set<LoreLifecycleState>([]), // Terminal state
};

/**
 * Calculates character bigram overlap ratio between two strings.
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0;
  const s1 = text1.trim();
  const s2 = text2.trim();
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;

  const getBigrams = (str: string): Set<string> => {
    const bigrams = new Set<string>();
    for (let i = 0; i < str.length - 1; i++) {
      bigrams.add(str.slice(i, i + 2));
    }
    return bigrams;
  };

  const bg1 = getBigrams(s1);
  const bg2 = getBigrams(s2);
  if (bg1.size === 0 || bg2.size === 0) return 0;

  let intersection = 0;
  bg1.forEach((bg) => {
    if (bg2.has(bg)) intersection++;
  });

  const union = bg1.size + bg2.size - intersection;
  return Math.round((intersection / union) * 100) / 100;
}

export class ShelvedLoreArchiveManager {
  private records: Map<string, ShelvedArchiveRecord> = new Map();

  /**
   * Validates whether a state transition from `from` to `to` is allowed.
   */
  public canTransition(from: LoreLifecycleState, to: LoreLifecycleState): boolean {
    if (from === to) return true;
    const allowed = VALID_TRANSITIONS[from];
    return allowed ? allowed.has(to) : false;
  }

  /**
   * Registers or updates an entity in the manager.
   */
  public registerEntity(
    entity: LoreEntity,
    state: LoreLifecycleState = 'ACTIVE',
    evacuationContext?: EvacuationContext
  ): ShelvedArchiveRecord {
    const existing = this.records.get(entity.id);
    const now = Date.now();

    const record: ShelvedArchiveRecord = {
      entityId: entity.id,
      entity: { ...entity, status: state.toLowerCase() },
      currentState: state,
      evacuationContext: evacuationContext || existing?.evacuationContext,
      restoreHistory: existing ? [...existing.restoreHistory] : [],
      archivedAt: existing?.archivedAt,
      trashedAt: existing?.trashedAt,
      restoredAt: existing?.restoredAt,
      updatedAt: now,
    };

    this.records.set(entity.id, record);
    return record;
  }

  /**
   * Transition an entity's lifecycle state.
   */
  public transitionState(entityId: string, newState: LoreLifecycleState): ShelvedArchiveRecord {
    const record = this.records.get(entityId);
    if (!record) {
      throw new Error(`Entity record not found for ID: ${entityId}`);
    }

    if (!this.canTransition(record.currentState, newState)) {
      throw new Error(
        `Invalid lifecycle transition from ${record.currentState} to ${newState} for entity ${entityId}`
      );
    }

    const now = Date.now();
    record.currentState = newState;
    record.entity.status = newState.toLowerCase();
    record.updatedAt = now;

    if (newState === 'ARCHIVED') record.archivedAt = now;
    if (newState === 'TRASHED') record.trashedAt = now;
    if (newState === 'RESTORED') record.restoredAt = now;

    return record;
  }

  /**
   * Archives an entity (soft-delete to Archive).
   */
  public archiveEntity(
    entityOrId: LoreEntity | string,
    evacuationContext?: EvacuationContext
  ): ShelvedArchiveRecord {
    const entityId = typeof entityOrId === 'string' ? entityOrId : entityOrId.id;
    let record = this.records.get(entityId);

    if (!record && typeof entityOrId !== 'string') {
      record = this.registerEntity(entityOrId, 'SHELVED', evacuationContext);
    } else if (!record) {
      throw new Error(`Entity record not found for ID: ${entityId}`);
    }

    if (evacuationContext) {
      record.evacuationContext = evacuationContext;
    }

    return this.transitionState(entityId, 'ARCHIVED');
  }

  /**
   * Trashes an entity (soft-delete to Trash bin).
   */
  public trashEntity(
    entityOrId: LoreEntity | string,
    evacuationContext?: EvacuationContext
  ): ShelvedArchiveRecord {
    const entityId = typeof entityOrId === 'string' ? entityOrId : entityOrId.id;
    let record = this.records.get(entityId);

    if (!record && typeof entityOrId !== 'string') {
      record = this.registerEntity(entityOrId, 'SHELVED', evacuationContext);
    } else if (!record) {
      throw new Error(`Entity record not found for ID: ${entityId}`);
    }

    if (evacuationContext) {
      record.evacuationContext = evacuationContext;
    }

    return this.transitionState(entityId, 'TRASHED');
  }

  /**
   * Shelves an entity (evacuated from active manuscript).
   */
  public shelveEntity(
    entityOrId: LoreEntity | string,
    evacuationContext?: EvacuationContext
  ): ShelvedArchiveRecord {
    const entityId = typeof entityOrId === 'string' ? entityOrId : entityOrId.id;
    let record = this.records.get(entityId);

    if (!record && typeof entityOrId !== 'string') {
      record = this.registerEntity(entityOrId, 'SHELVED', evacuationContext);
      return record;
    } else if (!record) {
      throw new Error(`Entity record not found for ID: ${entityId}`);
    }

    if (evacuationContext) {
      record.evacuationContext = evacuationContext;
    }

    return this.transitionState(entityId, 'SHELVED');
  }

  /**
   * Performs an integrity check between an original evacuationContext and a restore target context.
   */
  public checkContextIntegrity(
    evacuationContext: EvacuationContext | undefined,
    targetContext: RestoreTargetContext,
    entity: LoreEntity
  ): ContextIntegrityResult {
    const warnings: string[] = [];

    // 1. Chapter matching
    const chapterMatched = evacuationContext
      ? evacuationContext.chapterId === targetContext.chapterId
      : true;
    if (evacuationContext && !chapterMatched) {
      warnings.push(
        `Restoring to a different chapter (Original: ${evacuationContext.chapterId}, Target: ${targetContext.chapterId})`
      );
    }

    // 2. Anchor search (check entity name or aliases in targetText)
    const namesToCheck = [entity.name, ...(entity.aliases || [])].filter(
      (n): n is string => Boolean(n) && n.length >= 2
    );

    let anchorFound = false;
    let matchedName: string | undefined;
    let foundIndex = -1;

    for (const name of namesToCheck) {
      const idx = targetContext.text.indexOf(name);
      if (idx !== -1) {
        anchorFound = true;
        matchedName = name;
        foundIndex = idx;
        break;
      }
    }

    if (!anchorFound) {
      warnings.push(
        `Canonical entity name '${entity.name}' or its aliases were not found in target text`
      );
    }

    // 3. Position drift calculation
    let positionDrift = 0;
    if (evacuationContext) {
      const targetBaseOffset = targetContext.offset ?? 0;
      const targetAnchorPos = anchorFound && foundIndex !== -1
        ? targetBaseOffset + foundIndex
        : targetBaseOffset;
      positionDrift = Math.abs(targetAnchorPos - evacuationContext.offset);
    }

    if (positionDrift > 200) {
      warnings.push(`Position offset drift detected (${positionDrift} characters)`);
    }

    // 4. Surrounding text similarity ratio
    const surroundingTextMatchRatio = evacuationContext
      ? calculateTextSimilarity(evacuationContext.surroundingText, targetContext.text)
      : 1.0;

    if (evacuationContext && surroundingTextMatchRatio < 0.3) {
      warnings.push(
        `Surrounding text context has low similarity (${Math.round(
          surroundingTextMatchRatio * 100
        )}%)`
      );
    }

    // 5. Confidence Score
    let score = 0;
    if (chapterMatched) score += 0.35;
    if (anchorFound) score += 0.40;
    score += surroundingTextMatchRatio * 0.15;
    if (positionDrift <= 50) {
      score += 0.10;
    } else if (positionDrift <= 200) {
      score += 0.05;
    }

    const confidenceScore = Math.min(1.0, Math.round(score * 100) / 100);
    const isValid = confidenceScore >= 0.30;

    return {
      isValid,
      confidenceScore,
      chapterMatched,
      anchorFound,
      matchedName,
      positionDrift,
      surroundingTextMatchRatio,
      warnings,
    };
  }

  /**
   * Restores an entity from Archive or Trash, logging a restore history snapshot.
   */
  public restoreEntity(
    entityOrId: LoreEntity | string,
    targetContext: RestoreTargetContext,
    restoredState: LoreLifecycleState = 'RESTORED'
  ): {
    record: ShelvedArchiveRecord;
    entity: LoreEntity;
    integrity: ContextIntegrityResult;
  } {
    const entityId = typeof entityOrId === 'string' ? entityOrId : entityOrId.id;
    const record = this.records.get(entityId);

    if (!record) {
      throw new Error(`Entity record not found for ID: ${entityId}`);
    }

    const integrity = this.checkContextIntegrity(
      record.evacuationContext,
      targetContext,
      record.entity
    );

    this.transitionState(entityId, restoredState);

    const now = Date.now();
    const snapshot: RestoreSnapshot = {
      id: `rst_${now}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: now,
      targetContext,
      restoredStatus: restoredState,
      integrityResult: integrity,
      entitySnapshot: JSON.parse(JSON.stringify(record.entity)),
    };

    record.restoreHistory.push(snapshot);
    record.restoredAt = now;

    return {
      record,
      entity: record.entity,
      integrity,
    };
  }

  /**
   * Retrieves a record by entity ID.
   */
  public getRecord(entityId: string): ShelvedArchiveRecord | undefined {
    return this.records.get(entityId);
  }

  /**
   * Retrieves all records.
   */
  public getAllRecords(): ShelvedArchiveRecord[] {
    const list: ShelvedArchiveRecord[] = [];
    this.records.forEach((v) => list.push(v));
    return list;
  }

  /**
   * Retrieves all archived records.
   */
  public getArchivedRecords(): ShelvedArchiveRecord[] {
    return this.getAllRecords().filter((r) => r.currentState === 'ARCHIVED');
  }

  /**
   * Retrieves all trashed records.
   */
  public getTrashedRecords(): ShelvedArchiveRecord[] {
    return this.getAllRecords().filter((r) => r.currentState === 'TRASHED');
  }

  /**
   * Retrieves all shelved records.
   */
  public getShelvedRecords(): ShelvedArchiveRecord[] {
    return this.getAllRecords().filter((r) => r.currentState === 'SHELVED');
  }

  /**
   * Gets restore history snapshots for a given entity ID.
   */
  public getRestoreHistory(entityId: string): RestoreSnapshot[] {
    const record = this.records.get(entityId);
    return record ? [...record.restoreHistory] : [];
  }

  /**
   * Permanently purges a record from memory (hard delete).
   */
  public purgePermanently(entityId: string): boolean {
    const record = this.records.get(entityId);
    if (!record) return false;

    if (record.currentState !== 'TRASHED' && record.currentState !== 'PURGED') {
      throw new Error(`Cannot permanently purge entity ${entityId} when in state ${record.currentState}. Must be TRASHED first.`);
    }

    record.currentState = 'PURGED';
    record.entity.status = 'purged';
    return this.records.delete(entityId);
  }

  /**
   * Empties the trash bin, purging all TRASHED entities.
   */
  public emptyTrash(): number {
    const trashed = this.getTrashedRecords();
    let count = 0;
    for (const r of trashed) {
      if (this.purgePermanently(r.entityId)) {
        count++;
      }
    }
    return count;
  }
}
