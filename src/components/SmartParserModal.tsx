import React, { useState } from 'react';
import { X, Sparkles, Check, AlertTriangle, ArrowRight, BookOpen, RefreshCw, Key, ShieldCheck } from 'lucide-react';
import { Account, AccountingStandard } from '../types/accounting';
import { ParsedTransactionDraft, parseStoryProblemRuleBased } from '../utils/transactionParser';
import { parseTransactionsWithGeminiAI } from '../utils/geminiAiService';
import { useAccounting } from '../context/AccountingContext';
import { formatRupiah } from '../utils/formatters';

interface SmartParserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportBatch: (transactions: any[]) => void;
  accounts: Account[];
  standard: AccountingStandard;
}

const EXAMPLE_PROMPTS: Record<AccountingStandard, string[]> = {
  [AccountingStandard.PSAK]: [
    `1. Pada tanggal 1 Agustus 2026, pemilik menyetor modal tunai Rp 100.000.000 ke perusahaan.
2. Membayar sewa kantor untuk 1 tahun sebesar Rp 24.000.000 secara tunai.
3. Membeli perlengkapan kantor secara kredit seharga Rp 5.000.000 dari Toko Sejahtera.
4. Menyelesaikan jasa konsultasi kepada klien dan menerima pembayaran tunai Rp 18.000.000.
5. Membayar gaji karyawan staf operasional sebesar Rp 6.500.000.`,
  ],
  [AccountingStandard.SAK_EMKM]: [
    `1. Setoran modal awal usaha warung kopi sebesar Rp 30.000.000.
2. Membeli peralatan mesin espresso secara tunai Rp 12.000.000.
3. Membeli persediaan biji kopi dan susu Rp 3.500.000 tunai.
4. Penjualan kopi dan makanan ringan tunai selama pekan ini Rp 8.200.000.
5. Pemilik mengambil uang prive untuk kebutuhan keluarga sebesar Rp 1.000.000.`,
  ],
  [AccountingStandard.SAK_SYARIAH]: [
    `1. Pemilik menyetor modal disetor awal tunai sebesar Rp 150.000.000.
2. Membeli persediaan barang dagang untuk pesanan akad Murabahah seharga Rp 50.000.000 tunai.
3. Menyerahkan barang pesanan kepada nasabah dengan akad Murabahah Rp 65.000.000 secara tempo (Margin Rp 15.000.000).
4. Menerima dana zakat dari muzakki sebesar Rp 10.000.000 ke kas zakat.
5. Menyalurkan dana zakat kepada fakir miskin sebesar Rp 7.000.000.`,
  ],
  [AccountingStandard.SAK_EP]: [
    `1. Setor modal awal perusahaan entitas privat Rp 200.000.000.
2. Membeli mesin pabrik seharga Rp 45.000.000 tunai.
3. Membeli persediaan bahan baku secara kredit Rp 25.000.000.
4. Penjualan barang jadi Rp 40.000.000 (Tunai Rp 20jt dan Piutang Rp 20jt).
5. Membayar beban utilitas listrik dan air Rp 3.200.000.`,
  ],
  [AccountingStandard.SAP]: [
    `1. Menerima Pendapatan Pajak Daerah secara tunai sebesar Rp 40.000.000 (Catat jurnal finansial dan anggaran).
2. Membayar Belanja Gaji Pegawai ASN sebesar Rp 20.000.000 tunai.
3. Pengadaan Belanja Modal Komputer Kantor sebesar Rp 15.000.000 tunai.`,
  ],
};

export const SmartParserModal: React.FC<SmartParserModalProps> = ({
  isOpen,
  onClose,
  onImportBatch,
  accounts,
  standard,
}) => {
  const { settings } = useAccounting();
  const [textInput, setTextInput] = useState<string>('');
  const [drafts, setDrafts] = useState<ParsedTransactionDraft[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [isAiPowered, setIsAiPowered] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleUseExample = () => {
    const examples = EXAMPLE_PROMPTS[standard] || EXAMPLE_PROMPTS[AccountingStandard.PSAK];
    setTextInput(examples[0]);
  };

  const handleParse = async () => {
    if (!textInput.trim()) return;
    setIsLoading(true);
    setStatusMessage('Sedang menganalisis teks transaksi dengan AI...');

    try {
      // 1. Try Gemini AI with custom or server API key
      const aiResult = await parseTransactionsWithGeminiAI({
        text: textInput,
        standard,
        coaList: accounts,
        apiKey: settings.geminiApiKey,
        model: settings.aiModelPreference,
      });

      if (aiResult.drafts && aiResult.drafts.length > 0) {
        setDrafts(aiResult.drafts);
        setIsAiPowered(true);
        setStatusMessage(aiResult.message || `Berhasil dianalisis oleh Google Gemini AI (${aiResult.drafts.length} transaksi).`);
      } else {
        // 2. Fallback to offline rule-based parser
        const localDrafts = parseStoryProblemRuleBased(textInput, accounts, standard);
        setDrafts(localDrafts);
        setIsAiPowered(false);
        setStatusMessage(`Dianalisis menggunakan Parser Lokal (${localDrafts.length} transaksi).`);
      }
    } catch {
      const localDrafts = parseStoryProblemRuleBased(textInput, accounts, standard);
      setDrafts(localDrafts);
      setIsAiPowered(false);
      setStatusMessage(`Dianalisis menggunakan Parser Lokal (${localDrafts.length} transaksi).`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportAll = () => {
    const validDrafts = drafts.filter((d) => d.isBalanced);
    if (validDrafts.length === 0) return;

    onImportBatch(
      validDrafts.map((d) => ({
        date: d.date,
        refNumber: d.refNumber,
        description: d.description,
        category: d.category,
        entries: d.entries,
        notes: d.notes,
      }))
    );
    onClose();
    setDrafts([]);
    setTextInput('');
  };

  const hasApiKey = Boolean(settings.geminiApiKey?.trim());

  return (
    <div className="fixed inset-0 z-50 bg-[#1A1A1A]/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-[#FFFFFF] w-full max-w-4xl rounded-xl shadow-2xl border border-[#E6E0D6] overflow-hidden my-auto flex flex-col max-h-[94vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#1A1A1A] text-[#F9F8F6] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#2E2B27] rounded-lg border border-[#3E3A34]">
              <Sparkles className="w-5 h-5 text-[#86EFAC]" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-editorial-serif">Parser Transaksi Otomatis NarKuntansi</h3>
              <p className="text-xs text-[#D3CBC0] mt-0.5 font-editorial-sans">
                Konversi narasi soal cerita akuntansi Indonesia menjadi Jurnal Umum & Jurnal Penyesuaian (AJP) secara otomatis
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#D3CBC0] hover:text-[#FFFFFF] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 font-editorial-sans">
          {/* Input Section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-[#1A1A1A] uppercase tracking-wider">
                Tempelkan Teks Soal Cerita / Transaksi:
              </label>
              <button
                type="button"
                onClick={handleUseExample}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#1A1A1A] hover:underline"
              >
                <BookOpen className="w-3.5 h-3.5" /> Gunakan Contoh Soal ({standard})
              </button>
            </div>

            <textarea
              rows={5}
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Contoh:&#10;1. Pada 1 Agustus 2026, menyetor modal awal kas Rp 50.000.000.&#10;2. Membeli perlengkapan kantor tunai Rp 3.000.000.&#10;3. Membayar sewa gedung Rp 12.000.000."
              className="w-full px-3.5 py-2.5 text-xs sm:text-sm bg-[#F9F8F6] border border-[#D3CBC0] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#1A1A1A] font-editorial-mono text-[#1A1A1A]"
            />

            <div className="flex flex-wrap items-center justify-between gap-2 mt-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-[#5C5852]">
                  Standar Aktif: <strong className="text-[#1A1A1A]">{standard}</strong>
                </span>
                {hasApiKey ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#166534] bg-[#DCFCE7] px-2 py-0.5 rounded border border-[#BBF7D0]">
                    <ShieldCheck className="w-3 h-3" /> Gemini AI Aktif
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#5C5852] bg-[#EFECE5] px-2 py-0.5 rounded">
                    <Sparkles className="w-3 h-3 text-[#B45309]" /> Mode Cerdas Dual-Engine
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleParse}
                disabled={isLoading || !textInput.trim()}
                className={`inline-flex items-center gap-2 px-5 py-2 rounded-lg font-bold text-xs sm:text-sm text-[#F9F8F6] shadow-xs transition-all ${
                  isLoading || !textInput.trim()
                    ? 'bg-[#D3CBC0] text-[#8C877E] cursor-not-allowed'
                    : 'bg-[#1A1A1A] hover:bg-[#2F2C28]'
                }`}
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" /> Menganalisis...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4 text-[#86EFAC]" /> Analisis & Buat Jurnal
                  </>
                )}
              </button>
            </div>
          </div>

          {statusMessage && (
            <div className="p-3 rounded-lg bg-[#FAF9F6] border border-[#E6E0D6] text-xs text-[#1A1A1A] font-medium">
              {statusMessage}
            </div>
          )}

          {/* Parsed Drafts Preview */}
          {drafts.length > 0 && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between border-b border-[#E6E0D6] pb-2">
                <h4 className="text-sm font-bold text-[#1A1A1A] font-editorial-serif">
                  Hasil Terjemahan Jurnal ({drafts.length} Transaksi)
                </h4>
                <span className="text-xs text-[#5C5852]">
                  Periksa kebenaran akun dan angka sebelum diimpor — sistem akan mengarahkan otomatis ke Jurnal Umum atau Jurnal Penyesuaian sesuai kategori di atas
                </span>
              </div>

              <div className="space-y-3">
                {drafts.map((draft, idx) => (
                  <div
                    key={idx}
                    className={`p-4 rounded-xl border transition-all ${
                      draft.isBalanced
                        ? 'bg-[#FFFFFF] border-[#E6E0D6] shadow-xs'
                        : 'bg-[#FEF2F2] border-[#FECACA]'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2 pb-2 border-b border-[#E6E0D6]">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-bold text-xs bg-[#F4F1EA] px-2 py-0.5 rounded text-[#1A1A1A] font-editorial-mono">
                            {draft.refNumber}
                          </span>
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide ${
                              draft.category === 'penyesuaian'
                                ? 'bg-[#FEF3C7] text-[#92400E] border border-[#FDE68A]'
                                : 'bg-[#DBEAFE] text-[#1E40AF] border border-[#BFDBFE]'
                            }`}
                          >
                            {draft.category === 'penyesuaian' ? 'Jurnal Penyesuaian (AJP)' : 'Jurnal Umum'}
                          </span>
                          {draft.needsReview && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wide bg-[#FEE2E2] text-[#991B1B] border border-[#FECACA]">
                              Perlu Ditinjau
                            </span>
                          )}
                          <span className="text-xs text-[#8C877E] font-editorial-mono">{draft.date}</span>
                        </div>
                        <span className="text-sm font-semibold text-[#1A1A1A] font-editorial-serif">{draft.description}</span>
                      </div>
                      <div>
                        {draft.isBalanced ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#166534] bg-[#DCFCE7] px-2.5 py-0.5 rounded border border-[#BBF7D0]">
                            <Check className="w-3 h-3" /> Balance ({formatRupiah(draft.totalDebit)})
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#991B1B] bg-[#FEE2E2] px-2.5 py-0.5 rounded border border-[#FECACA]">
                            <AlertTriangle className="w-3 h-3" /> Selisih {formatRupiah(draft.difference)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1 font-editorial-mono text-xs">
                      {draft.entries.map((entry, eIdx) => {
                        const isCredit = entry.credit > 0 && entry.debit === 0;
                        return (
                          <div
                            key={eIdx}
                            className={`flex items-center justify-between py-1 px-2 rounded ${
                              eIdx % 2 === 0 ? 'bg-[#FAF9F6]' : 'bg-[#FFFFFF]'
                            }`}
                          >
                            <div className={`flex items-center gap-2 ${isCredit ? 'pl-6 text-[#5C5852] italic' : 'font-medium text-[#1A1A1A]'}`}>
                              <span className="text-[#8C877E] text-[11px]">({entry.accountCode})</span>
                              <span className="font-editorial-sans">{entry.accountName}</span>
                            </div>
                            <div className="flex items-center gap-6">
                              <span className={`w-28 text-right ${entry.debit > 0 ? 'font-bold text-[#1A1A1A]' : 'text-[#D3CBC0]'}`}>
                                {entry.debit > 0 ? formatRupiah(entry.debit) : '-'}
                              </span>
                              <span className={`w-28 text-right ${entry.credit > 0 ? 'font-bold text-[#1A1A1A]' : 'text-[#D3CBC0]'}`}>
                                {entry.credit > 0 ? formatRupiah(entry.credit) : '-'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {draft.notes && (
                      <p className="text-[11px] text-[#5C5852] mt-2 italic bg-[#F4F1EA] p-1.5 rounded">
                        ℹ {draft.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action footer */}
          <div className="flex items-center justify-between pt-4 border-t border-[#E6E0D6]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-[#5C5852] hover:bg-[#EFECE5] rounded-lg transition-colors"
            >
              Tutup
            </button>

            {drafts.length > 0 && (
              <button
                type="button"
                onClick={handleImportAll}
                className="inline-flex items-center gap-2 px-5 py-2 text-xs sm:text-sm font-bold text-[#F9F8F6] bg-[#1A1A1A] hover:bg-[#2F2C28] rounded-lg shadow-xs transition-all"
              >
                Impor {drafts.filter((d) => d.isBalanced).length} Transaksi ke Jurnal <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
