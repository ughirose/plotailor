import { describe, it, expect } from 'vitest';
import { PrhRuleEngine } from '../src/core/editor/PrhRuleEngine.js';

describe('PrhRuleEngine Unit Tests', () => {
  it('validates schema and adds/retrieves PRH rules', () => {
    const engine = new PrhRuleEngine();
    const rule = engine.addRule({
      id: '123e4567-e89b-12d3-a456-426614174000',
      expected: '魔法',
      patterns: ['魔術', 'まほう'],
      scope: 'all',
      action: 'suggest',
      description: '表記揺れ防止',
    });

    expect(rule.expected).toBe('魔法');
    expect(engine.getRules().length).toBe(1);
    expect(engine.getRule(rule.id)?.patterns).toEqual(['魔術', 'まほう']);
  });

  it('detects violations in all scope and ignores already compliant expected text', () => {
    const engine = new PrhRuleEngine();
    engine.addRule({
      id: '123e4567-e89b-12d3-a456-426614174001',
      expected: 'ヴァレリウス',
      patterns: ['バレリウス', 'ヴァレリオ'],
      scope: 'all',
      action: 'replace',
    });

    const text = 'バレリウスは静かに立ち上がった。ヴァレリウスは剣を抜いた。';
    const matches = engine.scan(text);

    expect(matches.length).toBe(1);
    expect(matches[0].matchedText).toBe('バレリウス');
    expect(matches[0].expected).toBe('ヴァレリウス');
    expect(matches[0].action).toBe('replace');
  });

  it('correctly discriminates dialogue and narration scopes', () => {
    const engine = new PrhRuleEngine();
    // Dialogue rule: 「貴様」 -> 「お前」
    engine.addRule({
      id: '123e4567-e89b-12d3-a456-426614174002',
      expected: 'お前',
      patterns: ['貴様'],
      scope: 'dialogue',
      action: 'suggest',
    });
    // Narration rule: 「僕」 -> 「彼」
    engine.addRule({
      id: '123e4567-e89b-12d3-a456-426614174003',
      expected: '彼',
      patterns: ['僕'],
      scope: 'narration',
      action: 'replace',
    });

    const text = '僕は前を向いた。「貴様、何をしている」と僕は言った。';
    const matches = engine.scan(text);

    // Narration matches: 「僕」 outside dialogue (first and second '僕')
    // Dialogue match: 「貴様」 inside dialogue
    const dialogueMatches = matches.filter(m => m.matchedText === '貴様');
    const narrationMatches = matches.filter(m => m.matchedText === '僕');

    expect(dialogueMatches.length).toBe(1);
    expect(dialogueMatches[0].expected).toBe('お前');

    expect(narrationMatches.length).toBe(2);
    expect(narrationMatches[0].expected).toBe('彼');
    expect(narrationMatches[0].action).toBe('replace');
  });

  it('filters character-specific rules based on activeCharacterId', () => {
    const engine = new PrhRuleEngine();
    engine.addRule({
      id: '123e4567-e89b-12d3-a456-426614174004',
      expected: 'わたくし',
      patterns: ['わたし', '私'],
      scope: 'dialogue',
      characterId: 'char-princess',
      action: 'suggest',
    });

    const text = '「私は行きます」';
    // When active character is another character
    expect(engine.scan(text, 'char-valerius').length).toBe(0);

    // When active character is princess
    const matches = engine.scan(text, 'char-princess');
    expect(matches.length).toBe(1);
    expect(matches[0].matchedText).toBe('私');
    expect(matches[0].expected).toBe('わたくし');
  });
});
