import { describe, it, expect } from 'vitest';
import {
  calculateManualScore,
  isEntityAnchored,
  reconcileEntityLifecycles,
  findShelvedCandidates,
  SHELF_THRESHOLD,
} from '../src/core/lore/ShelvedLoreLifecycle.js';
import type { LoreEntity } from '../src/core/lore/LoreEntityManager.js';

describe('Shelved Lore Automatic Evacuation Lifecycle', () => {
  it('calculates manual score accurately according to formula', () => {
    const highEffortEntity: LoreEntity = {
      id: 'item-1',
      name: '神剣・紫電',
      category: 'item',
      role: '古代の遺物', // n_fields + 1
      aliases: ['紫電'],   // n_fields + 1
      description: '北方の氷壁の奥深くに封印されていた古代神剣。雷光を宿し世界を裂く。', // len = 34
      relations: [{ targetId: 'char-1', label: '所有者' }], // n_relations = 1
      isSecret: true, // i_secret = 1
    } as any;

    const score = calculateManualScore(highEffortEntity);
    // formula: 1.2 * ln(34 + 1) + 2.0 * 2 + 5.0 * 1 + 1.5 * 1
    // ln(35) ~= 3.555, 1.2 * 3.555 ~= 4.266
    // 4.266 + 4.0 + 5.0 + 1.5 ~= 14.77
    expect(score).toBeGreaterThan(SHELF_THRESHOLD);
    expect(score).toBeGreaterThan(14);
  });

  it('calculates low score for transient unedited entity', () => {
    const lowEffortEntity: LoreEntity = {
      id: 'term-quick',
      name: '馬車',
      category: 'term',
      description: '普通の馬車', // len = 5
    };

    const score = calculateManualScore(lowEffortEntity);
    // 1.2 * ln(6) = 1.2 * 1.79 ~= 2.15 < 4.0
    expect(score).toBeLessThan(SHELF_THRESHOLD);
  });

  it('transitions active entity to DANGLING when deleted from manuscript', () => {
    const entities: LoreEntity[] = [
      {
        id: 'char-1',
        name: 'ヴァレリウス',
        category: 'character',
        status: 'active',
        description: '帝国北方総督。',
      },
    ];

    const manuscript = '静かな夜だった。誰もいない荒野が広がっていた。'; // 'ヴァレリウス' not mentioned
    const res = reconcileEntityLifecycles(manuscript, entities, false);

    expect(res.danglingEntities.length).toBe(1);
    expect(res.danglingEntities[0].status).toBe('dangling');
    expect(res.shelvedEntities.length).toBe(0);
    expect(res.purgedEntities.length).toBe(0);
  });

  it('promotes DANGLING to SHELVED upon commit if score >= 4.0', () => {
    const highEffortDangling: LoreEntity = {
      id: 'char-1',
      name: 'ヴァレリウス',
      category: 'character',
      role: '北方総督',
      status: 'dangling',
      description: '丹念に執筆された北方帝国の軍団長。星辰の盟約を代々守護している重要人物。',
      relations: [{ targetId: 'term-pact', label: '守護' }],
    };

    const manuscript = '静かな夜景。';
    const res = reconcileEntityLifecycles(manuscript, [highEffortDangling], true); // isCommitted = true

    expect(res.shelvedEntities.length).toBe(1);
    expect(res.shelvedEntities[0].status).toBe('shelved');
    expect(res.purgedEntities.length).toBe(0);
  });

  it('purges DANGLING upon commit if score < 4.0', () => {
    const lowEffortDangling: LoreEntity = {
      id: 'token-passerby',
      name: '通行人',
      category: 'character',
      status: 'dangling',
      description: '通行人A',
    };

    const manuscript = '静かな夜景。';
    const res = reconcileEntityLifecycles(manuscript, [lowEffortDangling], true);

    expect(res.purgedEntities.length).toBe(1);
    expect(res.shelvedEntities.length).toBe(0);
    expect(res.updatedEntities.length).toBe(0);
  });

  it('finds shelved candidates when proper noun is typed in new scene', () => {
    const shelvedEntities: LoreEntity[] = [
      {
        id: 'item-blade',
        name: '神剣・紫電',
        aliases: ['紫電'],
        category: 'item',
        status: 'shelved',
        description: '古代の遺物。',
      },
    ];

    const text = '旅路の果て、彼は紫電の光を見た。';
    const candidates = findShelvedCandidates(text, shelvedEntities);

    expect(candidates.length).toBe(1);
    expect(candidates[0].matchedText).toBe('紫電');
    expect(candidates[0].entity.id).toBe('item-blade');
  });
});
