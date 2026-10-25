// დიაგნოსტიკა (Round 3 §4/§7): რამდენ „ფიქრის“ ტოკენს ხარჯავს მოდელი რეალურ პრომპტზე სხვადასხვა thinkingConfig-ით.
// გამოყენება: node scripts/probe-thinking.mjs  (საჭიროა settings.json → gemini.api_key; გასაღები არ იბეჭდება)
import { loadConfig } from '../src/config.js';
import { byId } from '../src/characters.js';
import { buildPrompt } from '../src/prompt.js';
import { pacingState } from '../src/pacing.js';
import { toGeminiContents } from '../src/gemini.js';
import { proofreadInstruction, allowlistFor } from '../src/proofread.js';
import { GoogleGenAI } from '@google/genai';

const cfg = loadConfig();
if (cfg.gemini.mock) { console.log('გასაღები არ არის — გამოტოვებულია'); process.exit(0); }
const ai = new GoogleGenAI({ apiKey: cfg.gemini.api_key });
const model = cfg.gemini.model;
const speaker = byId.vaso;
const msgs = [{ role: 'user', content: 'როგორ ხართ, ბატონო ვასო? რას შვრებით დღეს?' }];
const gs = { day: 44, season: 'autumn', crackStage: 0, cycle: 1 };
const { systemInstruction, fewShot } = buildPrompt({ speaker, gameState: gs, cfg, stageMode: 'none', pacing: pacingState(msgs, speaker), userName: 'ნინო' });
const variants = [['budget 0', { thinkingBudget: 0 }], ['level LOW', { thinkingLevel: 'LOW' }], ['budget 128', { thinkingBudget: 128 }]];
const rows = [];
for (const [name, tc] of variants) {
  for (let i = 0; i < 2; i++) {
    const stream = await ai.models.generateContentStream({ model, contents: toGeminiContents([...fewShot, ...msgs]), config: { systemInstruction, temperature: cfg.gemini.temperature, maxOutputTokens: cfg.gemini.max_output_tokens, thinkingConfig: tc } });
    let u = null; let text = ''; let fin = null;
    for await (const ch of stream) { text += ch.text || ''; if (ch.usageMetadata) u = ch.usageMetadata; if (ch.candidates?.[0]?.finishReason) fin = ch.candidates[0].finishReason; }
    const pr = await ai.models.generateContent({ model, contents: [{ role: 'user', parts: [{ text }] }], config: { systemInstruction: proofreadInstruction(allowlistFor(speaker)), temperature: 0, maxOutputTokens: 400, thinkingConfig: tc } });
    const pu = pr.usageMetadata || {};
    rows.push({ variant: name, chat: { finish: fin, prompt: u?.promptTokenCount, cached: u?.cachedContentTokenCount || 0, out: u?.candidatesTokenCount, thoughts: u?.thoughtsTokenCount || 0, chars: text.length }, proofread: { finish: pr.candidates?.[0]?.finishReason, out: pu.candidatesTokenCount, thoughts: pu.thoughtsTokenCount || 0 } });
  }
}
console.log(JSON.stringify(rows, null, 1));
