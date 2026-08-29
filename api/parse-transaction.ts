import { GoogleGenAI } from '@google/genai';
import { buildParseTransactionSystemPrompt } from '../lib/aiPrompts';

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
    const { text, standard, coaList, apiKey, model } = req.body || {};

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Teks transaksi soal cerita diperlukan.' });
    }

    const ai = getGeminiClient(apiKey);
    if (!ai) {
      return res.status(503).json({
        error: 'Kunci API Gemini belum tersedia. Menggunakan parser cerdas lokal.',
        useFallback: true,
      });
    }

    const systemPrompt = buildParseTransactionSystemPrompt(standard, coaList);
    const modelName = model || 'gemini-3.7-flash';

    const response = await ai.models.generateContent({
      model: modelName,
      contents: `Analisis seluruh transaksi maupun data penyesuaian pada soal cerita berikut (baca sampai tuntas, termasuk bagian data penyesuaian di akhir soal jika ada) dan buatkan entri jurnalnya sesuai aturan klasifikasi kategori yang telah dijelaskan:\n\n${text}`,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    });

    const responseText = response.text || '{}';
    let parsedData: any;
    try {
      parsedData = JSON.parse(responseText);
    } catch {
      return res.status(500).json({
        error: 'Gagal memproses format JSON dari model AI',
        raw: responseText,
        useFallback: true,
      });
    }

    return res.status(200).json(parsedData);
  } catch (error: any) {
    console.error('Gemini parse transaction error:', error);
    return res.status(500).json({
      error: error?.message || 'Terjadi kesalahan saat memproses AI Parser',
      useFallback: true,
    });
  }
}
