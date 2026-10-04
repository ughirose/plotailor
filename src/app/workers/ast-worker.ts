import { PlotailorParser } from '../../lib/ast/parser.js';
import { ASTDocument, BlockNode } from '../../mocks/schema.js';

const parser = new PlotailorParser();
let previousDocument: ASTDocument | null = null;

// Debounce timer
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 300;

self.onmessage = (event: MessageEvent) => {
    const { type, payload } = event.data;

    if (type === 'parse') {
        const { text, version } = payload;

        if (debounceTimer) {
            clearTimeout(debounceTimer);
        }

        debounceTimer = setTimeout(() => {
            try {
                const doc = parser.parseDocument(text);
                doc.version = version;

                // Calculate block diff
                const diff = calculateDiff(previousDocument, doc);
                previousDocument = doc;

                self.postMessage({
                    type: 'parseComplete',
                    payload: {
                        document: doc,
                        diff
                    }
                });
            } catch (error) {
                console.error("AST Parse Error in Worker", error);
                self.postMessage({
                    type: 'parseError',
                    payload: error
                });
            }
        }, DEBOUNCE_MS);
    }
};

function calculateDiff(prev: ASTDocument | null, current: ASTDocument) {
    if (!prev) return { added: current.blocks, removed: [], updated: [] };

    // Simple block diffing based on text content since IDs might change on re-parse
    // For a real diff, we'd want stable IDs or better matching
    // This is a naive implementation for the worker
    const added: BlockNode[] = [];
    const removed: BlockNode[] = [];
    const updated: BlockNode[] = [];

    // Convert to maps of stringified content for quick comparison
    const prevMap = new Map<string, BlockNode>();
    prev.blocks.forEach((b: BlockNode) => prevMap.set(JSON.stringify(b.children), b));

    const currMap = new Map<string, BlockNode>();
    current.blocks.forEach((b: BlockNode) => currMap.set(JSON.stringify(b.children), b));

    current.blocks.forEach((b: BlockNode) => {
        const key = JSON.stringify(b.children);
        if (!prevMap.has(key)) {
            added.push(b);
        }
    });

    prev.blocks.forEach((b: BlockNode) => {
        const key = JSON.stringify(b.children);
        if (!currMap.has(key)) {
            removed.push(b);
        }
    });

    return { added, removed, updated };
}
