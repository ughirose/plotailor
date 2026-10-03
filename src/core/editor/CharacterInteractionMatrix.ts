/**
 * CharacterInteractionMatrix - Co-occurrence and Dialogue Interaction Frequency Calculator
 *
 * Designed for Plotailor 3-Pane IDE Constitution:
 * - Pure logic engine calculating character relationship networks from manuscript text.
 * - Tracks paragraph and scene character co-occurrences.
 * - Detects back-and-forth dialogue exchanges (直後発話).
 * - Computes relationship intimacy matrices and extracts top, distant, and isolated character pairs.
 */

export interface CharacterDefinition {
  id: string;
  name: string;
  aliases?: string[];
  color?: string;
}

export interface InteractionPair {
  char1: CharacterDefinition;
  char2: CharacterDefinition;
  coOccurrenceCount: number;
  dialogueTurnCount: number;
  relationshipScore: number;
}

export interface MatrixOptions {
  /** Scene separator regex (default: multi-newline or scene divider lines) */
  sceneDelimiter?: RegExp;
  /** Multiplier weight for back-and-forth dialogue exchanges (default: 2.0) */
  dialogueWeight?: number;
  /** Multiplier weight for paragraph/scene co-occurrences (default: 1.0) */
  coOccurrenceWeight?: number;
  /** Minimum score to consider connected (default: 0) */
  minScoreThreshold?: number;
}

export interface CharacterInteractionSummary {
  characters: CharacterDefinition[];
  matrix: number[][]; // 2D relationship matrix where matrix[i][j] is edge weight between char i and char j
  coOccurrenceMatrix: number[][];
  dialogueMatrix: number[][];
  pairs: InteractionPair[];
  topPairs: InteractionPair[];
  distantPairs: InteractionPair[];
  isolatedCharacters: CharacterDefinition[];
}

export interface SpeakerAttribution {
  lineIndex: number;
  character: CharacterDefinition | null;
  dialogueText: string;
}

export class CharacterInteractionMatrix {
  private options: Required<MatrixOptions>;

  constructor(options?: MatrixOptions) {
    this.options = {
      sceneDelimiter: options?.sceneDelimiter ?? /(?:\s*[*#=─-]{3,}\s*|\n{3,})/,
      dialogueWeight: options?.dialogueWeight ?? 2.0,
      coOccurrenceWeight: options?.coOccurrenceWeight ?? 1.0,
      minScoreThreshold: options?.minScoreThreshold ?? 0,
    };
  }

  /**
   * Helper to check if text contains character's name or any of their aliases.
   */
  public isCharacterPresent(text: string, character: CharacterDefinition): boolean {
    if (!text) return false;
    const searchTerms = [character.name, ...(character.aliases ?? [])].filter(Boolean);
    if (searchTerms.length === 0) return false;

    const escaped = searchTerms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(escaped.join('|'), 'u');
    return regex.test(text);
  }

  /**
   * Finds all characters present in a given block of text.
   */
  public detectCharactersInText(text: string, characters: CharacterDefinition[]): CharacterDefinition[] {
    return characters.filter((char) => this.isCharacterPresent(text, char));
  }

  /**
   * Detects speaker attribution for dialogue lines in text.
   * Parses Japanese quote marks 「...」 and 『...』 and associates them with nearby character mentions.
   */
  public extractDialogueLines(text: string, characters: CharacterDefinition[]): SpeakerAttribution[] {
    if (!text) return [];

    const lines = text.split('\n');
    const attributions: SpeakerAttribution[] = [];

    // Match dialogue brackets: 「...」 or 『...』
    const dialogueRegex = /[「『]([^」』]+)[」』]/g;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      let match: RegExpExecArray | null;
      dialogueRegex.lastIndex = 0;

      while ((match = dialogueRegex.exec(line)) !== null) {
        const dialogueText = match[1];

        // Strategy 1: Check text outside the dialogue quotes in the current line
        const textOutsideQuotes = line.replace(/[「『][^」』]+[」』]/g, ' ');
        let speaker = characters.find((c) => this.isCharacterPresent(textOutsideQuotes, c)) ?? null;

        // Strategy 2: If no speaker on line outside quotes, check immediate previous line (narrative line before dialogue)
        if (!speaker && i > 0) {
          const prevLine = lines[i - 1].trim();
          if (!/[「『]/.test(prevLine)) {
            speaker = characters.find((c) => this.isCharacterPresent(prevLine, c)) ?? null;
          }
        }

        // Strategy 3: Check immediate next line if short dialogue tag (e.g. 「〜〜〜」\nアーサーはつぶやいた。)
        if (!speaker && i < lines.length - 1) {
          const nextLine = lines[i + 1].trim();
          if (!/[「『]/.test(nextLine)) {
            speaker = characters.find((c) => this.isCharacterPresent(nextLine, c)) ?? null;
          }
        }

        attributions.push({
          lineIndex: i,
          character: speaker,
          dialogueText,
        });
      }
    }

    return attributions;
  }

  /**
   * Analyzes manuscript text to generate the interaction matrix and relationship summary.
   */
  public analyze(text: string, characters: CharacterDefinition[], customOptions?: MatrixOptions): CharacterInteractionSummary {
    const opts = customOptions ? { ...this.options, ...customOptions } : this.options;
    const n = characters.length;

    if (n === 0) {
      return {
        characters: [],
        matrix: [],
        coOccurrenceMatrix: [],
        dialogueMatrix: [],
        pairs: [],
        topPairs: [],
        distantPairs: [],
        isolatedCharacters: [],
      };
    }

    // Initialize 2D matrices
    const coMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    const dialMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
    const scoreMatrix: number[][] = Array.from({ length: n }, () => Array(n).fill(0));

    if (text && text.trim().length > 0) {
      // --- 1. Paragraph & Scene Co-occurrence Aggregation ---
      // Scene co-occurrences
      const scenes = text.split(opts.sceneDelimiter).filter((s) => s.trim().length > 0);
      for (const scene of scenes) {
        const scenePresent = this.detectCharactersInText(scene, characters);
        for (let i = 0; i < scenePresent.length; i++) {
          for (let j = i + 1; j < scenePresent.length; j++) {
            const idx1 = characters.findIndex((c) => c.id === scenePresent[i].id);
            const idx2 = characters.findIndex((c) => c.id === scenePresent[j].id);
            if (idx1 !== -1 && idx2 !== -1) {
              coMatrix[idx1][idx2] += 1;
              coMatrix[idx2][idx1] += 1;
            }
          }
        }

        // Paragraph co-occurrences within each scene
        const paragraphs = scene.split(/\n+/).filter((p) => p.trim().length > 0);
        for (const paragraph of paragraphs) {
          const paraPresent = this.detectCharactersInText(paragraph, characters);
          for (let i = 0; i < paraPresent.length; i++) {
            for (let j = i + 1; j < paraPresent.length; j++) {
              const idx1 = characters.findIndex((c) => c.id === paraPresent[i].id);
              const idx2 = characters.findIndex((c) => c.id === paraPresent[j].id);
              if (idx1 !== -1 && idx2 !== -1) {
                coMatrix[idx1][idx2] += 1;
                coMatrix[idx2][idx1] += 1;
              }
            }
          }
        }
      }

      // --- 2. Dialogue Turns (直後発話) Aggregation ---
      const dialogueAttributions = this.extractDialogueLines(text, characters);
      for (let d = 0; d < dialogueAttributions.length - 1; d++) {
        const current = dialogueAttributions[d];
        const next = dialogueAttributions[d + 1];

        if (current.character && next.character && current.character.id !== next.character.id) {
          const idx1 = characters.findIndex((c) => c.id === current.character!.id);
          const idx2 = characters.findIndex((c) => c.id === next.character!.id);

          if (idx1 !== -1 && idx2 !== -1) {
            dialMatrix[idx1][idx2] += 1;
            dialMatrix[idx2][idx1] += 1;
          }
        }
      }
    }

    // --- 3. Compute Intimacy / Relationship Score Matrix ---
    const pairs: InteractionPair[] = [];

    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;

        const score = Number(
          (coMatrix[i][j] * opts.coOccurrenceWeight + dialMatrix[i][j] * opts.dialogueWeight).toFixed(2)
        );
        scoreMatrix[i][j] = score;

        // Collect pairs once per unique combination (i < j)
        if (i < j) {
          pairs.push({
            char1: characters[i],
            char2: characters[j],
            coOccurrenceCount: coMatrix[i][j],
            dialogueTurnCount: dialMatrix[i][j],
            relationshipScore: score,
          });
        }
      }
    }

    // --- 4. Extractions ---
    // Top relationship pairs (sorted by relationshipScore descending, filter > minScoreThreshold)
    const topPairs = [...pairs]
      .filter((p) => p.relationshipScore > opts.minScoreThreshold)
      .sort((a, b) => b.relationshipScore - a.relationshipScore);

    // Distant pairs (pairs with 0 interaction score)
    const distantPairs = pairs.filter((p) => p.relationshipScore === 0);

    // Isolated characters (characters with 0 total interaction score with all other characters)
    const isolatedCharacters = characters.filter((_, charIdx) => {
      const totalScore = scoreMatrix[charIdx].reduce((sum, val) => sum + val, 0);
      return totalScore === 0;
    });

    return {
      characters,
      matrix: scoreMatrix,
      coOccurrenceMatrix: coMatrix,
      dialogueMatrix: dialMatrix,
      pairs,
      topPairs,
      distantPairs,
      isolatedCharacters,
    };
  }

  /**
   * Helper API to extract top N pairs from summary.
   */
  public getTopPairs(summary: CharacterInteractionSummary, limit?: number): InteractionPair[] {
    return limit !== undefined ? summary.topPairs.slice(0, limit) : summary.topPairs;
  }

  /**
   * Helper API to extract distant pairs from summary.
   */
  public getDistantPairs(summary: CharacterInteractionSummary): InteractionPair[] {
    return summary.distantPairs;
  }

  /**
   * Helper API to extract isolated characters from summary.
   */
  public getIsolatedCharacters(summary: CharacterInteractionSummary): CharacterDefinition[] {
    return summary.isolatedCharacters;
  }
}
