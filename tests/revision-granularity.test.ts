import { describe, it, expect, beforeEach } from 'vitest';
import {
  RevisionGranularityManager,
  type RevisionSnapshotInput,
  type TaggedRevisionSnapshot,
} from '../src/core/editor/RevisionGranularityManager.js';

describe('RevisionGranularityManager Unit Tests', () => {
  let manager: RevisionGranularityManager;

  beforeEach(() => {
    manager = new RevisionGranularityManager({ defaultAuthorId: 'test-author' });
  });

  describe('Classification & Tagging', () => {
    it('should respect explicit granularity input', () => {
      const snap = manager.addSnapshot({
        timestamp: 1000,
        content: 'Explicit fine input',
        granularity: 'fine',
      });
      expect(snap.granularity).toBe('fine');

      const coarseSnap = manager.addSnapshot({
        timestamp: 2000,
        content: 'Explicit coarse input',
        granularity: 'coarse',
      });
      expect(coarseSnap.granularity).toBe('coarse');
    });

    it('should infer fine granularity from trigger strings', () => {
      const snap1 = manager.addSnapshot({ timestamp: 1000, content: 'a', trigger: 'keystroke' });
      const snap2 = manager.addSnapshot({ timestamp: 2000, content: 'ab', trigger: 'line' });
      const snap3 = manager.addSnapshot({ timestamp: 3000, content: 'abc', trigger: 'input' });

      expect(snap1.granularity).toBe('fine');
      expect(snap2.granularity).toBe('fine');
      expect(snap3.granularity).toBe('fine');
    });

    it('should infer medium granularity from timer / auto-save triggers', () => {
      const snap1 = manager.addSnapshot({ timestamp: 1000, content: 'Auto saved', trigger: 'timer' });
      const snap2 = manager.addSnapshot({ timestamp: 2000, content: 'Auto saved 2', trigger: 'auto-save' });

      expect(snap1.granularity).toBe('medium');
      expect(snap2.granularity).toBe('medium');
    });

    it('should infer coarse granularity from manual / milestone triggers', () => {
      const snap1 = manager.addSnapshot({ timestamp: 1000, content: 'Chapter 1 Complete', trigger: 'manual' });
      const snap2 = manager.addSnapshot({ timestamp: 2000, content: 'Milestone Release', trigger: 'milestone' });

      expect(snap1.granularity).toBe('coarse');
      expect(snap2.granularity).toBe('coarse');
    });

    it('should infer granularity from metadata flags', () => {
      const snap1 = manager.addSnapshot({
        timestamp: 1000,
        content: 'Milestone item',
        metadata: { isMilestone: true },
      });
      const snap2 = manager.addSnapshot({
        timestamp: 2000,
        content: 'Timer item',
        metadata: { isAutoSave: true },
      });
      const snap3 = manager.addSnapshot({
        timestamp: 3000,
        content: 'Line edit',
        metadata: { isLineInput: true },
      });

      expect(snap1.granularity).toBe('coarse');
      expect(snap2.granularity).toBe('medium');
      expect(snap3.granularity).toBe('fine');
    });

    it('should infer granularity from label contents', () => {
      const snap1 = manager.addSnapshot({ timestamp: 1000, content: 'txt', label: 'Milestone v1.0' });
      const snap2 = manager.addSnapshot({ timestamp: 2000, content: 'txt', label: 'Auto-save at 10:00' });

      expect(snap1.granularity).toBe('coarse');
      expect(snap2.granularity).toBe('medium');
    });

    it('should infer granularity using timestamp and content delta heuristics when trigger is missing', () => {
      const base = manager.addSnapshot({ timestamp: 100000, content: 'Initial draft' });
      expect(base.granularity).toBe('fine');

      // Small time diff (<15s) -> fine
      const fineSnap = manager.addSnapshot({ timestamp: 105000, content: 'Initial draft.' });
      expect(fineSnap.granularity).toBe('fine');

      // Medium time diff (120s) -> medium
      const medSnap = manager.addSnapshot({ timestamp: 225000, content: 'Initial draft with edits.' });
      expect(medSnap.granularity).toBe('medium');

      // Large time diff (600s) -> coarse
      const coarseSnap = manager.addSnapshot({ timestamp: 825000, content: 'Substantial new section.' });
      expect(coarseSnap.granularity).toBe('coarse');
    });

    it('should correctly calculate charCount, lineCount, and default authorId', () => {
      const snap = manager.addSnapshot({
        timestamp: 1000,
        content: 'Line 1\nLine 2\nLine 3',
      });

      expect(snap.authorId).toBe('test-author');
      expect(snap.charCount).toBe('Line 1\nLine 2\nLine 3'.length);
      expect(snap.lineCount).toBe(3);
    });
  });

  describe('Filtering Snapshots', () => {
    beforeEach(() => {
      manager.addSnapshots([
        { timestamp: 1000, content: 'Fine 1', granularity: 'fine', authorId: 'author-A' },
        { timestamp: 2000, content: 'Fine 2', granularity: 'fine', authorId: 'author-B' },
        { timestamp: 3000, content: 'Med 1', granularity: 'medium', authorId: 'author-A' },
        { timestamp: 4000, content: 'Coarse 1', granularity: 'coarse', authorId: 'author-A' },
        { timestamp: 5000, content: 'Coarse 2', granularity: 'coarse', authorId: 'author-B' },
      ]);
    });

    it('should filter snapshots by single granularity level', () => {
      const fineList = manager.getSnapshotsByGranularity('fine');
      expect(fineList.length).toBe(2);
      expect(fineList.every((s) => s.granularity === 'fine')).toBe(true);

      const coarseList = manager.getSnapshotsByGranularity('coarse');
      expect(coarseList.length).toBe(2);
      expect(coarseList.every((s) => s.granularity === 'coarse')).toBe(true);
    });

    it('should filter snapshots by multiple granularity levels', () => {
      const list = manager.getSnapshotsByGranularity(['medium', 'coarse']);
      expect(list.length).toBe(3);
      expect(list.map((s) => s.granularity)).toEqual(['medium', 'coarse', 'coarse']);
    });

    it('should filter snapshots by time range', () => {
      const list = manager.filterByTimeRange(2000, 4000);
      expect(list.length).toBe(3);
      expect(list.map((s) => s.timestamp)).toEqual([2000, 3000, 4000]);
    });

    it('should filter snapshots by author', () => {
      const listA = manager.filterByAuthor('author-A');
      expect(listA.length).toBe(3);

      const listB = manager.filterByAuthor('author-B');
      expect(listB.length).toBe(2);
    });

    it('should support custom predicate filtering', () => {
      const list = manager.filter((s) => s.content.includes('Coarse'));
      expect(list.length).toBe(2);
    });
  });

  describe('Decimation (Downsampling)', () => {
    it('should handle empty snapshot list', () => {
      expect(manager.decimateSnapshots()).toEqual([]);
    });

    it('should preserve coarse milestones unconditionally by default during decimation', () => {
      manager.addSnapshots([
        { timestamp: 1000, content: 'f1', granularity: 'fine' },
        { timestamp: 1100, content: 'f2', granularity: 'fine' },
        { timestamp: 1200, content: 'f3', granularity: 'fine' },
        { timestamp: 1300, content: 'c1', granularity: 'coarse' },
        { timestamp: 1400, content: 'f4', granularity: 'fine' },
      ]);

      // Downsample fine snapshots with time interval of 1000ms
      const decimated = manager.decimateSnapshots({ timeIntervalMs: 1000, preserveCoarse: true });

      const coarseInDecimated = decimated.filter((s) => s.granularity === 'coarse');
      expect(coarseInDecimated.length).toBe(1);
      expect(coarseInDecimated[0].content).toBe('c1');
    });

    it('should downsample fine snapshots using timeIntervalMs', () => {
      manager.addSnapshots([
        { timestamp: 0, content: 'a', granularity: 'fine' },
        { timestamp: 10000, content: 'ab', granularity: 'fine' },
        { timestamp: 20000, content: 'abc', granularity: 'fine' },
        { timestamp: 60000, content: 'abcd', granularity: 'fine' },
        { timestamp: 120000, content: 'abcde', granularity: 'fine' },
      ]);

      const decimated = manager.decimateSnapshots({
        timeIntervalMs: 50000,
        preserveCoarse: true,
      });

      // t=0 (first), t=60000 (+60s >= 50s), t=120000 (last / +60s >= 50s)
      expect(decimated.map((s) => s.timestamp)).toContain(0);
      expect(decimated.map((s) => s.timestamp)).toContain(60000);
      expect(decimated.map((s) => s.timestamp)).toContain(120000);
      expect(decimated.map((s) => s.timestamp)).not.toContain(10000);
    });

    it('should filter out fine snapshots below minCharDiff threshold', () => {
      manager.addSnapshots([
        { timestamp: 0, content: 'a', granularity: 'fine' },
        { timestamp: 1000, content: 'ab', granularity: 'fine' },
        { timestamp: 2000, content: 'abc', granularity: 'fine' },
        { timestamp: 3000, content: 'abc, world story chapter 1!', granularity: 'fine' },
      ]);

      const decimated = manager.decimateSnapshots({ minCharDiff: 10 });
      // t=0 (first) and t=3000 (diff = 26 > 10)
      expect(decimated.some((s) => s.timestamp === 3000)).toBe(true);
      expect(decimated.some((s) => s.timestamp === 1000)).toBe(false);
    });

    it('should constrain output size to maxCount when maxCount option is specified', () => {
      for (let i = 0; i < 20; i++) {
        manager.addSnapshot({
          timestamp: i * 1000,
          content: `Content revision ${i}`,
          granularity: i % 5 === 0 ? 'coarse' : 'fine',
        });
      }

      const decimated = manager.decimateSnapshots({ maxCount: 5, preserveCoarse: true });
      expect(decimated.length).toBeLessThanOrEqual(6); // maxCount target + coarse preserves
      // Coarse snapshots at i=0, 5, 10, 15
      const coarseCount = decimated.filter((s) => s.granularity === 'coarse').length;
      expect(coarseCount).toBe(4);
    });
  });

  describe('Summary Statistics & Management', () => {
    it('should calculate accurate summary statistics', () => {
      manager.addSnapshots([
        { timestamp: 1000, content: 'f1', granularity: 'fine' },
        { timestamp: 2000, content: 'f2', granularity: 'fine' },
        { timestamp: 3000, content: 'm1', granularity: 'medium' },
        { timestamp: 5000, content: 'c1', granularity: 'coarse' },
      ]);

      const stats = manager.getSummaryStats();
      expect(stats.total).toBe(4);
      expect(stats.fineCount).toBe(2);
      expect(stats.mediumCount).toBe(1);
      expect(stats.coarseCount).toBe(1);
      expect(stats.earliestTimestamp).toBe(1000);
      expect(stats.latestTimestamp).toBe(5000);
    });

    it('should clear stored snapshots when clear() is invoked', () => {
      manager.addSnapshot({ timestamp: 1000, content: 'f1', granularity: 'fine' });
      expect(manager.getSnapshots().length).toBe(1);

      manager.clear();
      expect(manager.getSnapshots().length).toBe(0);
      expect(manager.getSummaryStats().total).toBe(0);
    });
  });
});
