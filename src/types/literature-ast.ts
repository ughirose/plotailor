import { z } from 'zod';

export const NodePositionSchema = z.object({
  start: z.object({
    line: z.number(),
    column: z.number(),
    offset: z.number(),
  }),
  end: z.object({
    line: z.number(),
    column: z.number(),
    offset: z.number(),
  }),
});

export type NodePosition = z.infer<typeof NodePositionSchema>;

export const TextNodeSchema = z.object({
  type: z.literal('text'),
  value: z.string(),
  position: NodePositionSchema.optional(),
});

export type TextNode = z.infer<typeof TextNodeSchema>;

export const RubyNodeSchema = z.object({
  type: z.literal('ruby'),
  parent: z.string(),
  ruby: z.string(),
  isExplicit: z.boolean().optional(),
  position: NodePositionSchema.optional(),
});

export type RubyNode = z.infer<typeof RubyNodeSchema>;

export const EmphasisNodeSchema = z.object({
  type: z.literal('emphasis'),
  text: z.string(),
  style: z.enum(['bouten', 'bold', 'italic']).default('bouten').optional(),
  position: NodePositionSchema.optional(),
});

export type EmphasisNode = z.infer<typeof EmphasisNodeSchema>;

export const ShoutNodeSchema = z.object({
  type: z.literal('shout'),
  text: z.string(),
  level: z.number().optional(),
  position: NodePositionSchema.optional(),
});

export type ShoutNode = z.infer<typeof ShoutNodeSchema>;

export const EntityLinkNodeSchema = z.object({
  type: z.literal('entity_link'),
  target: z.string(),
  alias: z.string().optional(),
  position: NodePositionSchema.optional(),
});

export type EntityLinkNode = z.infer<typeof EntityLinkNodeSchema>;

export const BreakNodeSchema = z.object({
  type: z.literal('break'),
  position: NodePositionSchema.optional(),
});

export type BreakNode = z.infer<typeof BreakNodeSchema>;

export const InlineNodeSchema = z.discriminatedUnion('type', [
  TextNodeSchema,
  RubyNodeSchema,
  EmphasisNodeSchema,
  ShoutNodeSchema,
  EntityLinkNodeSchema,
  BreakNodeSchema,
]);

export type InlineNode = z.infer<typeof InlineNodeSchema>;

export type ASTNode =
  | InlineNode
  | HeadingNode
  | ParagraphNode
  | BlockquoteNode
  | CalloutBlockNode
  | LetterBlockNode
  | DocumentNode;

export const HeadingNodeSchema = z.object({
  type: z.literal('heading'),
  level: z.number().min(1).max(6),
  children: z.array(InlineNodeSchema),
  position: NodePositionSchema.optional(),
});

export type HeadingNode = {
  type: 'heading';
  level: number;
  children: InlineNode[];
  position?: NodePosition;
};

export const ParagraphNodeSchema = z.object({
  type: z.literal('paragraph'),
  children: z.array(InlineNodeSchema),
  position: NodePositionSchema.optional(),
});

export type ParagraphNode = {
  type: 'paragraph';
  children: InlineNode[];
  position?: NodePosition;
};

export const ASTNodeSchema: z.ZodType<ASTNode> = z.lazy(() =>
  z.union([
    TextNodeSchema,
    RubyNodeSchema,
    EmphasisNodeSchema,
    ShoutNodeSchema,
    EntityLinkNodeSchema,
    BreakNodeSchema,
    HeadingNodeSchema,
    ParagraphNodeSchema,
    BlockquoteNodeSchema,
    CalloutBlockNodeSchema,
    LetterBlockNodeSchema,
    DocumentNodeSchema,
  ])
);

export const BlockquoteNodeSchema = z.object({
  type: z.literal('blockquote'),
  children: z.array(ASTNodeSchema),
  position: NodePositionSchema.optional(),
});

export type BlockquoteNode = {
  type: 'blockquote';
  children: ASTNode[];
  position?: NodePosition;
};

export const CalloutBlockNodeSchema = z.object({
  type: z.literal('callout'),
  kind: z.string(),
  title: z.string().optional(),
  children: z.array(ASTNodeSchema),
  position: NodePositionSchema.optional(),
});

export type CalloutBlockNode = {
  type: 'callout';
  kind: string;
  title?: string;
  children: ASTNode[];
  position?: NodePosition;
};

export const LetterBlockNodeSchema = z.object({
  type: z.literal('letter'),
  title: z.string().optional(),
  salutation: z.string().optional(),
  signoff: z.string().optional(),
  children: z.array(ASTNodeSchema),
  position: NodePositionSchema.optional(),
});

export type LetterBlockNode = {
  type: 'letter';
  title?: string;
  salutation?: string;
  signoff?: string;
  children: ASTNode[];
  position?: NodePosition;
};

export const DocumentNodeSchema = z.object({
  type: z.literal('root'),
  children: z.array(ASTNodeSchema),
  position: NodePositionSchema.optional(),
});

export type DocumentNode = {
  type: 'root';
  children: ASTNode[];
  position?: NodePosition;
};

export const LiteratureASTSchema = DocumentNodeSchema;
export type LiteratureAST = DocumentNode;
