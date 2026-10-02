export type EmphasisStyle = 'dot' | 'sesame' | 'circle' | 'double-circle' | 'triangle' | 'none';

export interface VerticalGlyphMetrics {
  glyph: string;
  x: number;
  y: number;
  isTcy?: boolean;
  rubyText?: string;
  emphasisStyle?: EmphasisStyle;
}
