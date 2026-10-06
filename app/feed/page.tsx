'use client'
// Page « Fil » : les semaines rendues publiques par les personnes que je suis,
// et l'onglet « Mes partages » (mes propres semaines publiques).
// Sur grand écran, une colonne « Suggestions » propose des personnes à suivre.
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { usePullToRefresh } from '@/lib/usePullToRefresh'
import Icon from '../components/Icon'
import { Avatar, EmptyState, Skeleton, Spinner, btn, card, useUI } from '../components/ui'
import {
  PROFILE_COLUMNS, WEEK_COLUMNS, WeekCard, WeekSheet, followUser, profileHref, profileName,
  type FollowState, type PublicProfile, type WeekRow,
} from '../components/social'

const PAGE_SIZE = 20
type Tab = 'following' | 'mine'

export default function FeedPage() {
  const { t } = useI18n()
  const { toast } = useUI()
  const [me, setMe] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('following')
  const [followingIds, setFollowingIds] = useState<string[] | null>(null)
  const [weeks, setWeeks] = useState<WeekRow[]>([])
  const [authors, setAuthors] = useState<Record<string, PublicProfile>>({})
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState(false)
  const [opened, setOpened] = useState<WeekRow | null>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  // Numéro de la demande en cours : ignore les réponses d'un ancien onglet
  const requestId = useRef(0)

  // 1) Qui suis-je, et qui je suis (abonnements acceptés)
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) { window.location.href = '/login'; return }
      const { data: f } = await supabase.from('follows').select('following_id')
        .eq('follower_id', data.user.id).eq('status', 'accepted')
      setFollowingIds((f || []).map(x => x.following_id))
      setMe(data.user.id)
    })()
  }, [])

  // Charge une page de semaines (offset = nombre déjà affichées)
  // (Les indicateurs de chargement sont allumés par celui qui appelle : onglet, bouton, défilement.)
  const loadPage = useCallback(async (offset: number) => {
    if (!me || followingIds === null) return
    const id = ++requestId.current
    const ids = tab === 'mine' ? [me] : followingIds
    const { data, error: err } = ids.length === 0
      ? { data: [], error: null }
      : await supabase.from('weeks').select(WEEK_COLUMNS)
        .in('user_id', ids).eq('visibility', 'public')
        .order('year', { ascending: false }).order('week_number', { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1)
    if (id !== requestId.current) return
    if (err) {
      if (offset === 0) setError(true)
      else toast(t('common.error'), 'error')
      setLoading(false); setLoadingMore(false)
      return
    }
    const rows = (data || []) as WeekRow[]

    // Profils des auteurs en une seule requête
    const missing = Array.from(new Set(rows.map(r => r.user_id)))
    if (missing.length) {
      const { data: profs } = await supabase.from('profiles').select(PROFILE_COLUMNS).in('id', missing)
      if (profs) setAuthors(prev => ({ ...prev, ...Object.fromEntries(profs.map(p => [p.id, p])) }))
    }
    if (id !== requestId.current) return
    setError(false)
    setWeeks(prev => (offset === 0 ? rows : [...prev, ...rows]))
    setHasMore(rows.length === PAGE_SIZE)
    setLoading(false); setLoadingMore(false)
  }, [me, followingIds, tab, toast, t])

  const loadMore = useCallback(() => {
    if (loadingMore) return
    setLoadingMore(true)
    loadPage(weeks.length)
  }, [loadingMore, loadPage, weeks.length])

  const retry = () => { setLoading(true); setError(false); loadPage(0) }

  // Recharge depuis le début quand l'onglet (ou la liste d'abonnements) change.
  // On attend un tour (Promise) pour ne pas modifier l'état pendant l'effet lui-même.
  useEffect(() => { Promise.resolve().then(() => loadPage(0)) }, [loadPage])

  // Chargement automatique quand on arrive en bas de la liste
  useEffect(() => {
    const el = sentinel.current
    if (!el || !hasMore || loading) return
    const obs = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting) loadMore()
    }, { rootMargin: '600px' })
    obs.observe(el)
    return () => obs.disconnect()
  }, [hasMore, loading, loadMore])

  const switchTab = (next: Tab) => {
    if (next === tab) return
    setWeeks([]); setHasMore(false); setLoading(true); setTab(next)
  }

  const closeSheet = useCallback(() => setOpened(null), [])

  // Tirer vers le bas = recharger le fil
  const { pull, refreshing } = usePullToRefresh(() => loadPage(0))

  return (
    <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 pt-6 pb-nav lg:flex lg:justify-center lg:gap-10">
      <main className="w-full max-w-xl mx-auto lg:mx-0">
        {(pull > 0 || refreshing) && (
          <div className="flex justify-center -mt-2 mb-2 transition-[height] overflow-hidden" style={{ height: refreshing ? 32 : Math.min(pull, 40) }}>
            <Spinner size={20} />
          </div>
        )}
        {/* En-tête */}
        <div className="flex items-center justify-between gap-3 mb-4">
          <h1 className="text-2xl font-semibold tracking-tight">{t('feed.title')}</h1>
          <Link href="/users" aria-label={t('feed.findPeople')} title={t('feed.findPeople')} className={`${btn.icon} active:scale-95`}>
            <Icon name="userPlus" size={22} />
          </Link>
        </div>

        {/* Onglets */}
        <div role="tablist" className="grid grid-cols-2 p-1 mb-5 rounded-xl bg-surface-2 border border-line">
          {(['following', 'mine'] as Tab[]).map(k => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => switchTab(k)}
              className={`h-9 rounded-lg text-sm font-medium transition ${tab === k ? 'bg-surface-3 text-fg shadow-sm' : 'text-muted hover:text-fg'}`}>
              {k === 'following' ? t('feed.tabFollowing') : t('feed.tabMine')}
            </button>
          ))}
        </div>

        {/* Contenu */}
        {loading ? (
          <FeedSkeleton />
        ) : error && weeks.length === 0 ? (
          <EmptyState icon="info" title={t('feed.errorTitle')} text={t('common.error')}
            action={<button onClick={retry} className={btn.secondary}>{t('common.retry')}</button>} />
        ) : weeks.length === 0 ? (
          tab === 'mine' ? (
            <EmptyState icon="calendar" title={t('feed.mineEmptyTitle')} text={t('feed.mineEmptyText')}
              action={<Link href="/calendar" className={btn.primary}>{t('feed.openCalendar')}</Link>} />
          ) : (
            <EmptyState icon="users" title={t('feed.emptyTitle')}
              text={followingIds && followingIds.length > 0 ? t('feed.emptyNoPosts') : t('feed.emptyText')}
              action={<Link href="/users" className={btn.primary}><Icon name="userPlus" size={18} />{t('feed.findPeople')}</Link>} />
          )
        ) : (
          <div className="space-y-5">
            {weeks.map(w => (
              <WeekCard key={w.id} week={w} author={authors[w.user_id]} me={me} onOpen={() => setOpened(w)} />
            ))}
            <div ref={sentinel} />
            {hasMore ? (
              <div className="flex justify-center pt-1">
                <button onClick={loadMore} disabled={loadingMore} className={btn.secondary}>
                  {loadingMore ? <Spinner size={18} /> : t('feed.loadMore')}
                </button>
              </div>
            ) : (
              <p className="flex items-center justify-center gap-2 text-sm text-subtle py-4"><Icon name="check" size={16} />{t('feed.end')}</p>
            )}
          </div>
        )}

        {/* Suggestions sur téléphone, quand le fil est vide */}
        {!loading && weeks.length === 0 && tab === 'following' && me && (
          <div className="lg:hidden mt-2"><Suggestions me={me} /></div>
        )}
      </main>

      {/* Colonne de droite (grand écran) */}
      <aside className="hidden lg:block w-72 shrink-0">
        <div className="sticky top-6">{me && <Suggestions me={me} />}</div>
      </aside>

      <WeekSheet week={opened} author={opened ? authors[opened.user_id] : null} me={me} onClose={closeSheet} />
    </div>
  )
}

function FeedSkeleton() {
  return (
    <div className="space-y-5">
      {[0, 1].map(i => (
        <div key={i} className={`${card} overflow-hidden`}>
          <div className="flex items-center gap-3 p-4">
            <Skeleton className="w-10 h-10 !rounded-full" />
            <div className="flex-1 space-y-2"><Skeleton className="h-3 w-32" /><Skeleton className="h-3 w-48" /></div>
          </div>
          <Skeleton className="h-72 !rounded-none" />
          <div className="p-4 space-y-2"><Skeleton className="h-4 w-2/3" /><Skeleton className="h-3 w-1/2" /></div>
        </div>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Suggestions : quelques profils que je ne suis pas encore            */
/* ------------------------------------------------------------------ */
function Suggestions({ me }: { me: string }) {
  const { t } = useI18n()
  const { toast } = useUI()
  const [people, setPeople] = useState<PublicProfile[] | null>(null)
  const [states, setStates] = useState<Record<string, FollowState>>({})
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      // Toutes mes relations (acceptées ou en attente) pour ne pas les reproposer
      const { data: f } = await supabase.from('follows').select('following_id').eq('follower_id', me)
      const known = new Set([me, ...(f || []).map(x => x.following_id)])
      const { data } = await supabase.from('profiles').select(PROFILE_COLUMNS).neq('id', me).limit(40)
      setPeople((data || []).filter(p => !known.has(p.id) && (p.full_name?.trim() || p.username?.trim())).slice(0, 5))
    })()
  }, [me])

  const follow = async (p: PublicProfile) => {
    setBusy(p.id)
    const status = await followUser(p, (name, s) =>
      t(s === 'pending' ? 'social.notifRequest' : 'social.notifFollow', { name: name || t('social.someone') }))
    setBusy(null)
    if (!status) { toast(t('common.error'), 'error'); return }
    setStates(prev => ({ ...prev, [p.id]: status }))
    toast(status === 'pending' ? t('social.requestSent') : t('social.followed'))
  }

  return (
    <section>
      <h2 className="text-sm font-semibold mb-3 px-1">{t('feed.suggestions')}</h2>
      <div className={`${card} p-2`}>
        {people === null ? (
          <div className="space-y-1 p-2">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex items-center gap-3 py-1.5">
                <Skeleton className="w-10 h-10 !rounded-full" />
                <div className="flex-1 space-y-2"><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-16" /></div>
              </div>
            ))}
          </div>
        ) : people.length === 0 ? (
          <p className="text-sm text-muted px-3 py-4">{t('feed.noSuggestions')}</p>
        ) : (
          <ul>
            {people.map(p => {
              const name = profileName(p, t('common.user'))
              const state = states[p.id] || 'none'
              return (
                <li key={p.id} className="flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-surface-2 transition">
                  <Link href={profileHref(p.id, me)} className="flex items-center gap-3 min-w-0 flex-1">
                    <Avatar url={p.avatar_url} name={name} size={40} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate flex items-center gap-1">
                        <span className="truncate">{name}</span>
                        {p.is_private && <Icon name="lock" size={12} className="text-subtle" />}
                      </p>
                      {p.username && p.username !== name && <p className="text-xs text-subtle truncate">@{p.username}</p>}
                    </div>
                  </Link>
                  {state === 'none' ? (
                    <button onClick={() => follow(p)} disabled={busy === p.id}
                      className="h-8 px-3 rounded-lg bg-brand text-ink text-xs font-semibold hover:bg-brand-strong active:scale-95 transition disabled:opacity-40 shrink-0">
                      {busy === p.id ? <Spinner size={14} /> : t('social.follow')}
                    </button>
                  ) : (
                    <span className="h-8 px-3 inline-flex items-center rounded-lg bg-surface-3 text-muted text-xs font-medium shrink-0">
                      {state === 'pending' ? t('social.requested') : t('social.followingState')}
                    </span>
                  )}
                </li>
              )
            })}
          </ul>
        )}
        <Link href="/users" className={`${btn.ghost} w-full mt-1 text-brand hover:text-brand`}>
          {t('common.seeAll')}<Icon name="arrowRight" size={16} />
        </Link>
      </div>
    </section>
  )
}
