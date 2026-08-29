import { GoogleGenAI } from '@google/genai';

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
    return res.status(405).json({ valid: false, message: 'Method not allowed' });
  }

  try {
    const { apiKey, model } = req.body || {};
    const ai = getGeminiClient(apiKey);
    if (!ai) {
      return res.status(400).json({ valid: false, message: 'Kunci API tidak ditemukan atau kosong.' });
    }

    const modelName = model || 'gemini-3.7-flash';
    const response = await ai.models.generateContent({
      model: modelName,
      contents: "Test koneksi. Jawab singkat satu kata: 'TERHUBUNG'.",
    });

    return res.status(200).json({
      valid: true,
      message: 'Kunci API Google Gemini valid & siap digunakan.',
      modelUsed: modelName,
      response: response.text?.trim() || 'OK',
    });
  } catch (err: any) {
    return res.status(400).json({
      valid: false,
      message: err?.message || 'Gagal memverifikasi Kunci API Gemini.',
    });
  }
}
