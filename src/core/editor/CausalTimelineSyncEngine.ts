/**
 * CausalTimelineSyncEngine - 因果DAG・伏線タイムライン双方向連携＆矛盾ノード同期エンジン
 *
 * 因果DAG（有向非巡回グラフ）のノード状態（循環矛盾、時間逆転パラドックス、未回収伏線）と、
 * 作中客観時間（Fabula）および語り順（Sjuzhet）タイムラインの双方向同期を実行する。
 * 矛盾発生ノードの特定・赤色ハイライト属性付与と、該当エディタ章・行文字オフセットへの
 * 逆引きジャンプアンカー生成、伏線放置スパン・回収率の数理スコアリングを提供する。
 */

import {
  EpistemicCalendarBridge,
} from '../causality/EpistemicCalendarBridge.js';

export type CausalRelationType = 'causes' | 'enables' | 'resolves' | 'prerequisite';

export type NodeSyncStatus =
  | 'NORMAL'
  | 'CYCLE_CONFLICT'
  | 'TIME_PARADOX'
  | 'EPISTEMIC_CONFLICT'
  | 'CELESTIAL_CONFLICT'
  | 'LIFESPAN_CONFLICT'
  | 'UNRESOLVED'
  | 'RESOLVED';

export type ConflictCategory =
  | 'cycle'
  | 'chronological_reversal'
  | 'dangling_prerequisite'
  | 'epistemic_fog_violation'
  | 'moon_phase_mismatch'
  | 'lifespan_breach';

export interface EpistemicContextInput {
  speakerId: string;
  speakerLocationId?: string;
  mentionedEventId: string;
  eventOccurrenceDay?: number;
  mentionDay?: number;
}

export interface CelestialContextInput {
  satelliteId?: string;
  expectedPhase?: string;
  year?: number;
  month?: number;
  day?: number;
  absoluteDay?: number;
}

export interface CausalNodeInput {
  id: string;
  label: string;
  chapterId: string;
  chapterIndex: number;
  chapterTitle?: string;
  lineNumber?: number;
  charOffset?: number;
  storyDay?: number; // 客観時間軸 (Fabula)
  discourseRatio?: number; // 読者体験軸進行度 (Sjuzhet: 0.0〜1.0)
  isForeshadowing?: boolean;
  resolvedNodeId?: string;
  characterId?: string;
  storyYear?: number;
  epistemicContext?: EpistemicContextInput;
  celestialContext?: CelestialContextInput;
}

export interface CausalEdgeInput {
  fromId: string; // 原因・前提ノード
  toId: string;   // 結果・後続ノード
  relationType?: CausalRelationType;
  label?: string;
}

export interface JumpAnchor {
  nodeId: string;
  label: string;
  chapterId: string;
  chapterIndex: number;
  chapterTitle: string;
  lineNumber: number;
  charOffset: number;
  badgeLabel: string;
  highlightColor: string;
}

export interface ConflictDetail {
  nodeId: string;
  targetNodeId?: string;
  category: ConflictCategory;
  description: string;
  severity: 'error' | 'warning';
  anchor?: JumpAnchor;
}

export interface SynchronizedNode extends CausalNodeInput {
  status: NodeSyncStatus;
  isConflict: boolean;
  conflictType?: ConflictCategory;
  conflictDescription?: string;
  highlightColor: string; // 正常: #3b82f6 / 矛盾: #ef4444 / 未回収: #f59e0b / 完了: #10b981
  jumpAnchor: JumpAnchor;
  danglingSpanChapters?: number; // 伏線放置章数スパン
}

export interface NarrativeIntegrityMetrics {
  totalNodes: number;
  totalEdges: number;
  cycleConflictCount: number;
  timeParadoxCount: number;
  epistemicConflictCount: number;
  celestialConflictCount: number;
  lifespanConflictCount: number;
  unresolvedForeshadowCount: number;
  resolvedForeshadowCount: number;
  resolutionRate: number; // 0.0 - 1.0
  averageDanglingSpanChapters: number;
  integrityScore: number; // 0 - 100 点満点
  isCleanDag: boolean;
}

export interface TimelinePlotNode {
  nodeId: string;
  label: string;
  status: NodeSyncStatus;
  x: number; // Sjuzhet X座標 (0 - 1000)
  storyY: number; // Fabula Y座標
  highlightColor: string;
  isConflict: boolean;
}

export interface TimelinePlotData {
  nodes: TimelinePlotNode[];
  edges: Array<{
    fromId: string;
    toId: string;
    color: string;
    isDashed: boolean;
  }>;
}

export interface SyncAnalysisResult {
  nodes: SynchronizedNode[];
  conflicts: ConflictDetail[];
  jumpAnchors: Map<string, JumpAnchor>;
  metrics: NarrativeIntegrityMetrics;
  timelinePlotData: TimelinePlotData;
}

export class CausalTimelineSyncEngine {
  private nodes: Map<string, CausalNodeInput> = new Map();
  private edges: CausalEdgeInput[] = [];
  private epistemicBridge: EpistemicCalendarBridge | null = null;

  constructor(
    nodes: CausalNodeInput[] = [],
    edges: CausalEdgeInput[] = [],
    epistemicBridge?: EpistemicCalendarBridge
  ) {
    for (const node of nodes) {
      this.nodes.set(node.id, { ...node });
    }
    this.edges = [...edges];
    this.epistemicBridge = epistemicBridge ?? null;
  }

  public setEpistemicBridge(bridge: EpistemicCalendarBridge | null): void {
    this.epistemicBridge = bridge;
  }

  public getEpistemicBridge(): EpistemicCalendarBridge | null {
    return this.epistemicBridge;
  }

  public setNodes(nodes: CausalNodeInput[]): void {
    this.nodes.clear();
    for (const node of nodes) {
      this.nodes.set(node.id, { ...node });
    }
  }

  public setEdges(edges: CausalEdgeInput[]): void {
    this.edges = [...edges];
  }

  public addNode(node: CausalNodeInput): void {
    this.nodes.set(node.id, { ...node });
  }

  public addEdge(edge: CausalEdgeInput): void {
    if (!this.edges.some((e) => e.fromId === edge.fromId && e.toId === edge.toId)) {
      this.edges.push({ ...edge });
    }
  }

  /**
   * Tarjan's Strongly Connected Components (SCC) アルゴリズムによる循環参照検出
   */
  public detectCycles(): string[][] {
    let index = 0;
    const indices = new Map<string, number>();
    const lowlinks = new Map<string, number>();
    const onStack = new Set<string>();
    const stack: string[] = [];
    const sccs: string[][] = [];

    // 隣接リスト作成
    const adj = new Map<string, string[]>();
    for (const id of this.nodes.keys()) {
      adj.set(id, []);
    }
    for (const e of this.edges) {
      if (this.nodes.has(e.fromId) && this.nodes.has(e.toId)) {
        adj.get(e.fromId)?.push(e.toId);
      }
    }

    const strongConnect = (v: string) => {
      indices.set(v, index);
      lowlinks.set(v, index);
      index += 1;
      stack.push(v);
      onStack.add(v);

      const neighbors = adj.get(v) || [];
      for (const w of neighbors) {
        if (!indices.has(w)) {
          strongConnect(w);
          lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
        } else if (onStack.has(w)) {
          lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
        }
      }

      if (lowlinks.get(v) === indices.get(v)) {
        const scc: string[] = [];
        let w = '';
        do {
          w = stack.pop()!;
          onStack.delete(w);
          scc.push(w);
        } while (w !== v);

        // 要素数2以上のSCC、または自己ループがある場合にサイクル判定
        if (scc.length > 1 || neighbors.includes(v)) {
          sccs.push(scc);
        }
      }
    };

    for (const id of this.nodes.keys()) {
      if (!indices.has(id)) {
        strongConnect(id);
      }
    }

    return sccs;
  }

  /**
   * 因果グラフとタイムラインの包括的同期・整合性解析を実行
   */
  public analyzeAndSynchronize(latestChapterIndex = 0): SyncAnalysisResult {
    const cycles = this.detectCycles();
    const cycleNodeIds = new Set<string>();
    for (const c of cycles) {
      for (const id of c) {
        cycleNodeIds.add(id);
      }
    }

    const conflicts: ConflictDetail[] = [];
    const jumpAnchors = new Map<string, JumpAnchor>();

    // 1. 循環矛盾の検出
    for (const cycle of cycles) {
      const cycleLabels = cycle.map((id) => this.nodes.get(id)?.label || id).join(' ➔ ');
      for (const id of cycle) {
        conflicts.push({
          nodeId: id,
          category: 'cycle',
          description: `因果循環ループ矛盾を検出: ${cycleLabels}`,
          severity: 'error',
        });
      }
    }

    // 2. 客観時間逆転（Time Paradox）の検出
    // causes / prerequisite において、原因(from)の客観日時 > 結果(to)の客観日時の場合
    const paradoxNodeIds = new Set<string>();
    for (const e of this.edges) {
      const fromNode = this.nodes.get(e.fromId);
      const toNode = this.nodes.get(e.toId);
      if (
        fromNode &&
        toNode &&
        fromNode.storyDay !== undefined &&
        toNode.storyDay !== undefined
      ) {
        if (fromNode.storyDay > toNode.storyDay) {
          paradoxNodeIds.add(fromNode.id);
          paradoxNodeIds.add(toNode.id);
          conflicts.push({
            nodeId: toNode.id,
            targetNodeId: fromNode.id,
            category: 'chronological_reversal',
            description: `時間順序の逆転（タイムパラドックス）: 原因「${fromNode.label}」(Day ${fromNode.storyDay}) が結果「${toNode.label}」(Day ${toNode.storyDay}) より未来に位置しています`,
            severity: 'error',
          });
        }
      }
    }

    // 3. EpistemicCalendarBridge による認知フォグ・天体暦・生没年検証
    const epistemicNodeMap = new Map<string, { category: ConflictCategory; description: string; status: NodeSyncStatus }>();
    if (this.epistemicBridge) {
      for (const node of this.nodes.values()) {
        // 3.1 認知フォグ検証
        if (node.epistemicContext) {
          const ep = node.epistemicContext;
          const mentionDay = ep.mentionDay ?? node.storyDay ?? 0;
          const res = this.epistemicBridge.verifyEpistemicMention(ep.speakerId, ep.mentionedEventId, mentionDay);
          if (res.status === 'VIOLATION') {
            const desc = res.reason || `認知フォグ違反: 情報到達前の日付（Day ${mentionDay}）に事件言及が発生しています`;
            conflicts.push({
              nodeId: node.id,
              category: 'epistemic_fog_violation',
              description: desc,
              severity: 'error',
            });
            epistemicNodeMap.set(node.id, {
              category: 'epistemic_fog_violation',
              description: desc,
              status: 'EPISTEMIC_CONFLICT',
            });
          }
        }

        // 3.2 天体月相検証
        if (node.celestialContext && node.celestialContext.satelliteId && node.celestialContext.expectedPhase) {
          const cc = node.celestialContext;
          const satId = cc.satelliteId!;
          const expPhase = cc.expectedPhase!;
          const dateOrAbs = cc.absoluteDay !== undefined
            ? cc.absoluteDay
            : (cc.year !== undefined && cc.month !== undefined && cc.day !== undefined)
              ? { year: cc.year, month: cc.month, day: cc.day }
              : node.storyDay ?? 0;

          const res = this.epistemicBridge.verifyMoonPhaseMention(satId, dateOrAbs, expPhase);
          if (!res.isValid) {
            const desc = res.reason || `天体月相不整合: ${satId} の月相が描写（${expPhase}）と一致しません`;
            conflicts.push({
              nodeId: node.id,
              category: 'moon_phase_mismatch',
              description: desc,
              severity: 'warning',
            });
            if (!epistemicNodeMap.has(node.id)) {
              epistemicNodeMap.set(node.id, {
                category: 'moon_phase_mismatch',
                description: desc,
                status: 'CELESTIAL_CONFLICT',
              });
            }
          }
        }

        // 3.3 生没年検証
        if (node.characterId && node.storyYear !== undefined) {
          const res = this.epistemicBridge.verifyCharacterLifespan(node.characterId, node.storyYear);
          if (!res.isValid) {
            const desc = res.reason || `生没年境界違反: 登場人物の生存期間外のアクションです`;
            conflicts.push({
              nodeId: node.id,
              category: 'lifespan_breach',
              description: desc,
              severity: 'error',
            });
            if (!epistemicNodeMap.has(node.id)) {
              epistemicNodeMap.set(node.id, {
                category: 'lifespan_breach',
                description: desc,
                status: 'LIFESPAN_CONFLICT',
              });
            }
          }
        }
      }
    }

    // 4. 各ノードの同期状態・ジャンプアンカー・放置スパン計算
    const synchronizedNodes: SynchronizedNode[] = [];
    let totalPlanted = 0;
    let totalResolved = 0;
    let totalDanglingSpan = 0;

    const maxChapterIndex = Math.max(
      latestChapterIndex,
      ...Array.from(this.nodes.values()).map((n) => n.chapterIndex || 0)
    );

    for (const node of this.nodes.values()) {
      let status: NodeSyncStatus = 'NORMAL';
      let isConflict = false;
      let conflictType: ConflictCategory | undefined;
      let conflictDescription: string | undefined;
      let highlightColor = '#3b82f6'; // デフォルト青

      // 優先度 1: 循環矛盾
      if (cycleNodeIds.has(node.id)) {
        status = 'CYCLE_CONFLICT';
        isConflict = true;
        conflictType = 'cycle';
        conflictDescription = '因果循環ループ矛盾に含まれるノードです';
        highlightColor = '#ef4444'; // 赤色
      }
      // 優先度 2: 時間逆転
      else if (paradoxNodeIds.has(node.id)) {
        status = 'TIME_PARADOX';
        isConflict = true;
        conflictType = 'chronological_reversal';
        conflictDescription = '時間順序の逆転（客観時間の前後矛盾）が発生しています';
        highlightColor = '#ef4444'; // 赤色
      }
      // 優先度 3: 認知フォグ・天体暦・生没年矛盾
      else if (epistemicNodeMap.has(node.id)) {
        const epInfo = epistemicNodeMap.get(node.id)!;
        status = epInfo.status;
        isConflict = true;
        conflictType = epInfo.category;
        conflictDescription = epInfo.description;
        highlightColor = epInfo.category === 'moon_phase_mismatch' ? '#f59e0b' : '#ef4444';
      }
      // 優先度 4: 伏線ステータス
      else if (node.isForeshadowing) {
        totalPlanted += 1;
        if (node.resolvedNodeId && this.nodes.has(node.resolvedNodeId)) {
          status = 'RESOLVED';
          highlightColor = '#10b981'; // 緑色
          totalResolved += 1;
        } else {
          status = 'UNRESOLVED';
          highlightColor = '#f59e0b'; // 琥珀色
        }
      }

      // 伏線放置スパン
      let danglingSpanChapters: number | undefined;
      if (node.isForeshadowing) {
        if (status === 'RESOLVED' && node.resolvedNodeId) {
          const resolvedNode = this.nodes.get(node.resolvedNodeId);
          danglingSpanChapters = Math.max(
            0,
            (resolvedNode?.chapterIndex ?? node.chapterIndex) - node.chapterIndex
          );
        } else {
          danglingSpanChapters = Math.max(0, maxChapterIndex - node.chapterIndex);
        }
        totalDanglingSpan += danglingSpanChapters;
      }

      // ジャンプアンカー作成
      const anchor: JumpAnchor = {
        nodeId: node.id,
        label: node.label,
        chapterId: node.chapterId,
        chapterIndex: node.chapterIndex,
        chapterTitle: node.chapterTitle || `第${node.chapterIndex + 1}章`,
        lineNumber: node.lineNumber ?? 1,
        charOffset: node.charOffset ?? 0,
        badgeLabel: isConflict ? '⚠️ 矛盾' : status === 'UNRESOLVED' ? '⏳ 未回収' : '✅ 整合',
        highlightColor,
      };

      jumpAnchors.set(node.id, anchor);

      synchronizedNodes.push({
        ...node,
        status,
        isConflict,
        conflictType,
        conflictDescription,
        highlightColor,
        jumpAnchor: anchor,
        danglingSpanChapters,
      });
    }

    // コンフリクトリストにアンカーをバインド
    for (const conf of conflicts) {
      conf.anchor = jumpAnchors.get(conf.nodeId);
    }

    // 5. メトリクス算出
    const totalNodes = this.nodes.size;
    const totalEdges = this.edges.length;
    const cycleConflictCount = cycleNodeIds.size;
    const timeParadoxCount = paradoxNodeIds.size;
    const epistemicConflictCount = conflicts.filter((c) => c.category === 'epistemic_fog_violation').length;
    const celestialConflictCount = conflicts.filter((c) => c.category === 'moon_phase_mismatch').length;
    const lifespanConflictCount = conflicts.filter((c) => c.category === 'lifespan_breach').length;
    const unresolvedForeshadowCount = totalPlanted - totalResolved;
    const resolutionRate = totalPlanted > 0 ? totalResolved / totalPlanted : 1.0;
    const averageDanglingSpanChapters =
      totalPlanted > 0 ? totalDanglingSpan / totalPlanted : 0;

    // 整合性健全度スコア (100点満点減点方式)
    let penalty =
      cycleConflictCount * 25 +
      timeParadoxCount * 20 +
      epistemicConflictCount * 20 +
      lifespanConflictCount * 15 +
      celestialConflictCount * 10 +
      unresolvedForeshadowCount * 5;
    const integrityScore = Math.max(0, Math.min(100, 100 - penalty));
    const isCleanDag = cycleConflictCount === 0 && timeParadoxCount === 0 && epistemicConflictCount === 0 && lifespanConflictCount === 0;

    const metrics: NarrativeIntegrityMetrics = {
      totalNodes,
      totalEdges,
      cycleConflictCount,
      timeParadoxCount,
      epistemicConflictCount,
      celestialConflictCount,
      lifespanConflictCount,
      unresolvedForeshadowCount,
      resolvedForeshadowCount: totalResolved,
      resolutionRate,
      averageDanglingSpanChapters: Number(averageDanglingSpanChapters.toFixed(1)),
      integrityScore,
      isCleanDag,
    };

    // 6. タイムラインプロットデータ作成 (Sjuzhet X: 0-1000, Fabula Y)
    const timelineNodes: TimelinePlotNode[] = synchronizedNodes.map((n) => {
      const x = Math.round((n.discourseRatio ?? n.chapterIndex / Math.max(1, maxChapterIndex)) * 1000);
      const storyY = n.storyDay ?? n.chapterIndex * 10;
      return {
        nodeId: n.id,
        label: n.label,
        status: n.status,
        x,
        storyY,
        highlightColor: n.highlightColor,
        isConflict: n.isConflict,
      };
    });

    const timelineEdges = this.edges.map((e) => {
      const fromConf = cycleNodeIds.has(e.fromId) || paradoxNodeIds.has(e.fromId) || epistemicNodeMap.has(e.fromId);
      const toConf = cycleNodeIds.has(e.toId) || paradoxNodeIds.has(e.toId) || epistemicNodeMap.has(e.toId);
      const isConf = fromConf && toConf;

      return {
        fromId: e.fromId,
        toId: e.toId,
        color: isConf ? '#ef4444' : '#64748b',
        isDashed: isConf,
      };
    });

    return {
      nodes: synchronizedNodes,
      conflicts,
      jumpAnchors,
      metrics,
      timelinePlotData: {
        nodes: timelineNodes,
        edges: timelineEdges,
      },
    };
  }
}

