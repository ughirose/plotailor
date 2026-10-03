import { describe, it, expect, beforeEach } from 'vitest';
import {
  CharacterInteractionMatrix,
  type CharacterDefinition,
  type InteractionPair,
} from '../src/core/editor/CharacterInteractionMatrix.js';

describe('CharacterInteractionMatrix', () => {
  let matrixEngine: CharacterInteractionMatrix;

  const characters: CharacterDefinition[] = [
    { id: 'c1', name: 'ヴァレリウス', aliases: ['ヴァレリウス将軍'] },
    { id: 'c2', name: 'アーサー', aliases: ['従卒アーサー'] },
    { id: 'c3', name: 'エレナ', aliases: ['魔導士エレナ'] },
    { id: 'c4', name: '孤立の影' }, // Never appears or interacts
  ];

  beforeEach(() => {
    matrixEngine = new CharacterInteractionMatrix();
  });

  describe('isCharacterPresent & detectCharactersInText', () => {
    it('detects character presence by canonical name and aliases', () => {
      const text = 'ヴァレリウス将軍が立ち上がり、アーサーに頷いた。';

      expect(matrixEngine.isCharacterPresent(text, characters[0])).toBe(true);
      expect(matrixEngine.isCharacterPresent(text, characters[1])).toBe(true);
      expect(matrixEngine.isCharacterPresent(text, characters[2])).toBe(false);

      const present = matrixEngine.detectCharactersInText(text, characters);
      expect(present.map((c) => c.id)).toEqual(['c1', 'c2']);
    });

    it('escapes special regex characters in character names', () => {
      const specialChar: CharacterDefinition = {
        id: 'spec',
        name: 'ヴァレリウス[指揮官]',
        aliases: ['アーサー(幼名)'],
      };
      const text = 'ヴァレリウス[指揮官]とアーサー(幼名)が話している。';

      expect(matrixEngine.isCharacterPresent(text, specialChar)).toBe(true);
    });
  });

  describe('extractDialogueLines (Speaker Attribution & Turn Detection)', () => {
    it('extracts dialogue lines and resolves speaker attribution from surrounding text', () => {
      const manuscript = `ヴァレリウス将軍が叫んだ。
「敵が来るぞ！」
アーサーは剣を構えた。
「了解しました、将軍！」`;

      const dialogues = matrixEngine.extractDialogueLines(manuscript, characters);

      expect(dialogues.length).toBe(2);
      expect(dialogues[0].character?.name).toBe('ヴァレリウス');
      expect(dialogues[0].dialogueText).toBe('敵が来るぞ！');
      expect(dialogues[1].character?.name).toBe('アーサー');
      expect(dialogues[1].dialogueText).toBe('了解しました、将軍！');
    });

    it('detects dialogue exchange turns (直後発話) between alternating speakers', () => {
      const manuscript = `ヴァレリウスが言った。
「準備は良いか？」
アーサーが応じる。
「いつでもいけます。」
「よし、突撃だ！」`;

      const summary = matrixEngine.analyze(manuscript, characters);

      // Dialogue turns between Valerius and Arthur should be recorded
      const valArthurPair = summary.pairs.find(
        (p) => (p.char1.id === 'c1' && p.char2.id === 'c2') || (p.char1.id === 'c2' && p.char2.id === 'c1')
      )!;

      expect(valArthurPair.dialogueTurnCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Paragraph & Scene Co-occurrence Aggregation', () => {
    it('aggregates character co-occurrences within paragraphs and scenes', () => {
      const manuscript = `ヴァレリウスとアーサーは王都の門前に立っていた。

エレナが遠くから走り寄ってきた。「ヴァレリウス様！」

***

シーン2：ヴァレリウスとエレナの対決。`;

      const summary = matrixEngine.analyze(manuscript, characters, {
        sceneDelimiter: /\s*\*\*\*\s*/,
      });

      const valArthur = summary.pairs.find(
        (p) => (p.char1.id === 'c1' && p.char2.id === 'c2') || (p.char1.id === 'c2' && p.char2.id === 'c1')
      )!;
      const elenaVal = summary.pairs.find(
        (p) => (p.char1.id === 'c3' && p.char2.id === 'c1') || (p.char1.id === 'c1' && p.char2.id === 'c3')
      )!;

      // In scene 1: Valerius, Arthur, Elena are in the same scene, plus paragraph co-occurrences
      expect(valArthur.coOccurrenceCount).toBeGreaterThan(0);
      expect(elenaVal.coOccurrenceCount).toBeGreaterThan(0);
    });
  });

  describe('Relationship Score Matrix & Configurable Weights', () => {
    it('calculates weighted relationship score matrix', () => {
      const manuscript = `ヴァレリウスとアーサーが話している。
「行くぞ。」
「はい！」`;

      const summary = matrixEngine.analyze(manuscript, characters, {
        coOccurrenceWeight: 1.0,
        dialogueWeight: 2.0,
      });

      const valIdx = characters.findIndex((c) => c.id === 'c1');
      const artIdx = characters.findIndex((c) => c.id === 'c2');

      const expectedScore =
        summary.coOccurrenceMatrix[valIdx][artIdx] * 1.0 +
        summary.dialogueMatrix[valIdx][artIdx] * 2.0;

      expect(summary.matrix[valIdx][artIdx]).toBe(expectedScore);
      expect(summary.matrix[artIdx][valIdx]).toBe(expectedScore);
    });
  });

  describe('Top Pairs, Distant Pairs, and Isolated Character Extraction API', () => {
    it('correctly identifies top pairs, distant pairs, and isolated characters', () => {
      const manuscript = `ヴァレリウス将軍と従卒アーサーは常に共に行動した。
「アーサー、前方を頼む。」
「了解です、ヴァレリウス様！」

一方、エレナは一人魔導書を読んでいた。`;

      const summary = matrixEngine.analyze(manuscript, characters);

      // Top pairs
      const topPairs = matrixEngine.getTopPairs(summary);
      expect(topPairs.length).toBeGreaterThan(0);
      expect(topPairs[0].char1.id).toMatch(/c1|c2/);
      expect(topPairs[0].char2.id).toMatch(/c1|c2/);

      // Distant pairs (e.g. Elena & Shadow, Arthur & Shadow, Valerius & Shadow, etc.)
      const distantPairs = matrixEngine.getDistantPairs(summary);
      const shadowDistant = distantPairs.filter(
        (p) => p.char1.id === 'c4' || p.char2.id === 'c4'
      );
      expect(shadowDistant.length).toBe(3); // Shadow with c1, c2, c3

      // Isolated characters
      const isolated = matrixEngine.getIsolatedCharacters(summary);
      expect(isolated.map((c) => c.id)).toContain('c4');
      expect(isolated.map((c) => c.id)).not.toContain('c1');
      expect(isolated.map((c) => c.id)).not.toContain('c2');
    });

    it('supports limiting top pairs output', () => {
      const manuscript = `ヴァレリウスとアーサー。エレナとヴァレリウス。`;
      const summary = matrixEngine.analyze(manuscript, characters);

      const top1 = matrixEngine.getTopPairs(summary, 1);
      expect(top1.length).toBe(1);
    });
  });

  describe('Edge cases and empty inputs', () => {
    it('handles empty manuscript text gracefully', () => {
      const summary = matrixEngine.analyze('', characters);

      expect(summary.pairs.length).toBe(6); // 4 characters = 4*3/2 = 6 pairs
      expect(summary.topPairs).toEqual([]);
      expect(summary.isolatedCharacters.length).toBe(4);
    });

    it('handles single character or empty character array', () => {
      const summary = matrixEngine.analyze('ヴァレリウスは歩いた。', []);

      expect(summary.characters).toEqual([]);
      expect(summary.matrix).toEqual([]);
      expect(summary.isolatedCharacters).toEqual([]);
    });
  });
});
