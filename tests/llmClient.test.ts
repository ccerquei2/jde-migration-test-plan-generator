import assert from 'assert';
import { estimateUSD } from '../lib/costEstimator.js';
import { generateChat, unlockTopModel, __setOpenAIOverride } from '../lib/llmClient.js';

(async () => {
  // test cost estimator
  const cost = estimateUSD('gpt-4o-mini', 1000, 2000);
  assert.strictEqual(cost, 0.015 * 1000 + 0.06 * 2000);

  // mock openai
  const originalEnv = process.env.LLM_PROVIDER;
  process.env.LLM_PROVIDER = 'openai';
  __setOpenAIOverride(new (class {
    chat = { completions: { create: async () => ({ choices: [{ message: { content: 'hi' } }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) } };
    constructor() {}
  })());
  const res = await generateChat({ model: 'gpt-4o-mini', prompt: 'hello' });
  assert.strictEqual(res.inputTokens, 10);
  assert.strictEqual(res.outputTokens, 5);
  assert.ok(res.costUSD > 0);

  // restricted model
  let errorCaught = false;
  try {
    await generateChat({ model: 'o3', prompt: 'hello' });
  } catch (e) {
    errorCaught = true;
  }
  assert.ok(errorCaught, 'restricted model should throw');

  const today = new Date();
  const pwd = `${String(today.getDate()).padStart(2,'0')}${String(today.getMonth()+1).padStart(2,'0')}${String(today.getFullYear()).slice(2)}`;
  unlockTopModel(pwd);
  await generateChat({ model: 'o3', prompt: 'ok' });
  __setOpenAIOverride(null);
  process.env.LLM_PROVIDER = originalEnv;
  console.log('All tests passed');
})().catch(err => { console.error(err); process.exit(1); });
