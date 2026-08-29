import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { buildAiChatSystemPrompt, buildParseTransactionSystemPrompt } from "./lib/aiPrompts";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Helper to get Gemini client either with custom key or env key
  function getGeminiClient(customKey?: string): GoogleGenAI | null {
    const key = customKey?.trim() || process.env.GEMINI_API_KEY;
    if (!key) return null;
    return new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }

  // Health API
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      appName: "NarKuntansi",
      version: "1.2.0",
      hasServerGeminiApiKey: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  // Test Gemini API Key
  app.post("/api/test-gemini-key", async (req, res) => {
    try {
      const { apiKey, model } = req.body;
      const ai = getGeminiClient(apiKey);
      if (!ai) {
        return res.status(400).json({ valid: false, message: "Kunci API tidak ditemukan atau kosong." });
      }

      const modelName = model || "gemini-3.7-flash";
      const response = await ai.models.generateContent({
        model: modelName,
        contents: "Test koneksi. Jawab singkat satu kata: 'TERHUBUNG'.",
      });

      return res.json({
        valid: true,
        message: "Kunci API Google Gemini valid & siap digunakan.",
        modelUsed: modelName,
        response: response.text?.trim() || "OK",
      });
    } catch (err: any) {
      return res.status(400).json({
        valid: false,
        message: err?.message || "Gagal memverifikasi Kunci API Gemini.",
      });
    }
  });

  // AI Accounting Consultant & Q&A API
  app.post("/api/ai-chat", async (req, res) => {
    try {
      const { message, standard, coaList, apiKey, model, history } = req.body;

      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Pertanyaan diperlukan." });
      }

      const ai = getGeminiClient(apiKey);
      if (!ai) {
        return res.status(401).json({
          error: "Kunci API Gemini belum diatur. Silakan masukkan Kunci API Gemini Anda di menu Pengaturan.",
        });
      }

      const systemPrompt = buildAiChatSystemPrompt(standard, coaList);

      const modelName = model || "gemini-3.7-flash";
      const response = await ai.models.generateContent({
        model: modelName,
        contents: message,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.2,
        },
      });

      return res.json({
        answer: response.text || "Tidak ada respon teks.",
        modelUsed: modelName,
      });
    } catch (error: any) {
      console.error("AI Chat error:", error);
      return res.status(500).json({
        error: error?.message || "Terjadi kesalahan pada layanan AI Gemini.",
      });
    }
  });

  // AI Transaction Parser API for Accounting Word Problems in Indonesian
  app.post("/api/parse-transaction", async (req, res) => {
    try {
      const { text, standard, coaList, apiKey, model } = req.body;

      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Teks transaksi soal cerita diperlukan." });
      }

      const ai = getGeminiClient(apiKey);
      if (!ai) {
        return res.status(503).json({
          error: "Kunci API Gemini belum tersedia. Menggunakan parser cerdas lokal.",
          useFallback: true,
        });
      }

      const systemPrompt = buildParseTransactionSystemPrompt(standard, coaList);

      const modelName = model || "gemini-3.7-flash";
      const response = await ai.models.generateContent({
        model: modelName,
        contents: `Analisis seluruh transaksi maupun data penyesuaian pada soal cerita berikut (baca sampai tuntas, termasuk bagian data penyesuaian di akhir soal jika ada) dan buatkan entri jurnalnya sesuai aturan klasifikasi kategori yang telah dijelaskan:\n\n${text}`,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          temperature: 0.1,
        },
      });

      const responseText = response.text || "{}";
      let parsedData;
      try {
        parsedData = JSON.parse(responseText);
      } catch {
        return res.status(500).json({
          error: "Gagal memproses format JSON dari model AI",
          raw: responseText,
          useFallback: true,
        });
      }

      return res.json(parsedData);
    } catch (error: any) {
      console.error("Gemini parse transaction error:", error);
      return res.status(500).json({
        error: error?.message || "Terjadi kesalahan saat memproses AI Parser",
        useFallback: true,
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`NarKuntansi Server running on http://localhost:${PORT}`);
  });
}

startServer();
