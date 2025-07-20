export const MODELS_BY_PROVIDER = {
  openai: [
    'gpt-4o-mini',
    'gpt-4o',
    'gpt-4.1-mini',
    'gpt-4.1-nano',
    'gpt-3.5-turbo-0125',
    'o3',
    'o4',
    'gpt-4.1',
    'gpt-4.5'
  ],
  groq: ['groq/llama3-8b-8192'],
  gemini: ['gemini-2.5-flash']
} as const;

export const DEFAULT_MODELS: Record<string, string> = {
  openai: 'gpt-3.5-turbo-0125',
  groq: 'groq/llama3-8b-8192',
  gemini: 'gemini-2.5-flash'
};

export function getModel(provider: string): string {
  return DEFAULT_MODELS[provider] || DEFAULT_MODELS['openai'];
}
