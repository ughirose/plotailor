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
    const parsed = PlotailorPrhRuleSchema.safeParse(rawRule);
    if (parsed.success) {
      this.rules.set(parsed.data.id, parsed.data);
      return parsed.data;
    }

    // Defensive normalization fallback for literary extensions and non-UUID seeds
    const r = rawRule as any;
    const isUuid =
      typeof r?.id === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(r.id);
    const id = isUuid
      ? r.id
      : typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : '00000000-0000-4000-8000-' + Math.random().toString(16).substring(2, 14).padEnd(12, '0');
    const scope = ['dialogue', 'narration', 'ruby', 'all'].includes(r?.scope) ? r.scope : 'all';
    const action = ['ignore', 'replace', 'suggest'].includes(r?.action)
      ? r.action
      : r?.action === 'warn'
        ? 'suggest'
        : 'suggest';
    const syntaxType = ['vocative', 'referential', 'general'].includes(r?.syntaxType)
      ? r.syntaxType
      : 'general';

    const normalized: PlotailorPrhRule = {
      id,
      expected: String(r?.expected ?? ''),
      patterns:
        Array.isArray(r?.patterns) && r.patterns.length > 0
          ? r.patterns.map(String)
          : [String(r?.expected ?? '')],
      scope,
      action,
      syntaxType,
      characterId: r?.characterId ? String(r.characterId) : undefined,
      description: r?.description ? String(r.description) : undefined,
    };

    this.rules.set(normalized.id, normalized);
    return normalized;
  }

  private archivedRules: Map<string, PlotailorPrhRule> = new Map();

  /**
   * Remove rule by UUID. If archive=true, moves to trash (archivedRules) for Undo restoration.
   */
  public removeRule(ruleId: string, archive: boolean = true): boolean {
    const existing = this.rules.get(ruleId);
    if (!existing) return false;
    this.rules.delete(ruleId);
    if (archive) {
      this.archivedRules.set(ruleId, existing);
    }
    return true;
  }

  /**
   * Move rule directly to archive (trash).
   */
  public archiveRule(ruleId: string): PlotailorPrhRule | null {
    const rule = this.rules.get(ruleId);
    if (!rule) return null;
    this.rules.delete(ruleId);
    this.archivedRules.set(ruleId, rule);
    return rule;
  }

  /**
   * Restore archived rule back to active rules.
   */
  public restoreRule(ruleId: string): PlotailorPrhRule | null {
    const rule = this.archivedRules.get(ruleId);
    if (!rule) return null;
    this.archivedRules.delete(ruleId);
    this.rules.set(ruleId, rule);
    return rule;
  }

  /**
   * Get all archived (trashed) rules.
   */
  public getArchivedRules(): PlotailorPrhRule[] {
    return Array.from(this.archivedRules.values());
  }

  /**
   * Permanently delete an archived rule from trash.
   */
  public purgeArchivedRule(ruleId: string): boolean {
    return this.archivedRules.delete(ruleId);
  }

  /**
   * Empty trash.
   */
  public clearArchived(): void {
    this.archivedRules.clear();
  }

  public getRules(): PlotailorPrhRule[] {
    return Array.from(this.rules.values());
  }

  public getRule(ruleId: string): PlotailorPrhRule | undefined {
    return this.rules.get(ruleId);
  }

  public clear(): void {
    this.rules.clear();
    this.archivedRules.clear();
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
