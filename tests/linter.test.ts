import { describe, it, expect } from 'vitest';
import {
  AhoCorasickAutomaton,
  LoreLinterEngine,
  MobileResilientStorage,
  OPFSStorage,
  AozoraParser,
} from '../src/index.js';

describe('AhoCorasickAutomaton in Plotailor', () => {
  it('scans multi-pattern terms efficiently', () => {
    const trie = new AhoCorasickAutomaton<string>();
    trie.addPattern('魔導石', 'CANONICAL');
    trie.addPattern('魔道石', 'FORBIDDEN');
    trie.addPattern('魔トウ石', 'FORBIDDEN');
    trie.build();

    const results = trie.search('その少年は魔道石と魔導石を持っていた。');
    expect(results.length).toBe(2);
    expect(results[0].keyword).toBe('魔道石');
    expect(results[1].keyword).toBe('魔導石');
  });
});

describe('LoreLinterEngine', () => {
  const regulations = [
    {
      canonical: '魔導石',
      forbidden: ['魔道石', '魔トウ石'],
      category: '魔法アイテム',
    },
    {
      canonical: 'エルフ',
      forbidden: ['妖精族'],
      category: '種族',
    },
  ];

  it('detects forbidden terminology with exact diagnostics', () => {
    const linter = new LoreLinterEngine(regulations);
    const text = '彼は妖精族の集落で魔道石を手に入れた。';
    const diagnostics = linter.lint(text);

    expect(diagnostics.length).toBe(2);
    expect(diagnostics[0].wrongTerm).toBe('妖精族');
    expect(diagnostics[0].canonical).toBe('エルフ');
    expect(diagnostics[1].wrongTerm).toBe('魔道石');
    expect(diagnostics[1].canonical).toBe('魔導石');
  });

  it('bypasses linting when IME composition is active', () => {
    const linter = new LoreLinterEngine(regulations);
    const text = '彼は魔道石を';
    const diagnostics = linter.lint(text, { isComposing: true });

    expect(diagnostics.length).toBe(0);
  });

  it('re-maps diagnostic offsets accurately when Aozora markup is present', () => {
    const linter = new LoreLinterEngine(regulations);
    // raw: 彼の｜親文字《るび》は魔道石を放った。
    const raw = '彼の｜親文字《るび》は魔道石を放った。';
    const { map } = AozoraParser.parse(raw);

    const diagnostics = linter.lint(raw, { displayMap: map });
    expect(diagnostics.length).toBe(1);
    expect(diagnostics[0].canonical).toBe('魔導石');
  });
});

describe('MobileResilientStorage', () => {
  it('writes and validates valid JSON without corruption', async () => {
    const baseStorage = new OPFSStorage();
    const resilient = new MobileResilientStorage(baseStorage);

    const data = JSON.stringify({ title: '長編小説第一章', wordCount: 15000 });
    const result = await resilient.writeSafe('manuscript.json', data);

    expect(result.success).toBe(true);
    expect(result.bytesWritten).toBeGreaterThan(0);

    const readBack = await resilient.readSafe('manuscript.json');
    expect(JSON.parse(readBack).wordCount).toBe(15000);
  });

  it('aborts write when corrupt JSON is supplied', async () => {
    const baseStorage = new OPFSStorage();
    const resilient = new MobileResilientStorage(baseStorage);

    const corruptData = '{ "brokenJson": ';
    await expect(resilient.writeSafe('corrupt.json', corruptData)).rejects.toThrow('Corrupt JSON');
  });
});
