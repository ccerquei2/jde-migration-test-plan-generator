export const PRICE_TABLE = {
  "gpt-4o-mini":   {in: 0.015, out: 0.06},
  "gpt-4o":        {in: 0.03,  out: 0.06},
  "gpt-4.1-mini":  {in: 0.0004, out: 0.0016},
  "gpt-4.1-nano":  {in: 0.0002, out: 0.0008},
  "gpt-3.5-turbo-0125": {in: 0.0005, out: 0.0015},
  "llama3-8b-8192": {in: 0.00005, out: 0.00008}
} as const;

export function estimateUSD(modelId: string, inTok: number, outTok: number): number {
  const pricing = (PRICE_TABLE as Record<string, {in: number; out: number}>)[modelId];
  if (!pricing) return 0;
  const cost = inTok * pricing.in + outTok * pricing.out;
  return Math.round(cost * 10000) / 10000;
}
