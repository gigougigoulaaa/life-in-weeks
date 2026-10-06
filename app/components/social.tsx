'use client'
// Briques « réseau social » partagées par le fil (/feed) et les profils publics (/profile/<id>) :
// J'aime, commentaires, carte de semaine et fiche de semaine en lecture seule.
// Les tables reactions / comments peuvent ne pas exister encore (script supabase/social.sql
// pas encore lancé) : dans ce cas les boutons se masquent au lieu de faire planter la page.
import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { isVideoUrl } from '@/lib/media'
import { APP_NAME } from '@/lib/appInfo'
import { blockUser, type ReportTarget } from '@/lib/moderation'
import Icon from './Icon'
import ReportSheet from './ReportSheet'
import EventCard from './EventCard'
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
// parent_id (réponses) et edited_at (modifié) viennent de supabase/settings.sql : peuvent ne pas exister encore.
type CommentRow = {
  id: string, week_id: string, user_id: string, content: string, created_at: string,
  parent_id?: string | null, edited_at?: string | null,
}

const COMMENT_BASE = 'id, week_id, user_id, content, created_at'
const UNDO_MS = 5000 // délai pendant lequel on peut annuler une suppression

// Vrai si l'erreur vient d'une colonne qui n'existe pas encore (script SQL pas lancé)
function isMissingColumn(err: { code?: string, message?: string } | null | undefined): boolean {
  if (!err) return false
  return err.code === '42703' || err.code === 'PGRST204' || /parent_id|edited_at/.test(err.message || '')
}

// Brouillon par semaine : pratique si on ferme la fenêtre par mégarde. Toujours en try/catch (navigation privée).
const draftKey = (weekId: string) => `liw-comment-draft-${weekId}`
function readDraft(weekId: string): string {
  try { return localStorage.getItem(draftKey(weekId)) || '' } catch { return '' }
}
function writeDraft(weekId: string, value: string) {
  try {
    if (value) localStorage.setItem(draftKey(weekId), value)
    else localStorage.removeItem(draftKey(weekId))
  } catch { /* ignoré */ }
}

async function fetchComments(weekId: string): Promise<{ data: CommentRow[] | null, error: boolean }> {
  const query = (cols: string) => supabase.from('comments').select(cols)
    .eq('week_id', weekId).order('created_at', { ascending: true }).limit(200)
  let res = await query(`${COMMENT_BASE}, parent_id, edited_at`)
  // Anciennes colonnes seulement si les nouvelles n'existent pas encore
  if (res.error) res = await query(COMMENT_BASE)
  if (res.error) return { data: null, error: true }
  return { data: res.data as unknown as CommentRow[], error: false }
}

// Insère un commentaire ; si parent_id n'existe pas encore, retombe sur un commentaire normal
async function insertComment(row: { week_id: string, user_id: string, content: string, parent_id?: string }) {
  const withParent = !!row.parent_id
  let res = await supabase.from('comments').insert(row)
    .select(withParent ? `${COMMENT_BASE}, parent_id` : COMMENT_BASE).single()
  if (res.error && withParent && isMissingColumn(res.error)) {
    const { parent_id: _ignored, ...plain } = row
    void _ignored
    res = await supabase.from('comments').insert(plain).select(COMMENT_BASE).single()
  }
  return { data: res.data as unknown as CommentRow | null, error: res.error }
}

// Modifie le texte ; si edited_at n'existe pas encore, on enregistre le texte seul
async function updateComment(id: string, content: string): Promise<{ ok: boolean, editedAt: string | null }> {
  const editedAt = new Date().toISOString()
  let res = await supabase.from('comments').update({ content, edited_at: editedAt }).eq('id', id).select('id')
  let stamp: string | null = editedAt
  if (res.error && isMissingColumn(res.error)) {
    res = await supabase.from('comments').update({ content }).eq('id', id).select('id')
    stamp = null
  }
  // Aucune ligne modifiée = refusé par les règles de sécurité
  return { ok: !res.error && (res.data?.length ?? 0) > 0, editedAt: stamp }
}

type ReplyTarget = { rootId: string, userId: string, name: string, mention: boolean }

export function CommentsSheet({ weekId, ownerId, open, onClose, weekNumber, onCountChange }: {
  weekId: string
  ownerId: string
  open: boolean
  onClose: () => void
  weekNumber?: number
  onCountChange?: (n: number) => void
}) {
  const { t, timeAgo } = useI18n()
  const { toast } = useUI()
  const [comments, setComments] = useState<CommentRow[]>([])
  const [authors, setAuthors] = useState<Record<string, PublicProfile>>({})
  const [me, setMe] = useState<{ id: string, name: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null)
  const [editing, setEditing] = useState<{ id: string, text: string } | null>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Suppressions en attente (annulables 5 s) : id → minuteur + commentaire retiré de l'écran
  const pending = useRef(new Map<string, { timer: ReturnType<typeof setTimeout>, row: CommentRow }>())
  // Dernières valeurs de t / toast, pour que les minuteurs n'utilisent jamais d'anciennes versions
  const latest = useRef({ t, toast })
  useEffect(() => { latest.current = { t, toast } })

  // Charge les profils manquants en une seule requête
  const loadAuthors = useCallback(async (ids: string[]) => {
    const missing = Array.from(new Set(ids))
    if (missing.length === 0) return
    const { data } = await supabase.from('profiles').select(PROFILE_COLUMNS).in('id', missing)
    if (data) setAuthors(prev => ({ ...prev, ...Object.fromEntries(data.map(p => [p.id, p])) }))
  }, [])

  // Supprime pour de bon un commentaire dont le délai d'annulation est écoulé
  const runDelete = useCallback(async (id: string) => {
    const entry = pending.current.get(id)
    if (!entry) return
    clearTimeout(entry.timer)
    pending.current.delete(id)
    const { error } = await supabase.from('comments').delete().eq('id', id)
    if (error) {
      // Échec : on remet le commentaire pour ne pas faire croire qu'il est supprimé
      setComments(prev => (prev.some(x => x.id === id) ? prev : [...prev, entry.row].sort((a, b) => a.created_at.localeCompare(b.created_at))))
      latest.current.toast(latest.current.t('common.error'), 'error')
    }
  }, [])

  // Exécute tout de suite les suppressions en attente (fermeture de la fenêtre, de la page…)
  const flushPending = useCallback(() => {
    for (const id of Array.from(pending.current.keys())) void runDelete(id)
  }, [runDelete])

  useEffect(() => { if (!open) flushPending() }, [open, flushPending])
  useEffect(() => {
    window.addEventListener('pagehide', flushPending)
    return () => {
      window.removeEventListener('pagehide', flushPending)
      flushPending()
      if (scrollTimer.current) clearTimeout(scrollTimer.current)
    }
  }, [flushPending])

  useEffect(() => {
    if (!open) return
    let alive = true
    ;(async () => {
      setLoading(true)
      setFailed(false)
      setReplyTo(null); setEditing(null); setMenuId(null)
      setText(readDraft(weekId))
      setMe(await getMe())
      const { data, error } = await fetchComments(weekId)
      if (!alive) return
      if (error || !data) { setFailed(true); setLoading(false); return }
      setComments(data)
      await loadAuthors(data.map(c => c.user_id))
      if (alive) setLoading(false)
    })()
    return () => { alive = false }
  }, [open, weekId, loadAuthors])

  // Le compteur du bouton suit la liste (ajout, suppression, annulation)
  useEffect(() => {
    if (open && !loading && !failed) onCountChange?.(comments.length)
  }, [comments.length, open, loading, failed, onCountChange])

  const changeText = (value: string) => { setText(value); writeDraft(weekId, value) }

  // Classement en fil : un seul niveau, toute réponse est rattachée au commentaire racine
  const byId = new Map(comments.map(c => [c.id, c]))
  const rootOf = (c: CommentRow): string => {
    let cur = c
    for (let i = 0; i < 20 && cur.parent_id && byId.has(cur.parent_id); i++) cur = byId.get(cur.parent_id)!
    return cur.id
  }
  const repliesByRoot = new Map<string, CommentRow[]>()
  const roots: CommentRow[] = []
  for (const c of comments) {
    const r = rootOf(c)
    if (r === c.id) roots.push(c)
    else repliesByRoot.set(r, [...(repliesByRoot.get(r) || []), c])
  }

  const nameOf = (userId: string) => profileName(authors[userId], t('common.user'))

  const startReply = (c: CommentRow) => {
    const rootId = rootOf(c)
    setEditing(null)
    setReplyTo({ rootId, userId: c.user_id, name: nameOf(c.user_id), mention: rootId !== c.id })
    inputRef.current?.focus()
  }

  const send = async (e?: { preventDefault: () => void }) => {
    e?.preventDefault()
    let content = text.trim()
    if (!content || sending || !me) return
    const target = replyTo
    if (target?.mention) content = `@${target.name} ${content}`
    content = content.slice(0, 1000)
    setSending(true)
    const { data, error } = await insertComment({ week_id: weekId, user_id: me.id, content, ...(target ? { parent_id: target.rootId } : {}) })
    setSending(false)
    if (error || !data) { toast(t('common.error'), 'error'); return }
    setComments(prev => [...prev, data])
    setText('')
    writeDraft(weekId, '')
    setReplyTo(null)
    loadAuthors([me.id])
    if (scrollTimer.current) clearTimeout(scrollTimer.current)
    scrollTimer.current = setTimeout(() => document.getElementById(`comment-${data.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)

    // Prévenir l'auteur du commentaire auquel on répond, puis le propriétaire de la semaine,
    // sans jamais prévenir soi-même ni la même personne deux fois
    const who = me.name || t('social.someone')
    const notified = new Set([me.id])
    if (target && !notified.has(target.userId)) {
      notified.add(target.userId)
      notify(target.userId, 'comment', t('social.notifReply', { name: who }))
    }
    if (!notified.has(ownerId)) {
      notify(ownerId, 'comment', t('social.notifComment', { name: who, n: weekNumber ?? '' }).replace(/\s+$/, ''))
    }
  }

  // Suppression avec annulation : le commentaire disparaît tout de suite, la base est mise à jour après 5 s
  const remove = (c: CommentRow) => {
    setMenuId(null)
    setComments(prev => prev.filter(x => x.id !== c.id))
    if (replyTo?.rootId === c.id) setReplyTo(null)
    const timer = setTimeout(() => { void runDelete(c.id) }, UNDO_MS)
    pending.current.set(c.id, { timer, row: c })
    toast(t('social.commentDeleted'), 'success', {
      duration: UNDO_MS,
      action: { label: t('common.undo'), onClick: () => undoRemove(c.id) },
    })
  }

  const undoRemove = (id: string) => {
    const entry = pending.current.get(id)
    if (!entry) return
    clearTimeout(entry.timer)
    pending.current.delete(id)
    setComments(prev => [...prev, entry.row].sort((a, b) => a.created_at.localeCompare(b.created_at)))
  }

  const saveEdit = async () => {
    if (!editing || savingEdit) return
    const content = editing.text.trim().slice(0, 1000)
    const original = comments.find(c => c.id === editing.id)
    if (!content) return
    if (original && original.content === content) { setEditing(null); return }
    setSavingEdit(true)
    const res = await updateComment(editing.id, content)
    setSavingEdit(false)
    if (!res.ok) { toast(t('common.error'), 'error'); return }
    setComments(prev => prev.map(c => (c.id === editing.id ? { ...c, content, edited_at: res.editedAt ?? c.edited_at } : c)))
    setEditing(null)
  }

  const itemClass = 'w-full h-10 px-3 rounded-lg flex items-center gap-2.5 text-sm text-start hover:bg-surface-3 transition'

  const renderComment = (c: CommentRow, isReply: boolean) => {
    const a = authors[c.user_id]
    const name = profileName(a, t('common.user'))
    const mine = !!me && c.user_id === me.id
    const canDelete = mine || (!!me && ownerId === me.id) // le propriétaire de la semaine peut modérer
    const isEditing = editing?.id === c.id
    const menuOpen = menuId === c.id
    return (
      <li key={c.id} id={`comment-${c.id}`} className={`flex gap-3 animate-fade-in ${isReply ? 'ms-10' : ''}`}>
        <Link href={profileHref(c.user_id, me?.id)} onClick={onClose} className="shrink-0">
          <Avatar url={a?.avatar_url} name={name} size={isReply ? 28 : 36} />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="text-sm">
            <Link href={profileHref(c.user_id, me?.id)} onClick={onClose} className="font-semibold hover:underline">{name}</Link>
            <span className="text-subtle text-xs ms-2">{timeAgo(c.created_at, true)}</span>
            {c.edited_at && <span className="text-subtle text-xs ms-1.5">· {t('social.edited')}</span>}
          </p>
          {isEditing ? (
            <div className="mt-1.5 space-y-2">
              <textarea value={editing.text} onChange={e => setEditing({ id: c.id, text: e.target.value })} rows={3} maxLength={1000} autoFocus
                aria-label={t('social.edit')}
                className="w-full resize-none bg-surface-2 text-fg px-3.5 py-3 rounded-xl outline-none border border-line focus:border-brand/60 text-sm transition" />
              <div className="flex gap-2">
                <button type="button" onClick={saveEdit} disabled={!editing.text.trim() || savingEdit} className={`${btn.primary} h-10 px-4`}>
                  {savingEdit && <Spinner size={14} />}{t('social.saveEdit')}
                </button>
                <button type="button" onClick={() => setEditing(null)} className={`${btn.secondary} h-10 px-4`}>{t('common.cancel')}</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-fg/90 mt-0.5 whitespace-pre-wrap break-words leading-relaxed">{c.content}</p>
          )}
          {!isEditing && me && (
            <button type="button" onClick={() => startReply(c)}
              className="mt-0.5 -ms-2 inline-flex items-center gap-1.5 h-10 px-2 rounded-lg text-xs font-medium text-muted hover:text-fg hover:bg-surface-2 transition active:scale-95">
              <Icon name="reply" size={15} />{t('social.reply')}
            </button>
          )}
        </div>
        {me && !isEditing && (
          <div className="relative shrink-0 -me-2">
            <button type="button" onClick={() => setMenuId(menuOpen ? null : c.id)} aria-label={t('common.more')} aria-expanded={menuOpen} className={btn.icon}>
              <Icon name="dots" size={18} />
            </button>
            {menuOpen && (
              <>
                {/* Zone invisible : un clic à côté referme le menu */}
                <button type="button" aria-hidden tabIndex={-1} onClick={() => setMenuId(null)} className="fixed inset-0 z-10 cursor-default" />
                <div role="menu" className="absolute end-0 top-10 z-20 min-w-48 p-1 rounded-xl bg-surface-2 border border-line-strong shadow-2xl animate-pop-in">
                  {mine && (
                    <button role="menuitem" type="button" className={itemClass}
                      onClick={() => { setMenuId(null); setReplyTo(null); setEditing({ id: c.id, text: c.content }) }}>
                      <Icon name="pencil" size={16} />{t('social.edit')}
                    </button>
                  )}
                  {canDelete && (
                    <button role="menuitem" type="button" className={`${itemClass} text-danger`} onClick={() => remove(c)}>
                      <Icon name="trash" size={16} />{t('common.delete')}
                    </button>
                  )}
                  {!mine && (
                    <button role="menuitem" type="button" className={itemClass}
                      onClick={() => { setMenuId(null); setReportTarget({ type: 'comment', id: c.id, userId: c.user_id }) }}>
                      <Icon name="flag" size={16} />{t('mod.report')}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </li>
    )
  }

  return (
    <>
      {/* Pendant le signalement, Échap ne ferme que la fenêtre de signalement */}
      <Sheet open={open} onClose={reportTarget ? () => {} : onClose} title={t('social.comments')}>
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
              <ul className="space-y-3 pb-16">
                {roots.map(c => (
                  <li key={c.id} className="list-none">
                    <ul className="space-y-1">
                      {renderComment(c, false)}
                      {(repliesByRoot.get(c.id) || []).map(r => renderComment(r, true))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {!failed && (
            <form onSubmit={send} className="sticky bottom-0 border-t border-line bg-surface">
              {replyTo && (
                <div className="flex items-center gap-2 ps-4 pe-1 pt-1 text-xs text-muted">
                  <Icon name="reply" size={14} />
                  <span className="flex-1 truncate">{t('social.replyingTo', { name: replyTo.name })}</span>
                  <button type="button" onClick={() => setReplyTo(null)} aria-label={t('common.cancel')} className={btn.icon}>
                    <Icon name="x" size={16} />
                  </button>
                </div>
              )}
              <div className="flex items-end gap-2 px-4 py-3">
                <textarea ref={inputRef} value={text} onChange={e => changeText(e.target.value)} rows={1} maxLength={1000}
                  placeholder={replyTo ? t('social.writeReply') : t('social.writeComment')} aria-label={replyTo ? t('social.writeReply') : t('social.writeComment')}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e) } }}
                  className="flex-1 min-h-11 max-h-32 resize-none bg-surface-2 text-fg placeholder:text-subtle px-3.5 py-3 rounded-xl outline-none border border-line focus:border-brand/60 text-sm transition" />
                <button type="submit" disabled={!text.trim() || sending || !me} aria-label={t('social.send')}
                  className="inline-flex items-center justify-center w-11 h-11 shrink-0 rounded-xl bg-brand text-ink hover:bg-brand-strong active:scale-95 transition disabled:opacity-40 disabled:pointer-events-none">
                  {sending ? <Spinner size={18} /> : <Icon name="send" size={18} />}
                </button>
              </div>
            </form>
          )}
        </div>
      </Sheet>
      <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />
    </>
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
/* Menu « ⋯ » d'une semaine d'autrui : signaler / bloquer              */
/* ------------------------------------------------------------------ */
export function WeekMenu({ week, author, me, onBlocked }: {
  week: WeekRow
  author?: PublicProfile | null
  me?: string | null
  onBlocked?: (userId: string) => void
}) {
  const { t } = useI18n()
  const { toast, confirm } = useUI()
  const [open, setOpen] = useState(false)
  const [reporting, setReporting] = useState(false)
  const closeMenu = useCallback(() => setOpen(false), [])
  // Pas de menu sur mes propres semaines
  if (!me || week.user_id === me) return null
  const name = profileName(author, t('common.user'))

  const block = async () => {
    setOpen(false)
    const ok = await confirm({ title: t('mod.blockTitle', { name }), message: t('mod.blockText'), confirmLabel: t('mod.block'), danger: true })
    if (!ok) return
    if (!(await blockUser(week.user_id))) { toast(t('mod.blockFailed'), 'error'); return }
    toast(t('mod.blocked', { name }))
    onBlocked?.(week.user_id)
  }

  const itemClass = 'w-full min-h-12 px-3 rounded-xl flex items-center gap-3 text-sm text-start hover:bg-surface-2 transition active:scale-[0.99]'
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={t('common.more')} className={btn.icon}>
        <Icon name="dots" size={20} />
      </button>
      <Sheet open={open} onClose={closeMenu} title={t('common.more')}>
        <div className="p-3 space-y-1">
          <button type="button" className={itemClass} onClick={() => { setOpen(false); setReporting(true) }}>
            <Icon name="flag" size={18} />{t('social.reportWeek')}
          </button>
          <button type="button" className={`${itemClass} text-danger`} onClick={block}>
            <Icon name="ban" size={18} />{t('social.blockPerson', { name })}
          </button>
        </div>
      </Sheet>
      <ReportSheet target={reporting ? { type: 'week', id: week.id, userId: week.user_id } : null} onClose={() => setReporting(false)} />
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Inviter des amis : partage natif, sinon copie du lien               */
/* ------------------------------------------------------------------ */
export function InviteButton({ className = btn.secondary }: { className?: string }) {
  const { t } = useI18n()
  const { toast } = useUI()
  const invite = async () => {
    const url = window.location.origin
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: APP_NAME, text: t('social.inviteText'), url })
        return
      } catch (e) {
        if (e instanceof Error && e.name === 'AbortError') return // la personne a fermé la fenêtre de partage
        // autre erreur : on essaie de copier le lien
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      toast(t('common.copied'))
    } catch {
      toast(t('common.error'), 'error')
    }
  }
  return (
    <button type="button" onClick={invite} className={className}>
      <Icon name="share" size={18} />{t('social.invite')}
    </button>
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
export function WeekCard({ week, author, me, onOpen, onBlocked }: {
  week: WeekRow, author?: PublicProfile | null, me?: string | null, onOpen?: () => void,
  // Appelé après le blocage de l'auteur : le fil retire alors ses semaines de la liste
  onBlocked?: (userId: string) => void
}) {
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
        {week.user_id === me ? (
          <Link href={`/calendar?y=${week.year}&w=${week.week_number}`} aria-label={t('social.openInCalendar')} title={t('social.openInCalendar')} className={btn.icon}>
            <Icon name="calendar" size={18} />
          </Link>
        ) : (
          <WeekMenu week={week} author={author} me={me} onBlocked={onBlocked} />
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
export function WeekSheet({ week, author, me, onClose, onBlocked }: {
  week: WeekRow | null, author?: PublicProfile | null, me?: string | null, onClose: () => void,
  onBlocked?: (userId: string) => void
}) {
  const { t, fmtStamp } = useI18n()
  if (!week) return null
  const dates = getWeekDates(week.year, week.week_number)
  const events = weekEvents(week)
  const extraMedia = (week.media_urls || []).filter(u => typeof u === 'string' && u)
  const name = profileName(author, t('common.user'))
  const empty = events.length === 0 && extraMedia.length === 0 && !week.content

  return (
    <Sheet open onClose={onClose} wide title={t('social.weekYear', { n: week.week_number, year: week.year })}
      headerExtra={<WeekMenu week={week} author={author} me={me} onBlocked={id => { onBlocked?.(id); onClose() }} />}>
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
          <div className="space-y-9">
            {events.map((ev, i) => (
              <EventCard key={i} ev={ev} date={fmtStamp(dates[ev.day], ev.time || undefined)} />
            ))}
          </div>
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
