import { GoogleGenAI } from '@google/genai';
import { buildAiChatSystemPrompt } from '../lib/aiPrompts';

function getGeminiClient(customKey?: string): GoogleGenAI | null {
  const key = customKey?.trim() || process.env.GEMINI_API_KEY;
  if (!key) return null;
  return new GoogleGenAI({
    apiKey: key,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { message, standard, coaList, apiKey, model } = req.body || {};

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Pertanyaan diperlukan.' });
    }

    const ai = getGeminiClient(apiKey);
    if (!ai) {
      return res.status(401).json({
        error: 'Kunci API Gemini belum diatur. Silakan masukkan Kunci API Gemini Anda di menu Pengaturan.',
      });
    }

    const systemPrompt = buildAiChatSystemPrompt(standard, coaList);
    const modelName = model || 'gemini-3.7-flash';

    const response = await ai.models.generateContent({
      model: modelName,
      contents: message,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.2,
      },
    });

    return res.status(200).json({
      answer: response.text || 'Tidak ada respon teks.',
      modelUsed: modelName,
    });
  } catch (error: any) {
    console.error('AI Chat error:', error);
    return res.status(500).json({
      error: error?.message || 'Terjadi kesalahan pada layanan AI Gemini.',
    });
  }
}
