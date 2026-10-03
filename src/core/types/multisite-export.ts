/**
 * Multi-Site Novel Export Platform Types and Formatting Options
 * 
 * Target Platforms:
 * - 'kakuyomu': Kakuyomu notation (｜親文字《るび》, 《《傍点》》)
 * - 'narou': Shousetsuka ni Narou notation (親文字(るび) / ｜親文字(るび))
 * - 'denshokyo_epub': Electronic Book Publishers Association of Japan EPUB3 XHTML format
 */

export type ExportTargetPlatform = 'kakuyomu' | 'narou' | 'denshokyo_epub';

export interface MultiSiteExportOptions {
  platform: ExportTargetPlatform;
  title?: string;
  author?: string;
  chapterTitle?: string;
  preserveRubyParentheses?: boolean; // For Narou: use fullwidth or halfwidth parens
  convertBoutenToNarouDots?: boolean; // For Narou: whether to convert bouten to dots
  epubHeadingLevel?: 1 | 2 | 3; // For EPUB XHTML: default <h2>
  includeXhtmlBoilerplate?: boolean; // Whether to wrap with full <?xml...> or inner body content
}

export interface MultiSiteExportResult {
  platform: ExportTargetPlatform;
  formattedContent: string;
  stats: {
    rubyCount: number;
    boutenCount: number;
    characterCount: number;
    paragraphCount: number;
  };
  metadata: {
    title?: string;
    author?: string;
    generatedAt: string;
  };
}
