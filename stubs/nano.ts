export class BiaffinePASHead {
  constructor(_options?: any) {}
  parse(_text: string): any {
    return [];
  }
}

export const JAPANESE_PAS_CASES = ['ガ', 'ヲ', 'ニ', 'ト', 'デ'];
export type PASCase = 'ガ' | 'ヲ' | 'ニ' | 'ト' | 'デ';
