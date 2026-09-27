export class BiaffinePASHead {
  constructor(public options?: unknown) {}
}

export const JAPANESE_PAS_CASES = [
  'ガ', 'ガ２', 'ヲ', 'ニ', 'ト', 'デ', 'カラ', 'ヨリ', 'ヘ', 'マデ'
];

export type PASCase = string;
