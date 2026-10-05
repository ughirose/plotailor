/**
 * ReadingTimeEstimator - Reading Time & Multi-Format Publication Page Calculator Engine
 *
 * Provides manuscript analysis for Japanese literary editor (Plotailor):
 * - Establishes estimated reading time based on standard (500-600 chars/min), speed (1,000 chars/min),
 *   and read-aloud (300 chars/min) modes.
 * - Applies pacing adjustments based on dialogue ratio (dialogue is read faster) and blank line pauses.
 * - Calculates publication page and episode counts across multiple format standards
 *   (Bunko: ~600 chars/p, Shinsho: ~700 chars/p, Tankobon: ~800 chars/p, Web novel 1 episode: ~3000 chars).
 * - Handles Aozora Bunko markup cleaning and custom configuration parameters.
 */

export type ReadingMode = 'standard' | 'speed' | 'read_aloud';

export interface ReadingSpeedConfig {
  /** Base characters per minute for standard reading mode (default: 500) */
  standardCpm?: number;
  /** Base characters per minute for speed reading mode (default: 1000) */
  speedCpm?: number;
  /** Base characters per minute for reading aloud mode (default: 300) */
  readAloudCpm?: number;
  /** Dialogue speed multiplier boost factor (default: 1.2 = 20% faster for dialogue) */
  dialogueSpeedMultiplier?: number;
  /** Added pause penalty in seconds per blank/empty line (default: 0.5) */
  pauseSecondsPerEmptyLine?: number;
}

export interface FormatPageConfig {
  /** Characters per page for Bunko (文庫本) (default: 600) */
  bunkoCharsPerPage?: number;
  /** Characters per page for Shinsho (新書本) (default: 700) */
  shinshoCharsPerPage?: number;
  /** Characters per page for Tankobon (単行本) (default: 800) */
  tankobonCharsPerPage?: number;
  /** Characters per episode for Web novel (Web小説1話) (default: 3000) */
  webNovelCharsPerEpisode?: number;
}

export interface FormattedTime {
  hours: number;
  minutes: number;
  seconds: number;
  formattedText: string;
}

export interface PublicationEstimate {
  bunkoPages: number;
  shinshoPages: number;
  tankobonPages: number;
  webNovelEpisodes: number;
  exactBunkoPages: number;
  exactShinshoPages: number;
  exactTankobonPages: number;
  exactWebNovelEpisodes: number;
}

export interface ReadingTimeResult {
  rawCharacterCount: number;
  cleanedCharacterCount: number;
  dialogueCharacterCount: number;
  narrativeCharacterCount: number;
  dialogueRatio: number;
  emptyLineCount: number;
  mode: ReadingMode;
  baseCpm: number;
  effectiveCpm: number;
  rawReadingTimeSeconds: number;
  rawFormattedTime: FormattedTime;
  adjustedReadingTimeSeconds: number;
  adjustedFormattedTime: FormattedTime;
  publication: PublicationEstimate;
}

export class ReadingTimeEstimator {
  // Preset Speeds (CPM: Characters Per Minute)
  public static readonly DEFAULT_STANDARD_CPM = 500;
  public static readonly DEFAULT_SPEED_CPM = 1000;
  public static readonly DEFAULT_READ_ALOUD_CPM = 300;

  // Preset Page Standards (Characters per Page / Episode)
  public static readonly DEFAULT_BUNKO_CHARS_PER_PAGE = 600;
  public static readonly DEFAULT_SHINSHO_CHARS_PER_PAGE = 700;
  public static readonly DEFAULT_TANKOBON_CHARS_PER_PAGE = 800;
  public static readonly DEFAULT_WEB_NOVEL_CHARS_PER_EPISODE = 3000;

  // Pacing Correction Defaults
  public static readonly DEFAULT_DIALOGUE_SPEED_MULTIPLIER = 1.2;
  public static readonly DEFAULT_PAUSE_SECONDS_PER_EMPTY_LINE = 0.5;

  private speedConfig: Required<ReadingSpeedConfig>;
  private pageConfig: Required<FormatPageConfig>;

  constructor(speedConfig?: ReadingSpeedConfig, pageConfig?: FormatPageConfig) {
    this.speedConfig = {
      standardCpm: speedConfig?.standardCpm ?? ReadingTimeEstimator.DEFAULT_STANDARD_CPM,
      speedCpm: speedConfig?.speedCpm ?? ReadingTimeEstimator.DEFAULT_SPEED_CPM,
      readAloudCpm: speedConfig?.readAloudCpm ?? ReadingTimeEstimator.DEFAULT_READ_ALOUD_CPM,
      dialogueSpeedMultiplier: speedConfig?.dialogueSpeedMultiplier ?? ReadingTimeEstimator.DEFAULT_DIALOGUE_SPEED_MULTIPLIER,
      pauseSecondsPerEmptyLine: speedConfig?.pauseSecondsPerEmptyLine ?? ReadingTimeEstimator.DEFAULT_PAUSE_SECONDS_PER_EMPTY_LINE,
    };

    this.pageConfig = {
      bunkoCharsPerPage: pageConfig?.bunkoCharsPerPage ?? ReadingTimeEstimator.DEFAULT_BUNKO_CHARS_PER_PAGE,
      shinshoCharsPerPage: pageConfig?.shinshoCharsPerPage ?? ReadingTimeEstimator.DEFAULT_SHINSHO_CHARS_PER_PAGE,
      tankobonCharsPerPage: pageConfig?.tankobonCharsPerPage ?? ReadingTimeEstimator.DEFAULT_TANKOBON_CHARS_PER_PAGE,
      webNovelCharsPerEpisode: pageConfig?.webNovelCharsPerEpisode ?? ReadingTimeEstimator.DEFAULT_WEB_NOVEL_CHARS_PER_EPISODE,
    };
  }

  /**
   * Strips Aozora Bunko ruby annotations, bouten, and formatting commands from raw manuscript text.
   */
  public static stripAozoraMarkup(rawText: string): string {
    if (!rawText) return '';

    return rawText
      // 1. Explicit ruby: ｜親文字《るび》 -> 親文字
      .replace(/｜([^《\r\n]+)《[^》\r\n]+》/g, '$1')
      // 2. Implicit kanji ruby: 漢字《るび》 -> 漢字
      .replace(/([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]+)《[^》\r\n]+》/g, '$1')
      // 3. Bouten: 《《傍点》》 -> 傍点
      .replace(/《《([^》\r\n]+)》》/g, '$1')
      // 4. Aozora command markup: ［＃...］ -> remove
      .replace(/［＃[^］\r\n]+］/g, '')
      // 5. Ruby sagari: 〔...〕 -> ...
      .replace(/〔([^〕\r\n]+)〕/g, '$1');
  }

  /**
   * Formats a duration in seconds into structured hours, minutes, and seconds representation.
   */
  public static formatSeconds(totalSeconds: number): FormattedTime {
    const roundedSeconds = Math.round(Math.max(0, totalSeconds));
    const hours = Math.floor(roundedSeconds / 3600);
    const minutes = Math.floor((roundedSeconds % 3600) / 60);
    const seconds = roundedSeconds % 60;

    let formattedText = '';
    if (hours > 0) {
      formattedText += `${hours}時間`;
    }
    if (minutes > 0 || hours > 0) {
      formattedText += `${minutes}分`;
    }
    formattedText += `${seconds}秒`;

    return {
      hours,
      minutes,
      seconds,
      formattedText,
    };
  }

  /**
   * Estimates reading time and calculates multi-format page publication metrics for manuscript text.
   */
  public estimate(rawText: string, mode: ReadingMode = 'standard'): ReadingTimeResult {
    const rawCharacterCount = rawText ? rawText.length : 0;
    const cleanedText = ReadingTimeEstimator.stripAozoraMarkup(rawText ?? '');
    const cleanedCharacterCount = cleanedText.length;

    // Extract dialogue enclosed in 「」 and 『』
    let dialogueCharacterCount = 0;
    const dialogueRegex = /[「『](.*?)[」』]/g;
    let match: RegExpExecArray | null;
    while ((match = dialogueRegex.exec(cleanedText)) !== null) {
      dialogueCharacterCount += match[1].length;
    }

    const narrativeCharacterCount = Math.max(0, cleanedCharacterCount - dialogueCharacterCount);
    const dialogueRatio = cleanedCharacterCount > 0 ? dialogueCharacterCount / cleanedCharacterCount : 0;

    // Count blank / empty lines
    const lines = (rawText ?? '').split(/\r?\n/);
    const emptyLineCount = lines.filter((line) => line.trim().length === 0).length;

    // Base CPM calculation based on reading mode
    let baseCpm: number;
    switch (mode) {
      case 'speed':
        baseCpm = this.speedConfig.speedCpm;
        break;
      case 'read_aloud':
        baseCpm = this.speedConfig.readAloudCpm;
        break;
      case 'standard':
      default:
        baseCpm = this.speedConfig.standardCpm;
        break;
    }

    // Unadjusted reading time (seconds)
    const rawReadingTimeSeconds = baseCpm > 0 ? (cleanedCharacterCount / baseCpm) * 60 : 0;

    // Pacing Adjustment Factor:
    // Effective CPM = baseCpm * (1 + dialogueRatio * (dialogueSpeedMultiplier - 1))
    const dialogueMultiplier = this.speedConfig.dialogueSpeedMultiplier;
    const effectiveCpm = baseCpm * (1 + dialogueRatio * (dialogueMultiplier - 1));

    // Base reading time with dialogue speed adjustment
    const baseReadingSeconds = effectiveCpm > 0 ? (cleanedCharacterCount / effectiveCpm) * 60 : 0;

    // Pause penalty added for blank lines
    const linePauseSeconds = emptyLineCount * this.speedConfig.pauseSecondsPerEmptyLine;

    const adjustedReadingTimeSeconds = Math.max(0, baseReadingSeconds + linePauseSeconds);

    // Publication Format Estimates
    const publication = this.calculatePublicationEstimate(cleanedCharacterCount);

    return {
      rawCharacterCount,
      cleanedCharacterCount,
      dialogueCharacterCount,
      narrativeCharacterCount,
      dialogueRatio: Number(dialogueRatio.toFixed(3)),
      emptyLineCount,
      mode,
      baseCpm,
      effectiveCpm: Number(effectiveCpm.toFixed(1)),
      rawReadingTimeSeconds: Number(rawReadingTimeSeconds.toFixed(1)),
      rawFormattedTime: ReadingTimeEstimator.formatSeconds(rawReadingTimeSeconds),
      adjustedReadingTimeSeconds: Number(adjustedReadingTimeSeconds.toFixed(1)),
      adjustedFormattedTime: ReadingTimeEstimator.formatSeconds(adjustedReadingTimeSeconds),
      publication,
    };
  }

  /**
   * Calculates publication page and episode metrics across publication standards.
   */
  public calculatePublicationEstimate(characterCount: number): PublicationEstimate {
    const bunko = this.pageConfig.bunkoCharsPerPage;
    const shinsho = this.pageConfig.shinshoCharsPerPage;
    const tankobon = this.pageConfig.tankobonCharsPerPage;
    const webNovel = this.pageConfig.webNovelCharsPerEpisode;

    const exactBunkoPages = bunko > 0 ? characterCount / bunko : 0;
    const exactShinshoPages = shinsho > 0 ? characterCount / shinsho : 0;
    const exactTankobonPages = tankobon > 0 ? characterCount / tankobon : 0;
    const exactWebNovelEpisodes = webNovel > 0 ? characterCount / webNovel : 0;

    return {
      bunkoPages: Math.ceil(exactBunkoPages),
      shinshoPages: Math.ceil(exactShinshoPages),
      tankobonPages: Math.ceil(exactTankobonPages),
      webNovelEpisodes: Math.ceil(exactWebNovelEpisodes),
      exactBunkoPages: Number(exactBunkoPages.toFixed(1)),
      exactShinshoPages: Number(exactShinshoPages.toFixed(1)),
      exactTankobonPages: Number(exactTankobonPages.toFixed(1)),
      exactWebNovelEpisodes: Number(exactWebNovelEpisodes.toFixed(1)),
    };
  }
}
