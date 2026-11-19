'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useI18n } from '../../context/I18nContext';
import { useNetwork } from '../../context/NetworkContext';
import {
  ShieldAlert,
  Wifi,
  WifiOff,
  Globe,
  Moon,
  Sun,
  RefreshCw,
  Menu,
  X,
} from 'lucide-react';

export function Header() {
  const { t, locale, setLocale } = useI18n();
  const { isOnline, pendingCount, isSyncing, triggerSync } = useNetwork();
  const pathname = usePathname();
  const [isDark, setIsDark] = useState<boolean>(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      const savedTheme = localStorage.getItem('relieflink_theme');
      if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        setIsDark(true);
        document.documentElement.classList.add('dark');
      }
    }
  }, []);

  const toggleDarkMode = () => {
    const next = !isDark;
    setIsDark(next);
    if (typeof window !== 'undefined') {
      if (next) {
        document.documentElement.classList.add('dark');
        localStorage.setItem('relieflink_theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark');
        localStorage.setItem('relieflink_theme', 'light');
      }
    }
  };

  const navLinks = [
    { href: '/', label: t('nav.home') },
    { href: '/report', label: t('nav.report'), primary: true },
    { href: '/map', label: t('nav.map') },
    { href: '/track', label: t('nav.track') },
    { href: '/login', label: t('nav.login') },
  ];

  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
        {/* Brand / Logo */}
        <Link
          href="/"
          className="flex items-center gap-3 touch-target focus:outline-none"
          aria-label="ReliefLink Homepage"
        >
          <div className="bg-blue-600 text-white p-2 rounded-lg shadow">
            <ShieldAlert className="w-6 h-6" aria-hidden="true" />
          </div>
          <div className="flex flex-col">
            <span className="font-extrabold text-xl tracking-tight text-slate-900 dark:text-white">
              {t('app.title')}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium hidden sm:inline">
              {t('app.tagline')}
            </span>
          </div>
        </Link>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-2" aria-label="Main Navigation">
          {navLinks.map((link) => {
            const isActive = pathname === link.href;
            if (link.primary) {
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="bg-red-700 hover:bg-red-800 text-white font-bold px-4 py-2.5 rounded-lg text-sm shadow transition-all touch-target inline-flex items-center justify-center border border-red-800"
                >
                  {link.label}
                </Link>
              );
            }
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-2 rounded-md text-sm font-semibold transition-colors touch-target inline-flex items-center justify-center ${
                  isActive
                    ? 'text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-slate-800'
                    : 'text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        {/* Right Controls: Network status, Language, Dark Mode */}
        <div className="flex items-center gap-2">
          {/* Online / Offline / Pending Status */}
          <div
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              isOnline
                ? pendingCount > 0
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-800'
                  : 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-300 dark:border-rose-800'
            }`}
            title={
              isOnline
                ? pendingCount > 0
                  ? `${pendingCount} reports pending sync`
                  : t('status.online')
                : t('status.offline')
            }
          >
            {isOnline ? (
              <Wifi className="w-4 h-4" aria-hidden="true" />
            ) : (
              <WifiOff className="w-4 h-4 text-rose-600 dark:text-rose-400" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">
              {isOnline ? (pendingCount > 0 ? `${pendingCount} Pending` : t('status.online')) : t('status.offline')}
            </span>

            {isOnline && pendingCount > 0 && (
              <button
                onClick={() => triggerSync()}
                disabled={isSyncing}
                className="ml-1 p-1 hover:bg-amber-200 dark:hover:bg-amber-800 rounded transition"
                title={t('status.syncNow')}
                aria-label={t('status.syncNow')}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              </button>
            )}
          </div>

          {/* Language Switcher */}
          <div className="relative inline-flex items-center">
            <Globe className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 absolute left-2 pointer-events-none" aria-hidden="true" />
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as any)}
              className="pl-6 pr-2 py-1.5 rounded-lg text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              aria-label="Select Language"
            >
              <option value="en">English</option>
              <option value="ti">ትግርኛ</option>
              <option value="am">አማርኛ</option>
            </select>
          </div>

          {/* Dark Mode Switcher */}
          <button
            onClick={toggleDarkMode}
            className="p-2 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 touch-target"
            aria-label={t('theme.toggle')}
          >
            {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>

          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 touch-target"
            aria-label="Open menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Navigation */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 px-4 pt-2 pb-4 space-y-2 bg-white dark:bg-slate-900">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`block px-4 py-3 rounded-md text-base font-medium touch-target ${
                link.primary
                  ? 'bg-red-700 text-white font-bold text-center'
                  : 'text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
