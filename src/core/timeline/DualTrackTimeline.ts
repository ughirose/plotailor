/**
 * Dual-Track Timeline (読者体験軸 Sjuzhet vs 客観時間軸 Fabula) & Connecting Splines Engine
 * 
 * Complies with Plotailor Literature IDE Spec Section 4:
 * - Discourse Track (Sjuzhet): Scenes linearly arranged by character count ratio.
 * - Story Track (Fabula): Continuous absolute day/tick scale; time ellipsis (省略) as blanks.
 * - Connecting Splines: Cubic Bezier curves connecting corresponding scenes.
 *   - Progressive (順行): Standard downward curve.
 *   - Analepsis (回想): Left-sloping crossing curve (cyan/blue glow #38bdf8).
 *   - Prolepsis (予見): Steep rightward curve (purple glow #a855f7).
 * - Foreshadowing Arcs: Bridged across Discourse track; red flashing dashed line when dangling.
 * - Trapezoidal Fuzzy Number (TrFN) ambiguous time model: A = (a1, a2, a3, a4).
 */

export interface TrFN {
  a1: number; // Left boundary (minimum possible)
  a2: number; // Core left (full possibility start)
  a3: number; // Core right (full possibility end)
  a4: number; // Right boundary (maximum possible)
}

export class FuzzyTimeInterval {
  public readonly a1: number;
  public readonly a2: number;
  public readonly a3: number;
  public readonly a4: number;

  constructor(a1: number, a2: number, a3: number, a4: number) {
    if (a1 > a2 || a2 > a3 || a3 > a4) {
      throw new Error(`Invalid TrFN bounds: ${a1} <= ${a2} <= ${a3} <= ${a4} must hold`);
    }
    this.a1 = a1;
    this.a2 = a2;
    this.a3 = a3;
    this.a4 = a4;
  }

  public add(other: FuzzyTimeInterval): FuzzyTimeInterval {
    return new FuzzyTimeInterval(
      this.a1 + other.a1,
      this.a2 + other.a2,
      this.a3 + other.a3,
      this.a4 + other.a4
    );
  }

  public subtract(other: FuzzyTimeInterval): FuzzyTimeInterval {
    return new FuzzyTimeInterval(
      this.a1 - other.a4,
      this.a2 - other.a3,
      this.a3 - other.a2,
      this.a4 - other.a1
    );
  }

  public overlaps(other: FuzzyTimeInterval): boolean {
    return Math.max(this.a1, other.a1) <= Math.min(this.a4, other.a4);
  }

  public strictlyPrecedes(other: FuzzyTimeInterval): boolean {
    return this.a4 < other.a1;
  }

  public center(): number {
    return (this.a2 + this.a3) / 2;
  }
}

export interface TimelineSceneInput {
  id: string;
  chapterId: string;
  title: string;
  charCount: number;
  storyDayStart: number;
  storyDayEnd: number;
  povCharacter?: string;
  summary?: string;
  foreshadowingRef?: {
    type: 'plant' | 'resolve';
    foreshadowingId: string;
    targetChapterId?: string;
  };
}

export type SplineType = 'progressive' | 'analepsis' | 'prolepsis';

export interface SplinePoint {
  x: number;
  y: number;
}

export interface ConnectingSpline {
  sceneId: string;
  type: SplineType;
  p0: SplinePoint;
  p1: SplinePoint;
  p2: SplinePoint;
  p3: SplinePoint;
  svgPath: string;
  color: string;
  glowColor: string;
  description: string;
}

export interface ForeshadowingArcData {
  id: string;
  foreshadowingId: string;
  originSceneId: string;
  resolveSceneId?: string;
  isDangling: boolean;
  p0: SplinePoint;
  p1: SplinePoint;
  svgPath: string;
  color: string;
  isDashed: boolean;
}

export interface LayoutDimensions {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  discourseY: number;
  storyY: number;
}

export class DualTrackTimelineEngine {
  private scenes: TimelineSceneInput[] = [];
  private dimensions: LayoutDimensions = {
    width: 800,
    height: 320,
    margin: { top: 40, right: 30, bottom: 40, left: 40 },
    discourseY: 80,
    storyY: 240,
  };

  constructor(scenes: TimelineSceneInput[] = [], dimensions?: Partial<LayoutDimensions>) {
    this.scenes = [...scenes];
    if (dimensions) {
      this.dimensions = { ...this.dimensions, ...dimensions };
    }
  }

  public setScenes(scenes: TimelineSceneInput[]): void {
    this.scenes = [...scenes];
  }

  public setDimensions(dimensions: Partial<LayoutDimensions>): void {
    this.dimensions = { ...this.dimensions, ...dimensions };
  }

  /**
   * Computes layouts for Discourse Track (Reader experience, linear by character ratio)
   * and Story Track (Objective Fabula continuous time, with ellipsis).
   */
  public computeLayout(): {
    discourseNodes: Array<{ id: string; title: string; x: number; y: number; width: number; scene: TimelineSceneInput }>;
    storyNodes: Array<{ id: string; title: string; x: number; y: number; width: number; scene: TimelineSceneInput }>;
    splines: ConnectingSpline[];
    foreshadowingArcs: ForeshadowingArcData[];
  } {
    if (this.scenes.length === 0) {
      return { discourseNodes: [], storyNodes: [], splines: [], foreshadowingArcs: [] };
    }

    const { width, margin, discourseY, storyY } = this.dimensions;
    const trackWidth = width - margin.left - margin.right;

    // 1. Discourse Track Layout (Linear by Char Count)
    const totalChars = Math.max(1, this.scenes.reduce((sum, s) => sum + s.charCount, 0));
    let currentX = margin.left;

    const discourseNodes = this.scenes.map((scene) => {
      const nodeWidth = Math.max(24, (scene.charCount / totalChars) * trackWidth);
      const centerX = currentX + nodeWidth / 2;
      const res = {
        id: scene.id,
        title: scene.title,
        x: centerX,
        y: discourseY,
        width: nodeWidth,
        scene,
      };
      currentX += nodeWidth;
      return res;
    });

    // 2. Story Track Layout (Absolute Day Scale with Ellipsis Gaps)
    const minDay = Math.min(...this.scenes.map((s) => s.storyDayStart));
    const maxDay = Math.max(...this.scenes.map((s) => s.storyDayEnd));
    const daySpan = Math.max(1, maxDay - minDay);

    const storyNodes = this.scenes.map((scene) => {
      const dayOffset = scene.storyDayStart - minDay;
      const dayRatio = dayOffset / daySpan;
      const centerX = margin.left + dayRatio * trackWidth;
      const dayDuration = Math.max(0.5, scene.storyDayEnd - scene.storyDayStart);
      const nodeWidth = Math.max(20, (dayDuration / daySpan) * trackWidth);

      return {
        id: scene.id,
        title: scene.title,
        x: centerX,
        y: storyY,
        width: nodeWidth,
        scene,
      };
    });

    // Map for fast coordinate lookup
    const discourseMap = new Map(discourseNodes.map((n) => [n.id, n]));
    const storyMap = new Map(storyNodes.map((n) => [n.id, n]));

    // 3. Connecting Splines (Cubic Bezier)
    const splines: ConnectingSpline[] = [];

    for (let i = 0; i < this.scenes.length; i++) {
      const scene = this.scenes[i];
      const dNode = discourseMap.get(scene.id);
      const sNode = storyMap.get(scene.id);
      if (!dNode || !sNode) continue;

      const p0: SplinePoint = { x: dNode.x, y: dNode.y + 12 };
      const p3: SplinePoint = { x: sNode.x, y: sNode.y - 12 };

      // Determine Spline Type
      // Analepsis (回想): Story time is earlier than the previous scene, causing left-slope cross
      // Prolepsis (予見): Story time jumps far into future compared to reading progression
      let splineType: SplineType = 'progressive';
      let color = 'rgba(207, 168, 92, 0.7)'; // Default warm gold
      let glowColor = 'rgba(207, 168, 92, 0.3)';
      let description = '順行 (Progressive Narrative)';

      if (i > 0) {
        const prevScene = this.scenes[i - 1];
        if (scene.storyDayStart < prevScene.storyDayStart) {
          splineType = 'analepsis';
          color = '#38bdf8'; // Glowing cyan
          glowColor = 'rgba(56, 189, 248, 0.8)';
          description = '回想 (Analepsis / Flashback)';
        } else if (scene.storyDayStart - prevScene.storyDayEnd > 30 || (sNode.x - dNode.x > 150)) {
          splineType = 'prolepsis';
          color = '#a855f7'; // Glowing purple
          glowColor = 'rgba(168, 85, 247, 0.8)';
          description = '予見 (Prolepsis / Flashforward)';
        }
      }

      // Control points for smooth vertical S-curve
      const dy = p3.y - p0.y;
      const p1: SplinePoint = { x: p0.x, y: p0.y + dy * 0.5 };
      const p2: SplinePoint = { x: p3.x, y: p3.y - dy * 0.5 };

      const svgPath = `M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} C ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}, ${p3.x.toFixed(1)} ${p3.y.toFixed(1)}`;

      splines.push({
        sceneId: scene.id,
        type: splineType,
        p0,
        p1,
        p2,
        p3,
        svgPath,
        color,
        glowColor,
        description,
      });
    }

    // 4. Foreshadowing Arcs (bridged over Discourse track)
    const foreshadowingArcs: ForeshadowingArcData[] = [];
    const plantMap = new Map<string, typeof discourseNodes[0]>();

    for (const dNode of discourseNodes) {
      const fRef = dNode.scene.foreshadowingRef;
      if (!fRef) continue;

      if (fRef.type === 'plant') {
        plantMap.set(fRef.foreshadowingId, dNode);
      } else if (fRef.type === 'resolve') {
        const origin = plantMap.get(fRef.foreshadowingId);
        if (origin) {
          // Resolved Arc
          const p0 = { x: origin.x, y: origin.y - 12 };
          const p1 = { x: dNode.x, y: dNode.y - 12 };
          const midX = (p0.x + p1.x) / 2;
          const arcHeight = Math.min(30, Math.abs(p1.x - p0.x) * 0.25);
          const svgPath = `M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} Q ${midX.toFixed(1)} ${(p0.y - arcHeight).toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;

          foreshadowingArcs.push({
            id: `arc-${fRef.foreshadowingId}`,
            foreshadowingId: fRef.foreshadowingId,
            originSceneId: origin.id,
            resolveSceneId: dNode.id,
            isDangling: false,
            p0,
            p1,
            svgPath,
            color: 'rgba(245, 158, 11, 0.9)',
            isDashed: false,
          });

          plantMap.delete(fRef.foreshadowingId);
        }
      }
    }

    // Any remaining plants are unrecovered / dangling arcs
    for (const [fId, origin] of plantMap.entries()) {
      const p0 = { x: origin.x, y: origin.y - 12 };
      const p1 = { x: Math.min(width - margin.right, origin.x + 80), y: origin.y - 12 };
      const midX = (p0.x + p1.x) / 2;
      const svgPath = `M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} Q ${midX.toFixed(1)} ${(p0.y - 25).toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;

      foreshadowingArcs.push({
        id: `arc-${fId}`,
        foreshadowingId: fId,
        originSceneId: origin.id,
        isDangling: true,
        p0,
        p1,
        svgPath,
        color: '#ef4444', // Red dashed flashing
        isDashed: true,
      });
    }

    return { discourseNodes, storyNodes, splines, foreshadowingArcs };
  }

  /**
   * Renders the complete timeline as an interactive SVG string.
   */
  public renderSvg(): string {
    const layout = this.computeLayout();
    const { width, height, discourseY, storyY, margin } = this.dimensions;

    return `
      <svg class="dual-track-svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
          <filter id="glow-purple" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>
        </defs>

        <!-- Background Tracks -->
        <!-- Discourse Track Line -->
        <g class="track-group">
          <line x1="${margin.left}" y1="${discourseY}" x2="${width - margin.right}" y2="${discourseY}" stroke="rgba(255,255,255,0.12)" stroke-width="3" stroke-linecap="round" />
          <text x="${margin.left - 8}" y="${discourseY + 4}" fill="#cfa85c" font-size="11" font-weight="600" text-anchor="end">Sjuzhet (読者体験軸)</text>
        </g>

        <!-- Story Track Line -->
        <g class="track-group">
          <line x1="${margin.left}" y1="${storyY}" x2="${width - margin.right}" y2="${storyY}" stroke="rgba(255,255,255,0.12)" stroke-width="3" stroke-linecap="round" />
          <text x="${margin.left - 8}" y="${storyY + 4}" fill="#388bfd" font-size="11" font-weight="600" text-anchor="end">Fabula (客観時間軸)</text>
        </g>

        <!-- Connecting Splines -->
        <g class="spline-group">
          ${layout.splines.map((s) => `
            <path d="${s.svgPath}" fill="none" stroke="${s.color}" stroke-width="${s.type === 'progressive' ? '1.5' : '2.5'}"
                  filter="${s.type === 'analepsis' ? 'url(#glow-cyan)' : s.type === 'prolepsis' ? 'url(#glow-purple)' : 'none'}"
                  class="timeline-spline ${s.type}" data-scene="${s.sceneId}">
              <title>${s.description}</title>
            </path>
          `).join('')}
        </g>

        <!-- Foreshadowing Arcs -->
        <g class="foreshadowing-arc-group">
          ${layout.foreshadowingArcs.map((arc) => `
            <path d="${arc.svgPath}" fill="none" stroke="${arc.color}" stroke-width="2"
                  stroke-dasharray="${arc.isDashed ? '4,4' : 'none'}"
                  class="foreshadowing-arc ${arc.isDangling ? 'dangling-arc' : ''}" data-fid="${arc.foreshadowingId}">
              <title>${arc.isDangling ? '未回収の伏線 (DANGLING)' : '回収済伏線'}</title>
            </path>
          `).join('')}
        </g>

        <!-- Discourse Nodes -->
        <g class="discourse-nodes">
          ${layout.discourseNodes.map((n) => `
            <g class="timeline-node discourse-node" transform="translate(${n.x}, ${n.y})" data-scene-id="${n.id}">
              <circle r="6" fill="#cfa85c" stroke="#161b22" stroke-width="2" />
              <text y="-14" fill="#e6edf3" font-size="10" text-anchor="middle">${n.title}</text>
            </g>
          `).join('')}
        </g>

        <!-- Story Nodes -->
        <g class="story-nodes">
          ${layout.storyNodes.map((n) => `
            <g class="timeline-node story-node" transform="translate(${n.x}, ${n.y})" data-scene-id="${n.id}">
              <circle r="6" fill="#388bfd" stroke="#161b22" stroke-width="2" />
              <text y="18" fill="#8b949e" font-size="10" text-anchor="middle">Day ${n.scene.storyDayStart}</text>
            </g>
          `).join('')}
        </g>
      </svg>
    `;
  }
}
