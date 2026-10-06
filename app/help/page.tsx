'use client'
// Centre d'aide : recherche simple + questions fréquentes en accordéons. Lisible sans être connecté.
import { useId, useMemo, useState } from 'react'
import { useI18n, type Key } from '@/lib/i18n'
import { CONTACT_EMAIL, DELETION_GRACE_DAYS } from '@/lib/appInfo'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import { EmptyState, btn, card, input } from '../components/ui'

// 12 questions : les textes sont dans lib/locales/parts/help.ts (help.q1 / help.a1 …)
const IDS = Array.from({ length: 12 }, (_, i) => i + 1)

export default function HelpPage() {
  const { t } = useI18n()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<number | null>(null)
  const baseId = useId()

  const faq = useMemo(() => IDS.map(n => ({
    n,
    question: t(`help.q${n}` as Key),
    answer: t(`help.a${n}` as Key, { n: DELETION_GRACE_DAYS }),
  })), [t])

  const needle = q.trim().toLowerCase()
  const shown = faq.filter(f => !needle || f.question.toLowerCase().includes(needle) || f.answer.toLowerCase().includes(needle))
  const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t('help.supportSubject'))}`

  const goBack = () => {
    if (window.history.length > 1) window.history.back()
    else window.location.href = '/'
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 sm:px-6 pt-6 pb-nav">
      <div className="flex items-center justify-between mb-8">
        <button onClick={goBack} className={`${btn.ghost} -ms-3`}>
          <Icon name="chevronLeft" size={18} />{t('common.back')}
        </button>
        <Logo size={22} withName className="text-sm text-muted" />
      </div>

      <div className="w-12 h-12 rounded-2xl bg-brand-soft text-brand flex items-center justify-center mb-5">
        <Icon name="help" size={24} />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">{t('help.title')}</h1>
      <p className="text-muted text-base leading-relaxed mt-3">{t('help.subtitle')}</p>

      <div className="relative mt-6">
        <span className="absolute start-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none"><Icon name="search" size={18} /></span>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} aria-label={t('help.search')}
          placeholder={t('help.search')} className={`${input} ps-10`} />
      </div>

      <div className="mt-6 flex flex-col gap-2" aria-live="polite">
        {shown.length === 0 ? (
          <EmptyState icon="search" title={t('help.noResult')} text={t('help.noResultText')} />
        ) : shown.map(f => {
          const isOpen = needle ? true : open === f.n // pendant une recherche, tout est déplié
          return (
            <div key={f.n} className={`${card} overflow-hidden`}>
              <h2>
                <button type="button" aria-expanded={isOpen} aria-controls={`${baseId}-${f.n}`}
                  onClick={() => setOpen(isOpen && !needle ? null : f.n)}
                  className="w-full flex items-center gap-3 px-4 min-h-14 py-3 text-start text-[15px] font-medium hover:bg-surface-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/60">
                  <span className="flex-1">{f.question}</span>
                  <Icon name="chevronDown" size={18} className={`text-subtle shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
              </h2>
              {isOpen && (
                <p id={`${baseId}-${f.n}`} className="px-4 pb-4 text-[15px] leading-7 text-fg/85 animate-fade-in">{f.answer}</p>
              )}
            </div>
          )
        })}
      </div>

      <div className={`${card} mt-8 p-5 flex flex-col items-center text-center gap-3`}>
        <p className="font-semibold">{t('help.stillNeed')}</p>
        <a href={mailto} className={btn.primary}><Icon name="mail" size={18} />{t('help.contactSupport')}</a>
      </div>
    </main>
  )
}
