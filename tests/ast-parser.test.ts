import { describe, it, expect } from 'vitest';
import { PlotailorParser } from '../src/lib/ast/parser.js';

describe('PlotailorParser', () => {
    it('should parse basic text into paragraphs', () => {
        const parser = new PlotailorParser();
        const doc = parser.parseDocument('Hello\n\nWorld');

        expect(doc.blocks.length).toBe(2);
        expect(doc.blocks[0].type).toBe('paragraph');
        expect(doc.blocks[0].children[0].content).toBe('Hello');
    });

    it('should parse dialogue', () => {
        const parser = new PlotailorParser();
        const doc = parser.parseDocument('「Hello」');

        expect(doc.blocks[0].type).toBe('dialogue');
        expect(doc.blocks[0].children[0].content).toBe('「Hello」');
    });

    it('should handle unclosed ruby tags gracefully', () => {
         const parser = new PlotailorParser();
         const doc = parser.parseDocument('|base《ruby');

         // Should not crash and should fall back to text node
         expect(doc.blocks[0].children[0].type).toBe('text');
         expect(doc.blocks[0].children[0].content).toBe('|base《ruby');
    });

    it('should parse ruby correctly', () => {
         const parser = new PlotailorParser();
         const doc = parser.parseDocument('|base《ruby》');

         expect(doc.blocks[0].children[0].type).toBe('ruby');
         expect((doc.blocks[0].children[0] as any).content).toBe('base');
         expect((doc.blocks[0].children[0] as any).metadata.rt).toBe('ruby');
    });
});
