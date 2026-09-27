export class BiaffinePASHead {
  constructor(_config?: any) {}
}

export const JAPANESE_PAS_CASES = [
  'ガ', 'ガ２', 'ヲ', 'ニ', 'ト', 'デ', 'カラ', 'ヨリ', 'ヘ', 'マデ'
] as const;

export type PASCase = typeof JAPANESE_PAS_CASES[number];
