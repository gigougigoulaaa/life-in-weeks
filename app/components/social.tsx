'use client'
// Briques « réseau social » partagées par le fil (/feed) et les profils publics (/profile/<id>) :
// J'aime, commentaires, carte de semaine et fiche de semaine en lecture seule.
// Les tables reactions / comments peuvent ne pas exister encore (script supabase/social.sql
// pas encore lancé) : dans ce cas les boutons se masquent au lieu de faire planter la page.
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { isVideoUrl } from '@/lib/media'
import Icon from './Icon'
import { Avatar, EmptyState, Sheet, Skeleton, Spinner, btn, useUI } from './ui'

/* ------------------------------------------------------------------ */
/* Types et petites fonctions utiles                                   */
/* ------------------------------------------------------------------ */
export type WeekEvent = { text?: string, description?: string, photos?: string[], time?: string }
export type WeekRow = {
  id: string
  user_id: string
  year: number
  week_number: number
  title?: string | null
  content?: string | null
  visibility?: string | null
  days?: unknown
  location?: { lat: number, lng: number, name?: string } | null
  media_urls?: string[] | null
}
export type PublicProfile = {
  id: string
  username?: string | null
  full_name?: string | null
  avatar_url?: string | null
  bio?: string | null
  is_private?: boolean | null
}
export type FlatEvent = WeekEvent & { day: number }

// Colonnes de « weeks » à charger pour l'affichage social
export const WEEK_COLUMNS = 'id, user_id, year, week_number, title, content, visibility, days, location, media_urls'
export const PROFILE_COLUMNS = 'id, username, full_name, avatar_url, bio, is_private'

// Les 7 dates (lundi → dimanche) d'une semaine — même calcul que le calendrier
export function getWeekDates(year: number, week: number): Date[] {
  const jan1 = new Date(year, 0, 1)
  const dayOfWeek = jan1.getDay()
  const daysToFirstWeek = (dayOfWeek <= 1 ? 1 - dayOfWeek : 8 - dayOfWeek)
  const firstMonday = new Date(year, 0, 1 + daysToFirstWeek)
  const weekStart = new Date(firstMonday)
  weekStart.setDate(firstMonday.getDate() + (week - 1) * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })
}

// Tous les évènements de la semaine dans une seule liste, triés par jour puis par heure
export function weekEvents(week: WeekRow): FlatEvent[] {
  const days = Array.isArray(week.days) ? week.days : []
  const list: FlatEvent[] = []
  days.slice(0, 7).forEach((d: unknown, day: number) => {
    const raw = d && typeof d === 'object' ? (d as { events?: unknown }).events : null
    const events: unknown[] = Array.isArray(raw) ? raw : []
    for (const ev of events) if (ev && typeof ev === 'object') list.push({ ...(ev as WeekEvent), day })
  })
  // Sans heure = placé en fin de journée
  return list.sort((a, b) => a.day - b.day || (a.time || '99:99').localeCompare(b.time || '99:99'))
}

// Toutes les photos/vidéos de la semaine (évènements d'abord, puis médias de la semaine), sans doublon
export function weekPhotos(week: WeekRow): string[] {
  const urls: string[] = []
  for (const ev of weekEvents(week)) for (const u of ev.photos || []) if (typeof u === 'string' && u) urls.push(u)
  for (const u of week.media_urls || []) if (typeof u === 'string' && u) urls.push(u)
  return Array.from(new Set(urls))
}

export function profileName(p: PublicProfile | null | undefined, fallback: string): string {
  return p?.full_name?.trim() || p?.username?.trim() || fallback
}

// Lien vers le profil : le sien → /profile, sinon /profile/<id>
export const profileHref = (id: string, me?: string | null) => (id === me ? '/profile' : `/profile/${id}`)

// Moi (id + nom affiché), mémorisé pour ne pas relire le profil à chaque clic
let meCache: { id: string, name: string } | null = null
export async function getMe(): Promise<{ id: string, name: string } | null> {
  const { data } = await supabase.auth.getUser()
  const user = data.user
  if (!user) return null
  if (meCache?.id === user.id) return meCache
  const { data: p } = await supabase.from('profiles').select('full_name, username').eq('id', user.id).maybeSingle()
  meCache = { id: user.id, name: p?.full_name?.trim() || p?.username?.trim() || '' }
  return meCache
}

// Envoie une notification à quelqu'un. Une erreur ici ne doit jamais bloquer l'action principale.
export async function notify(userId: string, type: 'follow' | 'comment' | 'reaction', content: string) {
  try { await supabase.from('notifications').insert({ user_id: userId, type, content, is_read: false }) } catch {}
}

/* ------------------------------------------------------------------ */
/* Bouton J'aime                                                       */
/* ------------------------------------------------------------------ */
export function ReactionButton({ weekId, ownerId, weekNumber }: { weekId: string, ownerId: string, weekNumber?: number }) {
  const { t, fmtNumber } = useI18n()
  const { toast } = useUI()
  const [available, setAvailable] = useState(true)
  const [liked, setLiked] = useState(false)
  const [count, setCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [pop, setPop] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const me = await getMe()
      const { data, error } = await supabase.from('reactions').select('user_id').eq('week_id', weekId)
      if (!alive) return
      if (error) { setAvailable(false); return } // table absente ou accès refusé → bouton masqué
      setCount(data.length)
      setLiked(!!me && data.some(r => r.user_id === me.id))
    })()
    return () => { alive = false }
  }, [weekId])

  if (!available) return null

  const toggle = async () => {
    try { navigator.vibrate?.(10) } catch { /* ignoré */ }
    if (busy) return
    const me = await getMe()
    if (!me) return
    setBusy(true)
    const next = !liked
    // Affichage immédiat (optimiste), annulé si le serveur refuse
    setLiked(next)
    setCount(c => Math.max(0, c + (next ? 1 : -1)))
    if (next) { setPop(true); setTimeout(() => setPop(false), 300) }
    const { error } = next
      ? await supabase.from('reactions').insert({ week_id: weekId, user_id: me.id })
      : await supabase.from('reactions').delete().eq('week_id', weekId).eq('user_id', me.id)
    if (error && error.code !== '23505') { // 23505 = déjà aimé : pas une vraie erreur
      setLiked(!next)
      setCount(c => Math.max(0, c + (next ? -1 : 1)))
      toast(t('common.error'), 'error')
    } else if (next && ownerId !== me.id) {
      notify(ownerId, 'reaction', t('social.notifReaction', { name: me.name || t('social.someone'), n: weekNumber ?? '' }).replace(/\s+$/, ''))
    }
    setBusy(false)
  }

  return (
    <button onClick={toggle} aria-pressed={liked} aria-label={liked ? t('social.unlike') : t('social.like')}
      className={`inline-flex items-center gap-1.5 h-10 min-w-10 px-2.5 rounded-xl text-sm font-medium transition active:scale-95 hover:bg-surface-2 ${liked ? 'text-brand' : 'text-muted hover:text-fg'}`}>
      <span className={`inline-flex transition-transform duration-200 ${pop ? 'scale-125' : 'scale-100'}`}>
        <Icon name="heart" size={22} filled={liked} />
      </span>
      {count > 0 && <span className="tabular-nums">{fmtNumber(count)}</span>}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Commentaires                                                        */
/* ------------------------------------------------------------------ */
type CommentRow = { id: string, week_id: string, user_id: string, content: string, created_at: string }

export function CommentsSheet({ weekId, ownerId, open, onClose, weekNumber, onCountChange }: {
  weekId: string
  ownerId: string
  open: boolean
  onClose: () => void
  weekNumber?: number
  onCountChange?: (n: number) => void
}) {
  const { t, timeAgo } = useI18n()
  const { toast, confirm } = useUI()
  const [comments, setComments] = useState<CommentRow[]>([])
  const [authors, setAuthors] = useState<Record<string, PublicProfile>>({})
  const [me, setMe] = useState<{ id: string, name: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const listEnd = useRef<HTMLDivElement>(null)

  // Charge les profils manquants en une seule requête
  const loadAuthors = useCallback(async (ids: string[]) => {
    const missing = Array.from(new Set(ids))
    if (missing.length === 0) return
    const { data } = await supabase.from('profiles').select(PROFILE_COLUMNS).in('id', missing)
    if (data) setAuthors(prev => ({ ...prev, ...Object.fromEntries(data.map(p => [p.id, p])) }))
  }, [])

  useEffect(() => {
    if (!open) return
    let alive = true
    ;(async () => {
      setLoading(true)
      setFailed(false)
      setMe(await getMe())
      const { data, error } = await supabase.from('comments').select('id, week_id, user_id, content, created_at')
        .eq('week_id', weekId).order('created_at', { ascending: true }).limit(200)
      if (!alive) return
      if (error) { setFailed(true); setLoading(false); return }
      setComments(data)
      await loadAuthors(data.map(c => c.user_id))
      if (alive) setLoading(false)
    })()
    return () => { alive = false }
  }, [open, weekId, loadAuthors])

  const send = async (e: FormEvent) => {
    e.preventDefault()
    const content = text.trim().slice(0, 1000)
    if (!content || sending || !me) return
    setSending(true)
    const { data, error } = await supabase.from('comments')
      .insert({ week_id: weekId, user_id: me.id, content })
      .select('id, week_id, user_id, content, created_at').single()
    setSending(false)
    if (error || !data) { toast(t('common.error'), 'error'); return }
    const next = [...comments, data]
    setComments(next)
    onCountChange?.(next.length)
    setText('')
    loadAuthors([me.id])
    setTimeout(() => listEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50)
    if (ownerId !== me.id) {
      notify(ownerId, 'comment', t('social.notifComment', { name: me.name || t('social.someone'), n: weekNumber ?? '' }).replace(/\s+$/, ''))
    }
  }

  const remove = async (c: CommentRow) => {
    const ok = await confirm({ title: t('social.deleteComment'), message: t('social.deleteCommentText'), confirmLabel: t('common.delete'), danger: true })
    if (!ok) return
    const { error } = await supabase.from('comments').delete().eq('id', c.id)
    if (error) { toast(t('common.error'), 'error'); return }
    const next = comments.filter(x => x.id !== c.id)
    setComments(next)
    onCountChange?.(next.length)
    toast(t('social.commentDeleted'))
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('social.comments')}>
      <div className="flex flex-col min-h-[50dvh] md:min-h-[360px]">
        <div className="flex-1 px-5 py-4">
          {loading ? (
            <div className="space-y-5">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="w-9 h-9 !rounded-full shrink-0" />
                  <div className="flex-1 space-y-2"><Skeleton className="h-3 w-28" /><Skeleton className="h-3 w-full" /></div>
                </div>
              ))}
            </div>
          ) : failed ? (
            <EmptyState icon="info" title={t('social.unavailable')} />
          ) : comments.length === 0 ? (
            <EmptyState icon="message" title={t('social.noComments')} text={t('social.noCommentsText')} />
          ) : (
            <ul className="space-y-5">
              {comments.map(c => {
                const a = authors[c.user_id]
                const name = profileName(a, t('common.user'))
                const canDelete = !!me && (c.user_id === me.id || ownerId === me.id)
                return (
                  <li key={c.id} className="group flex gap-3 animate-fade-in">
                    <Link href={profileHref(c.user_id, me?.id)} onClick={onClose} className="shrink-0">
                      <Avatar url={a?.avatar_url} name={name} size={36} />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm">
                        <Link href={profileHref(c.user_id, me?.id)} onClick={onClose} className="font-semibold hover:underline">{name}</Link>
                        <span className="text-subtle text-xs ms-2">{timeAgo(c.created_at, true)}</span>
                      </p>
                      <p className="text-sm text-fg/90 mt-0.5 whitespace-pre-wrap break-words leading-relaxed">{c.content}</p>
                    </div>
                    {canDelete && (
                      <button onClick={() => remove(c)} aria-label={t('common.delete')}
                        className={`${btn.icon} shrink-0 -me-2 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 hover:!text-danger`}>
                        <Icon name="trash" size={16} />
                      </button>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <div ref={listEnd} />
        </div>

        {!failed && (
          <form onSubmit={send} className="sticky bottom-0 flex items-end gap-2 px-4 py-3 border-t border-line bg-surface">
            <textarea value={text} onChange={e => setText(e.target.value)} rows={1} maxLength={1000}
              placeholder={t('social.writeComment')} aria-label={t('social.writeComment')}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e) } }}
              className="flex-1 min-h-11 max-h-32 resize-none bg-surface-2 text-fg placeholder:text-subtle px-3.5 py-3 rounded-xl outline-none border border-line focus:border-brand/60 text-sm transition" />
            <button type="submit" disabled={!text.trim() || sending || !me} aria-label={t('social.send')}
              className="inline-flex items-center justify-center w-11 h-11 shrink-0 rounded-xl bg-brand text-ink hover:bg-brand-strong active:scale-95 transition disabled:opacity-40 disabled:pointer-events-none">
              {sending ? <Spinner size={18} /> : <Icon name="send" size={18} />}
            </button>
          </form>
        )}
      </div>
    </Sheet>
  )
}

export function CommentButton({ weekId, ownerId, weekNumber }: { weekId: string, ownerId: string, weekNumber?: number }) {
  const { t, fmtNumber } = useI18n()
  const [available, setAvailable] = useState(true)
  const [count, setCount] = useState(0)
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { count: n, error } = await supabase.from('comments').select('id', { count: 'exact', head: true }).eq('week_id', weekId)
      if (!alive) return
      if (error) { setAvailable(false); return }
      setCount(n || 0)
    })()
    return () => { alive = false }
  }, [weekId])

  if (!available) return null
  return (
    <>
      <button onClick={() => setOpen(true)} aria-label={t('social.comments')}
        className="inline-flex items-center gap-1.5 h-10 min-w-10 px-2.5 rounded-xl text-sm font-medium text-muted hover:text-fg hover:bg-surface-2 transition active:scale-95">
        <Icon name="message" size={21} />
        {count > 0 && <span className="tabular-nums">{fmtNumber(count)}</span>}
      </button>
      <CommentsSheet weekId={weekId} ownerId={ownerId} weekNumber={weekNumber} open={open} onClose={close} onCountChange={setCount} />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Médias                                                              */
/* ------------------------------------------------------------------ */
function MediaItem({ url, className = '' }: { url: string, className?: string }) {
  if (isVideoUrl(url)) {
    return <video src={`${url}#t=0.1`} controls playsInline preload="metadata" className={`bg-black ${className}`} />
  }
  return <img src={url} alt="" loading="lazy" className={`bg-surface-2 ${className}`} />
}

// 1 média = grande image ; plusieurs = grille 2×2 avec « +N » sur la dernière case
function MediaGrid({ urls, onOpen }: { urls: string[], onOpen?: () => void }) {
  if (urls.length === 0) return null
  if (urls.length === 1) {
    return (
      <div className="bg-black" onClick={isVideoUrl(urls[0]) ? undefined : onOpen} role={onOpen && !isVideoUrl(urls[0]) ? 'button' : undefined}>
        <MediaItem url={urls[0]} className="w-full max-h-[560px] object-cover" />
      </div>
    )
  }
  const shown = urls.slice(0, 4)
  const extra = urls.length - shown.length
  return (
    <div className="grid grid-cols-2 gap-0.5 bg-line">
      {shown.map((u, i) => {
        const wide = shown.length === 3 && i === 0
        const isLast = i === shown.length - 1 && extra > 0
        return (
          <div key={u} className={`relative overflow-hidden ${wide ? 'col-span-2 aspect-[2/1]' : 'aspect-square'}`}
            onClick={isVideoUrl(u) && !isLast ? undefined : onOpen}>
            <MediaItem url={u} className="absolute inset-0 w-full h-full object-cover" />
            {isLast && (
              <button type="button" onClick={onOpen}
                className="absolute inset-0 bg-black/55 flex items-center justify-center text-white text-2xl font-semibold">
                +{extra}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Carte de semaine (fil)                                              */
/* ------------------------------------------------------------------ */
export function WeekCard({ week, author, me, onOpen }: { week: WeekRow, author?: PublicProfile | null, me?: string | null, onOpen?: () => void }) {
  const { t, fmtShortDate } = useI18n()
  const dates = getWeekDates(week.year, week.week_number)
  const range = `${fmtShortDate(dates[0].toISOString())} – ${fmtShortDate(dates[6].toISOString())}`
  const events = weekEvents(week)
  const photos = weekPhotos(week)
  const name = profileName(author, t('common.user'))
  const shownEvents = events.length > 3 ? events.slice(0, 2) : events
  const href = profileHref(week.user_id, me)

  return (
    <article className="bg-surface border border-line rounded-2xl overflow-hidden animate-fade-in">
      {/* En-tête : auteur + semaine */}
      <header className="flex items-center gap-3 px-4 py-3">
        <Link href={href} className="shrink-0 rounded-full active:scale-95 transition"><Avatar url={author?.avatar_url} name={name} size={40} /></Link>
        <div className="min-w-0 flex-1">
          <Link href={href} className="block font-semibold text-sm truncate hover:underline">{name}</Link>
          <p className="text-xs text-subtle truncate">
            <span className="text-muted">{t('social.weekYear', { n: week.week_number, year: week.year })}</span> · {range}
          </p>
        </div>
        {week.user_id === me && (
          <Link href={`/calendar?y=${week.year}&w=${week.week_number}`} aria-label={t('social.openInCalendar')} title={t('social.openInCalendar')} className={btn.icon}>
            <Icon name="calendar" size={18} />
          </Link>
        )}
      </header>

      <MediaGrid urls={photos} onOpen={onOpen} />

      {/* Texte : titre, description, évènements */}
      {(week.title || week.content || events.length > 0 || week.location?.name) && (
        <div className={`px-4 pt-3 ${onOpen ? 'cursor-pointer' : ''}`} onClick={onOpen}>
          {week.title && <p className="font-semibold leading-snug">{week.title}</p>}
          {week.content && <p className="text-sm text-fg/85 mt-1 whitespace-pre-wrap line-clamp-3 leading-relaxed">{week.content}</p>}
          {shownEvents.length > 0 && (
            <ul className="mt-2 space-y-1">
              {shownEvents.map((ev, i) => (
                <li key={i} className="flex items-baseline gap-2 text-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand shrink-0 translate-y-[-2px]" />
                  <span className="truncate">{ev.text || t('common.untitled')}</span>
                  {ev.time && <span className="text-subtle text-xs shrink-0">{ev.time}</span>}
                </li>
              ))}
              {events.length > shownEvents.length && (
                <li className="text-xs text-muted ps-3.5">{t('social.moreEvents', { n: events.length - shownEvents.length })}</li>
              )}
            </ul>
          )}
          {week.location?.name && (
            <p className="flex items-center gap-1.5 text-xs text-muted mt-2"><Icon name="mapPin" size={14} /><span className="truncate">{week.location.name}</span></p>
          )}
        </div>
      )}

      {/* Actions */}
      <footer className="flex items-center gap-1 px-2 py-1.5">
        <ReactionButton weekId={week.id} ownerId={week.user_id} weekNumber={week.week_number} />
        <CommentButton weekId={week.id} ownerId={week.user_id} weekNumber={week.week_number} />
      </footer>
    </article>
  )
}

/* ------------------------------------------------------------------ */
/* Fiche complète d'une semaine, en lecture seule                      */
/* ------------------------------------------------------------------ */
export function WeekSheet({ week, author, me, onClose }: { week: WeekRow | null, author?: PublicProfile | null, me?: string | null, onClose: () => void }) {
  const { t, fmtStamp } = useI18n()
  if (!week) return null
  const dates = getWeekDates(week.year, week.week_number)
  const events = weekEvents(week)
  const extraMedia = (week.media_urls || []).filter(u => typeof u === 'string' && u)
  const name = profileName(author, t('common.user'))
  const empty = events.length === 0 && extraMedia.length === 0 && !week.content

  return (
    <Sheet open onClose={onClose} wide title={t('social.weekYear', { n: week.week_number, year: week.year })}>
      <div className="px-5 py-4 space-y-5">
        <Link href={profileHref(week.user_id, me)} onClick={onClose} className="flex items-center gap-3 w-fit">
          <Avatar url={author?.avatar_url} name={name} size={36} />
          <span className="font-semibold text-sm">{name}</span>
        </Link>

        {(week.title || week.content) && (
          <div>
            {week.title && <p className="text-lg font-semibold tracking-tight">{week.title}</p>}
            {week.content && <p className="text-sm text-fg/85 mt-1 whitespace-pre-wrap leading-relaxed">{week.content}</p>}
          </div>
        )}

        {week.location?.name && (
          <p className="flex items-center gap-1.5 text-sm text-muted"><Icon name="mapPin" size={16} />{week.location.name}</p>
        )}

        {events.length > 0 && (
          <ol className="space-y-4">
            {events.map((ev, i) => {
              const photos = (ev.photos || []).filter(Boolean)
              return (
                <li key={i} className="border-s-2 border-brand/50 ps-4">
                  <p className="text-xs text-subtle flex items-center gap-1.5">
                    <Icon name="clock" size={13} />{fmtStamp(dates[ev.day], ev.time || undefined)}
                  </p>
                  <p className="font-medium mt-0.5">{ev.text || t('common.untitled')}</p>
                  {ev.description && <p className="text-sm text-muted mt-1 whitespace-pre-wrap leading-relaxed">{ev.description}</p>}
                  {photos.length > 0 && (
                    <div className={`grid gap-1.5 mt-2 ${photos.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {photos.map((u, j) => (
                        <MediaItem key={j} url={u}
                          className={`w-full rounded-xl object-cover ${photos.length === 1 ? 'max-h-96' : 'aspect-square'}`} />
                      ))}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        )}

        {extraMedia.length > 0 && (
          <div>
            <p className="text-sm font-semibold mb-2">{t('social.media')}</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {extraMedia.map((u, j) => <MediaItem key={j} url={u} className="w-full aspect-square rounded-xl object-cover" />)}
            </div>
          </div>
        )}

        {empty && <p className="text-sm text-muted text-center py-6">{t('social.emptyWeek')}</p>}
      </div>
      <div className="sticky bottom-0 flex items-center gap-1 px-3 py-2 border-t border-line bg-surface">
        <ReactionButton weekId={week.id} ownerId={week.user_id} weekNumber={week.week_number} />
        <CommentButton weekId={week.id} ownerId={week.user_id} weekNumber={week.week_number} />
      </div>
    </Sheet>
  )
}

/* ------------------------------------------------------------------ */
/* Bouton Suivre (suggestions, profil public)                          */
/* ------------------------------------------------------------------ */
export type FollowState = 'none' | 'pending' | 'accepted'

// Ajoute un abonnement : « en attente » si le profil est privé, sinon direct. Prévient la personne.
// `message` fabrique le texte (traduit) de la notification à partir de mon nom.
export async function followUser(target: PublicProfile, message: (myName: string, status: FollowState) => string): Promise<FollowState | null> {
  const me = await getMe()
  if (!me) return null
  const status: FollowState = target.is_private ? 'pending' : 'accepted'
  const { error } = await supabase.from('follows').insert({ follower_id: me.id, following_id: target.id, status })
  if (error && error.code !== '23505') return null // 23505 = déjà abonné
  if (!error) notify(target.id, 'follow', message(me.name, status))
  return status
}

export async function unfollowUser(targetId: string): Promise<boolean> {
  const me = await getMe()
  if (!me) return false
  const { error } = await supabase.from('follows').delete().eq('follower_id', me.id).eq('following_id', targetId)
  return !error
}
