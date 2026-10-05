import { describe, it, expect, beforeEach } from 'vitest';
import {
  ShelvedLoreArchiveManager,
  EvacuationContext,
  RestoreTargetContext,
} from '../src/core/lore/ShelvedLoreArchiveManager.js';
import type { LoreEntity } from '../src/core/lore/LoreEntityManager.js';

describe('ShelvedLoreArchiveManager', () => {
  let manager: ShelvedLoreArchiveManager;

  const sampleEntity: LoreEntity = {
    id: 'char-valerius',
    name: 'ヴァレリウス将軍',
    category: 'character',
    role: '帝国北方軍総督',
    description: '星辰の盟約を守護する武将。極北の要塞を任される寡黙な指導者。',
    aliases: ['ヴァレリウス', '総督'],
    status: 'active',
  };

  const sampleEvacuationContext: EvacuationContext = {
    chapterId: 'ch-01',
    chapterTitle: '第1章 氷壁の要塞',
    offset: 120,
    surroundingText: '極北の忘却の砦にて、ヴァレリウス将軍は静かに双月を見上げていた。',
    timestamp: Date.now() - 3600000,
    reason: 'anchor_disappeared',
    manualScore: 6.5,
  };

  beforeEach(() => {
    manager = new ShelvedLoreArchiveManager();
  });

  describe('State Machine & Transitions', () => {
    it('should validate allowed state transitions correctly', () => {
      expect(manager.canTransition('ACTIVE', 'SHELVED')).toBe(true);
      expect(manager.canTransition('SHELVED', 'ARCHIVED')).toBe(true);
      expect(manager.canTransition('SHELVED', 'TRASHED')).toBe(true);
      expect(manager.canTransition('ARCHIVED', 'RESTORED')).toBe(true);
      expect(manager.canTransition('TRASHED', 'RESTORED')).toBe(true);
      expect(manager.canTransition('RESTORED', 'ACTIVE')).toBe(true);

      // Disallowed transitions
      expect(manager.canTransition('ACTIVE', 'RESTORED')).toBe(false);
      expect(manager.canTransition('PURGED', 'ACTIVE')).toBe(false);
    });

    it('should register entity and transition lifecycle states', () => {
      const record = manager.registerEntity(sampleEntity, 'ACTIVE');
      expect(record.currentState).toBe('ACTIVE');
      expect(record.entityId).toBe(sampleEntity.id);

      const updatedRecord = manager.transitionState(sampleEntity.id, 'SHELVED');
      expect(updatedRecord.currentState).toBe('SHELVED');
      expect(updatedRecord.entity.status).toBe('shelved');
    });

    it('should throw an error when attempting an invalid state transition', () => {
      manager.registerEntity(sampleEntity, 'ACTIVE');
      expect(() => {
        manager.transitionState(sampleEntity.id, 'RESTORED');
      }).toThrow(/Invalid lifecycle transition/);
    });

    it('should throw an error when transitioning non-existent entity', () => {
      expect(() => {
        manager.transitionState('non-existent', 'SHELVED');
      }).toThrow(/Entity record not found/);
    });
  });

  describe('Archive & Trash Operations (Soft Delete)', () => {
    it('should archive a shelved entity preserving evacuationContext', () => {
      manager.registerEntity(sampleEntity, 'SHELVED', sampleEvacuationContext);
      const archivedRecord = manager.archiveEntity(sampleEntity.id);

      expect(archivedRecord.currentState).toBe('ARCHIVED');
      expect(archivedRecord.entity.status).toBe('archived');
      expect(archivedRecord.evacuationContext?.chapterId).toBe('ch-01');
      expect(archivedRecord.archivedAt).toBeDefined();

      const archivedList = manager.getArchivedRecords();
      expect(archivedList).toHaveLength(1);
      expect(archivedList[0].entityId).toBe(sampleEntity.id);
    });

    it('should trash an entity and list in trashed records', () => {
      manager.registerEntity(sampleEntity, 'SHELVED', sampleEvacuationContext);
      const trashedRecord = manager.trashEntity(sampleEntity.id);

      expect(trashedRecord.currentState).toBe('TRASHED');
      expect(trashedRecord.entity.status).toBe('trashed');
      expect(trashedRecord.trashedAt).toBeDefined();

      const trashedList = manager.getTrashedRecords();
      expect(trashedList).toHaveLength(1);
      expect(trashedList[0].entityId).toBe(sampleEntity.id);
    });
  });

  describe('Context Integrity Check (checkContextIntegrity)', () => {
    it('should calculate high confidence score for matching target context', () => {
      const targetContext: RestoreTargetContext = {
        chapterId: 'ch-01',
        chapterTitle: '第1章 氷壁の要塞',
        offset: 110, // 110 + 10 ('ヴァレリウス将軍' at char 10) = 120
        text: '極北の忘却の砦にて、ヴァレリウス将軍は静かに双月を見上げていた。',
      };

      const result = manager.checkContextIntegrity(
        sampleEvacuationContext,
        targetContext,
        sampleEntity
      );

      expect(result.isValid).toBe(true);
      expect(result.chapterMatched).toBe(true);
      expect(result.anchorFound).toBe(true);
      expect(result.matchedName).toBe('ヴァレリウス将軍');
      expect(result.positionDrift).toBe(0); // |(110 + 10) - 120| = 0
      expect(result.confidenceScore).toBeGreaterThanOrEqual(0.9);
      expect(result.warnings).toHaveLength(0);
    });

    it('should generate warnings for cross-chapter restore and missing anchor', () => {
      const targetContext: RestoreTargetContext = {
        chapterId: 'ch-05',
        chapterTitle: '第5章 王都の宴',
        offset: 50,
        text: '王都の舞踏会には華やかな貴族たちが集っていた。',
      };

      const result = manager.checkContextIntegrity(
        sampleEvacuationContext,
        targetContext,
        sampleEntity
      );

      expect(result.chapterMatched).toBe(false);
      expect(result.anchorFound).toBe(false);
      expect(result.warnings.some((w) => w.includes('different chapter'))).toBe(true);
      expect(result.warnings.some((w) => w.includes('not found'))).toBe(true);
      expect(result.confidenceScore).toBeLessThan(0.5);
    });

    it('should detect position offset drift', () => {
      const targetContext: RestoreTargetContext = {
        chapterId: 'ch-01',
        offset: 800,
        text: '長い物語の末尾にて、ヴァレリウス将軍の姿が遠くに見えた。',
      };

      const result = manager.checkContextIntegrity(
        sampleEvacuationContext,
        targetContext,
        sampleEntity
      );

      expect(result.chapterMatched).toBe(true);
      expect(result.anchorFound).toBe(true);
      expect(result.positionDrift).toBeGreaterThan(200); // |(800 + 10) - 120| = 690
      expect(result.warnings.some((w) => w.includes('drift detected'))).toBe(true);
    });
  });

  describe('Restore & Snapshot History', () => {
    it('should restore an entity from ARCHIVED state and record a history snapshot', () => {
      manager.registerEntity(sampleEntity, 'SHELVED', sampleEvacuationContext);
      manager.archiveEntity(sampleEntity.id);

      const targetContext: RestoreTargetContext = {
        chapterId: 'ch-01',
        offset: 110,
        text: '極北の忘却の砦にて、ヴァレリウス将軍は静かに双月を見上げていた。',
      };

      const restoreResult = manager.restoreEntity(sampleEntity.id, targetContext, 'RESTORED');

      expect(restoreResult.record.currentState).toBe('RESTORED');
      expect(restoreResult.integrity.isValid).toBe(true);

      const history = manager.getRestoreHistory(sampleEntity.id);
      expect(history).toHaveLength(1);
      expect(history[0].targetContext.chapterId).toBe('ch-01');
      expect(history[0].integrityResult.confidenceScore).toBeGreaterThan(0.8);
      expect(history[0].entitySnapshot.id).toBe(sampleEntity.id);
    });

    it('should track multiple restore snapshots over time', () => {
      manager.registerEntity(sampleEntity, 'SHELVED', sampleEvacuationContext);
      manager.archiveEntity(sampleEntity.id);

      const target1: RestoreTargetContext = { chapterId: 'ch-01', text: 'ヴァレリウス将軍の帰還' };
      manager.restoreEntity(sampleEntity.id, target1, 'RESTORED');

      manager.transitionState(sampleEntity.id, 'SHELVED');
      manager.archiveEntity(sampleEntity.id);

      const target2: RestoreTargetContext = { chapterId: 'ch-02', text: 'ヴァレリウスの出陣' };
      manager.restoreEntity(sampleEntity.id, target2, 'RESTORED');

      const history = manager.getRestoreHistory(sampleEntity.id);
      expect(history).toHaveLength(2);
      expect(history[0].targetContext.chapterId).toBe('ch-01');
      expect(history[1].targetContext.chapterId).toBe('ch-02');
    });
  });

  describe('Permanent Purge & Empty Trash', () => {
    it('should refuse permanent purge for non-TRASHED entities', () => {
      manager.registerEntity(sampleEntity, 'ACTIVE');
      expect(() => {
        manager.purgePermanently(sampleEntity.id);
      }).toThrow(/Cannot permanently purge/);
    });

    it('should permanently purge TRASHED entity', () => {
      manager.registerEntity(sampleEntity, 'SHELVED');
      manager.trashEntity(sampleEntity.id);

      const success = manager.purgePermanently(sampleEntity.id);
      expect(success).toBe(true);
      expect(manager.getRecord(sampleEntity.id)).toBeUndefined();
    });

    it('should empty all trashed items from manager', () => {
      const entity2: LoreEntity = {
        ...sampleEntity,
        id: 'char-selene',
        name: 'セレネ',
      };

      manager.registerEntity(sampleEntity, 'SHELVED');
      manager.registerEntity(entity2, 'SHELVED');

      manager.trashEntity(sampleEntity.id);
      manager.trashEntity(entity2.id);

      expect(manager.getTrashedRecords()).toHaveLength(2);

      const purgedCount = manager.emptyTrash();
      expect(purgedCount).toBe(2);
      expect(manager.getTrashedRecords()).toHaveLength(0);
      expect(manager.getAllRecords()).toHaveLength(0);
    });
  });
});
