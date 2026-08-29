export default function handler(req: any, res: any) {
  res.status(200).json({
    status: 'ok',
    appName: 'NarKuntansi',
    version: '1.2.0',
    hasServerGeminiApiKey: Boolean(process.env.GEMINI_API_KEY),
  });
}
