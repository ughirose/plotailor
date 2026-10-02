// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  OrthographyInspector,
  OrthographyRuleEntry,
  exportToPrhYaml,
  importFromPrhYaml,
} from '../src/ui/OrthographyInspector.js';

describe('OrthographyInspector (PR #741)', () => {
  const initialRules: OrthographyRuleEntry[] = [
    {
      id: 'rule-1',
      expected: '気づく',
      patterns: ['気付く'],
      category: 'general',
      description: '一般語句の表記統一',
      enabled: true,
    },
    {
      id: 'rule-2',
      expected: 'ヴァレリウス',
      patterns: ['バレリウス', 'ヴァレリュス'],
      category: 'character',
      description: '総督閣下の正式名表記',
      enabled: true,
    },
  ];

  describe('PRH YAML serialization & deserialization', () => {
    it('exports rules to standard PRH YAML format', () => {
      const yaml = exportToPrhYaml(initialRules);
      expect(yaml).toContain('version: 1');
      expect(yaml).toContain('expected: 気づく');
      expect(yaml).toContain('- 気付く');
      expect(yaml).toContain('expected: ヴァレリウス');
      expect(yaml).toContain('- バレリウス');
      expect(yaml).toContain('- ヴァレリュス');
    });

    it('excludes disabled rules from PRH export', () => {
      const rulesWithDisabled: OrthographyRuleEntry[] = [
        ...initialRules,
        {
          id: 'rule-disabled',
          expected: '魔道石',
          patterns: ['魔導石'],
          category: 'lore',
          enabled: false,
        },
      ];
      const yaml = exportToPrhYaml(rulesWithDisabled);
      expect(yaml).not.toContain('魔道石');
    });

    it('imports PRH YAML back into rules array', () => {
      const yaml = `
# plotailor-prh.yml
version: 1
rules:
  - expected: 分かる
    patterns:
      - わかる
      - 解る
    description: 思考系動詞の統一
  - expected: セレネ
    patterns:
      - セレーネ
`;
      const imported = importFromPrhYaml(yaml);
      expect(imported.length).toBe(2);
      expect(imported[0].expected).toBe('分かる');
      expect(imported[0].patterns).toEqual(['わかる', '解る']);
      expect(imported[0].description).toBe('思考系動詞の統一');
      expect(imported[1].expected).toBe('セレネ');
      expect(imported[1].patterns).toEqual(['セレーネ']);
    });
  });

  describe('OrthographyInspector DOM component (Non-Modal 3-Pane Inline)', () => {
    it('renders inline rule table with correct initial counts', () => {
      const inspector = new OrthographyInspector({ rules: initialRules });
      const el = inspector.getElement();

      expect(el.querySelector('.orthography-header')).not.toBeNull();
      expect(el.textContent).toContain('2 / 2 有効');
      expect(el.textContent).toContain('気づく');
      expect(el.textContent).toContain('ヴァレリウス');
    });

    it('adds rule via addRule method and triggers onChange', () => {
      const onChange = vi.fn();
      const inspector = new OrthographyInspector({ rules: initialRules, onChange });

      const created = inspector.addRule({
        expected: 'コンジャンクション',
        patterns: ['合', '惑星直列'],
        category: 'lore',
        description: '天文用語',
      });

      expect(created.id).toBeDefined();
      expect(inspector.getRules().length).toBe(3);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(inspector.getElement().textContent).toContain('コンジャンクション');
    });

    it('toggles rule enabled state', () => {
      const onChange = vi.fn();
      const inspector = new OrthographyInspector({ rules: initialRules, onChange });

      const toggled = inspector.toggleRule('rule-1', false);
      expect(toggled).toBe(true);

      const rules = inspector.getRules();
      expect(rules.find((r) => r.id === 'rule-1')?.enabled).toBe(false);
      expect(inspector.getElement().textContent).toContain('1 / 2 有効');
      expect(onChange).toHaveBeenCalled();
    });

    it('removes rule via removeRule method', () => {
      const onChange = vi.fn();
      const inspector = new OrthographyInspector({ rules: initialRules, onChange });

      const removed = inspector.removeRule('rule-1');
      expect(removed).toBe(true);
      expect(inspector.getRules().length).toBe(1);
      expect(inspector.getElement().textContent).not.toContain('気づく');
      expect(onChange).toHaveBeenCalled();
    });

    it('filters rules by search text', () => {
      const inspector = new OrthographyInspector({ rules: initialRules });
      const el = inspector.getElement();
      const searchInput = el.querySelector('.orthography-search') as HTMLInputElement;

      searchInput.value = 'ヴァレ';
      searchInput.dispatchEvent(new Event('input'));

      expect(el.textContent).toContain('ヴァレリウス');
      expect(el.textContent).not.toContain('気づく');
    });

    it('adds rule via inline form submission (strictly non-modal)', () => {
      const inspector = new OrthographyInspector({ rules: initialRules });
      const el = inspector.getElement();

      const expInput = el.querySelector('.add-expected') as HTMLInputElement;
      const patInput = el.querySelector('.add-patterns') as HTMLInputElement;
      const submitBtn = el.querySelector('.add-submit-btn') as HTMLButtonElement;

      expInput.value = 'フォボス';
      patInput.value = 'ポボス, 第2衛星';
      submitBtn.click();

      expect(inspector.getRules().some((r) => r.expected === 'フォボス')).toBe(true);
      expect(el.textContent).toContain('フォボス');
    });
  });
});
