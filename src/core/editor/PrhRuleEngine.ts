import { PlotailorPrhRuleSchema, type PlotailorPrhRule } from '@worldcraft/schema';

export interface PrhMatchResult {
  ruleId: string;
  expected: string;
  matchedText: string;
  from: number;
  to: number;
  action: 'ignore' | 'replace' | 'suggest';
  description?: string;
  characterId?: string;
}

export interface DialogueSpan {
  from: number;
  to: number;
  isDialogue: boolean;
  speakerId?: string;
}

/**
 * Extended Proofreading Rule (PRH) Engine with Literary Scoping & Character Consistency.
 */
export class PrhRuleEngine {
  private rules: Map<string, PlotailorPrhRule> = new Map();

  constructor(initialRules: PlotailorPrhRule[] = []) {
    for (const rule of initialRules) {
      this.addRule(rule);
    }
  }

  /**
   * Add or update a PRH rule with schema validation.
   */
  public addRule(rawRule: unknown): PlotailorPrhRule {
    const validated = PlotailorPrhRuleSchema.parse(rawRule);
    this.rules.set(validated.id, validated);
    return validated;
  }

  /**
   * Remove rule by UUID.
   */
  public removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  public getRules(): PlotailorPrhRule[] {
    return Array.from(this.rules.values());
  }

  public getRule(ruleId: string): PlotailorPrhRule | undefined {
    return this.rules.get(ruleId);
  }

  public clear(): void {
    this.rules.clear();
  }

  /**
   * Segments text into dialogue spans (inside 「」) and narration spans (outside 「」).
   */
  public static extractDialogueSpans(text: string): DialogueSpan[] {
    const spans: DialogueSpan[] = [];
    const len = text.length;
    let inDialogue = false;
    let spanStart = 0;

    for (let i = 0; i < len; i++) {
      const char = text[i];
      if (char === '「' && !inDialogue) {
        if (i > spanStart) {
          spans.push({ from: spanStart, to: i, isDialogue: false });
        }
        spanStart = i;
        inDialogue = true;
      } else if (char === '」' && inDialogue) {
        spans.push({ from: spanStart, to: i + 1, isDialogue: true });
        spanStart = i + 1;
        inDialogue = false;
      }
    }

    if (spanStart < len) {
      spans.push({ from: spanStart, to: len, isDialogue: inDialogue });
    }

    return spans;
  }

  /**
   * Scans text for rule violations according to scope (dialogue / narration / ruby / all / character).
   */
  public scan(text: string, activeCharacterId?: string): PrhMatchResult[] {
    const results: PrhMatchResult[] = [];
    if (!text || this.rules.size === 0) return results;

    const dialogueSpans = PrhRuleEngine.extractDialogueSpans(text);

    for (const rule of this.rules.values()) {
      if (rule.action === 'ignore') continue;
      if (rule.characterId && activeCharacterId && rule.characterId !== activeCharacterId) {
        continue;
      }

      for (const pattern of rule.patterns) {
        if (!pattern) continue;

        let regex: RegExp;
        try {
          // If regex pattern begins with /, use RegExp, otherwise safe escaped literal
          if (pattern.startsWith('/') && pattern.endsWith('/')) {
            regex = new RegExp(pattern.slice(1, -1), 'g');
          } else {
            const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            regex = new RegExp(escaped, 'g');
          }
        } catch {
          const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          regex = new RegExp(escaped, 'g');
        }

        let match: RegExpExecArray | null;
        while ((match = regex.exec(text)) !== null) {
          const from = match.index;
          const to = from + match[0].length;
          const matchedText = match[0];

          // If match equals expected, it is already conforming
          if (matchedText === rule.expected) {
            continue;
          }

          // Check Scope
          if (rule.scope === 'dialogue') {
            const inDia = dialogueSpans.some(s => s.isDialogue && from >= s.from && to <= s.to);
            if (!inDia) continue;
          } else if (rule.scope === 'narration') {
            const inDia = dialogueSpans.some(s => s.isDialogue && from >= s.from && to <= s.to);
            if (inDia) continue;
          } else if (rule.scope === 'ruby') {
            // Check if inside |...《...》 or ｜...《...》
            const rubyRegex = /[|｜]([^《]+)《([^》]+)》/g;
            let insideRuby = false;
            let rMatch: RegExpExecArray | null;
            while ((rMatch = rubyRegex.exec(text)) !== null) {
              if (from >= rMatch.index && to <= rMatch.index + rMatch[0].length) {
                insideRuby = true;
                break;
              }
            }
            if (!insideRuby) continue;
          }

          results.push({
            ruleId: rule.id,
            expected: rule.expected,
            matchedText,
            from,
            to,
            action: rule.action,
            description: rule.description,
            characterId: rule.characterId,
          });
        }
      }
    }

    // Sort by position
    results.sort((a, b) => a.from - b.from);
    return results;
  }
}
