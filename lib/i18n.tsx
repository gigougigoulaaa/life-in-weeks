'use client'
import { createContext, useContext, useEffect, useMemo, useState, useCallback, ReactNode } from 'react'
import fr from './locales/fr'
import { LANGUAGES, LOADERS, Dict } from './locales'

const STORAGE_KEY = 'liw-lang'

export type Key = keyof typeof fr

type I18nValue = {
  lang: string
  setLang: (code: string) => void
  t: (key: Key, vars?: Record<string, string | number>) => string
  dir: 'ltr' | 'rtl'
  timeAgo: (date: string, dateAfterDay?: boolean) => string
  yearsAgo: (n: number) => string
  dayNames: string[]
  fmtDayMonth: (d: Date) => string
  fmtShortDate: (date: string) => string
  fmtNumber: (n: number) => string
}

const I18nContext = createContext<I18nValue | null>(null)

function safeLocale(code: string): string {
  try {
    new Intl.DateTimeFormat(code)
    return code
  } catch {
    return 'en'
  }
}

function detectLanguage(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && LANGUAGES.some(l => l.code === saved)) return saved
  } catch {}
  const prefs = typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : []
  for (const p of prefs) {
    if (!p) continue
    const lower = p.toLowerCase()
    if (lower === 'zh-tw' || lower === 'zh-hk' || lower === 'zh-hant') return 'zh-TW'
    const base = lower.split('-')[0]
    const code = base === 'nb' || base === 'nn' ? 'no' : base === 'fil' ? 'tl' : base
    const found = LANGUAGES.find(l => l.code.toLowerCase() === code)
    if (found) return found.code
  }
  return 'fr'
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState('fr')
  const [dict, setDict] = useState<Dict>(fr)

  const load = useCallback(async (code: string) => {
    if (code === 'fr') { setDict(fr); return }
    try {
      const mod = await LOADERS[code]()
      setDict(mod.default)
    } catch {
      setDict(fr)
    }
  }, [])

  // Au premier affichage : langue enregistrée, sinon langue du téléphone
  useEffect(() => {
    const code = detectLanguage()
    setLangState(code)
    load(code)
  }, [load])

  const setLang = useCallback((code: string) => {
    setLangState(code)
    load(code)
    try { localStorage.setItem(STORAGE_KEY, code) } catch {}
  }, [load])

  const meta = LANGUAGES.find(l => l.code === lang)
  const dir: 'ltr' | 'rtl' = meta?.rtl ? 'rtl' : 'ltr'

  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = dir
  }, [lang, dir])

  const value = useMemo<I18nValue>(() => {
    const locale = safeLocale(lang)

    const t = (key: Key, vars?: Record<string, string | number>) => {
      let s = dict[key] ?? fr[key] ?? String(key)
      if (vars) for (const k of Object.keys(vars)) s = s.split(`{${k}}`).join(String(vars[k]))
      return s
    }

    const rtf = (style: 'short' | 'long') => {
      try { return new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style }) }
      catch { return new Intl.RelativeTimeFormat('en', { numeric: 'auto', style }) }
    }

    const timeAgo = (date: string, dateAfterDay = false) => {
      const diff = Date.now() - new Date(date).getTime()
      const mins = Math.floor(diff / 60000)
      const hours = Math.floor(diff / 3600000)
      const days = Math.floor(diff / 86400000)
      const r = rtf('short')
      if (mins < 1) return r.format(0, 'second')
      if (mins < 60) return r.format(-mins, 'minute')
      if (hours < 24) return r.format(-hours, 'hour')
      if (dateAfterDay) return new Date(date).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
      return r.format(-days, 'day')
    }

    const yearsAgo = (n: number) => rtf('long').format(-n, 'year')

    // Lundi → Dimanche dans la langue choisie (1er janvier 2024 = un lundi)
    const dayNames = Array.from({ length: 7 }, (_, i) =>
      new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'long' })
    )

    const fmtDayMonth = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric', month: 'numeric' })
    const fmtShortDate = (date: string) =>
      new Date(date).toLocaleDateString(locale, { day: 'numeric', month: 'short' })
    const fmtNumber = (n: number) => n.toLocaleString(locale)

    return { lang, setLang, t, dir, timeAgo, yearsAgo, dayNames, fmtDayMonth, fmtShortDate, fmtNumber }
  }, [lang, dict, dir, setLang])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useI18n doit être utilisé dans <LanguageProvider>')
  return ctx
}
