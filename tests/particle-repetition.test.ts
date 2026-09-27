import { describe, it, expect } from 'vitest';
import {
  ParticleRepetitionLinterEngine,
  createParticleDiagnostics,
  AozoraParser,
} from '../src/index.js';

describe('ParticleRepetitionLinterEngine', () => {
  it('detects 3 or more repeated occurrences of the same particle in a sentence', () => {
    const linter = new ParticleRepetitionLinterEngine();
    const text = '私の友達の家の猫の毛は白い。';
    const diagnostics = linter.lint(text);

    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].particle).toBe('の');
    expect(diagnostics[0].count).toBe(4);
    expect(diagnostics[0].severity).toBe('warning');
    expect(diagnostics[0].message).toContain('同一助詞「の」が文中に4回連続・重複出現しています');
  });

  it('does NOT trigger warning when particle appears fewer than threshold (e.g. 2 times)', () => {
    const linter = new ParticleRepetitionLinterEngine();
    const text = '私の友達は元気です。';
    const diagnostics = linter.lint(text);

    expect(diagnostics.length).toBe(0);
  });

  it('does NOT trigger warning for different particles used in the same sentence', () => {
    const linter = new ParticleRepetitionLinterEngine();
    const text = '私のは友達に学校で会った。';
    const diagnostics = linter.lint(text);

    expect(diagnostics.length).toBe(0);
  });

  it('bypasses particle repetition linting when IME composition is active', () => {
    const linter = new ParticleRepetitionLinterEngine();
    const text = '私の友達の家の';
    const diagnostics = linter.lint(text, { isComposing: true });

    expect(diagnostics.length).toBe(0);
  });

  it('handles custom target particles and custom repetition thresholds', () => {
    const linter = new ParticleRepetitionLinterEngine(['に'], 2);
    const text = '東京に行き、京都に行った。';
    const diagnostics = linter.lint(text);

    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].particle).toBe('に');
    expect(diagnostics[0].count).toBe(2);
  });

  it('allows updating target particles dynamically via setTargetParticles', () => {
    const linter = new ParticleRepetitionLinterEngine(['の']);
    linter.setTargetParticles(['で']);
    const text = '公園で友達とカフェで静かに部屋で過ごした。';
    const diagnostics = linter.lint(text);

    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].particle).toBe('で');
  });

  it('maps offsets correctly when Aozora ruby displayMap is present', () => {
    const raw = '私の｜友達《ともだち》の｜家《うち》の猫。';
    const { map } = AozoraParser.parse(raw);
    const linter = new ParticleRepetitionLinterEngine();
    const diagnostics = linter.lint(raw, { displayMap: map });

    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].particle).toBe('の');
    expect(diagnostics[0].from).toBeLessThan(diagnostics[0].to);
  });

  it('createParticleDiagnostics helper function correctly wraps engine', () => {
    const text = '彼が山に行き、彼が海に行き、彼が空を飛んだ。';
    const diagnostics = createParticleDiagnostics(text);

    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].particle).toBe('が');
    expect(diagnostics[0].count).toBe(3);
  });
});
