/**
 * PovConsistencyAnalyzer - Third-Person Limited vs Omniscient POV Consistency Linter
 *
 * Complies with Plotailor 3-Pane IDE Constitution:
 * - Detects "神の視点ブレ" (POV Drift / Mixed Third-Person Limited narration)
 *   where multiple characters' internal psychological states are depicted in the same scene.
 * - Provides permanent inline/docked badge metadata and HTML without popup modals.
 * - Supports Japanese IME guard bypass and Aozora ruby text parsing.
 */

export interface CharacterPovProfile {
  name: string;
  aliases?: string[];
}

export interface PsychologicalDepiction {
  characterName: string;
  textSnippet: string;
  from: number;
  to: number;
  marker: string;
}

export interface PovDiagnostic {
  from: number;
  to: number;
  severity: 'warning' | 'error' | 'info';
  message: string;
  focalCharacter: string;
  driftingCharacter: string;
  snippet: string;
}

export interface PovBadgeState {
  label: string;
  focalCharacter: string | null;
  hasDrift: boolean;
  driftCharacters: string[];
  status: 'normal' | 'warning' | 'neutral';
  badgeHtml: string;
  tooltip: string;
}

export interface PovAnalysisResult {
  focalCharacter: string | null;
  hasDrift: boolean;
  psychologicalDepictions: PsychologicalDepiction[];
  driftCharacters: string[];
  diagnostics: PovDiagnostic[];
  badge: PovBadgeState;
}

export interface PovAnalyzerOptions {
  knownCharacters?: (string | CharacterPovProfile)[];
  targetFocalCharacter?: string | null;
}

// Japanese psychological depiction markers (internal thoughts, emotions, perceptions)
const PSYCHOLOGICAL_MARKERS = [
  'と思った',
  'と心の中で',
  'と念じた',
  'と祈った',
  'と胸を痛めた',
  'と安堵した',
  'と痛感した',
  'と危惧した',
  'と直感した',
  'と確信した',
  'と暗澹',
  'と悲嘆',
  'と悟った',
  'と後悔した',
  'と嫉妬',
  'と苦痛',
  'と恐怖',
  'と不安',
  'と焦った',
  'と憤った',
  'と胸を焦がした',
  'と密かに思った',
  'と思いを馳せた',
  'と反論したくなった',
  '内心焦って',
  '内心恐れて',
  '恐怖に震え',
  '安堵を覚えた',
  '不安を募らせた',
  '動揺を隠せなかった',
];

export class PovConsistencyAnalyzer {
  private knownCharacters: CharacterPovProfile[] = [];
  private targetFocalCharacter: string | null = null;

  constructor(options?: PovAnalyzerOptions) {
    if (options) {
      this.configure(options);
    }
  }

  public configure(options: PovAnalyzerOptions): void {
    if (options.knownCharacters) {
      this.knownCharacters = options.knownCharacters.map((c) =>
        typeof c === 'string' ? { name: c, aliases: [] } : c
      );
    }
    if (options.targetFocalCharacter !== undefined) {
      this.targetFocalCharacter = options.targetFocalCharacter;
    }
  }

  public setTargetFocalCharacter(characterName: string | null): void {
    this.targetFocalCharacter = characterName;
  }

  public getTargetFocalCharacter(): string | null {
    return this.targetFocalCharacter;
  }

  public setKnownCharacters(characters: (string | CharacterPovProfile)[]): void {
    this.knownCharacters = characters.map((c) =>
      typeof c === 'string' ? { name: c, aliases: [] } : c
    );
  }

  /**
   * Analyzes text for character psychological depictions and POV consistency.
   * Skips detailed analysis when IME composition is active to ensure authoring performance.
   */
  public analyze(
    text: string,
    options?: { isComposing?: boolean }
  ): PovAnalysisResult {
    if (options?.isComposing) {
      return this.createEmptyResult(this.targetFocalCharacter);
    }

    const cleanText = this.stripAozoraFormatting(text);
    const depictions = this.extractPsychologicalDepictions(cleanText, text);

    // Group depictions by character name
    const charDepictionsMap = new Map<string, PsychologicalDepiction[]>();
    for (const d of depictions) {
      const existing = charDepictionsMap.get(d.characterName) || [];
      existing.push(d);
      charDepictionsMap.set(d.characterName, existing);
    }

    const detectedCharNames = Array.from(charDepictionsMap.keys());

    // Determine Focal Character
    let focalCharacter: string | null = this.targetFocalCharacter;
    if (!focalCharacter) {
      if (detectedCharNames.length > 0) {
        // Pick the character with the most psychological depictions as primary focal character
        focalCharacter = detectedCharNames.reduce((prev, curr) => {
          const prevCount = charDepictionsMap.get(prev)?.length || 0;
          const currCount = charDepictionsMap.get(curr)?.length || 0;
          return currCount > prevCount ? curr : prev;
        });
      }
    }

    // Determine Drift Characters (psychological depictions from characters other than focalCharacter)
    const driftCharacters = focalCharacter
      ? detectedCharNames.filter((name) => name !== focalCharacter)
      : (detectedCharNames.length > 1 ? detectedCharNames.slice(1) : []);

    const hasDrift = driftCharacters.length > 0;

    // Generate Diagnostics for drifting depictions
    const diagnostics: PovDiagnostic[] = [];
    if (hasDrift && focalCharacter) {
      for (const driftChar of driftCharacters) {
        const driftDepictions = charDepictionsMap.get(driftChar) || [];
        for (const dep of driftDepictions) {
          diagnostics.push({
            from: dep.from,
            to: dep.to,
            severity: 'warning',
            message: `【視点ブレ警報】視点人物「${focalCharacter}」のシーン内で「${driftChar}」の心理描写（「${dep.marker}」）が混在しています（神の視点ポロリ）。`,
            focalCharacter,
            driftingCharacter: driftChar,
            snippet: dep.textSnippet,
          });
        }
      }
    }

    // Generate Badge
    const badge = this.buildBadgeState(focalCharacter, hasDrift, driftCharacters);

    return {
      focalCharacter,
      hasDrift,
      psychologicalDepictions: depictions,
      driftCharacters,
      diagnostics,
      badge,
    };
  }

  private extractPsychologicalDepictions(
    cleanText: string,
    rawText: string
  ): PsychologicalDepiction[] {
    const depictions: PsychologicalDepiction[] = [];
    const sentences = cleanText.split(/(?<=[。！？\n])/);

    let currentOffset = 0;

    for (const sentence of sentences) {
      if (!sentence.trim()) {
        currentOffset += sentence.length;
        continue;
      }

      for (const marker of PSYCHOLOGICAL_MARKERS) {
        const markerIdx = sentence.indexOf(marker);
        if (markerIdx !== -1) {
          const charName = this.resolveCharacterName(sentence, markerIdx);
          if (charName) {
            const rawFrom = rawText.indexOf(sentence.trim(), Math.max(0, currentOffset - 20));
            const from = rawFrom !== -1 ? rawFrom : currentOffset;
            const to = from + sentence.length;

            depictions.push({
              characterName: charName,
              textSnippet: sentence.trim(),
              from,
              to,
              marker,
            });
            break; // One marker per sentence is sufficient
          }
        }
      }

      currentOffset += sentence.length;
    }

    return depictions;
  }

  private resolveCharacterName(sentence: string, markerIdx: number): string | null {
    const textBeforeMarker = sentence.substring(0, markerIdx);

    // 1. Check against explicitly registered known characters & aliases
    for (const profile of this.knownCharacters) {
      if (textBeforeMarker.includes(profile.name)) {
        return profile.name;
      }
      if (profile.aliases) {
        for (const alias of profile.aliases) {
          if (textBeforeMarker.includes(alias)) {
            return profile.name;
          }
        }
      }
    }

    // 2. Heuristic extraction: Look for `[Name]は` or `[Name]が` in proximity before marker
    const subjectMatch = textBeforeMarker.match(/([一-龠ぁ-んァ-ヶa-zA-Z0-9ー]{2,10})[はが](?:[^はが]*)$/);
    if (subjectMatch) {
      const candidate = subjectMatch[1].replace(/^(?:その|あの|この|彼|彼女|自分)/, '').trim();
      if (candidate.length >= 2) {
        return candidate;
      }
    }

    return null;
  }

  private stripAozoraFormatting(text: string): string {
    // Strips Aozora ruby tags `｜親文字《るび》` -> `親文字` and `《《傍点》》`
    return text
      .replace(/｜([^《]+)《[^》]+》/g, '$1')
      .replace(/《《([^》]+)》》/g, '$1')
      .replace(/《[^》]+》/g, '');
  }

  private buildBadgeState(
    focalCharacter: string | null,
    hasDrift: boolean,
    driftCharacters: string[]
  ): PovBadgeState {
    if (!focalCharacter && !hasDrift) {
      return {
        label: '視点: 客観／未特定',
        focalCharacter: null,
        hasDrift: false,
        driftCharacters: [],
        status: 'neutral',
        tooltip: '特定のキャラクターへの心理描写焦点化は検知されていません（客観描写）。',
        badgeHtml: `<span class="pov-badge pov-neutral" data-status="neutral" title="特定の人物への心理描写焦点化なし">👁️ 視点: 客観／未特定</span>`,
      };
    }

    if (!hasDrift) {
      return {
        label: `視点: ${focalCharacter}`,
        focalCharacter,
        hasDrift: false,
        driftCharacters: [],
        status: 'normal',
        tooltip: `三人称一元視点（${focalCharacter}）として整合しています。`,
        badgeHtml: `<span class="pov-badge pov-normal" data-status="normal" data-focal="${focalCharacter}" title="三人称一元視点: ${focalCharacter}">👁️ 視点: ${focalCharacter}</span>`,
      };
    }

    const driftLabel = driftCharacters.join('・');
    const label = `⚠️ 視点ブレ: ${focalCharacter}（${driftLabel}混在）`;
    const tooltip = `視点人物「${focalCharacter}」のシーン内で「${driftLabel}」の心理描写が混在しています（神の視点ブレ）。`;
    const badgeHtml = `<span class="pov-badge pov-warning" data-status="warning" data-focal="${focalCharacter}" data-drift="${driftLabel}" title="${tooltip}">⚠️ 視点ブレ: ${focalCharacter}（${driftLabel}混在）</span>`;

    return {
      label,
      focalCharacter,
      hasDrift: true,
      driftCharacters,
      status: 'warning',
      tooltip,
      badgeHtml,
    };
  }

  private createEmptyResult(focalCharacter: string | null): PovAnalysisResult {
    const badge = this.buildBadgeState(focalCharacter, false, []);
    return {
      focalCharacter,
      hasDrift: false,
      psychologicalDepictions: [],
      driftCharacters: [],
      diagnostics: [],
      badge,
    };
  }
}
