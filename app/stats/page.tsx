'use client'
// Statistiques de vie : un bilan fier et motivant de tout ce que tu as déjà vécu et rempli.
// Les calculs sont dans lib/lifeStats.ts ; cette page ne s'occupe que de l'affichage.
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import {
  computeStats, computeBadges, exactAge, parseBirth, timeLived,
  type StatWeek, type DotState,
} from '@/lib/lifeStats'
import Icon, { type IconName } from '../components/Icon'
import { btn, card, EmptyState, Skeleton, Spinner, useUI } from '../components/ui'

/* ---------------- Compteur animé (0 → valeur), sans animation si l'utilisateur l'a désactivée ---------------- */
function CountUp({ value, format }: { value: number, format: (n: number) => string }) {
  const [reduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
  const [shown, setShown] = useState(reduced ? value : 0)
  useEffect(() => {
    if (reduced) return
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 900)
      setShown(Math.round(value * (1 - Math.pow(1 - p, 3)))) // décélération douce
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, reduced])
  return <>{format(reduced ? value : shown)}</>
}

/* ---------------- Petites briques ---------------- */
function Section({ title, icon, children }: { title: string, icon: IconName, children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
        <Icon name={icon} size={16} className="text-brand" />{title}
      </h2>
      {children}
    </section>
  )
}

function Tile({ icon, label, children, hint }: { icon: IconName, label: string, children: ReactNode, hint?: string }) {
  return (
    <div className={`${card} p-4`}>
      <span className="w-8 h-8 rounded-lg bg-surface-2 text-muted flex items-center justify-center"><Icon name={icon} size={16} /></span>
      <p className="text-2xl font-semibold tracking-tight mt-3 tabular-nums text-brand">{children}</p>
      <p className="text-xs text-muted mt-0.5">{label}</p>
      {hint && <p className="text-[11px] text-subtle mt-1 leading-snug">{hint}</p>}
    </div>
  )
}

const dotClass: Record<DotState, string> = {
  past: 'bg-fg/30',
  filled: 'bg-brand',
  current: 'bg-brand ring-2 ring-brand/40 ring-offset-2 ring-offset-surface',
  upcoming: 'border border-line-strong',
}

export default function StatsPage() {
  const { t, lang, fmtNumber } = useI18n()
  const { toast } = useUI()
  const [birthStr, setBirthStr] = useState<string | null>(null)
  const [weeks, setWeeks] = useState<StatWeek[]>([])
  const [loaded, setLoaded] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [picked, setPicked] = useState<number | null>(null) // année survolée/touchée dans l'histogramme
  const [now] = useState(() => new Date())

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.assign('/login'); return }
      const [{ data: prof }, { data: rows }] = await Promise.all([
        supabase.from('profiles').select('birth_date').eq('id', data.user.id).maybeSingle(),
        supabase.from('weeks').select('id, year, week_number, title, content, days, media_urls, location')
          .eq('user_id', data.user.id),
      ])
      setBirthStr((prof as { birth_date?: string | null } | null)?.birth_date || null)
      setWeeks((rows as StatWeek[]) || [])
      setLoaded(true)
    })
  }, [])

  const stats = useMemo(() => computeStats(weeks, now), [weeks, now])
  const badges = useMemo(() => computeBadges(stats), [stats])
  const birth = parseBirth(birthStr)
  const age = birth ? exactAge(birth, now) : null
  const lived = birth ? timeLived(birth, now) : null

  // Noms de mois courts dans la langue choisie
  const monthNames = useMemo(() => {
    try {
      const f = new Intl.DateTimeFormat(lang, { month: 'short' })
      return Array.from({ length: 12 }, (_, i) => f.format(new Date(2024, i, 1)))
    } catch {
      return Array.from({ length: 12 }, (_, i) => String(i + 1))
    }
  }, [lang])

  const share = async () => {
    if (sharing) return
    setSharing(true)
    const text = t('stats.shareText', { n: fmtNumber(stats.filledCount), s: fmtNumber(Math.max(stats.streak, stats.bestStreak)) })
    const url = window.location.origin
    try {
      if (navigator.share) { await navigator.share({ text, url }); setSharing(false); return }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') { setSharing(false); return }
    }
    try { await navigator.clipboard.writeText(`${text} ${url}`); toast(t('common.copied')) }
    catch { toast(t('common.error'), 'error') }
    setSharing(false)
  }

  /* ---------------- Chargement ---------------- */
  if (!loaded) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 sm:px-6 pt-6 pb-nav">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-40 mt-6 rounded-2xl" />
        <div className="grid grid-cols-3 gap-3 mt-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
        <Skeleton className="h-48 mt-6 rounded-2xl" />
      </main>
    )
  }

  const header = (
    <header className="flex items-center gap-2">
      <Link href="/profile" aria-label={t('stats.back')} className={`${btn.icon} -ms-2`}><Icon name="chevronLeft" size={22} /></Link>
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{t('stats.title')}</h1>
        <p className="text-sm text-muted">{t('stats.subtitle')}</p>
      </div>
    </header>
  )

  /* ---------------- État vide ---------------- */
  if (stats.filledCount === 0) {
    return (
      <main className="mx-auto w-full max-w-2xl px-4 sm:px-6 pt-6 pb-nav animate-fade-in">
        {header}
        <div className={`${card} mt-6`}>
          <EmptyState icon="chart" title={t('stats.emptyTitle')} text={t('stats.emptyText')}
            action={<Link href="/calendar" className={btn.primary}><Icon name="calendar" size={16} />{t('stats.emptyAction')}</Link>} />
        </div>
      </main>
    )
  }

  /* ---------------- Valeurs d'affichage ---------------- */
  const maxYear = Math.max(1, ...stats.byYear.map(y => y.count))
  const curYear = now.getFullYear()
  const shownYear = stats.byYear.find(y => y.year === (picked ?? curYear)) || stats.byYear[stats.byYear.length - 1]
  const yearsAria = stats.byYear.map(y => t('stats.yearMemories', { year: y.year, n: y.count })).join(', ')
  const maxMonth = Math.max(1, ...stats.byMonth)
  const monthsAria = stats.byMonth.map((n, i) => `${monthNames[i]} ${n}`).join(', ')
  const num = (n: number) => fmtNumber(n)

  return (
    <main className="mx-auto w-full max-w-2xl px-4 sm:px-6 pt-6 pb-nav animate-fade-in">
      {header}

      {/* 1. Ton temps */}
      <Section title={t('stats.time')} icon="clock">
        {age && lived ? (
          <>
            <div className={`${card} p-5 bg-gradient-to-br from-brand-soft to-surface`}>
              <p className="text-xs text-muted">{t('stats.age')}</p>
              <p className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <span className="text-4xl font-semibold tracking-tight text-brand tabular-nums">{t('stats.ageYears', { n: age.years })}</span>
                <span className="text-lg text-fg/90 tabular-nums">{t('stats.ageMonths', { n: age.months })}</span>
                <span className="text-lg text-fg/90 tabular-nums">{t('stats.ageDays', { n: age.days })}</span>
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-3">
              {([['stats.daysLived', lived.days], ['stats.weeksLived', lived.weeks], ['stats.hoursLived', lived.hours]] as const).map(([k, v]) => (
                <div key={k} className={`${card} p-3 sm:p-4 min-w-0`}>
                  <p className="text-lg sm:text-2xl font-semibold tracking-tight tabular-nums text-brand truncate"><CountUp value={v} format={num} /></p>
                  <p className="text-[11px] sm:text-xs text-muted mt-1 leading-snug">{t(k)}</p>
                </div>
              ))}
            </div>
          </>
        ) : (
          <Link href="/calendar" className={`${card} flex items-center gap-3 p-4 hover:bg-surface-2 transition active:scale-[0.99]`}>
            <span className="w-10 h-10 rounded-xl bg-brand-soft text-brand flex items-center justify-center shrink-0"><Icon name="calendar" size={18} /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium">{t('stats.noBirthTitle')}</span>
              <span className="block text-xs text-muted mt-0.5">{t('stats.noBirthText')}</span>
            </span>
            <Icon name="chevronRight" size={18} className="text-subtle" />
          </Link>
        )}
      </Section>

      {/* 2. Régularité */}
      <Section title={t('stats.regularity')} icon="flame">
        <div className="grid grid-cols-2 gap-3">
          <Tile icon="flame" label={t('stats.streak')}>{t('stats.streakUnit', { n: num(stats.streak) })}</Tile>
          <Tile icon="award" label={t('stats.bestStreak')}>{t('stats.streakUnit', { n: num(Math.max(stats.streak, stats.bestStreak)) })}</Tile>
          <Tile icon="pencil" label={t('stats.filledThisYear')}>{num(stats.filledThisYear)}</Tile>
          <Tile icon="chart" label={t('stats.yearRate')} hint={t('stats.yearRateHint')}>{num(stats.yearRate)} %</Tile>
        </div>
      </Section>

      {/* 3. Souvenirs par année */}
      <Section title={t('stats.byYear')} icon="chart">
        <div className={`${card} p-4`}>
          <p className="text-sm tabular-nums h-5">
            <span className="font-semibold text-brand">{shownYear?.year}</span>
            <span className="text-muted"> · {t('stats.memoriesCount', { n: num(shownYear?.count || 0) })}</span>
          </p>
          <div dir="ltr" className="overflow-x-auto mt-3 pb-1" role="img" aria-label={t('stats.byYearAria', { list: yearsAria })}>
            <div className="flex items-end gap-2 h-40 min-w-full w-max">
              {stats.byYear.map(y => {
                const on = y.year === curYear
                const active = y.year === shownYear?.year
                return (
                  <div key={y.year} aria-hidden="true" className="flex flex-col items-center justify-end h-full w-9 shrink-0 cursor-pointer"
                    onPointerEnter={() => setPicked(y.year)} onClick={() => setPicked(y.year)}>
                    <div className={`w-full rounded-t-md transition-all ${on ? 'bg-brand' : 'bg-fg/25'} ${active ? 'opacity-100' : 'opacity-70'}`}
                      style={{ height: `${Math.max(4, (y.count / maxYear) * 100)}%` }} />
                    <span className={`text-[10px] mt-1.5 tabular-nums ${active ? 'text-fg' : 'text-subtle'}`}>{`’${String(y.year).slice(-2)}`}</span>
                  </div>
                )
              })}
            </div>
          </div>
          <p className="text-[11px] text-subtle mt-2">{t('stats.tapBar')}</p>
        </div>
      </Section>

      {/* 4. Rythme de l'année */}
      <Section title={t('stats.rhythm')} icon="calendar">
        <div className="grid gap-3 md:grid-cols-2">
          <div className={`${card} p-4`}>
            <p className="text-xs text-muted mb-3">{t('stats.yearGrid')}</p>
            <div dir="ltr" role="img" aria-label={t('stats.yearGridAria', { n: stats.filledThisYear })}
              className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
              {stats.yearDots.map((d, i) => <span key={i} aria-hidden="true" className={`aspect-square rounded-full ${dotClass[d]}`} />)}
            </div>
            <ul className="flex flex-wrap gap-x-3 gap-y-1 mt-4 text-[11px] text-muted">
              {([['past', 'stats.legendPast'], ['filled', 'stats.legendFilled'], ['current', 'stats.legendCurrent'], ['upcoming', 'stats.legendUpcoming']] as const).map(([d, k]) => (
                <li key={d} className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${dotClass[d]}`} />{t(k)}</li>
              ))}
            </ul>
          </div>
          <div className={`${card} p-4`}>
            <p className="text-xs text-muted mb-3">{t('stats.activeMonths')}</p>
            <ul dir="ltr" className="flex flex-col gap-1.5" aria-label={t('stats.activeMonthsAria', { list: monthsAria })}>
              {stats.byMonth.map((n, i) => (
                <li key={i} className="flex items-center gap-2 text-[11px]">
                  <span className="w-8 text-muted capitalize shrink-0">{monthNames[i]}</span>
                  <span className="flex-1 h-2 rounded-full bg-surface-2 overflow-hidden">
                    <span className="block h-full rounded-full bg-brand transition-all" style={{ width: `${(n / maxMonth) * 100}%` }} />
                  </span>
                  <span className="w-5 text-end tabular-nums text-subtle">{n}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      {/* 5. Lieux */}
      <Section title={t('stats.places')} icon="mapPin">
        <div className="grid grid-cols-2 gap-3">
          <Tile icon="globe" label={t('stats.countries')}>{num(stats.countries)}</Tile>
          <Tile icon="mapPin" label={t('stats.differentPlaces')}>{num(stats.places)}</Tile>
        </div>
        <div className={`${card} mt-3 p-4`}>
          <p className="text-xs text-muted mb-2">{t('stats.topPlaces')}</p>
          {stats.topPlaces.length === 0 ? (
            <p className="text-sm text-subtle">{t('stats.noPlaces')}</p>
          ) : (
            <ul className="divide-y divide-line">
              {stats.topPlaces.map(p => (
                <li key={p.name} className="flex items-center gap-3 py-2.5 text-sm">
                  <Icon name="mapPin" size={16} className="text-brand shrink-0" />
                  <span className="flex-1 min-w-0 truncate">{p.name}</span>
                  <span className="text-xs text-muted tabular-nums">{t('stats.placeCount', { n: num(p.count) })}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      {/* 6. Contenu */}
      <Section title={t('stats.content')} icon="pencil">
        <div className="grid grid-cols-2 gap-3">
          <Tile icon="pencil" label={t('stats.events')}>{num(stats.events)}</Tile>
          <Tile icon="message" label={t('stats.words')}>{num(stats.words)}</Tile>
          <Tile icon="image" label={t('stats.photos')}>{num(stats.photos)}</Tile>
          <Tile icon="video" label={t('stats.videos')}>{num(stats.videos)}</Tile>
        </div>
        {stats.busiest && (
          <Link href={`/calendar?y=${stats.busiest.year}&w=${stats.busiest.week}`}
            className={`${card} mt-3 flex items-center gap-3 p-4 hover:bg-surface-2 transition active:scale-[0.99]`}>
            <span className="w-10 h-10 rounded-xl bg-brand-soft text-brand flex items-center justify-center shrink-0"><Icon name="sparkles" size={18} /></span>
            <span className="flex-1 min-w-0">
              <span className="block text-xs text-muted">{t('stats.busiest')}</span>
              <span className="block text-sm font-semibold mt-0.5">{t('common.weekOfYear', { n: stats.busiest.week, year: stats.busiest.year })}</span>
              <span className="block text-xs text-subtle mt-0.5">{t('stats.busiestDetail', { n: num(stats.busiest.score) })}</span>
            </span>
            <Icon name="chevronRight" size={18} className="text-subtle" />
          </Link>
        )}
      </Section>

      {/* 7. Jalons */}
      <Section title={t('stats.milestones')} icon="award">
        <div className="grid gap-3 sm:grid-cols-2">
          {badges.map(b => {
            const n = num(b.target)
            const pct = Math.min(100, (b.value / b.target) * 100)
            return (
              <div key={`${b.kind}-${b.target}`} className={`${card} p-4 flex gap-3 ${b.unlocked ? 'border-brand/40' : ''}`}>
                <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${b.unlocked ? 'bg-brand text-ink' : 'bg-surface-2 text-subtle'}`}>
                  <Icon name="award" size={20} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${b.unlocked ? 'text-fg' : 'text-muted'}`}>{t(`stats.badge.${b.kind}.title`, { n })}</p>
                  <p className="text-xs text-muted mt-0.5 leading-snug">{t(`stats.badge.${b.kind}.desc`, { n })}</p>
                  {b.unlocked ? (
                    <p className="flex items-center gap-1 text-xs font-medium text-brand mt-2"><Icon name="check" size={12} strokeWidth={3} />{t('stats.unlocked')}</p>
                  ) : (
                    <div className="mt-2">
                      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
                        <div className="h-full rounded-full bg-fg/30" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[11px] text-subtle mt-1 tabular-nums">{num(b.value)}/{n}</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </Section>

      {/* 8. Partage */}
      <button onClick={share} disabled={sharing} className={`${btn.primary} w-full mt-8`}>
        {sharing ? <Spinner size={16} /> : <Icon name="share" size={16} />}{t('stats.share')}
      </button>
    </main>
  )
}
