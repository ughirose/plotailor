export type PASCase = string;

export const JAPANESE_PAS_CASES: PASCase[] = [
  'ガ', 'ガ２', 'ヲ', 'ニ', 'ト', 'デ', 'カラ', 'ヨリ', 'ヘ', 'マデ'
];

export class BiaffinePASHead {
  constructor(_options?: any) {}
  analyze(_text: string): any {
    return {};
  }
}
