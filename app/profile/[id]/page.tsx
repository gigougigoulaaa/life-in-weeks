'use client'
// Profil public d'une autre personne : /profile/<id>
// En-tête (photo, nom, bio, chiffres, Suivre / Message) puis grille de ses semaines publiques.
// Si c'est mon propre identifiant, on renvoie vers ma page /profile.
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { isVideoUrl } from '@/lib/media'
import Icon from '../../components/Icon'
import { Avatar, EmptyState, Skeleton, Spinner, btn, page, useUI } from '../../components/ui'
import {
  PROFILE_COLUMNS, WEEK_COLUMNS, WeekSheet, followUser, profileName, unfollowUser, weekEvents, weekPhotos,
  type FollowState, type PublicProfile, type WeekRow,
} from '../../components/social'

const PAGE_SIZE = 30

export default function PublicProfilePage() {
  const { t, fmtNumber } = useI18n()
  const { toast, confirm } = useUI()
  const router = useRouter()
  const params = useParams<{ id: string }>()
  const id = Array.isArray(params?.id) ? params.id[0] : params?.id

  const [me, setMe] = useState<string | null>(null)
  const [profile, setProfile] = useState<PublicProfile | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [follow, setFollow] = useState<FollowState>('none')
  const [stats, setStats] = useState({ weeks: 0, followers: 0, following: 0 })
  const [weeks, setWeeks] = useState<WeekRow[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [weeksLoading, setWeeksLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [opened, setOpened] = useState<WeekRow | null>(null)

  const locked = !!profile?.is_private && follow !== 'accepted'

  // Profil, relation, chiffres
  useEffect(() => {
    if (!id) return
    (async () => {
      const { data: auth } = await supabase.auth.getUser()
      if (!auth.user) { window.location.href = '/login'; return }
      if (auth.user.id === id) { router.replace('/profile'); return }
      setMe(auth.user.id)

      const [{ data: p }, { data: rel }, followers, following, shared] = await Promise.all([
        supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle(),
        supabase.from('follows').select('status').eq('follower_id', auth.user.id).eq('following_id', id).maybeSingle(),
        supabase.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', id).eq('status', 'accepted'),
        supabase.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', id).eq('status', 'accepted'),
        supabase.from('weeks').select('id', { count: 'exact', head: true }).eq('user_id', id).eq('visibility', 'public'),
      ])
      if (!p) { setNotFound(true); setLoading(false); return }
      setProfile(p)
      setFollow(rel?.status === 'accepted' ? 'accepted' : rel?.status === 'pending' ? 'pending' : 'none')
      setStats({ weeks: shared.count || 0, followers: followers.count || 0, following: following.count || 0 })
      setLoading(false)
    })()
  }, [id, router])

  // Semaines publiques (pages de 30)
  const loadWeeks = useCallback(async (offset: number) => {
    if (!id) return
    const { data, error } = await supabase.from('weeks').select(WEEK_COLUMNS)
      .eq('user_id', id).eq('visibility', 'public')
      .order('year', { ascending: false }).order('week_number', { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)
    if (error) toast(t('common.error'), 'error')
    const rows = (data || []) as WeekRow[]
    setWeeks(prev => (offset === 0 ? rows : [...prev, ...rows]))
    setHasMore(rows.length === PAGE_SIZE)
    setWeeksLoading(false)
  }, [id, toast, t])

  useEffect(() => {
    if (!profile || locked) return
    Promise.resolve().then(() => loadWeeks(0))
  }, [profile, locked, loadWeeks])

  const onFollowClick = async () => {
    if (!profile || busy) return
    if (follow === 'none') {
      setBusy(true)
      const status = await followUser(profile, (name, s) =>
        t(s === 'pending' ? 'social.notifRequest' : 'social.notifFollow', { name: name || t('social.someone') }))
      setBusy(false)
      if (!status) { toast(t('common.error'), 'error'); return }
      setFollow(status)
      if (status === 'accepted') setStats(s => ({ ...s, followers: s.followers + 1 }))
      toast(status === 'pending' ? t('social.requestSent') : t('social.followed'))
      return
    }
    const ok = await confirm(follow === 'pending'
      ? { title: t('pub.cancelRequest'), confirmLabel: t('common.confirm'), danger: true }
      : { title: t('pub.unfollowTitle'), message: t('pub.unfollowText'), confirmLabel: t('pub.unfollow'), danger: true })
    if (!ok) return
    setBusy(true)
    const done = await unfollowUser(profile.id)
    setBusy(false)
    if (!done) { toast(t('common.error'), 'error'); return }
    if (follow === 'accepted') setStats(s => ({ ...s, followers: Math.max(0, s.followers - 1) }))
    toast(follow === 'pending' ? t('pub.requestCanceled') : t('pub.unfollowed'))
    setFollow('none')
  }

  const goBack = () => {
    if (window.history.length > 1) router.back()
    else router.push('/feed')
  }
  const closeSheet = useCallback(() => setOpened(null), [])

  const backButton = (
    <button onClick={goBack} aria-label={t('pub.back')} className={`${btn.icon} -ms-2 active:scale-95`}>
      <Icon name="chevronLeft" size={24} />
    </button>
  )

  /* ---- Chargement ---- */
  if (loading) {
    return (
      <div className={page}>
        {backButton}
        <div className="flex flex-col items-center sm:flex-row sm:items-center gap-5 mt-4">
          <Skeleton className="w-24 h-24 !rounded-full" />
          <div className="flex-1 w-full space-y-3 flex flex-col items-center sm:items-start">
            <Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-64" /><Skeleton className="h-10 w-56" />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-1 mt-8">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-square !rounded-lg" />)}
        </div>
      </div>
    )
  }

  /* ---- Introuvable ---- */
  if (notFound || !profile) {
    return (
      <div className={page}>
        {backButton}
        <EmptyState icon="user" title={t('pub.notFoundTitle')} text={t('pub.notFoundText')}
          action={<Link href="/feed" className={btn.secondary}>{t('pub.goFeed')}</Link>} />
      </div>
    )
  }

  const name = profileName(profile, t('common.user'))
  const showUsername = !!profile.username && profile.username !== name

  const followLabel = follow === 'accepted' ? t('social.followingState') : follow === 'pending' ? t('social.requested') : t('social.follow')

  return (
    <div className={`${page} md:max-w-4xl`}>
      <div className="flex items-center gap-2 mb-2">
        {backButton}
        <p className="font-semibold truncate">{showUsername ? `@${profile.username}` : name}</p>
      </div>

      {/* En-tête du profil */}
      <header className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-start gap-5 sm:gap-8 pt-2 pb-6 border-b border-line">
        <Avatar url={profile.avatar_url} name={name} size={104} ring />
        <div className="flex-1 min-w-0 w-full">
          <h1 className="text-2xl font-semibold tracking-tight flex items-center justify-center sm:justify-start gap-2">
            <span className="truncate">{name}</span>
            {profile.is_private && <Icon name="lock" size={16} className="text-subtle" />}
          </h1>
          {showUsername && <p className="text-sm text-muted mt-0.5">@{profile.username}</p>}
          {profile.bio && <p className="text-sm text-fg/85 mt-3 whitespace-pre-wrap leading-relaxed max-w-md mx-auto sm:mx-0">{profile.bio}</p>}

          {/* Chiffres */}
          <div className="grid grid-cols-3 max-w-sm mx-auto sm:mx-0 mt-5">
            {([['weeks', stats.weeks], ['followers', stats.followers], ['following', stats.following]] as const).map(([k, n]) => (
              <div key={k} className="text-center sm:text-start">
                <p className="text-lg font-semibold tabular-nums">{fmtNumber(n)}</p>
                <p className="text-xs text-muted">{t(`pub.${k}`)}</p>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex gap-2 mt-5 max-w-sm mx-auto sm:mx-0">
            <button onClick={onFollowClick} disabled={busy}
              className={`${follow === 'none' ? btn.primary : btn.secondary} flex-1`}>
              {busy ? <Spinner size={18} /> : <>{follow === 'accepted' && <Icon name="check" size={16} />}{followLabel}</>}
            </button>
            <Link href={`/messages?to=${profile.id}`} className={`${btn.secondary} flex-1`}>
              <Icon name="send" size={16} />{t('pub.message')}
            </Link>
          </div>
        </div>
      </header>

      {/* Semaines */}
      {locked ? (
        <EmptyState icon="lock" title={t('pub.lockedTitle')} text={t('pub.lockedText')} />
      ) : weeksLoading && weeks.length === 0 ? (
        <div className="grid grid-cols-3 gap-1 mt-1">
          {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-square !rounded-lg" />)}
        </div>
      ) : weeks.length === 0 ? (
        <EmptyState icon="grid" title={t('pub.noWeeksTitle')} text={t('pub.noWeeksText')} />
      ) : (
        <>
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-fg py-3">
            <Icon name="grid" size={14} />{t('pub.weeks')}
          </div>
          <div className="grid grid-cols-3 gap-1">
            {weeks.map(w => <WeekTile key={w.id} week={w} onClick={() => setOpened(w)} />)}
          </div>
          {hasMore && (
            <div className="flex justify-center mt-5">
              <button onClick={() => { setWeeksLoading(true); loadWeeks(weeks.length) }} disabled={weeksLoading} className={btn.secondary}>
                {weeksLoading ? <Spinner size={18} /> : t('feed.loadMore')}
              </button>
            </div>
          )}
        </>
      )}

      <WeekSheet week={opened} author={profile} me={me} onClose={closeSheet} />
    </div>
  )
}

// Vignette carrée : 1re photo de la semaine, sinon une carte texte
function WeekTile({ week, onClick }: { week: WeekRow, onClick: () => void }) {
  const { t } = useI18n()
  const cover = weekPhotos(week)[0]
  const first = weekEvents(week)[0]
  const label = t('social.weekShort', { n: week.week_number, year: week.year })
  const title = first?.text || week.title || t('common.untitled')

  return (
    <button onClick={onClick} aria-label={`${label} — ${title}`}
      className="group relative aspect-square overflow-hidden rounded-lg bg-surface border border-line active:scale-[0.98] transition">
      {cover ? (
        <>
          {isVideoUrl(cover)
            ? <video src={`${cover}#t=0.1`} muted playsInline preload="metadata" className="absolute inset-0 w-full h-full object-cover" />
            : <img src={cover} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />}
          {isVideoUrl(cover) && <span className="absolute top-2 end-2 text-white drop-shadow"><Icon name="play" size={16} filled /></span>}
          <span className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/70 to-transparent text-white text-[11px] font-medium text-start">{label}</span>
        </>
      ) : (
        <span className="absolute inset-0 flex flex-col justify-between p-2.5 sm:p-3 text-start bg-gradient-to-br from-brand-soft to-surface">
          <span className="text-xs sm:text-sm font-semibold leading-snug line-clamp-4 text-fg">{title}</span>
          <span className="text-[11px] text-muted font-medium">{label}</span>
        </span>
      )}
      <span className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition" />
    </button>
  )
}
