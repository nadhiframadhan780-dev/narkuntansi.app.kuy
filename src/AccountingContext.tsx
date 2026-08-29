import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import {
  Account,
  AccountingStandard,
  AppState,
  EntitySettings,
  LedgerAccount,
  Transaction,
  TrialBalanceResult,
  WorksheetResult,
} from '../types/accounting';
import { getCoaByStandard } from '../data/coaStandards';
import { getSampleTransactions } from '../data/sampleData';
import { calculateLedgers, calculateTrialBalance, calculateWorksheet } from '../utils/accountingEngine';

const STORAGE_KEY = 'narkuntansi_state_v1';

const DEFAULT_SETTINGS: EntitySettings = {
  entityName: 'PT Nar Kuntansi Indonesia',
  entityType: 'Perseroan Terbatas (PT)',
  standard: AccountingStandard.PSAK,
  address: 'Jl. Jenderal Sudirman Kav. 52-53, Jakarta Selatan',
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  currency: 'IDR',
  initialCash: 150000000,
  preparedBy: 'Staf Akuntansi',
  approvedBy: 'Direktur Keuangan (CPA)',
};

interface AccountingContextType {
  standard: AccountingStandard;
  settings: EntitySettings;
  accounts: Account[];
  transactions: Transaction[];
  ledgers: Map<string, LedgerAccount>;
  trialBalance: TrialBalanceResult;
  worksheet: WorksheetResult;
  // Actions
  setStandard: (std: AccountingStandard, reloadSample?: boolean) => void;
  updateSettings: (partial: Partial<EntitySettings>) => void;
  addTransaction: (tx: Omit<Transaction, 'id'>) => string;
  updateTransaction: (id: string, tx: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  addMultipleTransactions: (txs: Omit<Transaction, 'id'>[]) => void;
  addAccount: (acc: Omit<Account, 'id'>) => void;
  updateAccount: (id: string, acc: Partial<Account>) => void;
  deleteAccount: (id: string) => void;
  resetCoaToDefault: () => void;
  loadSampleData: () => void;
  clearAllData: () => void;
  exportJsonBackup: () => void;
  importJsonBackup: (jsonStr: string) => { success: boolean; error?: string };
}

const AccountingContext = createContext<AccountingContextType | undefined>(undefined);

export const AccountingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [standard, setStandardState] = useState<AccountingStandard>(AccountingStandard.PSAK);
  const [settings, setSettingsState] = useState<EntitySettings>(DEFAULT_SETTINGS);
  const [accounts, setAccountsState] = useState<Account[]>(() => getCoaByStandard(AccountingStandard.PSAK));
  const [transactions, setTransactionsState] = useState<Transaction[]>(() => getSampleTransactions(AccountingStandard.PSAK));

  // 1. Initial Load from LocalStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: AppState = JSON.parse(saved);
        if (parsed.standard && parsed.accounts && parsed.transactions) {
          setStandardState(parsed.standard);
          setSettingsState(parsed.settings || DEFAULT_SETTINGS);
          setAccountsState(parsed.accounts);
          setTransactionsState(parsed.transactions);
        }
      }
    } catch (err) {
      console.warn('Failed to load state from localStorage:', err);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  // 2. Auto-save to LocalStorage & Dynamic Favicon update
  useEffect(() => {
    if (!isLoaded) return;

    // Update browser tab favicon dynamically if custom logo is set
    try {
      let favicon = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!favicon) {
        favicon = document.createElement('link');
        favicon.rel = 'icon';
        document.head.appendChild(favicon);
      }
      if (settings.customLogoUrl) {
        favicon.href = settings.customLogoUrl;
      } else {
        favicon.href = 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2220%22 fill=%22%231A1A1A%22/><text y=%2270%22 x=%2222%22 font-size=%2265%22 font-family=%22serif%22 fill=%22%23F9F8F6%22>N</text></svg>';
      }
    } catch {
      // ignore DOM manipulation error in non-browser env
    }

    const timeout = setTimeout(() => {
      const stateToSave: AppState = {
        version: '1.0.0',
        standard,
        settings,
        accounts,
        transactions,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
    }, 300);

    return () => clearTimeout(timeout);
  }, [isLoaded, standard, settings, accounts, transactions]);

  // Memoized Calculations
  const ledgers = useMemo(() => {
    return calculateLedgers(accounts, transactions, ['umum', 'penyesuaian']);
  }, [accounts, transactions]);

  const trialBalance = useMemo(() => {
    return calculateTrialBalance(accounts, transactions, ['umum', 'penyesuaian']);
  }, [accounts, transactions]);

  const worksheet = useMemo(() => {
    return calculateWorksheet(accounts, transactions);
  }, [accounts, transactions]);

  // Handler: Change Standard
  const setStandard = (newStandard: AccountingStandard, reloadSample = true) => {
    setStandardState(newStandard);
    setSettingsState((prev) => ({ ...prev, standard: newStandard }));
    const newCoa = getCoaByStandard(newStandard);
    setAccountsState(newCoa);
    if (reloadSample) {
      const newSample = getSampleTransactions(newStandard);
      setTransactionsState(newSample);
    }
  };

  const updateSettings = (partial: Partial<EntitySettings>) => {
    setSettingsState((prev) => ({ ...prev, ...partial }));
  };

  const addTransaction = (txData: Omit<Transaction, 'id'>): string => {
    const id = `tx-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
    const newTx: Transaction = {
      ...txData,
      id,
      createdAt: new Date().toISOString(),
    };
    setTransactionsState((prev) => [newTx, ...prev]);
    return id;
  };

  const updateTransaction = (id: string, txData: Partial<Transaction>) => {
    setTransactionsState((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...txData } : t))
    );
  };

  const deleteTransaction = (id: string) => {
    setTransactionsState((prev) => prev.filter((t) => t.id !== id));
  };

  const addMultipleTransactions = (txs: Omit<Transaction, 'id'>[]) => {
    const newItems: Transaction[] = txs.map((txData, i) => ({
      ...txData,
      id: `tx-${Date.now()}-${i}-${Math.random().toString(36).substr(2, 5)}`,
      createdAt: new Date().toISOString(),
    }));
    setTransactionsState((prev) => [...newItems, ...prev]);
  };

  const addAccount = (accData: Omit<Account, 'id'>) => {
    const id = `acc-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const newAcc: Account = { ...accData, id, isCustom: true };
    setAccountsState((prev) => [...prev, newAcc]);
  };

  const updateAccount = (id: string, accData: Partial<Account>) => {
    setAccountsState((prev) =>
      prev.map((a) => (a.id === id ? { ...a, ...accData } : a))
    );
  };

  const deleteAccount = (id: string) => {
    setAccountsState((prev) => prev.filter((a) => a.id !== id));
  };

  const resetCoaToDefault = () => {
    setAccountsState(getCoaByStandard(standard));
  };

  const loadSampleData = () => {
    setAccountsState(getCoaByStandard(standard));
    setTransactionsState(getSampleTransactions(standard));
  };

  const clearAllData = () => {
    setTransactionsState([]);
  };

  const exportJsonBackup = () => {
    const state: AppState = {
      version: '1.0.0',
      standard,
      settings,
      accounts,
      transactions,
    };
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `NarKuntansi_Backup_${settings.entityName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJsonBackup = (jsonStr: string): { success: boolean; error?: string } => {
    try {
      const parsed = JSON.parse(jsonStr);
      if (!parsed.standard || !Array.isArray(parsed.accounts) || !Array.isArray(parsed.transactions)) {
        return { success: false, error: 'Format file JSON cadangan tidak valid.' };
      }
      setStandardState(parsed.standard);
      setSettingsState(parsed.settings || DEFAULT_SETTINGS);
      setAccountsState(parsed.accounts);
      setTransactionsState(parsed.transactions);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Gagal membaca file JSON.' };
    }
  };

  return (
    <AccountingContext.Provider
      value={{
        standard,
        settings,
        accounts,
        transactions,
        ledgers,
        trialBalance,
        worksheet,
        setStandard,
        updateSettings,
        addTransaction,
        updateTransaction,
        deleteTransaction,
        addMultipleTransactions,
        addAccount,
        updateAccount,
        deleteAccount,
        resetCoaToDefault,
        loadSampleData,
        clearAllData,
        exportJsonBackup,
        importJsonBackup,
      }}
    >
      {children}
    </AccountingContext.Provider>
  );
};

export function useAccounting(): AccountingContextType {
  const ctx = useContext(AccountingContext);
  if (!ctx) {
    throw new Error('useAccounting must be used within an AccountingProvider');
  }
  return ctx;
}
