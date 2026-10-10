import { describe, it, expect } from 'vitest';
import {
  BeatSheetProgressScorer,
  STANDARD_BEAT_SHEET,
} from '../src/core/editor/BeatSheetProgressScorer';

describe('BeatSheetProgressScorer', () => {
  const scorer = new BeatSheetProgressScorer();

  describe('evaluateProgress - Three-Act Structure Beat Sheet', () => {
    it('returns default Setup beat when progress is 0 or target is 0', () => {
      const res1 = scorer.evaluateProgress(0, 100000);
      expect(res1.currentBeat.id).toBe('setup');
      expect(res1.progressPercentage).toBe(0);
      expect(res1.act).toBe('Act1');
      expect(res1.actProgressPercentage).toBe(0);

      const res2 = scorer.evaluateProgress(5000, 0);
      expect(res2.currentBeat.id).toBe('setup');
      expect(res2.progressPercentage).toBe(0);
    });

    it('correctly maps character position ratios to Three-Act beats', () => {
      // 5% -> Setup (Act 1)
      const setupRes = scorer.evaluateProgress(5000, 100000);
      expect(setupRes.currentBeat.id).toBe('setup');
      expect(setupRes.progressPercentage).toBe(5);
      expect(setupRes.act).toBe('Act1');

      // 12% -> Inciting Incident (Act 1)
      const incidentRes = scorer.evaluateProgress(12000, 100000);
      expect(incidentRes.currentBeat.id).toBe('inciting_incident');
      expect(incidentRes.progressPercentage).toBe(12);
      expect(incidentRes.act).toBe('Act1');

      // 27% -> Plot Point 1 (Act 2)
      const pp1Res = scorer.evaluateProgress(27000, 100000);
      expect(pp1Res.currentBeat.id).toBe('plot_point_1');
      expect(pp1Res.progressPercentage).toBe(27);
      expect(pp1Res.act).toBe('Act2');

      // 50% -> Midpoint (Act 2)
      const midRes = scorer.evaluateProgress(50000, 100000);
      expect(midRes.currentBeat.id).toBe('midpoint');
      expect(midRes.progressPercentage).toBe(50);
      expect(midRes.act).toBe('Act2');

      // 72% -> Crisis / PP2 (Act 2)
      const crisisRes = scorer.evaluateProgress(72000, 100000);
      expect(crisisRes.currentBeat.id).toBe('crisis');
      expect(crisisRes.progressPercentage).toBe(72);
      expect(crisisRes.act).toBe('Act2');

      // 90% -> Climax (Act 3)
      const climaxRes = scorer.evaluateProgress(90000, 100000);
      expect(climaxRes.currentBeat.id).toBe('climax');
      expect(climaxRes.progressPercentage).toBe(90);
      expect(climaxRes.act).toBe('Act3');

      // 98% -> Resolution (Act 3)
      const resRes = scorer.evaluateProgress(98000, 100000);
      expect(resRes.currentBeat.id).toBe('resolution');
      expect(resRes.progressPercentage).toBe(98);
      expect(resRes.act).toBe('Act3');
    });

    it('clamps progress percentages at 100% and returns last beat for overflow', () => {
      const overflow = scorer.evaluateProgress(120000, 100000);
      expect(overflow.progressPercentage).toBe(100);
      expect(overflow.currentBeat.id).toBe('resolution');
      expect(overflow.act).toBe('Act3');
      expect(overflow.actProgressPercentage).toBe(100);
    });

    it('supports custom beat definitions', () => {
      const customBeats = [
        {
          id: 'part_1',
          name: 'Part 1',
          act: 'Act1' as const,
          startPercentage: 0,
          endPercentage: 50,
          description: 'First half',
        },
        {
          id: 'part_2',
          name: 'Part 2',
          act: 'Act2' as const,
          startPercentage: 50,
          endPercentage: 100,
          description: 'Second half',
        },
      ];
      const customScorer = new BeatSheetProgressScorer(customBeats);

      const res1 = customScorer.evaluateProgress(20000, 100000);
      expect(res1.currentBeat.id).toBe('part_1');

      const res2 = customScorer.evaluateProgress(70000, 100000);
      expect(res2.currentBeat.id).toBe('part_2');
    });
  });

  describe('evaluateTension - Scene Tension Scoring', () => {
    it('returns zero tension for empty or whitespace-only text', () => {
      const emptyRes = scorer.evaluateTension('');
      expect(emptyRes.tensionScore).toBe(0);
      expect(emptyRes.breakdown.actionScore).toBe(0);
      expect(emptyRes.breakdown.conflictScore).toBe(0);
      expect(emptyRes.breakdown.tempoScore).toBe(0);

      const wsRes = scorer.evaluateTension('   \n  \t ');
      expect(wsRes.tensionScore).toBe(0);
    });

    it('calculates low tension for peaceful, descriptive exposition scenes', () => {
      const expositionText =
        '静かな朝の光が部屋に差し込んでいた。テーブルの上には湯気の立つ紅茶が置かれている。彼女は本を読みながら、静かに時が流れるのを感じていた。窓の外では小鳥が囀り、おだやかな風が樹々を揺らしていた。';

      const result = scorer.evaluateTension(expositionText);
      expect(result.tensionScore).toBeLessThan(40);
      expect(result.metrics.exclamationQuestionCount).toBe(0);
      expect(result.metrics.conflictWordCount).toBe(0);
      expect(result.metrics.dialogueRatio).toBe(0);
    });

    it('calculates high tension for intense battle / conflict scenes with short dialogue and exclamations', () => {
      const battleText = `
「来るぞ！ 構えろ！」
敵の集団が突進してきた！ 激突する刃と刃！
「死ねぇっ！」
敵の剣を間一髪で交わす。恐怖と焦りが胸を刺す。
「逃げるな！ 殴れ！」
「くそっ、撃て！ 殺される前に砕け！」
悲鳴と血煙が舞い、絶望的な死闘が繰り広げられる！
`;

      const result = scorer.evaluateTension(battleText);
      expect(result.tensionScore).toBeGreaterThan(60);
      expect(result.breakdown.actionScore).toBeGreaterThan(50);
      expect(result.breakdown.conflictScore).toBeGreaterThan(50);
      expect(result.metrics.exclamationQuestionCount).toBeGreaterThan(5);
      expect(result.metrics.shortDialogueCount).toBeGreaterThan(0);
    });

    it('properly limits scores within range 0 to 100', () => {
      const extremelyHighTensionText = '「死ね！」「殺す！」「絶望！」「危機！」'.repeat(50);
      const result = scorer.evaluateTension(extremelyHighTensionText);

      expect(result.tensionScore).toBeGreaterThanOrEqual(0);
      expect(result.tensionScore).toBeLessThanOrEqual(100);
      expect(result.breakdown.actionScore).toBeLessThanOrEqual(100);
      expect(result.breakdown.conflictScore).toBeLessThanOrEqual(100);
      expect(result.breakdown.tempoScore).toBeLessThanOrEqual(100);
    });
  });

  describe('analyze - Combined Progress and Tension', () => {
    it('returns combined progress and tension analysis object', () => {
      const currentPos = 88000;
      const totalTarget = 100000;
      const sceneText = '「死ぬな！ 耐えろ！」敵の刃が迫る！ 危機一髪で身を躱した。';

      const combined = scorer.analyze(currentPos, totalTarget, sceneText);

      expect(combined.progress.currentBeat.id).toBe('climax');
      expect(combined.progress.act).toBe('Act3');
      expect(combined.tension.tensionScore).toBeGreaterThan(30);
      expect(combined.tension.metrics.actionWordCount).toBeGreaterThan(0);
    });
  });
});
