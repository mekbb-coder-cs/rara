'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Locale, translations } from '../lib/i18n';

interface I18nContextType {
  locale: Locale;
  dir: 'ltr' | 'rtl';
  setLocale: (loc: Locale) => void;
  t: (key: string, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    // Check localStorage preference if available
    const saved = localStorage.getItem('relieflink_locale') as Locale;
    if (saved === 'en' || saved === 'ti' || saved === 'am') {
      setLocaleState(saved);
    }
  }, []);

  const dir: 'ltr' = 'ltr';

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale;
      document.documentElement.dir = dir;
    }
  }, [locale, dir]);

  const setLocale = (newLocale: Locale) => {
    setLocaleState(newLocale);
    if (typeof window !== 'undefined') {
      localStorage.setItem('relieflink_locale', newLocale);
    }
  };

  const t = (key: string, fallback?: string): string => {
    const dict = translations[locale];
    if (dict && dict[key]) {
      return dict[key];
    }
    // Fallback to English dictionary
    if (translations.en[key]) {
      return translations.en[key];
    }
    return fallback || key;
  };

  return (
    <I18nContext.Provider value={{ locale, dir, setLocale, t }}>
      <div dir={dir} className="w-full min-h-screen flex flex-col">
        {children}
      </div>
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return ctx;
}
