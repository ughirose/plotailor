/**
 * Multi-layer Decoration & POV Breach Detection Engine
 * 
 * Complies with Plotailor Literature IDE Spec Section 2.2:
 * - Layer 0 (Physical Anchor): border-bottom 1px dotted rgba(56, 189, 248, 0.6) (vertical: left side), Z-Index 10.
 * - Layer 1 (Foreshadowing): background-color rgba(245, 158, 11, 0.15), Z-Index 20, mix-blend-mode: multiply.
 * - Layer 2 (POV Violation): text-decoration wavy underline #ef4444 1.5px (vertical: right side), Z-Index 30.
 * - Conflict Arbitration: Layer 2 completely masks Layer 0 on overlapping ranges to avoid vertical line interference.
 */

import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';
import { StateField, StateEffect, type Extension, Range } from '@codemirror/state';
import type { LoreEntity } from '../lore/LoreEntityManager.js';

export type DecorationLayer = 0 | 1 | 2;

export interface MultiLayerItem {
  from: number;
  to: number;
  layer: DecorationLayer;
  type: 'physical_anchor' | 'foreshadowing' | 'pov_violation';
  label: string;
  detail?: string;
  sourceEntityId?: string;
}

export interface PovContext {
  currentPovCharacterId: string;
  currentPovCharacterName?: string;
}

export interface PovBreachResult {
  from: number;
  to: number;
  offendingText: string;
  ownerCharacterName: string;
  secretDetail: string;
  message: string;
}

/**
 * Detects POV confidentiality leaks / POV violations in the manuscript text.
 * When the narrative is told from Character A's POV, directly stating Character B's
 * inner thoughts or secret lore without external sensory cues constitutes a POV violation.
 */
export class PovBreachDetector {
  /**
   * Scans text for POV violations against known entities.
   */
  public detect(text: string, context: PovContext, entities: LoreEntity[]): PovBreachResult[] {
    const results: PovBreachResult[] = [];
    if (!context.currentPovCharacterId) return results;

    const currentPovId = context.currentPovCharacterId;

    // Filter secret entities belonging to or identifying other characters
    const nonPovSecrets = entities.filter((ent) => {
      // If entity is marked secret or belongs to another character
      const isOtherChar = ent.category === 'character' && ent.id !== currentPovId;
      const isOtherSecret = ((ent as any).isSecret || (ent as any).ownerCharacterId) && (ent as any).ownerCharacterId !== currentPovId;
      return isOtherChar || isOtherSecret;
    });

    // Unobservable inner thought patterns for other characters
    const innerThoughtPatterns = [
      /([^\s。、]{1,10})の胸中では[^\s。、]{1,20}(?:思っていた|願っていた|企んでいた|苦悩していた)/g,
      /([^\s。、]{1,10})は内心[^\s。、]{1,20}(?:見下して|嘲笑して|恐怖して|安堵して)いた/g,
      /([^\s。、]{1,10})の密かな(?:目論見|企み|意図|本心|野望)/g,
    ];

    for (const pattern of innerThoughtPatterns) {
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const charName = match[1];
        // If the subject is not current POV character
        if (context.currentPovCharacterName && charName.includes(context.currentPovCharacterName)) {
          continue;
        }

        results.push({
          from: match.index,
          to: match.index + match[0].length,
          offendingText: match[0],
          ownerCharacterName: charName,
          secretDetail: '他者の不可知な内面心理の直接記述',
          message: `【POV機密漏洩エラー】${charName}の不可知な内面思考が直接語られています。三人称限定または会話・仕草描写へ修正してください。`,
        });
      }
    }

    // Check specific secret entities
    for (const ent of entities) {
      const isSecret = (ent as any).isSecret === true;
      const ownerId = (ent as any).ownerCharacterId;
      if (isSecret && ownerId && ownerId !== currentPovId) {
        const terms = [ent.name, ...(ent.aliases || [])];
        for (const term of terms) {
          if (!term || term.length < 2) continue;
          let idx = text.indexOf(term);
          while (idx !== -1) {
            results.push({
              from: idx,
              to: idx + term.length,
              offendingText: term,
              ownerCharacterName: ent.name,
              secretDetail: ent.description || '秘匿情報',
              message: `【POV機密漏洩エラー】視点主が知り得ない極秘設定「${ent.name}」が直接暴露されています。`,
            });
            idx = text.indexOf(term, idx + 1);
          }
        }
      }
    }

    return results;
  }
}

/**
 * Reconciles decorations according to Layer hierarchy and conflict resolution rules:
 * - Layer 2 (POV Violation) completely suppresses / masks Layer 0 (Physical Anchor)
 *   on overlapping ranges to eliminate line interference in vertical writing.
 * - Sorts items according to CodeMirror Range order.
 */
export function reconcileDecorations(items: MultiLayerItem[]): MultiLayerItem[] {
  const layer2Items = items.filter((it) => it.layer === 2);

  const filtered: MultiLayerItem[] = [];

  for (const item of items) {
    if (item.layer === 0) {
      // Check if item overlaps with any Layer 2 item
      const overlapsWithLayer2 = layer2Items.some(
        (l2) => Math.max(item.from, l2.from) < Math.min(item.to, l2.to)
      );
      if (overlapsWithLayer2) {
        // Suppress Layer 0 due to Layer 2 conflict rule
        continue;
      }
    }
    filtered.push(item);
  }

  // Sort by from, then by layer ascending
  filtered.sort((a, b) => {
    if (a.from !== b.from) return a.from - b.from;
    if (a.to !== b.to) return a.to - b.to;
    return a.layer - b.layer;
  });

  return filtered;
}

// CodeMirror 6 Decoration Marks
export const layer0Mark = Decoration.mark({
  class: 'cm-decoration-layer0',
  attributes: {
    'data-layer': '0',
    title: '物理事実アンカー',
  },
});

export const layer1Mark = Decoration.mark({
  class: 'cm-decoration-layer1',
  attributes: {
    'data-layer': '1',
    title: '伏線ハイライト',
  },
});

export const layer2Mark = Decoration.mark({
  class: 'cm-decoration-layer2',
  attributes: {
    'data-layer': '2',
    title: 'POV機密漏洩エラー',
  },
});

export const setMultiLayerDecorations = StateEffect.define<DecorationSet>();

export const multiLayerDecorationField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(decorations, tr) {
    decorations = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setMultiLayerDecorations)) {
        decorations = effect.value;
      }
    }
    return decorations;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/**
 * Builds a CodeMirror DecorationSet from reconciled MultiLayerItems.
 */
export function buildMultiLayerDecorationSet(
  docLength: number,
  items: MultiLayerItem[]
): DecorationSet {
  const reconciled = reconcileDecorations(items);
  const ranges: Range<Decoration>[] = [];

  for (const item of reconciled) {
    const from = Math.max(0, Math.min(item.from, docLength));
    const to = Math.max(from, Math.min(item.to, docLength));
    if (from >= to) continue;

    let mark = layer0Mark;
    if (item.layer === 1) mark = layer1Mark;
    else if (item.layer === 2) mark = layer2Mark;

    ranges.push(mark.range(from, to));
  }

  // Ensure ranges are ordered by `from` then `to` for CodeMirror
  ranges.sort((a, b) => {
    if (a.from !== b.from) return a.from - b.from;
    return a.to - b.to;
  });

  return Decoration.set(ranges, true);
}
