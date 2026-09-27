/**
 * EmotionalArcChart - Line Chart Visualizer for Character Emotional Dynamics & Climax Arc
 *
 * Generates responsive SVG line charts and HTML dock cards visualizing
 * positive/negative emotional valence transitions and scene tension curves leading to climax.
 */

import type { EmotionalArcResult, EmotionalSceneData } from './EmotionalArcAnalyzer.js';

export interface ChartRenderOptions {
  width?: number;
  height?: number;
  showTitle?: boolean;
  showLegend?: boolean;
  showClimaxMarker?: boolean;
  theme?: 'dark' | 'light';
}

export class EmotionalArcChart {
  private result: EmotionalArcResult;

  constructor(result: EmotionalArcResult) {
    this.result = result;
  }

  /**
   * Generates a complete SVG line chart representing emotional valence and tension trajectory.
   */
  public renderSvgString(options?: ChartRenderOptions): string {
    const width = options?.width ?? 320;
    const height = options?.height ?? 180;
    const padding = { top: 25, right: 20, bottom: 30, left: 35 };

    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    const scenes = this.result.scenes;

    if (scenes.length === 0) {
      return `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" class="emotional-arc-svg">
          <rect width="100%" height="100%" fill="transparent"/>
          <text x="${width / 2}" y="${height / 2}" text-anchor="middle" fill="#646d79" font-size="12">原稿データなし (解析可能シーン未検出)</text>
        </svg>
      `;
    }

    // Y-axis mappings:
    // Valence [-1.0, +1.0] -> mapped to plotHeight (Top: +1.0, Bottom: -1.0)
    // Tension [0.0, 1.0] -> mapped to plotHeight (Top: 1.0, Bottom: 0.0)
    const mapYValence = (v: number): number => {
      const clamped = Math.max(-1.0, Math.min(1.0, v));
      // +1.0 -> padding.top, -1.0 -> padding.top + plotHeight
      return padding.top + ((1.0 - clamped) / 2.0) * plotHeight;
    };

    const mapYTension = (t: number): number => {
      const clamped = Math.max(0.0, Math.min(1.0, t));
      // 1.0 -> padding.top, 0.0 -> padding.top + plotHeight
      return padding.top + (1.0 - clamped) * plotHeight;
    };

    // X-axis mapping:
    const mapX = (index: number): number => {
      if (scenes.length === 1) {
        return padding.left + plotWidth / 2;
      }
      return padding.left + (index / (scenes.length - 1)) * plotWidth;
    };

    // Build SVG paths
    let valencePathD = '';
    let tensionPathD = '';

    const valencePoints: { x: number; y: number; scene: EmotionalSceneData }[] = [];
    const tensionPoints: { x: number; y: number; scene: EmotionalSceneData }[] = [];

    scenes.forEach((scene, i) => {
      const x = Number(mapX(i).toFixed(1));
      const yValence = Number(mapYValence(scene.valence).toFixed(1));
      const yTension = Number(mapYTension(scene.tension).toFixed(1));

      valencePoints.push({ x, y: yValence, scene });
      tensionPoints.push({ x, y: yTension, scene });

      if (i === 0) {
        valencePathD += `M ${x} ${yValence}`;
        tensionPathD += `M ${x} ${yTension}`;
      } else {
        valencePathD += ` L ${x} ${yValence}`;
        tensionPathD += ` L ${x} ${yTension}`;
      }
    });

    const neutralY = Number(mapYValence(0).toFixed(1));

    // Climax Marker
    let climaxMarkerSvg = '';
    if (options?.showClimaxMarker !== false && scenes.length > 0) {
      const climaxPoint = tensionPoints[this.result.peakTensionSceneIndex];
      if (climaxPoint) {
        climaxMarkerSvg = `
          <!-- Climax Highlight Indicator -->
          <g class="climax-marker" transform="translate(${climaxPoint.x}, ${climaxPoint.y})">
            <circle r="9" fill="rgba(239, 68, 68, 0.25)" stroke="#ef4444" stroke-width="1.5">
              <animate attributeName="r" values="6;11;6" dur="2s" repeatCount="indefinite" />
            </g>
            <circle r="4" fill="#ef4444" />
            <text y="-14" text-anchor="middle" fill="#ef4444" font-size="9" font-weight="bold">🔥 Climax (Scene ${climaxPoint.scene.sceneIndex + 1})</text>
          </g>
        `;
      }
    }

    // Valence data points
    const valenceCirclesSvg = valencePoints
      .map(
        (p) => `
        <circle cx="${p.x}" cy="${p.y}" r="3" fill="#10b981" stroke="#0e1117" stroke-width="1">
          <title>Scene ${p.scene.sceneIndex + 1}: 感情価 ${p.scene.valence > 0 ? '+' : ''}${p.scene.valence}</title>
        </circle>
      `
      )
      .join('');

    // Tension data points
    const tensionCirclesSvg = tensionPoints
      .map(
        (p) => `
        <circle cx="${p.x}" cy="${p.y}" r="3" fill="#f59e0b" stroke="#0e1117" stroke-width="1">
          <title>Scene ${p.scene.sceneIndex + 1}: 緊張度 ${p.scene.tension}</title>
        </circle>
      `
      )
      .join('');

    // X-axis scene labels
    const xAxisLabels = scenes
      .map((s, i) => {
        const x = mapX(i);
        return `<text x="${x}" y="${height - 8}" text-anchor="middle" fill="#646d79" font-size="8">S${s.sceneIndex + 1}</text>`;
      })
      .join('');

    return `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" height="${height}" class="emotional-arc-svg" style="font-family: sans-serif;">
        <!-- Background Grid -->
        <rect width="100%" height="100%" fill="transparent"/>

        <!-- Neutral Baseline (Valence = 0) -->
        <line x1="${padding.left}" y1="${neutralY}" x2="${width - padding.right}" y2="${neutralY}" stroke="rgba(255, 255, 255, 0.12)" stroke-dasharray="3,3" stroke-width="1"/>
        <text x="${padding.left - 5}" y="${neutralY + 3}" text-anchor="end" fill="#646d79" font-size="8">0.0</text>

        <!-- Top / Bottom Y-Axis Labels -->
        <text x="${padding.left - 5}" y="${padding.top + 3}" text-anchor="end" fill="#10b981" font-size="8">+1.0</text>
        <text x="${padding.left - 5}" y="${height - padding.bottom + 3}" text-anchor="end" fill="#6366f1" font-size="8">-1.0</text>

        <!-- Line Paths -->
        <path d="${valencePathD}" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="${tensionPathD}" fill="none" stroke="#f59e0b" stroke-width="2" stroke-dasharray="4,2" stroke-linecap="round" stroke-linejoin="round"/>

        <!-- Data Circles -->
        ${valenceCirclesSvg}
        ${tensionCirclesSvg}

        <!-- Climax Marker -->
        ${climaxMarkerSvg}

        <!-- X-Axis Labels -->
        ${xAxisLabels}

        <!-- Legend -->
        ${
          options?.showLegend !== false
            ? `
          <g transform="translate(${padding.left}, 12)">
            <line x1="0" y1="0" x2="12" y2="0" stroke="#10b981" stroke-width="2"/>
            <text x="16" y="3" fill="#a5b4fc" font-size="8">感情価(Pos/Neg)</text>

            <line x1="90" y1="0" x2="102" y2="0" stroke="#f59e0b" stroke-width="2" stroke-dasharray="3,1"/>
            <text x="106" y="3" fill="#f59e0b" font-size="8">緊張度(テンション)</text>
          </g>
        `
            : ''
        }
      </svg>
    `;
  }

  /**
   * Renders the complete HTML card UI for 3-pane right dock integration.
   */
  public renderHtmlContainer(options?: ChartRenderOptions): string {
    const svgChart = this.renderSvgString(options);
    const summary = this.result.summary;

    const dominantBadgeColor =
      summary.dominantEmotion === 'positive'
        ? 'background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3);'
        : summary.dominantEmotion === 'negative'
        ? 'background: rgba(239, 68, 68, 0.15); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3);'
        : 'background: rgba(156, 163, 175, 0.15); color: #9ca3af; border: 1px solid rgba(156, 163, 175, 0.3);';

    const dominantLabel =
      summary.dominantEmotion === 'positive'
        ? 'ポジティブ優勢'
        : summary.dominantEmotion === 'negative'
        ? 'ネガティブ優勢'
        : '中立・静寂';

    const climaxPercent = (this.result.climaxProgress * 100).toFixed(0);

    return `
      <div class="emotional-arc-card" style="background: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 0.85rem; margin-bottom: 0.75rem;">
        <div class="card-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <span style="font-size: 0.85rem; font-weight: 600; color: var(--text-primary); display: flex; align-items: center; gap: 0.4rem;">
            📈 登場人物感情曲線 ＆ テンション推移
          </span>
          <span style="font-size: 0.7rem; padding: 0.15rem 0.45rem; border-radius: 9999px; ${dominantBadgeColor}">
            ${dominantLabel}
          </span>
        </div>

        <div class="chart-wrapper" style="width: 100%; margin: 0.4rem 0;">
          ${svgChart}
        </div>

        <div class="arc-stats-grid" style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.4rem; font-size: 0.72rem; text-align: center; margin-top: 0.4rem; background: rgba(0, 0, 0, 0.2); padding: 0.4rem; border-radius: 6px;">
          <div>
            <div style="color: var(--text-muted);">総シーン数</div>
            <div style="color: var(--text-primary); font-weight: 600;">${summary.totalScenes} シーン</div>
          </div>
          <div>
            <div style="color: var(--text-muted);">全体感情価</div>
            <div style="color: ${this.result.overallValence >= 0 ? '#10b981' : '#f87171'}; font-weight: 600;">
              ${this.result.overallValence > 0 ? '+' : ''}${this.result.overallValence}
            </div>
          </div>
          <div>
            <div style="color: var(--text-muted);">クライマックス位置</div>
            <div style="color: #f59e0b; font-weight: 600;">${climaxPercent}% (Scene ${this.result.peakTensionSceneIndex + 1})</div>
          </div>
        </div>
      </div>
    `;
  }
}
