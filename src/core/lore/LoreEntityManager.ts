import { VirtualFileSystem } from '../fs/VirtualFileSystem.js';
import type { LoreTermDefinition } from '../../ui/LoreInspectorDock.js';

export type LoreCategory = 'character' | 'term' | 'item' | 'foreshadowing' | 'location';

export interface LoreRelation {
  targetId: string;
  label: string; // e.g. "主従", "敵対", "守護", "因果", "契機", "回収契機"
}

export interface LoreEntity {
  id: string;
  name: string;
  category: LoreCategory;
  role?: string;
  status?: string; // 'active' | 'alive' | 'deceased' | 'unresolved' | 'resolved' | 'shelved'
  description: string;
  aliases?: string[];
  forbiddenNames?: string[];
  relations?: LoreRelation[];
  updatedAt?: number;
}

export const DEFAULT_LORE_ENTITIES: LoreEntity[] = [
  {
    id: 'char-valerius',
    name: 'ヴァレリウス将軍',
    category: 'character',
    role: '帝国北方軍総督',
    status: 'alive',
    description: '星辰の盟約を守護する武将。極北の要塞を任される寡黙な指導者。',
    aliases: ['ヴァレリウス', '総督'],
    forbiddenNames: ['バレリウス'],
    relations: [
      { targetId: 'term-pact', label: '盟約守護' },
      { targetId: 'char-selene', label: '同盟' },
      { targetId: 'loc-fortress', label: '司令拠点' },
    ],
  },
  {
    id: 'char-selene',
    name: 'セレネ',
    category: 'character',
    role: '第一衛星の巫女',
    status: 'alive',
    description: '冷徹な知性で架空暦法を司る巫女。双月の合を見守る。',
    aliases: ['巫女セレネ', '暦の巫女'],
    forbiddenNames: ['セレーネ'],
    relations: [
      { targetId: 'fore-omen', label: '凶兆察知' },
      { targetId: 'term-pact', label: '儀式立会' },
    ],
  },
  {
    id: 'term-pact',
    name: '星辰の盟約',
    category: 'term',
    role: '古代不可侵協定',
    status: 'active',
    description: '双月が重なる夜にのみ更新される古代の不可侵協定。帝国と精霊界の均衡を維持する。',
    aliases: ['盟約', '古代協定'],
    forbiddenNames: ['星神の盟約'],
    relations: [
      { targetId: 'fore-omen', label: '破棄の危機' },
    ],
  },
  {
    id: 'fore-omen',
    name: '双月の凶兆',
    category: 'foreshadowing',
    role: '運命の合（Conjunction）',
    status: 'unresolved',
    description: '第4月14日の夜、二重満月が重なる刻に何者かによって盟約の封印が解かれるという伝承。',
    aliases: ['双月合', '凶兆', '不穏な凶兆', '双月の凶兆'],
    relations: [
      { targetId: 'loc-fortress', label: '発生予兆' },
    ],
  },
  {
    id: 'loc-fortress',
    name: '忘却の砦',
    category: 'location',
    role: '極北防衛要塞',
    status: 'active',
    description: '帝国最北端の永久凍土に築かれた巨石要塞。古代の盟約台座を秘匿している。',
    aliases: ['北の砦', '北方の砦', '永久氷壁'],
    relations: [],
  },
];

export class LoreEntityManager {
  private vfs?: VirtualFileSystem;
  private entities: LoreEntity[] = [];

  constructor(vfs?: VirtualFileSystem, initialEntities?: LoreEntity[]) {
    this.vfs = vfs;
    this.entities = initialEntities ? [...initialEntities] : [...DEFAULT_LORE_ENTITIES];
  }

  public getEntities(category?: LoreCategory): LoreEntity[] {
    if (!category) {
      return [...this.entities];
    }
    return this.entities.filter((e) => e.category === category);
  }

  public setEntities(entities: LoreEntity[]): void {
    this.entities = [...entities];
  }

  public getEntity(id: string): LoreEntity | undefined {
    return this.entities.find((e) => e.id === id);
  }

  public createEntity(data: Omit<LoreEntity, 'id'> & { id?: string }): LoreEntity {
    const id = data.id || `lore_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newEntity: LoreEntity = {
      ...data,
      id,
      updatedAt: Date.now(),
    };
    this.entities.push(newEntity);
    return newEntity;
  }

  public updateEntity(id: string, patch: Partial<Omit<LoreEntity, 'id'>>): LoreEntity | null {
    const idx = this.entities.findIndex((e) => e.id === id);
    if (idx === -1) return null;

    this.entities[idx] = {
      ...this.entities[idx],
      ...patch,
      updatedAt: Date.now(),
    };
    return this.entities[idx];
  }

  public deleteEntity(id: string): boolean {
    const initialLen = this.entities.length;
    this.entities = this.entities.filter((e) => e.id !== id);
    // Also remove relations referencing this entity
    for (const e of this.entities) {
      if (e.relations) {
        e.relations = e.relations.filter((r) => r.targetId !== id);
      }
    }
    return this.entities.length < initialLen;
  }

  public toLoreTermDefinitions(): LoreTermDefinition[] {
    return this.entities.map((e) => ({
      id: e.id,
      canonicalName: e.name,
      aliases: e.aliases || [],
      forbiddenNames: e.forbiddenNames || [],
      category: e.category,
      description: e.description,
      status: e.status === 'shelved' ? 'shelved' : 'active',
    }));
  }

  public async loadFromVFS(projectId: string): Promise<void> {
    if (!this.vfs) return;
    const path = `/projects/${projectId}/lore/entities.json`;
    if (await this.vfs.exists(path)) {
      try {
        const loaded = await this.vfs.readJson<LoreEntity[]>(path);
        if (Array.isArray(loaded)) {
          this.entities = loaded;
        }
      } catch (err) {
        console.warn('Failed to load lore from VFS:', err);
      }
    }
  }

  public async saveToVFS(projectId: string): Promise<void> {
    if (!this.vfs) return;
    const dir = `/projects/${projectId}/lore`;
    if (!(await this.vfs.exists(dir))) {
      await this.vfs.mkdir(dir, true);
    }
    await this.vfs.writeJson(`${dir}/entities.json`, this.entities);
  }
}
