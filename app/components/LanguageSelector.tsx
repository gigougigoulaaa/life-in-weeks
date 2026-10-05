'use client'
import { useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { LANGUAGES } from '@/lib/locales'
import Icon from './Icon'
import { Sheet, input } from './ui'

// Bouton globe + panneau de choix de la langue (toute l'app change d'un coup)
export default function LanguageSelector({ className = '', showName = false }: { className?: string; showName?: boolean }) {
  const { lang, setLang, t } = useI18n()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const current = LANGUAGES.find(l => l.code === lang)
  const needle = q.trim().toLowerCase()
  const list = LANGUAGES.filter(l => !needle || l.name.toLowerCase().includes(needle) || l.code.toLowerCase().includes(needle))

  const close = () => { setOpen(false); setQ('') }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t('common.language')} title={t('common.language')}
        className={className || `inline-flex items-center gap-2 h-10 rounded-xl text-muted hover:text-fg hover:bg-surface-2 transition ${showName ? 'px-3 text-sm' : 'w-10 justify-center'}`}>
        <Icon name="globe" size={18} />
        {showName && current && <span dir={current.rtl ? 'rtl' : 'ltr'}>{current.name}</span>}
      </button>

      <Sheet open={open} onClose={close} title={t('common.language')}>
        <div className="px-4 pt-4 pb-2 sticky top-0 bg-surface z-10">
          <div className="relative">
            <span className="absolute start-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none"><Icon name="search" size={18} /></span>
            <input type="search" value={q} onChange={e => setQ(e.target.value)} autoFocus
              placeholder={t('common.searchLanguage')} className={`${input} ps-10`} />
          </div>
        </div>
        <div className="px-2 pb-4">
          {list.map(l => {
            const active = l.code === lang
            return (
              <button key={l.code} type="button"
                onClick={() => { setLang(l.code); close() }}
                className={`w-full flex items-center justify-between gap-3 px-3 h-12 rounded-xl text-sm text-start transition hover:bg-surface-2 ${active ? 'text-fg font-semibold' : 'text-muted hover:text-fg'}`}>
                <span dir={l.rtl ? 'rtl' : 'ltr'}>{l.name}</span>
                {active && <span className="text-brand"><Icon name="check" size={18} /></span>}
              </button>
            )
          })}
          {list.length === 0 && <p className="text-subtle text-sm text-center py-8">{t('account.langNone')}</p>}
        </div>
      </Sheet>
    </>
  )
}
