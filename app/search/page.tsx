'use client'
import { useDeferredValue, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { isVideoUrl } from '@/lib/media'
import Icon from '../components/Icon'
import { card, input, page, EmptyState, Skeleton } from '../components/ui'

type Week = {
  id: string, year: number, week_number: number, title?: string | null, content?: string | null,
  days?: { events?: { text?: string, description?: string, photos?: string[] }[] }[] | null,
  media_urls?: string[] | null, location?: { name?: string } | null,
}

// Met en minuscules et retire les accents, caractère par caractère (les positions restent les mêmes)
const fold = (s: string) => s.split('').map(c => c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')[0] ?? c).join('')

// Tous les textes d'une semaine (titre, résumé, évènements, lieu)
function textsOf(w: Week): string[] {
  const out = [w.title || '', w.content || '', w.location?.name || '']
  for (const d of w.days || []) for (const e of d?.events || []) out.push(e?.text || '', e?.description || '')
  return out.filter(Boolean)
}

function photoOf(w: Week): string | null {
  const all = [...(w.media_urls || []), ...(w.days || []).flatMap(d => (d?.events || []).flatMap(e => e?.photos || []))]
  return all.find(u => u && !isVideoUrl(u)) || null
}

// Extrait d'environ 140 caractères autour du premier mot trouvé
function snippet(text: string, word: string): string {
  const i = fold(text).indexOf(word)
  if (i < 0 || text.length <= 140) return text
  const start = Math.max(0, i - 50)
  return (start > 0 ? '…' : '') + text.slice(start, start + 140) + (start + 140 < text.length ? '…' : '')
}

// Surligne les mots recherchés
function highlight(text: string, words: string[]): ReactNode[] {
  const f = fold(text)
  const marks = new Array(text.length).fill(false)
  for (const w of words) {
    let i = f.indexOf(w)
    while (w && i >= 0) { for (let k = i; k < i + w.length; k++) marks[k] = true; i = f.indexOf(w, i + w.length) }
  }
  const out: ReactNode[] = []
  let buf = '', on = false
  const flush = () => { if (buf) out.push(on ? <mark key={out.length} className="bg-brand/25 text-fg rounded px-0.5">{buf}</mark> : buf); buf = '' }
  text.split('').forEach((c, i) => { if (marks[i] !== on) { flush(); on = marks[i] } buf += c })
  flush()
  return out
}

export default function SearchPage() {
  const { t } = useI18n()
  const [weeks, setWeeks] = useState<Week[] | null>(null)
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)

  // On charge une seule fois toutes mes semaines : la recherche se fait ensuite instantanément,
  // y compris dans les évènements de chaque jour et les lieux.
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.href = '/login'; return }
      const { data: rows } = await supabase.from('weeks')
        .select('id, year, week_number, title, content, days, media_urls, location')
        .eq('user_id', data.user.id)
        .order('year', { ascending: false }).order('week_number', { ascending: false })
      setWeeks((rows as Week[]) || [])
    })
  }, [])

  const words = useMemo(() => fold(deferred.trim()).split(/\s+/).filter(Boolean), [deferred])

  const results = useMemo(() => {
    if (!weeks || words.length === 0) return []
    return weeks.flatMap(w => {
      const texts = textsOf(w)
      const folded = texts.map(fold)
      // Tous les mots doivent apparaître quelque part dans la semaine
      if (!words.every(word => folded.some(s => s.includes(word)))) return []
      const hit = texts.find((_, i) => folded[i].includes(words[0])) || ''
      return [{ week: w, excerpt: hit === w.title ? (w.content || '') : snippet(hit, words[0]), photo: photoOf(w) }]
    }).slice(0, 100)
  }, [weeks, words])

  const openWeek = (w: Week) => { window.location.assign(`/calendar?y=${w.year}&w=${w.week_number}`) }

  return (
    <main className={page}>
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">{t('search.title')}</h1>
        <p className="text-sm text-muted mt-1">{t('search.subtitle')}</p>
      </header>

      <div className="relative mb-6">
        <span className="absolute start-3.5 top-1/2 -translate-y-1/2 text-subtle pointer-events-none"><Icon name="search" size={18} /></span>
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} autoFocus
          placeholder={t('search.placeholder')} className={`${input} h-12 ps-11 text-base sm:text-sm`} />
      </div>

      {weeks === null ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
        </div>
      ) : words.length === 0 ? (
        <EmptyState icon="sparkles" title={t('search.startTitle')} text={t('search.startText')} />
      ) : results.length === 0 ? (
        <EmptyState icon="search" title={t('search.noResultTitle')} text={t('search.noResult', { query: deferred.trim() })} />
      ) : (
        <>
          <p className="text-xs text-subtle mb-3">{t('search.count', { n: results.length })}</p>
          <ul className="flex flex-col gap-3">
            {results.map(({ week, excerpt, photo }) => (
              <li key={week.id}>
                <button onClick={() => openWeek(week)}
                  className={`${card} w-full flex items-start gap-4 p-4 text-start transition hover:bg-surface-2 hover:border-line-strong active:scale-[0.99]`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-brand">{t('search.weekYear', { n: week.week_number, year: week.year })}</p>
                    <p className="font-semibold mt-1 truncate">{highlight(week.title || t('common.untitled'), words)}</p>
                    {excerpt && <p className="text-sm text-muted mt-1 line-clamp-2 leading-relaxed">{highlight(excerpt, words)}</p>}
                    {week.location?.name && (
                      <p className="flex items-center gap-1 text-xs text-subtle mt-2"><Icon name="mapPin" size={12} /><span className="truncate">{week.location.name}</span></p>
                    )}
                  </div>
                  {photo && <img src={photo} alt="" loading="lazy" className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl object-cover shrink-0 bg-surface-2" />}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  )
}
