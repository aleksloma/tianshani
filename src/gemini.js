// Google Gemini (@google/genai): მოდელის შემოწმება ListModels-ით, სტრიმინგი, usageMetadata.
import { GoogleGenAI } from '@google/genai';

let client = null;
let resolvedModel = null;
let resolving = null;

function getClient(cfg) {
  if (!client) client = new GoogleGenAI({ apiKey: cfg.gemini.api_key });
  return client;
}

/** ვერსიის რიცხვი მოდელის სახელიდან (gemini-2.5-flash → 2.5) დალაგებისთვის. */
function versionOf(name) {
  const m = name.match(/gemini-(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : 0;
}

/**
 * ამოწმებს, რომ settings.json → gemini.model არსებობს. თუ არა — ირჩევს უახლოეს Flash მოდელს.
 * შედეგი იქეშება; ლოგავს კონსოლში.
 */
export async function resolveModel(cfg, log = console) {
  if (resolvedModel) return resolvedModel;
  if (resolving) return resolving;
  const wanted = cfg.gemini.model;
  resolving = (async () => {
    try {
      const pager = await getClient(cfg).models.list({ config: { pageSize: 1000 } });
      const names = [];
      for await (const m of pager) {
        const actions = m.supportedActions || [];
        if (!actions.length || actions.includes('generateContent')) names.push(String(m.name).replace(/^models\//, ''));
      }
      if (names.includes(wanted)) {
        resolvedModel = wanted;
        log.info?.(`[gemini] მოდელი ${wanted} ნაპოვნია.`);
      } else {
        const flash = names
          .filter((n) => /flash/.test(n) && !/(lite|image|tts|live|audio|embed|thinking-exp|preview-tts)/.test(n))
          .sort((a, b) => versionOf(b) - versionOf(a) || a.length - b.length);
        resolvedModel = flash[0] || names.find((n) => /flash/.test(n)) || wanted;
        console.warn(`[gemini] მოდელი ${wanted} ვერ მოიძებნა, გამოიყენება ${resolvedModel}`);
      }
    } catch (e) {
      console.warn(`[gemini] ListModels ვერ შესრულდა (${e.message}); ვცდით ${wanted}-ს პირდაპირ.`);
      resolvedModel = wanted;
    } finally {
      resolving = null;
    }
    return resolvedModel;
  })();
  return resolving;
}

export function currentModel() { return resolvedModel; }

/** ჩვენი {role, content} → Gemini contents (user/model), ერთნაირი როლები ერთიანდება. */
export function toGeminiContents(messages) {
  const out = [];
  for (const m of messages) {
    const role = m.role === 'assistant' || m.role === 'model' ? 'model' : 'user';
    const last = out[out.length - 1];
    if (last && last.role === role) last.parts[0].text += `\n${m.content}`;
    else out.push({ role, parts: [{ text: m.content }] });
  }
  if (out.length && out[0].role !== 'user') out.unshift({ role: 'user', parts: [{ text: '…' }] });
  return out;
}

/**
 * სტრიმინგი: async generator → { delta } ... ბოლოს { usage: {input, output} }.
 * thinking_budget: 0 — მოკლე, სწრაფი პასუხებისთვის; თუ მოდელი არ იღებს — მეორედ ვცდით მის გარეშე.
 */
export async function* geminiStream({ cfg, systemInstruction, contents, signal }) {
  const model = await resolveModel(cfg);
  const baseConfig = {
    systemInstruction,
    temperature: cfg.gemini.temperature,
    maxOutputTokens: cfg.gemini.max_output_tokens,
    abortSignal: signal,
  };
  const tb = cfg.gemini.thinking_budget;
  const withThinking = tb === null || tb === undefined ? baseConfig : { ...baseConfig, thinkingConfig: { thinkingBudget: tb } };

  let stream;
  try {
    stream = await getClient(cfg).models.generateContentStream({ model, contents: toGeminiContents(contents), config: withThinking });
  } catch (e) {
    if (withThinking !== baseConfig && /thinking/i.test(String(e.message))) {
      stream = await getClient(cfg).models.generateContentStream({ model, contents: toGeminiContents(contents), config: baseConfig });
    } else throw e;
  }

  let usage = null;
  for await (const chunk of stream) {
    const text = chunk.text;
    if (text) yield { delta: text };
    if (chunk.usageMetadata) usage = chunk.usageMetadata;
  }
  yield {
    usage: {
      input: usage?.promptTokenCount ?? 0,
      // „ფიქრის“ ტოკენებიც გამომავალად ითვლება (ასე ითვლის ბილინგიც)
      output: (usage?.candidatesTokenCount ?? 0) + (usage?.thoughtsTokenCount ?? 0),
    },
  };
}
