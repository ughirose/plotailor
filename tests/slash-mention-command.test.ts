import { describe, it, expect, beforeEach } from 'vitest';
import {
  SlashMentionCommandParser,
  LoreMentionCandidate,
  SlashCommandDefinition,
} from '../src/core/editor/SlashMentionCommandParser.js';

describe('SlashMentionCommandParser', () => {
  let parser: SlashMentionCommandParser;

  const mockLoreDict: LoreMentionCandidate[] = [
    {
      id: 'alice',
      name: 'アリス',
      category: 'character',
      ruby: 'ありす',
      description: '主人公の魔法使い',
    },
    {
      id: 'mana_stone',
      name: '魔導石',
      category: 'item',
      ruby: 'マナストーン',
      description: '魔力を秘めた神秘の鉱石',
    },
    {
      id: 'elf_village',
      name: 'エルフの里',
      category: 'location',
      description: '森の奥深くにある集落',
    },
  ];

  beforeEach(() => {
    parser = new SlashMentionCommandParser(undefined, mockLoreDict);
  });

  describe('Slash Command Parsing', () => {
    it('detects slash command at the start of a line', () => {
      const text = '/rub';
      const match = parser.parseCommandAtCursor({
        text,
        cursorOffset: text.length,
      });

      expect(match).not.toBeNull();
      expect(match?.triggerType).toBe('slash');
      expect(match?.prefix).toBe('rub');
      expect(match?.rawMatch).toBe('/rub');
      expect(match?.from).toBe(0);
      expect(match?.to).toBe(4);
    });

    it('detects slash command after whitespace or Japanese full-width space', () => {
      const text = '彼は言った。 /ch';
      const match = parser.parseCommandAtCursor({
        text,
        cursorOffset: text.length,
      });

      expect(match).not.toBeNull();
      expect(match?.triggerType).toBe('slash');
      expect(match?.prefix).toBe('ch');
      expect(match?.rawMatch).toBe('/ch');
      expect(match?.from).toBe(6);
      expect(match?.to).toBe(9);

      const textJpSpace = '第一節　/head';
      const matchJp = parser.parseCommandAtCursor({
        text: textJpSpace,
        cursorOffset: textJpSpace.length,
      });

      expect(matchJp).not.toBeNull();
      expect(matchJp?.triggerType).toBe('slash');
      expect(matchJp?.prefix).toBe('head');
      expect(matchJp?.from).toBe(4);
      expect(matchJp?.to).toBe(9);
    });

    it('ignores slash inside URLs or mid-word text', () => {
      const urlText = 'https://example.com/api';
      const matchUrl = parser.parseCommandAtCursor({
        text: urlText,
        cursorOffset: urlText.length,
      });
      expect(matchUrl).toBeNull();

      const midWordText = 'and/or';
      const matchMid = parser.parseCommandAtCursor({
        text: midWordText,
        cursorOffset: midWordText.length,
      });
      expect(matchMid).toBeNull();
    });

    it('dispatches default slash command completions', () => {
      const text = '冒頭で /ru';
      const result = parser.dispatch({
        text,
        cursorOffset: text.length,
      });

      expect(result).not.toBeNull();
      expect(result?.triggerType).toBe('slash');
      expect(result?.from).toBe(4);
      expect(result?.to).toBe(7);
      expect(result?.candidates.length).toBeGreaterThan(0);

      const rubyCmd = result?.candidates.find((c) => c.label === '/ruby');
      expect(rubyCmd).toBeDefined();
      expect(rubyCmd?.replacementText).toContain('｜${1:漢字}《${2:るび}》');
    });
  });

  describe('Mention (@) Command Parsing', () => {
    it('detects mention at line start or after Japanese punctuation', () => {
      const text = '@アリ';
      const match = parser.parseCommandAtCursor({
        text,
        cursorOffset: text.length,
      });

      expect(match).not.toBeNull();
      expect(match?.triggerType).toBe('mention');
      expect(match?.prefix).toBe('アリ');
      expect(match?.rawMatch).toBe('@アリ');
      expect(match?.from).toBe(0);
      expect(match?.to).toBe(3);

      const textWithBracket = '「@魔';
      const matchBracket = parser.parseCommandAtCursor({
        text: textWithBracket,
        cursorOffset: textWithBracket.length,
      });

      expect(matchBracket).not.toBeNull();
      expect(matchBracket?.triggerType).toBe('mention');
      expect(matchBracket?.prefix).toBe('魔');
      expect(matchBracket?.from).toBe(1);
      expect(matchBracket?.to).toBe(3);
    });

    it('filters lore candidates matching query prefix', () => {
      const text = '登場人物: @あり';
      const dispatch = parser.dispatch({
        text,
        cursorOffset: text.length,
      });

      expect(dispatch).not.toBeNull();
      expect(dispatch?.triggerType).toBe('mention');
      expect(dispatch?.candidates.length).toBe(1);
      expect(dispatch?.candidates[0].label).toBe('アリス');
      expect(dispatch?.candidates[0].replacementText).toBe('｜アリス《ありす》');
    });

    it('formats lore entry without ruby correctly', () => {
      const text = '目的地は @エル';
      const dispatch = parser.dispatch({
        text,
        cursorOffset: text.length,
      });

      expect(dispatch).not.toBeNull();
      expect(dispatch?.candidates.length).toBe(1);
      expect(dispatch?.candidates[0].label).toBe('エルフの里');
      expect(dispatch?.candidates[0].replacementText).toBe('エルフの里');
    });
  });

  describe('IME Composition Guard', () => {
    it('returns null when IME composition is active (isComposing: true)', () => {
      const text = '/ruby';
      const match = parser.parseCommandAtCursor({
        text,
        cursorOffset: text.length,
        isComposing: true,
      });
      expect(match).toBeNull();

      const dispatch = parser.dispatch({
        text: '@アリス',
        cursorOffset: 4,
        isComposing: true,
      });
      expect(dispatch).toBeNull();
    });
  });

  describe('Customization & Dynamic Updates', () => {
    it('allows updating slash commands and adding lore candidates dynamically', () => {
      const customSlash: SlashCommandDefinition[] = [
        {
          id: 'custom',
          name: 'custom',
          label: '/custom',
          description: 'カスタムスニペット',
          snippet: '【カスタム】',
        },
      ];

      parser.setSlashCommands(customSlash);
      const slashResult = parser.dispatch({
        text: '/cust',
        cursorOffset: 5,
      });

      expect(slashResult?.candidates.length).toBe(1);
      expect(slashResult?.candidates[0].label).toBe('/custom');

      parser.addLoreCandidate({
        id: 'hero',
        name: '勇者ロト',
        category: 'character',
      });

      const mentionResult = parser.dispatch({
        text: '@勇者',
        cursorOffset: 3,
      });

      expect(mentionResult?.candidates.length).toBe(1);
      expect(mentionResult?.candidates[0].label).toBe('勇者ロト');
    });
  });
});
