export interface ParsedChapter {
  foreword: string;
  afterword: string;
  content: string;
}

export class ChapterParser {
  private static readonly FOREWORD_RE = /\[前書き\]([\s\S]*?)\[前書き終わり\]/g;
  private static readonly AFTERWORD_RE = /\[後書き\]([\s\S]*?)\[後書き終わり\]/g;
  private static readonly COMMENT_LINE_RE = /\/\/(.*)$/gm;
  private static readonly COMMENT_BLOCK_RE = /%%([\s\S]*?)%%/g;

  /**
   * Parses the raw content, extracting foreword and afterword,
   * and completely removes inline and block comments.
   */
  public static parse(rawContent: string): ParsedChapter {
    let foreword = '';
    let afterword = '';
    let content = rawContent || '';

    // Extract forewords
    content = content.replace(this.FOREWORD_RE, (match, inner) => {
      foreword += inner.trim() + '\n';
      return '';
    });

    // Extract afterwords
    content = content.replace(this.AFTERWORD_RE, (match, inner) => {
      afterword += inner.trim() + '\n';
      return '';
    });

    // Remove comments completely
    content = content.replace(this.COMMENT_LINE_RE, '');
    content = content.replace(this.COMMENT_BLOCK_RE, '');

    return {
      foreword: foreword.trim(),
      afterword: afterword.trim(),
      content: content.trim()
    };
  }
}
