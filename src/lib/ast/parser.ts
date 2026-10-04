import { ASTDocument, BlockNode, InlineNode, TextNode } from '../../mocks/schema.js';

function uuidv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

export class PlotailorParser {
    parseDocument(text: string): ASTDocument {
        const blocks = this.parseBlocks(text);
        return {
            type: 'document',
            blocks,
            version: '1.0'
        };
    }

    parseBlocks(text: string): BlockNode[] {
        // Normalize line endings
        const normalized = text.replace(/\r\n/g, '\n');
        // Split by blank lines for paragraphs
        const rawBlocks = normalized.split(/\n\s*\n/);

        const blocks: BlockNode[] = [];

        for (const raw of rawBlocks) {
            const trimmed = raw.trim();
            if (!trimmed) continue;

            if (trimmed === '***' || trimmed === '---') {
                blocks.push({
                    type: 'scene_break',
                    children: [],
                    id: uuidv4()
                });
                continue;
            }

            if (trimmed.startsWith('#')) {
                blocks.push({
                    type: 'heading',
                    children: this.parseInline(trimmed.replace(/^#+\s*/, '')),
                    id: uuidv4()
                });
                continue;
            }

            if (trimmed.startsWith('「') && trimmed.endsWith('」')) {
                 blocks.push({
                    type: 'dialogue',
                    children: this.parseInline(trimmed),
                    id: uuidv4()
                });
                continue;
            }

            blocks.push({
                type: 'paragraph',
                children: this.parseInline(trimmed),
                id: uuidv4()
            });
        }

        return blocks;
    }

    parseInline(text: string): (InlineNode | TextNode)[] {
        const nodes: (InlineNode | TextNode)[] = [];
        let cursor = 0;

        while (cursor < text.length) {
            // Fault-tolerant inline token recovery logic here
            // Example for Ruby: |BaseText《RubyText》
            let rubyMatch = this.findNextRuby(text, cursor);
            let emphasisMatch = this.findNextEmphasis(text, cursor);
            let linkMatch = this.findNextLink(text, cursor);

            // Find the earliest match
            let nextMatch = [rubyMatch, emphasisMatch, linkMatch]
                .filter(m => m !== null)
                .sort((a, b) => a!.index - b!.index)[0];

            if (nextMatch) {
                // Add preceding text
                if (nextMatch.index > cursor) {
                    nodes.push({
                        type: 'text',
                        content: text.slice(cursor, nextMatch.index)
                    });
                }

                // Add the matched inline node
                nodes.push(nextMatch.node);
                cursor = nextMatch.endIndex;
            } else {
                // No more matches, add remaining text
                nodes.push({
                    type: 'text',
                    content: text.slice(cursor)
                });
                break;
            }
        }

        return nodes;
    }

    private findNextRuby(text: string, startIndex: number) {
        // Basic match for |text《ruby》
        const regex = /\|([^《]+)《([^》]+)》/g;
        regex.lastIndex = startIndex;
        const match = regex.exec(text);
        if (match) {
            return {
                index: match.index,
                endIndex: match.index + match[0].length,
                node: {
                    type: 'ruby' as const,
                    content: match[1],
                    metadata: { rt: match[2] },
                    raw: match[0]
                }
            };
        }
        // Fault-tolerant logic for unclosed bracket
        const unclosedRegex = /\|([^《]+)《([^》]*)$/g;
        unclosedRegex.lastIndex = startIndex;
        const unclosedMatch = unclosedRegex.exec(text);
        if (unclosedMatch && !text.slice(unclosedMatch.index).includes('》')) {
            // Treat as text node fallback if no closing bracket
            return null; // Return null so it gets processed as text
        }

        return null;
    }

    private findNextEmphasis(text: string, startIndex: number) {
         // Basic match for *text* or _text_
        const regex = /([*_])(.*?)\1/g;
        regex.lastIndex = startIndex;
        const match = regex.exec(text);
        if (match) {
            return {
                index: match.index,
                endIndex: match.index + match[0].length,
                node: {
                    type: 'emphasis' as const,
                    content: match[2],
                    raw: match[0]
                }
            };
        }
        return null;
    }

    private findNextLink(text: string, startIndex: number) {
        // Basic match for [[Entity]]
        const regex = /\[\[([^\]]+)\]\]/g;
        regex.lastIndex = startIndex;
        const match = regex.exec(text);
        if (match) {
            return {
                index: match.index,
                endIndex: match.index + match[0].length,
                node: {
                    type: 'entity_link' as const,
                    content: match[1],
                    raw: match[0]
                }
            };
        }
        return null;
    }
}
