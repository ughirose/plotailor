export type PlotailorASTNode = BlockNode | InlineNode | TextNode;

export type BlockNodeType = 'paragraph' | 'dialogue' | 'heading' | 'scene_break';

export interface BlockNode {
  type: BlockNodeType;
  children: (InlineNode | TextNode)[];
  id?: string;
}

export type InlineNodeType = 'ruby' | 'emphasis' | 'entity_link' | 'error';

export interface InlineNode {
  type: InlineNodeType;
  content: string;
  metadata?: Record<string, unknown>;
  raw?: string; // for fallback/error recovery
  children?: (InlineNode | TextNode)[]; // Optional support for nesting if needed
}

export interface TextNode {
  type: 'text';
  content: string;
}

export interface ASTDocument {
  type: 'document';
  blocks: BlockNode[];
  version: string;
}
