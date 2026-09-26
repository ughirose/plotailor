import { describe, it, expect } from 'vitest';
import {
  FuzzyTimeInterval,
  DualTrackTimelineEngine,
  type TimelineSceneInput,
} from '../src/core/timeline/DualTrackTimeline.js';

describe('Dual-Track Timeline Engine & Fuzzy Time Model', () => {
  describe('Trapezoidal Fuzzy Number (TrFN) Algebra', () => {
    it('creates valid fuzzy interval and calculates center', () => {
      const interval = new FuzzyTimeInterval(10, 12, 14, 18);
      expect(interval.a1).toBe(10);
      expect(interval.center()).toBe(13);
    });

    it('rejects invalid bounds where a1 > a2', () => {
      expect(() => new FuzzyTimeInterval(15, 10, 14, 18)).toThrow();
    });

    it('performs interval addition (A ⊕ B)', () => {
      const a = new FuzzyTimeInterval(1, 2, 3, 4);
      const b = new FuzzyTimeInterval(10, 20, 30, 40);
      const c = a.add(b);
      expect(c.a1).toBe(11);
      expect(c.a2).toBe(22);
      expect(c.a3).toBe(33);
      expect(c.a4).toBe(44);
    });

    it('evaluates overlap and strict precedence', () => {
      const t1 = new FuzzyTimeInterval(1, 2, 3, 5);
      const t2 = new FuzzyTimeInterval(6, 7, 8, 9);
      const t3 = new FuzzyTimeInterval(4, 5, 6, 7);

      expect(t1.strictlyPrecedes(t2)).toBe(true);
      expect(t1.overlaps(t2)).toBe(false);
      expect(t1.overlaps(t3)).toBe(true);
    });
  });

  describe('Dual-Track Layout & Splines', () => {
    const sampleScenes: TimelineSceneInput[] = [
      {
        id: 'scene-1',
        chapterId: 'ch1',
        title: '双月の夜',
        charCount: 2000,
        storyDayStart: 100,
        storyDayEnd: 101,
        foreshadowingRef: {
          type: 'plant',
          foreshadowingId: 'omen-1',
        },
      },
      {
        id: 'scene-2',
        chapterId: 'ch1',
        title: '幼き日の誓約 (回想)',
        charCount: 1500,
        storyDayStart: 20, // Far in the past => Analepsis
        storyDayEnd: 21,
      },
      {
        id: 'scene-3',
        chapterId: 'ch2',
        title: '帝都急襲の予兆 (予見)',
        charCount: 2500,
        storyDayStart: 250, // Far in future => Prolepsis
        storyDayEnd: 252,
      },
      {
        id: 'scene-4',
        chapterId: 'ch3',
        title: '盟約の回収',
        charCount: 1000,
        storyDayStart: 255,
        storyDayEnd: 256,
        foreshadowingRef: {
          type: 'resolve',
          foreshadowingId: 'omen-1',
        },
      },
    ];

    it('computes linear discourse track and proportional story track', () => {
      const engine = new DualTrackTimelineEngine(sampleScenes);
      const layout = engine.computeLayout();

      expect(layout.discourseNodes.length).toBe(4);
      expect(layout.storyNodes.length).toBe(4);
      expect(layout.splines.length).toBe(4);

      // Verify spline types
      const splineTypes = layout.splines.map((s) => s.type);
      expect(splineTypes[0]).toBe('progressive');
      expect(splineTypes[1]).toBe('analepsis'); // Scene 2 story day 20 < scene 1 story day 100
      expect(splineTypes[2]).toBe('prolepsis'); // Scene 3 story day 250 >> scene 2
    });

    it('identifies resolved and dangling foreshadowing arcs', () => {
      const danglingScenes: TimelineSceneInput[] = [
        {
          id: 'scene-a',
          chapterId: 'ch1',
          title: '未解決の伏線',
          charCount: 1000,
          storyDayStart: 10,
          storyDayEnd: 11,
          foreshadowingRef: {
            type: 'plant',
            foreshadowingId: 'unresolved-secret',
          },
        },
      ];

      const engine = new DualTrackTimelineEngine(danglingScenes);
      const layout = engine.computeLayout();

      expect(layout.foreshadowingArcs.length).toBe(1);
      expect(layout.foreshadowingArcs[0].isDangling).toBe(true);
      expect(layout.foreshadowingArcs[0].isDashed).toBe(true);
      expect(layout.foreshadowingArcs[0].color).toBe('#ef4444');
    });

    it('renders clean SVG output containing all tracks, splines and arcs', () => {
      const engine = new DualTrackTimelineEngine(sampleScenes);
      const svg = engine.renderSvg();

      expect(svg).toContain('<svg class="dual-track-svg"');
      expect(svg).toContain('Sjuzhet (読者体験軸)');
      expect(svg).toContain('Fabula (客観時間軸)');
      expect(svg).toContain('timeline-spline analepsis');
      expect(svg).toContain('timeline-spline prolepsis');
      expect(svg).toContain('foreshadowing-arc');
    });
  });
});
