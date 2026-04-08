import { ReadingMap } from './types';
import { UserAccount } from './billing';

const GENERATED_MAPS_KEY = 'lanren-read.generated-maps.v1';
const USER_ACCOUNT_KEY = 'lanren-read.user-account.v1';

function canUseStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

export function loadGeneratedMaps(): ReadingMap[] {
  if (!canUseStorage()) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(GENERATED_MAPS_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('Failed to load generated maps from localStorage.', error);
    return [];
  }
}

export function persistGeneratedMaps(maps: ReadingMap[]) {
  if (!canUseStorage()) {
    return;
  }

  try {
    window.localStorage.setItem(GENERATED_MAPS_KEY, JSON.stringify(maps));
  } catch (error) {
    console.warn('Failed to persist generated maps to localStorage.', error);
  }
}

export function loadUserAccount(): UserAccount | null {
  if (!canUseStorage()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(USER_ACCOUNT_KEY);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as UserAccount;
  } catch (error) {
    console.warn('Failed to load user account from localStorage.', error);
    return null;
  }
}

export function persistUserAccount(account: UserAccount | null) {
  if (!canUseStorage()) {
    return;
  }

  try {
    if (!account) {
      window.localStorage.removeItem(USER_ACCOUNT_KEY);
      return;
    }

    window.localStorage.setItem(USER_ACCOUNT_KEY, JSON.stringify(account));
  } catch (error) {
    console.warn('Failed to persist user account.', error);
  }
}
