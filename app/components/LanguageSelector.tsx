'use client'
import { useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { LANGUAGES } from '@/lib/locales'

// Bouton 🌐 + fenêtre de choix de la langue (toute l'app change d'un coup)
export default function LanguageSelector({ className = '', showName = false }: { className?: string; showName?: boolean }) {
  const { lang, setLang, t } = useI18n()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')

  const list = LANGUAGES.filter(l =>
    l.name.toLowerCase().includes(q.toLowerCase()) || l.code.toLowerCase().includes(q.toLowerCase())
  )

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={t('common.language')}
        className={className || 'text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500 transition whitespace-nowrap text-white'}>
        🌐{showName && ` ${LANGUAGES.find(l => l.code === lang)?.name ?? ''}`}
      </button>
      {open && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4"
          onClick={() => setOpen(false)}>
          <div className="bg-zinc-900 text-white rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col border border-zinc-800"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 pb-2">
              <h2 className="font-bold">🌐 {t('common.language')}</h2>
              <button onClick={() => setOpen(false)} className="text-zinc-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="px-4 pb-2">
              <input type="text" value={q} onChange={e => setQ(e.target.value)}
                placeholder={t('common.searchLanguage')}
                className="w-full bg-zinc-800 text-white px-3 py-2 rounded-lg outline-none text-sm border border-zinc-700 focus:border-zinc-500" />
            </div>
            <div className="overflow-y-auto px-2 pb-3">
              {list.map(l => (
                <button key={l.code}
                  onClick={() => { setLang(l.code); setOpen(false); setQ('') }}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm text-start hover:bg-zinc-800 transition ${l.code === lang ? 'bg-zinc-800 font-bold' : ''}`}>
                  <span dir={l.rtl ? 'rtl' : 'ltr'}>{l.name}</span>
                  {l.code === lang && <span>✓</span>}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
