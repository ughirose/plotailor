/**
 * Shelved Lore Automatic Evacuation Lifecycle Engine
 * 
 * Complies with Plotailor Literature IDE Spec Section 3:
 * - Manual Addition Score S_manual = w_l * ln(L_note + 1) + w_f * N_fields + w_s * I_secret + w_r * N_relations
 *   w_l = 1.2, w_f = 2.0, w_s = 5.0, w_r = 1.5
 *   Threshold theta_shelf = 4.0
 * - DANGLING: When entity anchor disappears from text (protected in undo buffer).
 * - On Commit:
 *   - S_manual >= 4.0 -> SHELVED (permanent stock)
 *   - S_manual < 4.0  -> PURGED (auto-cleared ephemeral token)
 * - Auto-Discovery & Rebind:
 *   - When shelved proper noun appears in text, flags indicator [?] and allows Alt+P (Promote) to rebind.
 */

import type { LoreEntity } from './LoreEntityManager.js';

export const SHELF_WEIGHTS = {
  w_l: 1.2, // Logarithmic weight of note length
  w_f: 2.0, // Weight per user modified custom field
  w_s: 5.0, // Weight for top secret flag
  w_r: 1.5, // Weight per relation link
} as const;

export const SHELF_THRESHOLD = 4.0;

export interface ShelvedCandidateMatch {
  entity: LoreEntity;
  from: number;
  to: number;
  matchedText: string;
}

export interface LifecycleReconciliationResult {
  updatedEntities: LoreEntity[];
  shelvedEntities: LoreEntity[];
  purgedEntities: LoreEntity[];
  danglingEntities: LoreEntity[];
}

/**
 * Calculates the manual effort score (S_manual) for a LoreEntity.
 */
export function calculateManualScore(entity: LoreEntity): number {
  const noteLength = (entity.description || '').length;
  const l_note = Math.max(0, noteLength);

  // Custom fields count (role, customFields, aliases)
  let n_fields = 0;
  if (entity.role && entity.role.trim().length > 0) n_fields += 1;
  if (entity.aliases && entity.aliases.length > 0) n_fields += 1;
  if ((entity as any).customFields) {
    n_fields += Object.keys((entity as any).customFields).length;
  }

  const i_secret = (entity as any).isSecret === true ? 1 : 0;
  const n_relations = (entity.relations || []).length;

  const score =
    SHELF_WEIGHTS.w_l * Math.log(l_note + 1) +
    SHELF_WEIGHTS.w_f * n_fields +
    SHELF_WEIGHTS.w_s * i_secret +
    SHELF_WEIGHTS.w_r * n_relations;

  return Math.round(score * 100) / 100;
}

/**
 * Scans text to check if an entity's canonical name or aliases appear in the manuscript.
 */
export function isEntityAnchored(text: string, entity: LoreEntity): boolean {
  if (text.includes(entity.name)) return true;
  if (entity.aliases && entity.aliases.length > 0) {
    for (const alias of entity.aliases) {
      if (alias && alias.length >= 2 && text.includes(alias)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Reconciles the lifecycle of all entities against the current manuscript text.
 * When isCommitted is true (e.g. user saved or revision committed), DANGLING entities
 * are transitioned to either SHELVED (score >= 4.0) or PURGED (score < 4.0).
 */
export function reconcileEntityLifecycles(
  manuscriptText: string,
  entities: LoreEntity[],
  isCommitted = false
): LifecycleReconciliationResult {
  const updatedEntities: LoreEntity[] = [];
  const shelvedEntities: LoreEntity[] = [];
  const purgedEntities: LoreEntity[] = [];
  const danglingEntities: LoreEntity[] = [];

  for (const ent of entities) {
    const anchored = isEntityAnchored(manuscriptText, ent);
    const score = calculateManualScore(ent);
    const copy = { ...ent, manualScore: score };

    if (anchored) {
      // Re-anchor or remain active
      if (copy.status === 'dangling' || copy.status === 'shelved') {
        copy.status = 'active';
      }
      updatedEntities.push(copy);
    } else {
      // Entity has no anchor in current manuscript text
      if (copy.status === 'active' || copy.status === 'alive') {
        // Transition to dangling on anchor disappearance
        copy.status = 'dangling';
        danglingEntities.push(copy);
        updatedEntities.push(copy);
      } else if (copy.status === 'dangling') {
        if (isCommitted) {
          if (score >= SHELF_THRESHOLD) {
            copy.status = 'shelved';
            shelvedEntities.push(copy);
            updatedEntities.push(copy);
          } else {
            copy.status = 'purged';
            purgedEntities.push(copy);
            // Purged entities are dropped from updatedEntities
          }
        } else {
          danglingEntities.push(copy);
          updatedEntities.push(copy);
        }
      } else if (copy.status === 'shelved') {
        shelvedEntities.push(copy);
        updatedEntities.push(copy);
      } else if (copy.status !== 'purged') {
        updatedEntities.push(copy);
      }
    }
  }

  return {
    updatedEntities,
    shelvedEntities,
    purgedEntities,
    danglingEntities,
  };
}

/**
 * Scans text for appearances of shelved entities, so the editor can show [?] badge
 * and offer Alt+P Promote quick-binding.
 */
export function findShelvedCandidates(
  text: string,
  shelvedEntities: LoreEntity[]
): ShelvedCandidateMatch[] {
  const matches: ShelvedCandidateMatch[] = [];

  for (const ent of shelvedEntities) {
    if (ent.status !== 'shelved') continue;
    const names = [ent.name, ...(ent.aliases || [])];

    for (const name of names) {
      if (!name || name.length < 2) continue;
      let idx = text.indexOf(name);
      while (idx !== -1) {
        matches.push({
          entity: ent,
          from: idx,
          to: idx + name.length,
          matchedText: name,
        });
        idx = text.indexOf(name, idx + 1);
      }
    }
  }

  return matches;
}
