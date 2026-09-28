/**
 * SlashMentionCommandParser - Slash (/) and Mention (@) command parsing & completion dispatcher
 *
 * Implements line-start / word-boundary trigger detection, candidate filtering based on active prefix query,
 * replacement range (from/to) calculation, and IME composition safety.
 */

export type CommandTriggerType = 'slash' | 'mention';

export interface SlashCommandDefinition {
  id: string;
  name: string;
  label: string;
  description: string;
  snippet?: string;
  category?: 'formatting' | 'structure' | 'utility' | string;
}

export interface LoreMentionCandidate {
  id: string;
  name: string;
  category: 'character' | 'item' | 'location' | 'faction' | 'term' | string;
  ruby?: string;
  description?: string;
}

export interface CommandParseContext {
  text: string;
  cursorOffset: number;
  isComposing?: boolean;
}

export interface CommandMatch {
  triggerType: CommandTriggerType;
  prefix: string;
  rawMatch: string;
  from: number;
  to: number;
}

export interface CandidateResult<T> {
  item: T;
  label: string;
  detail?: string;
  description?: string;
  replacementText: string;
}

export interface CompletionDispatchResult<T> {
  triggerType: CommandTriggerType;
  match: CommandMatch;
  candidates: CandidateResult<T>[];
  from: number;
  to: number;
}

export const DEFAULT_SLASH_COMMANDS: SlashCommandDefinition[] = [
  {
    id: 'ruby',
    name: 'ruby',
    label: '/ruby',
    description: '青空文庫形式のルビ指定（｜親文字《ルビ》）を入力',
    snippet: '｜${1:漢字}《${2:るび}》',
    category: 'formatting',
  },
  {
    id: 'bouten',
    name: 'bouten',
    label: '/bouten',
    description: '特定テキストへの傍点・強調表示指定',
    snippet: '《《${1:傍点}》》',
    category: 'formatting',
  },
  {
    id: 'chapter',
    name: 'chapter',
    label: '/chapter',
    description: '新章（大見出し）の見出しを挿入',
    snippet: '第${1:一}章 ${2:タイトル}\n',
    category: 'structure',
  },
  {
    id: 'heading',
    name: 'heading',
    label: '/heading',
    description: '節・中見出しを挿入',
    snippet: '■ ${1:見出し}\n',
    category: 'structure',
  },
];

export class SlashMentionCommandParser {
  private slashCommands: SlashCommandDefinition[];
  private loreDictionary: LoreMentionCandidate[];

  constructor(
    slashCommands: SlashCommandDefinition[] = DEFAULT_SLASH_COMMANDS,
    loreDictionary: LoreMentionCandidate[] = []
  ) {
    this.slashCommands = [...slashCommands];
    this.loreDictionary = [...loreDictionary];
  }

  public setSlashCommands(commands: SlashCommandDefinition[]): void {
    this.slashCommands = [...commands];
  }

  public setLoreDictionary(candidates: LoreMentionCandidate[]): void {
    this.loreDictionary = [...candidates];
  }

  public addLoreCandidate(candidate: LoreMentionCandidate): void {
    this.loreDictionary.push(candidate);
  }

  /**
   * Scans text leading up to cursorOffset for active '/' or '@' command trigger.
   * Returns null if IME is active or if no valid trigger is detected.
   */
  public parseCommandAtCursor(context: CommandParseContext): CommandMatch | null {
    if (context.isComposing) {
      return null;
    }

    const { text, cursorOffset } = context;
    if (cursorOffset < 1 || cursorOffset > text.length) {
      return null;
    }

    const textBeforeCursor = text.slice(0, cursorOffset);

    // Regex explanation for Slash (/):
    // Match '/' at line start, string start, or preceded by whitespace / Japanese whitespace (\s, \u3000)
    // Followed by valid command prefix characters (no whitespace, no punctuation that breaks commands)
    const slashRegex = /(?:^|[\s\u3000])(\/([\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\-]*))$/;
    const slashMatch = textBeforeCursor.match(slashRegex);

    if (slashMatch) {
      const rawMatch = slashMatch[1]; // e.g., "/rub"
      const prefix = slashMatch[2];   // e.g., "rub"
      const from = cursorOffset - rawMatch.length;
      const to = cursorOffset;

      return {
        triggerType: 'slash',
        prefix,
        rawMatch,
        from,
        to,
      };
    }

    // Regex explanation for Mention (@):
    // Match '@' at line start, string start, or preceded by whitespace / boundary
    const mentionRegex = /(?:^|[\s\u3000\n\r"'(「『（〔〈《【])(@([\w\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]*))$/;
    const mentionMatch = textBeforeCursor.match(mentionRegex);

    if (mentionMatch) {
      const rawMatch = mentionMatch[1]; // e.g., "@アリ"
      const prefix = mentionMatch[2];   // e.g., "アリ"
      const from = cursorOffset - rawMatch.length;
      const to = cursorOffset;

      return {
        triggerType: 'mention',
        prefix,
        rawMatch,
        from,
        to,
      };
    }

    return null;
  }

  /**
   * Dispatches and filters candidates based on command context at cursor.
   */
  public dispatch(
    context: CommandParseContext
  ): CompletionDispatchResult<SlashCommandDefinition | LoreMentionCandidate> | null {
    const match = this.parseCommandAtCursor(context);
    if (!match) return null;

    if (match.triggerType === 'slash') {
      return this.getSlashCompletions(context, match);
    } else {
      return this.getMentionCompletions(context, match);
    }
  }

  /**
   * Retrieves matching Slash commands for active query.
   */
  public getSlashCompletions(
    context: CommandParseContext,
    existingMatch?: CommandMatch
  ): CompletionDispatchResult<SlashCommandDefinition> | null {
    const match = existingMatch || this.parseCommandAtCursor(context);
    if (!match || match.triggerType !== 'slash') return null;

    const query = match.prefix.toLowerCase();

    const filtered = this.slashCommands.filter((cmd) => {
      if (!query) return true;
      return (
        cmd.name.toLowerCase().includes(query) ||
        cmd.label.toLowerCase().includes(query) ||
        cmd.description.toLowerCase().includes(query)
      );
    });

    const candidates: CandidateResult<SlashCommandDefinition>[] = filtered.map((cmd) => ({
      item: cmd,
      label: cmd.label,
      detail: cmd.category,
      description: cmd.description,
      replacementText: cmd.snippet || cmd.label,
    }));

    return {
      triggerType: 'slash',
      match,
      candidates,
      from: match.from,
      to: match.to,
    };
  }

  /**
   * Retrieves matching Lore Mentions for active query.
   */
  public getMentionCompletions(
    context: CommandParseContext,
    existingMatch?: CommandMatch
  ): CompletionDispatchResult<LoreMentionCandidate> | null {
    const match = existingMatch || this.parseCommandAtCursor(context);
    if (!match || match.triggerType !== 'mention') return null;

    const query = match.prefix.toLowerCase();

    const filtered = this.loreDictionary.filter((entry) => {
      if (!query) return true;
      return (
        entry.name.toLowerCase().includes(query) ||
        (entry.ruby && entry.ruby.toLowerCase().includes(query)) ||
        (entry.description && entry.description.toLowerCase().includes(query))
      );
    });

    const candidates: CandidateResult<LoreMentionCandidate>[] = filtered.map((entry) => {
      const replacementText = entry.ruby
        ? `｜${entry.name}《${entry.ruby}》`
        : entry.name;

      return {
        item: entry,
        label: entry.name,
        detail: entry.ruby ? `[${entry.ruby}] ${entry.category}` : entry.category,
        description: entry.description,
        replacementText,
      };
    });

    return {
      triggerType: 'mention',
      match,
      candidates,
      from: match.from,
      to: match.to,
    };
  }
}
