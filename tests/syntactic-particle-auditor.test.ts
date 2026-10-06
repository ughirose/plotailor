import { describe, it, expect } from 'vitest';
import { SyntacticParticleAuditor } from '../src/core/editor/SyntacticParticleAuditor.js';

describe('SyntacticParticleAuditor', () => {
  const auditor = new SyntacticParticleAuditor();

  describe('False Positive Prevention (文学的実例文で誤警告を出さない)', () => {
    it('does NOT trigger warning for clauses separated by punctuation (読点による節境界)', () => {
      // 3 occurrences of 'の', but separated across 3 clauses by 読点 (各節内は1回のみ)
      const text = '彼の言った通りに街へ向かい、教会の扉を開けると、黒衣の男が立っていた。';
      const chains = auditor.auditParticleChains(text);
      expect(chains).toHaveLength(0);
    });

    it('does NOT trigger warning for subject-case "の" preceding relative clause predicates (主格の「の」)', () => {
      // 「雪の降る」は主格（が置換可能）、「窓の外」「部屋の隅」は修飾だが節・述語で分離
      const text = '雪の降る静かな夜、窓の外の月明かりが部屋の隅を照らしていた。';
      const chains = auditor.auditParticleChains(text);
      expect(chains).toHaveLength(0);
    });

    it('does NOT trigger warning for formal nouns and idiomatic expressions (形式名詞・連語)', () => {
      // 「こと」「通り」「ため」
      const text = 'このことについては、彼の言う通りの結果になったため、次の対策を練る。';
      const chains = auditor.auditParticleChains(text);
      expect(chains).toHaveLength(0);
    });

    it('does NOT count compound particles like のみ, ので, のに, のは, のが, のだ', () => {
      const text = '雨が降ったので、傘を持つのに苦労したのだが、家に着いた。';
      const chains = auditor.auditParticleChains(text);
      expect(chains).toHaveLength(0);
    });

    it('does NOT count pronouns or adnominals ending in の (この, その, あの, どの, ほんの)', () => {
      const text = 'この街のその店であの人のほんの一言を思い出した。';
      const chains = auditor.auditParticleChains(text);
      expect(chains).toHaveLength(0);
    });
  });

  describe('True Positive Detection (不自然な助詞多用・悪文を正確に検出)', () => {
    it('detects 4 consecutive noun modifier chains in a single clause', () => {
      const text = '私の友達の家の猫の毛は白い。';
      const chains = auditor.auditParticleChains(text);
      expect(chains).toHaveLength(1);
      expect(chains[0].particle).toBe('の');
      expect(chains[0].count).toBe(4);
      expect(chains[0].chainText).toBe('の友達の家の猫の');
    });

    it('detects 3 consecutive noun modifier chains in a single clause with default threshold', () => {
      const text = '王国の首都の中央の広場の噴水。';
      const chains = auditor.auditParticleChains(text);
      expect(chains).toHaveLength(1);
      expect(chains[0].count).toBe(4);
    });

    it('isolates the warning to the specific offending clause rather than the entire sentence', () => {
      const text = '朝早く起きて散歩をし、私の友達の家の猫の毛をブラッシングしてから出かけた。';
      const chains = auditor.auditParticleChains(text);
      expect(chains).toHaveLength(1);
      expect(chains[0].count).toBe(4);
      // '私の友達の家の猫の毛' starts after '朝早く起きて散歩をし、'
      expect(chains[0].from).toBeGreaterThan(10);
    });
  });

  describe('Custom threshold behavior', () => {
    it('honors custom threshold (e.g., chainThreshold = 4)', () => {
      const strictAuditor = new SyntacticParticleAuditor({ chainThreshold: 4 });
      const text3 = '青い空の雲の向こうの光。'; // 3 consecutive
      expect(strictAuditor.auditParticleChains(text3)).toHaveLength(0);

      const text4 = '私の友達の家の猫の毛。'; // 4 consecutive
      expect(strictAuditor.auditParticleChains(text4)).toHaveLength(1);
    });
  });
});
