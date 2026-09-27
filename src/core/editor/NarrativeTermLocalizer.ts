/**
 * NarrativeTermLocalizer - General Japanese Terminology & UI String Translator
 *
 * Translates literary theory terms (Sjuzhet/Fabula), technical acronyms (VFS/PoP/DAG),
 * and UI string keys bidirectionally for Plotailor IDE.
 */

export interface TermEntry {
  term: string;
  translated: string;
  category: 'literary' | 'technical' | 'ui';
  description?: string;
}

export interface UIStringMapping {
  key: string;
  label: string;
}

/**
 * Standard literary theory term mappings for writers.
 */
export const LITERARY_TERM_MAP: Record<string, string> = {
  Sjuzhet: '語り順',
  sjuzhet: '語り順',
  Syuzhet: '語り順',
  syuzhet: '語り順',
  Fabula: '作中時系列',
  fabula: '作中時系列',
};

/**
 * Standard technical term mappings for writers.
 */
export const TECHNICAL_TERM_MAP: Record<string, string> = {
  VFS: '作品ファイル管理',
  vfs: '作品ファイル管理',
  PoP: '執筆プロセス証明',
  pop: '執筆プロセス証明',
  DAG: '因果相関図',
  dag: '因果相関図',
};

/**
 * Default UI key to Japanese display label mappings.
 */
export const DEFAULT_UI_KEY_MAP: Record<string, string> = {
  'workspace.explorer': '作品ファイル',
  'workspace.editor': '執筆エディタ',
  'workspace.inspector': '設定インスペクタ',
  'editor.timeline': '作中時系列',
  'editor.narrative_order': '語り順',
  'editor.proof_of_process': '執筆プロセス証明',
  'editor.causal_graph': '因果相関図',
  'file.vfs_root': '作品ファイル管理ルート',
  'action.save': '保存',
  'action.export': '書き出し',
  'action.proof_sync': '執筆プロセス同期',
};

export class NarrativeTermLocalizer {
  private literaryTerms: Map<string, string>;
  private technicalTerms: Map<string, string>;
  private uiKeyToLabelMap: Map<string, string>;
  private uiLabelToKeyMap: Map<string, string>;

  constructor(customUIMappings?: Record<string, string>) {
    this.literaryTerms = new Map(Object.entries(LITERARY_TERM_MAP));
    this.technicalTerms = new Map(Object.entries(TECHNICAL_TERM_MAP));
    this.uiKeyToLabelMap = new Map(Object.entries(DEFAULT_UI_KEY_MAP));
    this.uiLabelToKeyMap = new Map();

    // Populate initial UI reverse map
    for (const [key, label] of this.uiKeyToLabelMap.entries()) {
      this.uiLabelToKeyMap.set(label, key);
    }

    // Register custom UI mappings if provided
    if (customUIMappings) {
      for (const [key, label] of Object.entries(customUIMappings)) {
        this.registerUIMapping(key, label);
      }
    }
  }

  /**
   * Translates a literary theory term (e.g. Sjuzhet -> 語り順, Fabula -> 作中時系列).
   * Returns original term if no translation found.
   */
  public translateLiteraryTerm(term: string): string {
    return this.literaryTerms.get(term) ?? term;
  }

  /**
   * Translates a technical term (e.g. VFS -> 作品ファイル管理, PoP -> 執筆プロセス証明, DAG -> 因果相関図).
   * Returns original term if no translation found.
   */
  public translateTechnicalTerm(term: string): string {
    return this.technicalTerms.get(term) ?? term;
  }

  /**
   * Translates any recognized term (literary or technical) or UI key to friendly Japanese.
   * Order of precedence: UI key -> Literary term -> Technical term -> original text.
   */
  public translateTerm(term: string): string {
    if (this.uiKeyToLabelMap.has(term)) {
      return this.uiKeyToLabelMap.get(term)!;
    }
    if (this.literaryTerms.has(term)) {
      return this.literaryTerms.get(term)!;
    }
    if (this.technicalTerms.has(term)) {
      return this.technicalTerms.get(term)!;
    }
    return term;
  }

  /**
   * Translates an internal UI key to display label (Forward translation).
   * Returns fallback or original key if mapping does not exist.
   */
  public getUILabel(key: string, fallback?: string): string {
    return this.uiKeyToLabelMap.get(key) ?? fallback ?? key;
  }

  /**
   * Reverse-translates a display label to internal UI key (Reverse translation).
   * Returns fallback or original label if mapping does not exist.
   */
  public getUIKey(label: string, fallback?: string): string {
    return this.uiLabelToKeyMap.get(label) ?? fallback ?? label;
  }

  /**
   * Dynamically registers or overwrites a UI key <-> display label mapping (Bidirectional).
   */
  public registerUIMapping(key: string, label: string): void {
    this.uiKeyToLabelMap.set(key, label);
    this.uiLabelToKeyMap.set(label, key);
  }

  /**
   * Translates arbitrary text by replacing all occurrences of known technical, literary terms,
   * and registered UI keys with their friendly Japanese labels.
   */
  public localizeText(text: string): string {
    let result = text;

    // Collect all replaceable terms sorted by length descending to prevent partial replacements
    const termsToReplace: Array<{ pattern: string; replacement: string }> = [];

    // UI Keys
    for (const [key, label] of this.uiKeyToLabelMap.entries()) {
      termsToReplace.push({ pattern: key, replacement: label });
    }

    // Literary terms
    for (const [term, translated] of this.literaryTerms.entries()) {
      termsToReplace.push({ pattern: term, replacement: translated });
    }

    // Technical terms
    for (const [term, translated] of this.technicalTerms.entries()) {
      termsToReplace.push({ pattern: term, replacement: translated });
    }

    // Sort by pattern length descending
    termsToReplace.sort((a, b) => b.pattern.length - a.pattern.length);

    for (const { pattern, replacement } of termsToReplace) {
      if (result.includes(pattern)) {
        result = result.split(pattern).join(replacement);
      }
    }

    return result;
  }

  /**
   * Reverse translates text containing display labels back to internal UI keys/terms where possible.
   */
  public reverseLocalizeText(text: string): string {
    let result = text;

    // UI Labels to keys
    const labelsToReplace: Array<{ label: string; key: string }> = [];

    for (const [label, key] of this.uiLabelToKeyMap.entries()) {
      labelsToReplace.push({ label, key });
    }

    labelsToReplace.sort((a, b) => b.label.length - a.label.length);

    for (const { label, key } of labelsToReplace) {
      if (result.includes(label)) {
        result = result.split(label).join(key);
      }
    }

    return result;
  }

  /**
   * Returns a complete list of all term mappings across all categories.
   */
  public getAllTermEntries(): TermEntry[] {
    const entries: TermEntry[] = [];

    for (const [term, translated] of this.literaryTerms.entries()) {
      entries.push({ term, translated, category: 'literary' });
    }

    for (const [term, translated] of this.technicalTerms.entries()) {
      entries.push({ term, translated, category: 'technical' });
    }

    for (const [key, label] of this.uiKeyToLabelMap.entries()) {
      entries.push({ term: key, translated: label, category: 'ui' });
    }

    return entries;
  }
}
