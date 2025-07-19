import { estimateUSD } from './costEstimator.js';
import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';

export interface ChatArgs {
  model: string;
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  responseMimeType?: string;
}

export interface ChatResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
}

const RESTRICTED_MODELS = ['o3', 'o4', 'gpt-4.1', 'gpt-4.5'];
let unlocked = false;
export function unlockTopModel(pwd: string) {
  const today = new Date();
  const dd = String(today.getDate()).padStart(2, '0');
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const yy = String(today.getFullYear()).slice(2);
  const correct = dd + mm + yy;
  if (pwd !== correct) {
    throw new Error('401');
  }
  unlocked = true;
}

export async function generateChat(args: ChatArgs): Promise<ChatResponse> {
  const provider = (globalThis as any).__llmProvider || process.env.LLM_PROVIDER || 'openai';
  const model = args.model;
  if (RESTRICTED_MODELS.includes(model) && !unlocked) {
    throw new Error('401');
  }
  switch (provider) {
    case 'groq':
      return groqClient(args);
    case 'gemini':
      return geminiClient(args);
    case 'openai':
    default:
      return openaiClient(args);
  }
}

let openAIOverride: any = null;
export function __setOpenAIOverride(o: any) { openAIOverride = o; }

async function openaiClient(args: ChatArgs): Promise<ChatResponse> {
  const openai =
    openAIOverride ||
    new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      dangerouslyAllowBrowser: true,
    });
  const messages = [] as { role: 'system' | 'user'; content: string }[];
  if (args.systemPrompt) messages.push({ role: 'system', content: args.systemPrompt });
  messages.push({ role: 'user', content: args.prompt });
  const res = await openai.chat.completions.create({
    model: args.model,
    messages,
    temperature: args.temperature,
    response_format: args.responseMimeType === 'application/json' ? { type: 'json_object' } : undefined
  });
  const content = res.choices[0]?.message?.content || '';
  const inTok = res.usage?.prompt_tokens ?? 0;
  const outTok = res.usage?.completion_tokens ?? 0;
  return {
    content,
    inputTokens: inTok,
    outputTokens: outTok,
    costUSD: estimateUSD(args.model, inTok, outTok)
  };
}

async function groqClient(args: ChatArgs): Promise<ChatResponse> {
  const messages = [] as { role: string; content: string }[];
  if (args.systemPrompt) messages.push({ role: 'system', content: args.systemPrompt });
  messages.push({ role: 'user', content: args.prompt });
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.GROQ_API_KEY}`
    },
    body: JSON.stringify({ model: args.model, messages, temperature: args.temperature })
  });
  const data = await resp.json();
  const content = data.choices?.[0]?.message?.content || '';
  const inTok = data.usage?.prompt_tokens ?? 0;
  const outTok = data.usage?.completion_tokens ?? 0;
  return { content, inputTokens: inTok, outputTokens: outTok, costUSD: estimateUSD(args.model, inTok, outTok) };
}

async function geminiClient(args: ChatArgs): Promise<ChatResponse> {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model: args.model,
    contents: args.prompt,
    config: {
      systemInstruction: args.systemPrompt,
      temperature: args.temperature,
      responseMimeType: args.responseMimeType
    }
  });
  return { content: response.text, inputTokens: 0, outputTokens: 0, costUSD: 0 };
}
