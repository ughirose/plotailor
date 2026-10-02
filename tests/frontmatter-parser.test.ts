import { describe, it, expect, vi } from 'vitest';
import {
  parseFrontmatter,
  calculateObjectiveTicks,
  generateTimelineSyncEvent,
  stripFrontmatterForExport,
} from '../src/lib/parser/frontmatter-parser.js';

describe('frontmatter-parser (PR #745)', () => {
  const validYaml = `---
pov: "char_valerius"
date: "2024-10-01T12:00:00Z"
location: "loc_citadel_01"
characters:
  - "char_valerius"
  - "char_duke_aldred"
status: "draft"
---
第一章の始まり。
夜明けの光が砦を照らす。`;

  const validFictionalYaml = `---
pov: "char_valerius"
date: "帝国暦140年 白露月 15日"
location: "loc_citadel_01"
scalarTime: 10050000
---
ここは架空暦のテスト。`;

  const noFrontmatter = `第一章の始まり。
ただのテキスト。`;

  const malformedYaml = `---
pov: [unclosed array
date: 2024-10-01
---
壊れたYAML。`;

  describe('parseFrontmatter', () => {
    it('should correctly parse standard YAML frontmatter', () => {
      const { frontmatter, content } = parseFrontmatter(validYaml);
      expect(frontmatter).not.toBeNull();
      expect(frontmatter?.pov).toBe('char_valerius');
      expect(frontmatter?.date).toBe('2024-10-01T12:00:00Z');
      expect(frontmatter?.location).toBe('loc_citadel_01');
      expect(frontmatter?.characters).toEqual(['char_valerius', 'char_duke_aldred']);
      expect(frontmatter?.status).toBe('draft');
      expect(content).toBe('第一章の始まり。\n夜明けの光が砦を照らす。');
    });

    it('should return null frontmatter if none exists', () => {
      const { frontmatter, content } = parseFrontmatter(noFrontmatter);
      expect(frontmatter).toBeNull();
      expect(content).toBe(noFrontmatter);
    });

    it('should handle malformed YAML gracefully', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { frontmatter, content } = parseFrontmatter(malformedYaml);

      expect(frontmatter).toBeNull();
      expect(content).toBe('壊れたYAML。');

      warnSpy.mockRestore();
    });
  });

  describe('calculateObjectiveTicks', () => {
    it('should return scalarTime if it exists (e.g. from CustomCalendarSimulator)', () => {
      const { frontmatter } = parseFrontmatter(validFictionalYaml);
      const ticks = calculateObjectiveTicks(frontmatter);
      expect(ticks).toBe(10050000);
    });

    it('should parse standard ISO dates to JS timestamps', () => {
      const { frontmatter } = parseFrontmatter(validYaml);
      const ticks = calculateObjectiveTicks(frontmatter);
      expect(ticks).toBe(Date.parse('2024-10-01T12:00:00Z'));
    });

    it('should fallback to deterministic hash for unparseable fictional dates', () => {
      const frontmatter = {
        date: '帝国暦140年 白露月 15日',
      };
      const ticks = calculateObjectiveTicks(frontmatter);
      expect(ticks).toBeGreaterThan(0);

      // Ensure it is deterministic
      const ticks2 = calculateObjectiveTicks({ date: '帝国暦140年 白露月 15日' });
      expect(ticks).toBe(ticks2);

      // Ensure different dates give different hashes
      const ticks3 = calculateObjectiveTicks({ date: '帝国暦140年 白露月 16日' });
      expect(ticks).not.toBe(ticks3);
    });

    it('should return 0 if no timing information is available', () => {
      expect(calculateObjectiveTicks(null)).toBe(0);
      expect(calculateObjectiveTicks({})).toBe(0);
    });
  });

  describe('generateTimelineSyncEvent', () => {
    it('should generate a sync event with scalarTime', () => {
      const { frontmatter } = parseFrontmatter(validFictionalYaml);
      const event = generateTimelineSyncEvent('scene-001', frontmatter);

      expect(event.type).toBe('timeline_sync');
      expect(event.sceneId).toBe('scene-001');
      expect(event.scalarTime).toBe(10050000);
    });
  });

  describe('stripFrontmatterForExport', () => {
    it('should strip frontmatter and return only the content', () => {
      const stripped = stripFrontmatterForExport(validYaml);
      expect(stripped).toBe('第一章の始まり。\n夜明けの光が砦を照らす。');
    });

    it('should return the original text if no frontmatter is present', () => {
      const stripped = stripFrontmatterForExport(noFrontmatter);
      expect(stripped).toBe(noFrontmatter);
    });
  });
});
