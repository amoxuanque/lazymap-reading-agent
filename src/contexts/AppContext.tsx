import React, { createContext, useContext, useMemo, useState, ReactNode } from 'react';
import { Language, translations } from '../locales/translations';
import {
  BillingAction,
  CreditPackId,
  UserAccount,
  consumeAccountCredits,
  createDemoAccount,
  purchaseCredits,
} from '../lib/billing';
import { loadUserAccount, persistUserAccount } from '../lib/storage';

type Page = 'home' | 'search' | 'map' | 'shelf' | 'gen' | 'profile';

interface AppState {
  language: Language;
  currentPage: Page;
  searchQuery: string;
  searchAuthor: string;
  currentMapId: string | null;
  shareId: string | null;
}

interface ConsumeResult {
  ok: boolean;
      error?: string;
  chargedCredits?: number;
}

interface AppContextType extends AppState {
  account: UserAccount | null;
  navigate: (page: Page, params?: any) => void;
  signInDemo: (payload?: { name?: string; email?: string }) => void;
  signOut: () => void;
  purchasePack: (packId: CreditPackId) => void;
  resetCredits: () => void;
  consumeCredits: (action: BillingAction, meta?: { title?: string }) => ConsumeResult;
  t: (section: keyof typeof translations.zh, key: string) => string;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

function getInitialState(): AppState {
  if (typeof window === 'undefined') {
    return {
      language: 'zh',
      currentPage: 'home',
      searchQuery: '',
      searchAuthor: '',
      currentMapId: null,
      shareId: null,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const shareId = params.get('shareId');
  const mapId = params.get('mapId');
  const query = params.get('q') || '';
  const author = params.get('author') || '';
  const page = params.get('page') as Page | null;

  return {
    language: 'zh',
    currentPage: shareId || mapId ? 'map' : page || (query ? 'search' : 'home'),
    searchQuery: query,
    searchAuthor: author,
    currentMapId: mapId,
    shareId,
  };
}

function updateUrl(page: Page, params?: { mapId?: string | null; shareId?: string | null; query?: string; author?: string }) {
  if (typeof window === 'undefined') {
    return;
  }

  const next = new URL(window.location.href);
  next.searchParams.delete('shareId');
  next.searchParams.delete('mapId');
  next.searchParams.delete('q');
  next.searchParams.delete('author');
  next.searchParams.delete('page');

  if (page === 'map' && params?.shareId) {
    next.searchParams.set('shareId', params.shareId);
  } else if (page === 'map' && params?.mapId) {
    next.searchParams.set('mapId', params.mapId);
  } else if (page === 'search' && params?.query) {
    next.searchParams.set('q', params.query);
    if (params.author) {
      next.searchParams.set('author', params.author);
    }
  } else if (page === 'profile') {
    next.searchParams.set('page', 'profile');
  }

  window.history.replaceState({}, '', `${next.pathname}${next.search}`);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(getInitialState);
  const [account, setAccount] = useState<UserAccount | null>(() => loadUserAccount() || createDemoAccount());

  const navigate = (page: Page, params?: any) => {
    const nextQuery = params?.query !== undefined ? params.query : state.searchQuery;
    const nextAuthor = params?.author !== undefined ? params.author : state.searchAuthor;
    const nextMapId =
      page === 'map'
        ? (params?.shareId ? null : (params?.mapId !== undefined ? params.mapId : state.currentMapId))
        : state.currentMapId;
    const nextShareId =
      page === 'map'
        ? (params?.shareId !== undefined ? params.shareId : (params?.mapId !== undefined ? null : state.shareId))
        : state.shareId;

    setState((prev) => ({
      ...prev,
      currentPage: page,
      searchQuery: nextQuery,
      searchAuthor: nextAuthor,
      currentMapId: nextMapId,
      shareId: nextShareId,
    }));

    updateUrl(page, { query: nextQuery, author: nextAuthor, mapId: nextMapId, shareId: nextShareId });
    window.scrollTo(0, 0);
  };

  const setAndPersistAccount = (nextAccount: UserAccount | null) => {
    setAccount(nextAccount);
    persistUserAccount(nextAccount);
  };

  const signInDemo = (payload?: { name?: string; email?: string }) => {
    const seeded = createDemoAccount();
    const nextAccount: UserAccount = {
      ...seeded,
      name: payload?.name || seeded.name,
      email: payload?.email || seeded.email,
    };

    setAndPersistAccount(nextAccount);
  };

  const signOut = () => {
    setAndPersistAccount(null);
  };

  const purchasePack = (packId: CreditPackId) => {
    const nextAccount = purchaseCredits(account, packId);
    setAndPersistAccount(nextAccount);
  };

  const resetCredits = () => {
    if (!account) {
      signInDemo();
      return;
    }

    const seeded = createDemoAccount();
    setAndPersistAccount({
      ...seeded,
      name: account.name,
      email: account.email,
    });
  };

  const consumeCredits = (action: BillingAction, meta?: { title?: string }) => {
    const result = consumeAccountCredits(account, action, meta?.title);
    if (result.ok && result.account) {
      setAndPersistAccount(result.account);
      return {
        ok: true,
        chargedCredits: result.chargedCredits,
      } satisfies ConsumeResult;
    }

    return {
      ok: false,
      error: result.error || '当前无法扣费，请稍后重试。',
    } satisfies ConsumeResult;
  };

  const t = (section: keyof typeof translations.zh, key: string) => {
    const sectionData = translations[state.language][section] as Record<string, string>;
    return sectionData[key] || key;
  };

  const value = useMemo(
    () => ({
      ...state,
      account,
      navigate,
      signInDemo,
      signOut,
      purchasePack,
      resetCredits,
      consumeCredits,
      t,
    }),
    [state, account],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
}
