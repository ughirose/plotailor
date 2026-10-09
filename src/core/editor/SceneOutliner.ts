/**
 * SceneOutliner - Scene Transition Detection & Outline Tree Generator
 *
 * Complies with 3-Pane Integrated IDE layout rules:
 * - Automatically detects scene markers (***, ◆◆◆, 3+ blank lines, etc.)
 * - Extracts leading sentence preview, line numbers, and character counts
 * - Estimates scene location and participating characters via NLP heuristics
 * - Generates dockable HTML tree view without popups/modals
 */

export interface SceneOutlinerOptions {
  customMarkers?: string[];
  blankLineThreshold?: number;
  knownCharacters?: string[];
  knownLocations?: string[];
}

export interface SceneHeadingNode {
  id: string;
  level: 1 | 2 | 3;
  title: string;
  line: number;
  offset: number;
  format: 'aozora' | 'markdown';
}

export type HeadingNode = SceneHeadingNode;

export interface SceneNode {
  id: string;
  index: number;
  marker: string;
  startLine: number;
  endLine: number;
  startOffset: number;
  endOffset: number;
  characterCount: number;
  leadingSentence: string;
  estimatedLocation: string | null;
  estimatedCharacters: string[];
  rawContent: string;
}

const DEFAULT_MARKERS = [
  '***',
  '◆◆◆',
  '◇◇◇',
  '＊＊＊',
  '▲▲▲',
  '---',
  '===',
  'ooo',
];

export class SceneOutliner {
  private customMarkers: string[];
  private blankLineThreshold: number;
  private knownCharacters: string[];
  private knownLocations: string[];

  constructor(options?: SceneOutlinerOptions) {
    this.customMarkers = options?.customMarkers ?? DEFAULT_MARKERS;
    this.blankLineThreshold = options?.blankLineThreshold ?? 3;
    this.knownCharacters = options?.knownCharacters ?? [];
    this.knownLocations = options?.knownLocations ?? [];
  }

  /**
   * Static helper to analyze manuscript scenes directly.
   */
  public static analyzeScenes(rawText: string, options?: SceneOutlinerOptions): SceneNode[] {
    return new SceneOutliner(options).parse(rawText);
  }

  /**
   * Static helper to extract Aozora Bunko and Markdown headings from manuscript text.
   */
  public static extractHeadings(rawText: string): HeadingNode[] {
    if (!rawText) return [];
    const headings: HeadingNode[] = [];
    const lines = rawText.split(/\r?\n/);
    let offset = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trimmed = line.trim();

      // 1. Aozora Bunko headings
      const aozoraDai = /[［\[]＃大見出し[］\]]([^\n［］\[\]]+)[［\[]＃大見出し終わり[］\]]/.exec(trimmed);
      if (aozoraDai) {
        headings.push({
          id: `heading-${headings.length + 1}`,
          level: 1,
          title: aozoraDai[1].trim(),
          line: lineNum,
          offset,
          format: 'aozora',
        });
      } else {
        const aozoraChu = /[［\[]＃中見出し[］\]]([^\n［］\[\]]+)[［\[]＃中見出し終わり[］\]]/.exec(trimmed);
        if (aozoraChu) {
          headings.push({
            id: `heading-${headings.length + 1}`,
            level: 2,
            title: aozoraChu[1].trim(),
            line: lineNum,
            offset,
            format: 'aozora',
          });
        } else {
          const aozoraSho = /[［\[]＃小見出し[］\]]([^\n［］\[\]]+)[［\[]＃小見出し終わり[］\]]/.exec(trimmed);
          if (aozoraSho) {
            headings.push({
              id: `heading-${headings.length + 1}`,
              level: 3,
              title: aozoraSho[1].trim(),
              line: lineNum,
              offset,
              format: 'aozora',
            });
          } else {
            // 2. Markdown headings
            const mdMatch = /^(#{1,3})\s+(.+)$/.exec(trimmed);
            if (mdMatch) {
              const level = mdMatch[1].length as 1 | 2 | 3;
              headings.push({
                id: `heading-${headings.length + 1}`,
                level,
                title: mdMatch[2].trim(),
                line: lineNum,
                offset,
                format: 'markdown',
              });
            }
          }
        }
      }

      offset += line.length + 1;
    }

    return headings;
  }

  /**
   * Set or update known characters and locations for enhanced extraction accuracy.
   */
  public setKnowledgeBase(characters: string[], locations: string[]): void {
    this.knownCharacters = characters;
    this.knownLocations = locations;
  }

  /**
   * Parse raw manuscript text into structured scene nodes.
   */
  public parse(rawText: string): SceneNode[] {
    if (!rawText || rawText.trim().length === 0) {
      return [];
    }

    const lines = rawText.split(/\r?\n/);
    const scenes: SceneNode[] = [];

    let currentSceneLines: { line: string; lineNumber: number; offset: number }[] = [];
    let currentMarker = '開始';
    let lineOffset = 0;
    let consecutiveBlankCount = 0;
    let pendingBlankLines: { line: string; lineNumber: number; offset: number }[] = [];

    const flushScene = () => {
      if (currentSceneLines.length === 0) return;

      const rawContent = currentSceneLines.map((l) => l.line).join('\n');
      const startLine = currentSceneLines[0].lineNumber;
      const endLine = currentSceneLines[currentSceneLines.length - 1].lineNumber;
      const startOffset = currentSceneLines[0].offset;
      const lastLineObj = currentSceneLines[currentSceneLines.length - 1];
      const endOffset = lastLineObj.offset + lastLineObj.line.length;
      const characterCount = rawContent.replace(/\s/g, '').length;

      const leadingSentence = this.extractLeadingSentence(rawContent);
      const estimatedLocation = this.estimateLocation(rawContent);
      const estimatedCharacters = this.estimateCharacters(rawContent);

      scenes.push({
        id: `scene-${scenes.length + 1}`,
        index: scenes.length + 1,
        marker: currentMarker,
        startLine,
        endLine,
        startOffset,
        endOffset,
        characterCount,
        leadingSentence,
        estimatedLocation,
        estimatedCharacters,
        rawContent,
      });

      currentSceneLines = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNumber = i + 1;
      const trimmed = line.trim();
      const currentLineObj = { line, lineNumber, offset: lineOffset };

      // Check explicit scene marker
      const isExplicitMarker = this.isExplicitMarker(trimmed);

      if (isExplicitMarker) {
        // Flush existing scene before marker
        flushScene();
        currentMarker = trimmed;
        pendingBlankLines = [];
        consecutiveBlankCount = 0;
      } else if (trimmed === '') {
        consecutiveBlankCount++;
        pendingBlankLines.push(currentLineObj);

        if (consecutiveBlankCount >= this.blankLineThreshold) {
          // 3 or more blank lines detected
          if (currentSceneLines.length > 0) {
            while (
              currentSceneLines.length > 0 &&
              currentSceneLines[currentSceneLines.length - 1].line.trim() === ''
            ) {
              currentSceneLines.pop();
            }
            flushScene();
          }
          currentMarker = `${consecutiveBlankCount}行空き`;
        }
      } else {
        // Non-blank line
        if (consecutiveBlankCount >= this.blankLineThreshold) {
          consecutiveBlankCount = 0;
          pendingBlankLines = [];
        } else if (pendingBlankLines.length > 0) {
          currentSceneLines.push(...pendingBlankLines);
          pendingBlankLines = [];
          consecutiveBlankCount = 0;
        }

        currentSceneLines.push(currentLineObj);
      }

      lineOffset += line.length + 1; // +1 for \n
    }

    // Flush final scene
    flushScene();

    return scenes;
  }

  /**
   * Renders the dockable HTML tree view for right dock integration.
   */
  public renderRightDockTree(scenes: SceneNode[]): string {
    if (scenes.length === 0) {
      return `
        <div class="scene-outliner-dock empty">
          <div class="scene-outliner-header">
            <span>🎬 シーン目次 (0 シーン)</span>
          </div>
          <p class="scene-outliner-empty-msg">本文中にシーン転換記号（***、◆◆◆、3行空き等）が検出されていません。</p>
        </div>
      `;
    }

    const itemsHtml = scenes
      .map((scene) => {
        const charsDisplay =
          scene.estimatedCharacters.length > 0
            ? scene.estimatedCharacters.map((c) => this.escapeHtml(c)).join(', ')
            : 'なし';

        const locationDisplay = scene.estimatedLocation
          ? this.escapeHtml(scene.estimatedLocation)
          : '未指定';

        return `
          <div class="scene-tree-item" data-scene-id="${scene.id}" data-start-line="${scene.startLine}" data-start-offset="${scene.startOffset}">
            <div class="scene-item-title">
              <span class="scene-index">#${scene.index}</span>
              <span class="scene-marker-badge">${this.escapeHtml(scene.marker)}</span>
              <span class="scene-text-preview" title="${this.escapeHtml(scene.leadingSentence)}">${this.escapeHtml(scene.leadingSentence)}</span>
            </div>
            <div class="scene-item-meta">
              <span class="scene-meta-tag location">📍 ${locationDisplay}</span>
              <span class="scene-meta-tag characters">👤 ${charsDisplay}</span>
              <span class="scene-meta-tag metrics">L${scene.startLine}-${scene.endLine} (${scene.characterCount}字)</span>
            </div>
          </div>
        `;
      })
      .join('');

    return `
      <div class="scene-outliner-dock">
        <div class="scene-outliner-header">
          <span>🎬 シーン目次 (全 ${scenes.length} シーン)</span>
        </div>
        <div class="scene-tree-list">
          ${itemsHtml}
        </div>
      </div>
    `;
  }

  private isExplicitMarker(trimmedLine: string): boolean {
    if (!trimmedLine) return false;
    return (
      this.customMarkers.includes(trimmedLine) ||
      /^[*◆◇▲■★☆=─-]{3,}$/.test(trimmedLine)
    );
  }

  private extractLeadingSentence(rawContent: string): string {
    const cleanText = rawContent
      .replace(/《《([^》]+)》》/g, '$1')            // Convert bouten 《《文字》》 to 文字
      .replace(/｜([^《\n]+)《[^》\n]+》/g, '$1') // Strip Aozora full ruby ｜漢字《かんじ》 -> 漢字
      .replace(/([一-龠ァ-ヶa-zA-Z0-9]+)《[^》\n]+》/g, '$1') // Strip simplified ruby 漢字《かんじ》 -> 漢字
      .replace(/[ \t]+/g, ' ')
      .trim();

    const lines = cleanText.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return '(空シーン)';

    const firstLine = lines[0].replace(/^[　\s]+/, '');
    const sentenceMatch = firstLine.match(/^(.*?[。]|.{1,60})/);

    const result = sentenceMatch ? sentenceMatch[0] : firstLine;
    return result.length > 60 ? `${result.substring(0, 57)}...` : result;
  }

  private estimateLocation(rawContent: string): string | null {
    // 1. Explicit tag check e.g. 【場所：王都】 or 【場所】王都
    const tagMatch = rawContent.match(/【場所[：:]?\s*([^】]+)】/);
    if (tagMatch) {
      return tagMatch[1].trim();
    }

    // 2. Location particle heuristic e.g. 「〜にて」「〜に到着」「〜の部屋」
    const particleMatch = rawContent.match(
      /([一-龠ぁ-んァ-ヶ]{2,10})(?:にて|で(?:合流|待機|開催|滞在)|へ到着|に到着|の(?:中央|広場|部屋|室内|城内|庭園|門前|最奥))/
    );
    if (particleMatch) {
      const loc = particleMatch[1].replace(/^[一-龠ぁ-んァ-ヶ]+は|^一行は|^彼らは|^私達は/, '');
      return loc.trim();
    }

    // 3. Known locations match (sorted by longest first to avoid partial prefix match)
    const sortedLocations = [...this.knownLocations].sort((a, b) => b.length - a.length);
    for (const loc of sortedLocations) {
      if (rawContent.includes(loc)) {
        return loc;
      }
    }

    // 4. Suffix heuristic e.g. 王都, 北方砦, 執務室
    const suffixMatch = rawContent.match(
      /([一-龠ァ-ヶ]{2,8}(?:砦|室|王都|城|町|村|館|広場|森|山|港|宮殿|塔|屋敷|寺院|洞窟|街道|学園|居酒屋|教会|要塞))/
    );
    if (suffixMatch) {
      return suffixMatch[1].trim();
    }

    return null;
  }

  private estimateCharacters(rawContent: string): string[] {
    const detected = new Set<string>();

    // 1. Known characters match
    for (const char of this.knownCharacters) {
      if (rawContent.includes(char)) {
        detected.add(char);
      }
    }

    // 2. Speaker attribution match: 「...」と[名前]が言った
    const speakerRegex =
      /[「『].*?[」』]\s*と(?:言っ|呟い|叫ん|答え|囁い|問う|話|語っ|つぶや|ささや)?\s*([一-龠ァ-ヶ]{2,8})/g;
    let match: RegExpExecArray | null;
    while ((match = speakerRegex.exec(rawContent)) !== null) {
      if (match[1] && !this.isCommonWord(match[1])) {
        detected.add(match[1]);
      }
    }

    // 3. Honorifics / Titles match: [名前]将軍, [名前]殿, [名前]様, [名前]さん, [名前]君
    const honorificRegex =
      /([一-龠ァ-ヶ]{2,8})(?:将軍|隊長|殿|様|さん|君|ちゃん|博士|卿|王|皇帝|皇女|王子|大公|伯爵|子爵|男爵)/g;
    while ((match = honorificRegex.exec(rawContent)) !== null) {
      if (match[1] && !this.isCommonWord(match[1])) {
        detected.add(match[1]);
      }
    }

    // 4. Katakana name heuristics (e.g. ヴァレリウス, アーサー)
    const katakanaNameRegex = /([ァ-ヴー]{2,8})/g;
    while ((match = katakanaNameRegex.exec(rawContent)) !== null) {
      const name = match[1];
      if (
        name.length >= 2 &&
        !this.isCommonKatakanaWord(name) &&
        !detected.has(name)
      ) {
        const count = (rawContent.match(new RegExp(name, 'g')) || []).length;
        if (count >= 1) {
          detected.add(name);
        }
      }
    }

    return Array.from(detected);
  }

  private isCommonWord(word: string): boolean {
    const commonWords = [
      '私', '僕', '俺', '自分', '誰か', '相手', '彼女', '彼', 'みんな',
      '人間', '言葉', '声', '表情', '男', '女', '少女', '少年', '老人',
    ];
    return commonWords.includes(word);
  }

  private isCommonKatakanaWord(word: string): boolean {
    const commonKatakana = [
      'ルビ', 'テキスト', 'プレビュー', 'ページ', 'モード', 'ボタン',
      'データ', 'エラー', 'メッセージ', 'タイプ', 'レベル', 'システム',
      'チェック', 'リスト', 'カード', 'ヘッダー', 'インジケータ',
    ];
    return commonKatakana.includes(word);
  }

  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
