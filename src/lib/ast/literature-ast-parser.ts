import {
  LiteratureASTSchema,
  type LiteratureAST,
  type DocumentNode,
  type ASTNode,
  type InlineNode,
  type HeadingNode,
  type ParagraphNode,
  type BlockquoteNode,
  type CalloutBlockNode,
  type LetterBlockNode,
  type TextNode,
  type RubyNode,
  type EmphasisNode,
  type ShoutNode,
  type EntityLinkNode,
  type BreakNode,
} from '../../types/literature-ast.js';

export class LiteratureASTParser {
  /**
   * Parse a Markdown/Literary text into a Literature AST document node.
   */
  static parse(markdown: string): DocumentNode {
    if (!markdown || markdown.trim().length === 0) {
      return {
        type: 'root',
        children: [],
      };
    }

    const lines = markdown.split(/\r?\n/);
    const rootChildren: ASTNode[] = [];

    let lineIdx = 0;
    while (lineIdx < lines.length) {
      const line = lines[lineIdx];

      // 1. Heading (# Title, ## Title, etc.)
      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        const level = headingMatch[1].length;
        const textContent = headingMatch[2];
        const children = this.parseInline(textContent);
        rootChildren.push({
          type: 'heading',
          level,
          children,
        });
        lineIdx++;
        continue;
      }

      // 2. Horizontal Rule / Scene Break (***, ---, ___)
      const trimmedLine = line.trim();
      if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmedLine)) {
        rootChildren.push({
          type: 'break',
        });
        lineIdx++;
        continue;
      }

      // 3. Blockquote / Callout / Letter Block (lines starting with >)
      if (line.trimStart().startsWith('>')) {
        const blockquoteLines: string[] = [];
        while (lineIdx < lines.length && lines[lineIdx].trimStart().startsWith('>')) {
          const rawLine = lines[lineIdx].trimStart();
          // Remove leading '>' and optional leading space
          const content = rawLine.startsWith('> ') ? rawLine.slice(2) : rawLine.slice(1);
          blockquoteLines.push(content);
          lineIdx++;
        }

        const firstLine = blockquoteLines[0] || '';

        // Check for Callout or Letter header: [!NOTE] Title or [!LETTER] Title
        const headerMatch = firstLine.match(/^\[!([A-Za-z0-9_-]+)\](?:\s+(.*))?$/);

        if (headerMatch) {
          const kind = headerMatch[1].toUpperCase();
          const title = headerMatch[2] ? headerMatch[2].trim() : undefined;
          const bodyLines = blockquoteLines.slice(1);
          const bodyText = bodyLines.join('\n');
          const childAST = this.parse(bodyText);

          if (kind === 'LETTER') {
            const letterNode: LetterBlockNode = {
              type: 'letter',
              title,
              children: childAST.children,
            };
            rootChildren.push(letterNode);
          } else {
            const calloutNode: CalloutBlockNode = {
              type: 'callout',
              kind,
              title,
              children: childAST.children,
            };
            rootChildren.push(calloutNode);
          }
        } else {
          // Standard blockquote
          const bodyText = blockquoteLines.join('\n');
          const childAST = this.parse(bodyText);
          const blockquoteNode: BlockquoteNode = {
            type: 'blockquote',
            children: childAST.children,
          };
          rootChildren.push(blockquoteNode);
        }
        continue;
      }

      // 3. Blank lines (skip or handle paragraphs)
      if (line.trim() === '') {
        lineIdx++;
        continue;
      }

      // 4. Paragraph
      const paragraphLines: string[] = [];
      while (
        lineIdx < lines.length &&
        lines[lineIdx].trim() !== '' &&
        !lines[lineIdx].trimStart().startsWith('>') &&
        !lines[lineIdx].match(/^#{1,6}\s+/)
      ) {
        paragraphLines.push(lines[lineIdx]);
        lineIdx++;
      }

      if (paragraphLines.length > 0) {
        const paragraphText = paragraphLines.join('\n');
        const children = this.parseInline(paragraphText);
        rootChildren.push({
          type: 'paragraph',
          children,
        });
      }
    }

    return {
      type: 'root',
      children: rootChildren,
    };
  }

  /**
   * Parse inline literary Markdown content into an array of InlineNode.
   */
  static parseInline(text: string): InlineNode[] {
    if (!text) return [];

    const nodes: InlineNode[] = [];
    let pos = 0;

    while (pos < text.length) {
      // 1. Bouten / Emphasis: 《《傍点》》
      if (text.startsWith('《《', pos)) {
        const closeIdx = text.indexOf('》》', pos + 2);
        if (closeIdx !== -1) {
          const content = text.slice(pos + 2, closeIdx);
          nodes.push({
            type: 'emphasis',
            text: content,
            style: 'bouten',
          });
          pos = closeIdx + 2;
          continue;
        }
      }

      // 2. Explicit Ruby: ｜親《るび》 or |親《るび》
      if (text[pos] === '｜' || text[pos] === '|') {
        const sub = text.slice(pos + 1);
        const rubyMatch = sub.match(/^([^《\r\n]+)《([^》\r\n]*)》/);
        if (rubyMatch) {
          nodes.push({
            type: 'ruby',
            parent: rubyMatch[1],
            ruby: rubyMatch[2],
            isExplicit: true,
          });
          pos += 1 + rubyMatch[0].length;
          continue;
        }
      }

      // 3. Implicit Kanji Ruby: 漢字《るび》
      const kanjiSub = text.slice(pos);
      const implicitRubyMatch = kanjiSub.match(/^([\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]+)《([^》\r\n]*)》/);
      if (implicitRubyMatch) {
        nodes.push({
          type: 'ruby',
          parent: implicitRubyMatch[1],
          ruby: implicitRubyMatch[2],
          isExplicit: false,
        });
        pos += implicitRubyMatch[0].length;
        continue;
      }

      // 4. Entity Link: [[Entity]] or [[Entity|Alias]]
      if (text.startsWith('[[', pos)) {
        const closeIdx = text.indexOf(']]', pos + 2);
        if (closeIdx !== -1) {
          const inner = text.slice(pos + 2, closeIdx);
          const pipeIdx = inner.indexOf('|');
          let target = inner;
          let alias: string | undefined = undefined;

          if (pipeIdx !== -1) {
            target = inner.slice(0, pipeIdx);
            alias = inner.slice(pipeIdx + 1);
          }

          nodes.push({
            type: 'entity_link',
            target,
            alias,
          });
          pos = closeIdx + 2;
          continue;
        }
      }

      // 5. Shout Node: 【叫び】 or ！叫び！ or ！！叫び！！ or !shout(text) or !叫び
      if (text[pos] === '【') {
        const closeIdx = text.indexOf('】', pos + 1);
        if (closeIdx !== -1) {
          const inner = text.slice(pos + 1, closeIdx);
          nodes.push({
            type: 'shout',
            text: inner,
          });
          pos = closeIdx + 1;
          continue;
        }
      }

      const shoutExclMatch = kanjiSub.match(/^(?:！|!){1,2}([^！!\r\n]+)(?:！|!){1,2}/);
      if (shoutExclMatch) {
        nodes.push({
          type: 'shout',
          text: shoutExclMatch[1],
        });
        pos += shoutExclMatch[0].length;
        continue;
      }

      // 6. Plain text until next token trigger
      let nextPos = pos + 1;
      while (nextPos < text.length) {
        const char = text[nextPos];
        if (
          char === '《' ||
          char === '｜' ||
          char === '|' ||
          char === '[' ||
          char === '【' ||
          char === '！' ||
          char === '!'
        ) {
          break;
        }
        // Also check implicit kanji + 《
        if (/[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/.test(char)) {
          const checkSub = text.slice(nextPos);
          if (/^[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]+《/.test(checkSub)) {
            break;
          }
        }
        nextPos++;
      }

      const textVal = text.slice(pos, nextPos);
      if (nodes.length > 0 && nodes[nodes.length - 1].type === 'text') {
        (nodes[nodes.length - 1] as TextNode).value += textVal;
      } else {
        nodes.push({
          type: 'text',
          value: textVal,
        });
      }

      pos = nextPos;
    }

    return nodes;
  }

  /**
   * Validate an AST object against the Zod schema.
   * Throws ZodError on invalid structure unless fallback logic is applied.
   */
  static validate(ast: unknown): LiteratureAST {
    return LiteratureASTSchema.parse(ast);
  }

  /**
   * Safely validate an AST object with fallback to an empty root node on failure.
   */
  static safeValidate(ast: unknown): { success: boolean; data: LiteratureAST } {
    const result = LiteratureASTSchema.safeParse(ast);
    if (result.success) {
      return { success: true, data: result.data };
    }
    return {
      success: false,
      data: {
        type: 'root',
        children: [],
      },
    };
  }

  /**
   * Parse Markdown and validate the output AST against Zod schema.
   */
  static parseAndValidate(markdown: string): LiteratureAST {
    const ast = this.parse(markdown);
    return this.validate(ast);
  }
}

export function parseLiteratureMarkdown(markdown: string): LiteratureAST {
  return LiteratureASTParser.parseAndValidate(markdown);
}

export function validateLiteratureAST(ast: unknown): LiteratureAST {
  return LiteratureASTParser.validate(ast);
}
