'use client'
// Messagerie privée : liste des conversations + fil de discussion.
// Téléphone : liste OU conversation en plein écran. Ordinateur : deux colonnes.
// Fonctions : photos, suppression avec « Annuler », « Lu / Envoyé », menu de la conversation
// (profil, sourdine, blocage, signalement) et brouillons conservés par conversation.
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { uploadMedia, checkMedia, MAX_IMAGE_MB } from '@/lib/media'
import { blockUser, type ReportTarget } from '@/lib/moderation'
import { getNotifPrefs, toggleMuted } from '@/lib/notifPrefs'
import Icon from '@/app/components/Icon'
import ReportSheet from '@/app/components/ReportSheet'
import { Avatar, EmptyState, Sheet, Skeleton, Spinner, useUI, input } from '@/app/components/ui'
import type { RealtimeChannel } from '@supabase/supabase-js'

type Profile = { id: string, username?: string | null, full_name?: string | null, avatar_url?: string | null }
type Message = {
  id: string, sender_id: string, receiver_id: string, content: string,
  is_read: boolean, created_at: string, pending?: boolean, media_url?: string | null,
}
type Conversation = { user: Profile, lastMessage: Message }
type DbError = { message?: string, code?: string } | null

const PROFILE_FIELDS = 'id, username, full_name, avatar_url'
const UNDO_DELAY = 5000 // temps pour annuler une suppression (ms)
const displayName = (p?: Profile | null) => p?.full_name || p?.username || ''
const firstName = (p?: Profile | null) => (p?.full_name || '').split(' ')[0] || p?.username || ''
// Même jour calendaire (pour les séparateurs « Aujourd'hui », « Hier »…)
const dayKey = (d: string) => new Date(d).toDateString()

// Ajoute un message sans jamais créer de doublon (il peut arriver deux fois : envoi + temps réel)
const addUnique = (list: Message[], m: Message) => list.some(x => x.id === m.id) ? list : [...list, m]

// Brouillons : le stockage du navigateur peut être indisponible (navigation privée…), donc try/catch partout
const draftKey = (uid: string, other: string) => `liw-draft-${uid}-${other}`
const readDraft = (uid: string | null, other: string): string => {
  if (!uid) return ''
  try { return window.localStorage.getItem(draftKey(uid, other)) || '' } catch { return '' }
}
const writeDraft = (uid: string, other: string, text: string) => {
  try {
    if (text.trim()) window.localStorage.setItem(draftKey(uid, other), text)
    else window.localStorage.removeItem(draftKey(uid, other))
  } catch { /* stockage indisponible : on ignore, le brouillon ne sera juste pas gardé */ }
}

// La colonne media_url n'existe peut-être pas encore (settings.sql pas lancé)
const isMissingColumn = (e: DbError) => !!e && (e.code === 'PGRST204' || e.code === '42703' || /media_url/i.test(e.message || ''))
// Refus des règles de sécurité : personne qui m'a bloqué, ou réglage « seulement les personnes qu'elle suit »
const isDenied = (e: DbError) => !!e && (e.code === '42501' || /row-level security|violates/i.test(e.message || ''))

export default function MessagesPage() {
  const { t, lang, timeAgo, fmtShortDate } = useI18n()
  const { toast, confirm } = useUI()

  const [me, setMe] = useState<string | null>(null)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [following, setFollowing] = useState<Profile[]>([])

  const [selected, setSelected] = useState<Profile | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [loadingConv, setLoadingConv] = useState(false)
  const [draft, setDraft] = useState('')

  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Profile[]>([])
  const [searching, setSearching] = useState(false)

  // Photo choisie (pas encore envoyée) + état d'envoi
  const [photo, setPhoto] = useState<{ file: File, url: string } | null>(null)
  const [sendingPhoto, setSendingPhoto] = useState(false)
  const [viewImage, setViewImage] = useState<string | null>(null)

  // Menus : actions sur un message, menu de la conversation, signalement
  const [menuMsg, setMenuMsg] = useState<Message | null>(null)
  const [headerMenu, setHeaderMenu] = useState(false)
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null)
  const [muted, setMuted] = useState<string[]>([])

  // Messages masqués en attente de suppression définitive (annulation possible)
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const pendingDeletes = useRef(new Map<string, ReturnType<typeof setTimeout>>())

  // Un seul abonnement temps réel à la fois pour la conversation ouverte
  const convChannel = useRef<RealtimeChannel | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef<{ file: File, url: string } | null>(null)
  const openIdRef = useRef<string | undefined>(undefined)
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pressFired = useRef(false)

  /* ---------------- Chargement de la liste des conversations ---------------- */
  const loadConversations = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('messages')
      .select(`*, sender:sender_id(${PROFILE_FIELDS}), receiver:receiver_id(${PROFILE_FIELDS})`)
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(500)
    setLoadingList(false)
    if (error || !data) return
    // On garde seulement le dernier message de chaque personne
    const seen = new Set<string>()
    const convos: Conversation[] = []
    for (const msg of data as (Message & { sender: Profile | null, receiver: Profile | null })[]) {
      const otherId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id
      if (seen.has(otherId)) continue
      seen.add(otherId)
      const other = msg.sender_id === userId ? msg.receiver : msg.sender
      convos.push({ user: other || { id: otherId }, lastMessage: msg })
    }
    setConversations(convos)
  }, [])

  // Au démarrage : utilisateur connecté, conversations, personnes suivies, lien profond ?to=
  useEffect(() => {
    let cancelled = false
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.href = '/login'; return }
      if (cancelled) return
      const uid = data.user.id
      setMe(uid)
      loadConversations(uid)

      // Personnes suivies (pour « Commencer une conversation »)
      supabase.from('follows').select('following_id').eq('follower_id', uid).eq('status', 'accepted').limit(30)
        .then(async ({ data: f }) => {
          const ids = (f || []).map(x => x.following_id)
          if (!ids.length || cancelled) return
          const { data: profs } = await supabase.from('profiles').select(PROFILE_FIELDS).in('id', ids)
          if (!cancelled) setFollowing(profs || [])
        })

      // Lien profond : /messages?to=<id> ouvre directement la conversation
      const to = new URLSearchParams(window.location.search).get('to')
      if (to && to !== uid) {
        const { data: p } = await supabase.from('profiles').select(PROFILE_FIELDS).eq('id', to).maybeSingle()
        if (p && !cancelled) { setLoadingConv(true); setSelected(p); setDraft(readDraft(uid, p.id)) }
      }
    })
    return () => { cancelled = true }
  }, [loadConversations])

  // Conversations en sourdine (réglage enregistré sur le profil)
  useEffect(() => {
    if (!me) return
    let cancelled = false
    getNotifPrefs().then(p => { if (!cancelled) setMuted(p.muted || []) })
    return () => { cancelled = true }
  }, [me])

  // Temps réel pour la liste : chaque message reçu la rafraîchit
  useEffect(() => {
    if (!me) return
    const channel = supabase
      .channel(`inbox-${me}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${me}` },
        () => loadConversations(me))
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [me, loadConversations])

  // Mémorise la conversation ouverte pour les réponses qui arrivent après un changement de conversation
  useEffect(() => { openIdRef.current = selected?.id }, [selected])

  /* ---------------- Conversation ouverte ---------------- */
  const markRead = useCallback(async (userId: string, otherId: string) => {
    await supabase.from('messages').update({ is_read: true })
      .eq('sender_id', otherId).eq('receiver_id', userId).eq('is_read', false)
    // Retire la pastille « non lu » localement
    setConversations(prev => prev.map(c => c.user.id === otherId && c.lastMessage.receiver_id === userId
      ? { ...c, lastMessage: { ...c.lastMessage, is_read: true } } : c))
  }, [])

  const otherId = selected?.id
  useEffect(() => {
    if (!me || !otherId) return
    let cancelled = false

    supabase.from('messages').select('*')
      .or(`and(sender_id.eq.${me},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${me})`)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return
        setLoadingConv(false)
        if (error) { toast(t('msg.loadError'), 'error'); return }
        // Fusion avec ce qui serait déjà arrivé par le temps réel pendant le chargement
        setMessages(prev => prev.reduce(addUnique, (data || []) as Message[]))
        markRead(me, otherId)
      })

    // On ferme l'ancien canal avant d'en ouvrir un nouveau (évite fuites et doublons)
    if (convChannel.current) supabase.removeChannel(convChannel.current)
    const onInsert = (payload: { new: unknown }) => {
      const msg = payload.new as Message
      const concerns = (msg.sender_id === me && msg.receiver_id === otherId) || (msg.sender_id === otherId && msg.receiver_id === me)
      if (!concerns) return
      setMessages(prev => addUnique(prev, msg))
      if (msg.sender_id === otherId) markRead(me, otherId)
    }
    // Mise à jour d'un de MES messages (l'autre personne l'a lu) : rafraîchit « Envoyé » → « Lu »
    const onUpdate = (payload: { new: unknown }) => {
      const msg = payload.new as Message
      if (msg.sender_id !== me || msg.receiver_id !== otherId) return
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, is_read: msg.is_read } : m))
    }
    convChannel.current = supabase
      .channel(`conv-${me}-${otherId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${me}` }, onInsert)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `sender_id=eq.${me}` }, onInsert)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `sender_id=eq.${me}` }, onUpdate)
      .subscribe()

    return () => {
      cancelled = true
      if (convChannel.current) { supabase.removeChannel(convChannel.current); convChannel.current = null }
    }
  }, [me, otherId, markRead, toast, t])

  // Défilement automatique vers le dernier message
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages, otherId])

  /* ---------------- Recherche de personnes (attente de 250 ms) ---------------- */
  useEffect(() => {
    const q = query.trim().replace(/[%,()*]/g, '')
    if (!q || !me) return
    const timer = setTimeout(async () => {
      const { data } = await supabase.from('profiles').select(PROFILE_FIELDS)
        .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`).neq('id', me).limit(8)
      setResults(data || [])
      setSearching(false)
    }, 250)
    return () => clearTimeout(timer)
  }, [query, me])

  /* ---------------- Photo à envoyer ---------------- */
  const clearPhoto = useCallback(() => {
    if (photoRef.current) URL.revokeObjectURL(photoRef.current.url)
    photoRef.current = null
    setPhoto(null)
  }, [])
  // À la fermeture de la page, on libère l'aperçu
  useEffect(() => () => { if (photoRef.current) URL.revokeObjectURL(photoRef.current.url) }, [])

  const pickPhoto = (file?: File) => {
    if (!file) return
    const problem = file.type.startsWith('image/') ? checkMedia(file) : 'unsupported'
    if (problem) {
      toast(problem === 'tooBig' ? t('media.tooBig', { n: MAX_IMAGE_MB }) : problem === 'unsupported' ? t('media.unsupported') : t('media.failed'), 'error')
      return
    }
    if (photoRef.current) URL.revokeObjectURL(photoRef.current.url)
    const next = { file, url: URL.createObjectURL(file) }
    photoRef.current = next
    setPhoto(next)
  }

  /* ---------------- Ouverture d'une conversation ---------------- */
  const openConversation = (p: Profile) => {
    if (p.id !== selected?.id) { setMessages([]); setLoadingConv(true); clearPhoto() }
    setSelected(p)
    setQuery('')
    setResults([])
    // Le brouillon de cette conversation (s'il y en a un) revient dans le champ
    setDraft(readDraft(me, p.id))
  }

  /* ---------------- Saisie : le brouillon est gardé à chaque frappe ---------------- */
  const updateDraft = (value: string) => {
    setDraft(value)
    if (me && selected) writeDraft(me, selected.id, value)
  }

  // Le champ grandit avec le texte, jusqu'à 4 lignes
  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 116)}px`
  }, [])
  useEffect(() => { resizeTextarea() }, [draft, otherId, resizeTextarea])

  /* ---------------- Envoi ---------------- */
  const send = async () => {
    const content = draft.trim()
    if ((!content && !photo) || !me || !selected || sendingPhoto) return
    const to = selected
    const insert = (row: Record<string, unknown>) => supabase.from('messages').insert(row).select().single()
    const base = { sender_id: me, receiver_id: to.id, content }

    // Remet le texte dans le champ si l'envoi échoue (sans écraser ce qui a été retapé entre-temps)
    const keepText = () => {
      writeDraft(me, to.id, content)
      if (openIdRef.current === to.id) setDraft(cur => cur || content)
    }
    const finish = (msg: Message) => {
      if (openIdRef.current === to.id) setMessages(prev => addUnique(prev, msg))
      setConversations(prev => [{ user: to, lastMessage: msg }, ...prev.filter(c => c.user.id !== to.id)])
    }

    /* Avec photo : on envoie d'abord le fichier, puis le message (le texte reste dans le champ en attendant) */
    if (photo) {
      setSendingPhoto(true)
      const up = await uploadMedia('weeks-media', `${me}/messages`, photo.file)
      if (up.error || !up.url) {
        setSendingPhoto(false)
        toast(up.error === 'tooBig' ? t('media.tooBig', { n: MAX_IMAGE_MB }) : up.error === 'unsupported' ? t('media.unsupported') : t('media.failed'), 'error')
        return
      }
      let { data, error } = await insert({ ...base, media_url: up.url })
      let photoDropped = false
      // Colonne media_url absente : on envoie le texte seul (s'il y en a) et on prévient pour la photo
      if (error && isMissingColumn(error)) {
        photoDropped = true
        if (content) ({ data, error } = await insert(base))
      }
      setSendingPhoto(false)
      if (error || !data) {
        toast(photoDropped ? t('msg.photoError') : isDenied(error) ? t('msg.cannotSend') : t('msg.sendError'), 'error')
        return
      }
      if (photoDropped) toast(t('msg.photoError'), 'error')
      writeDraft(me, to.id, '')
      if (openIdRef.current === to.id) setDraft('')
      clearPhoto()
      finish(data as Message)
      return
    }

    /* Texte seul : optimiste, affiché tout de suite */
    const tempId = `tmp-${Date.now()}`
    const temp: Message = { id: tempId, sender_id: me, receiver_id: to.id, content, is_read: false, created_at: new Date().toISOString(), pending: true }
    setMessages(prev => [...prev, temp])
    writeDraft(me, to.id, '')
    setDraft('')

    const { data, error } = await insert(base)
    if (error || !data) {
      setMessages(prev => prev.filter(m => m.id !== tempId))
      keepText()
      toast(isDenied(error) ? t('msg.cannotSend') : t('msg.sendError'), 'error')
      return
    }
    // Remplace le message temporaire par le vrai (sauf s'il est déjà arrivé par le temps réel)
    setMessages(prev => prev.some(m => m.id === data.id)
      ? prev.filter(m => m.id !== tempId)
      : prev.map(m => m.id === tempId ? (data as Message) : m))
    setConversations(prev => [{ user: to, lastMessage: data as Message }, ...prev.filter(c => c.user.id !== to.id)])
  }

  /* ---------------- Suppression avec « Annuler » ---------------- */
  // Le message disparaît tout de suite ; la vraie suppression a lieu après quelques secondes.
  const commitDelete = useCallback(async (id: string) => {
    pendingDeletes.current.delete(id)
    const { error } = await supabase.from('messages').delete().eq('id', id)
    if (error) {
      setHidden(prev => { const n = new Set(prev); n.delete(id); return n })
      toast(t('msg.deleteError'), 'error')
    } else if (me) {
      loadConversations(me)
    }
  }, [me, loadConversations, toast, t])

  const startDelete = (m: Message) => {
    setMenuMsg(null)
    setHidden(prev => new Set(prev).add(m.id))
    const timer = setTimeout(() => commitDelete(m.id), UNDO_DELAY)
    pendingDeletes.current.set(m.id, timer)
    toast(t('msg.deleted'), 'success', {
      duration: UNDO_DELAY,
      action: {
        label: t('common.undo'),
        onClick: () => {
          if (!pendingDeletes.current.has(m.id)) return // trop tard, déjà supprimé
          clearTimeout(pendingDeletes.current.get(m.id))
          pendingDeletes.current.delete(m.id)
          setHidden(prev => { const n = new Set(prev); n.delete(m.id); return n })
        },
      },
    })
  }

  // Si la personne quitte la page avant la fin du délai, les suppressions en attente sont exécutées quand même
  useEffect(() => {
    const pending = pendingDeletes.current
    const flush = () => {
      pending.forEach((timer, id) => {
        clearTimeout(timer)
        supabase.from('messages').delete().eq('id', id).then(() => {})
      })
      pending.clear()
    }
    window.addEventListener('pagehide', flush)
    return () => { window.removeEventListener('pagehide', flush); flush() }
  }, [])

  const copyText = async (m: Message) => {
    setMenuMsg(null)
    try { await navigator.clipboard.writeText(m.content); toast(t('msg.textCopied')) }
    catch { toast(t('common.error'), 'error') }
  }

  // Appui long (téléphone) sur mes messages
  const cancelPress = () => { if (pressTimer.current) { clearTimeout(pressTimer.current); pressTimer.current = null } }
  const startPress = (m: Message) => {
    cancelPress()
    pressFired.current = false
    pressTimer.current = setTimeout(() => { pressFired.current = true; setMenuMsg(m) }, 450)
  }
  useEffect(() => cancelPress, [])

  /* ---------------- Menu de la conversation ---------------- */
  const isMuted = !!selected && muted.includes(selected.id)

  const onToggleMute = async () => {
    if (!selected) return
    setHeaderMenu(false)
    const res = await toggleMuted(selected.id)
    if (res === null) { toast(t('msg.muteError'), 'error'); return }
    setMuted(prev => res ? [...prev.filter(x => x !== selected.id), selected.id] : prev.filter(x => x !== selected.id))
    toast(res ? t('msg.mutedOn') : t('msg.mutedOff'))
  }

  const onBlock = async () => {
    if (!selected || !me) return
    const target = selected
    setHeaderMenu(false)
    const name = displayName(target) || t('common.user')
    const ok = await confirm({ title: t('mod.blockTitle', { name }), message: t('mod.blockText'), confirmLabel: t('mod.block'), danger: true })
    if (!ok) return
    if (await blockUser(target.id)) {
      toast(t('mod.blocked', { name }))
      setSelected(null)
      setMessages([])
      loadConversations(me)
    } else {
      toast(t('mod.blockFailed'), 'error')
    }
  }

  const onReport = () => {
    if (!selected) return
    setHeaderMenu(false)
    setReportTarget({ type: 'profile', id: selected.id, userId: selected.id })
  }

  /* ---------------- Affichage ---------------- */
  const timeOf = (d: string) => {
    try { return new Date(d).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }) }
    catch { return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }
  }
  const dayLabel = (d: string) => {
    const date = new Date(d)
    const today = new Date()
    const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
    if (date.toDateString() === today.toDateString()) return t('msg.today')
    if (date.toDateString() === yesterday.toDateString()) return t('msg.yesterday')
    return date.getFullYear() === today.getFullYear() ? fmtShortDate(d) : `${fmtShortDate(d)} ${date.getFullYear()}`
  }

  // Messages affichés (sans ceux en attente de suppression) et mon dernier message envoyé (pour « Lu / Envoyé »)
  const visible = messages.filter(m => !hidden.has(m.id))
  let lastMineId: string | null = null
  for (let i = visible.length - 1; i >= 0; i--) {
    if (visible[i].sender_id === me && !visible[i].pending) { lastMineId = visible[i].id; break }
  }

  // Hauteur disponible : tout l'écran moins la barre du bas sur téléphone
  const fullHeight = 'h-[calc(100dvh_-_4rem_-_env(safe-area-inset-bottom))] md:h-dvh'

  const menuRow = 'w-full flex items-center gap-3 min-h-12 px-5 text-sm text-start hover:bg-surface-2 active:bg-surface-3 transition'

  const searchBlock = (
    <div className="relative">
      <span className="absolute inset-y-0 start-3 flex items-center text-subtle pointer-events-none"><Icon name="search" size={18} /></span>
      <input type="search" value={query} onChange={e => {
          setQuery(e.target.value)
          // Le spinner s'affiche pendant l'attente ; vider le champ efface les résultats
          if (e.target.value.trim()) setSearching(true); else setResults([])
        }} placeholder={t('msg.search')}
        className={`${input} ps-10`} aria-label={t('msg.search')} />
      {query.trim() && (
        <div className="absolute z-20 inset-x-0 top-full mt-2 bg-surface border border-line-strong rounded-2xl shadow-2xl overflow-hidden animate-fade-in">
          {searching && results.length === 0 ? (
            <div className="flex justify-center py-5"><Spinner /></div>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted text-center py-5">{t('msg.noResults')}</p>
          ) : results.map(p => (
            <button key={p.id} onClick={() => openConversation(p)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-surface-2 transition text-start">
              <Avatar url={p.avatar_url} name={displayName(p)} size={36} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{displayName(p) || t('common.user')}</p>
                {p.username && <p className="text-xs text-subtle truncate">@{p.username}</p>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )

  const startRow = following.length > 0 && (
    <div className="px-4 pb-2">
      <p className="text-sm font-semibold mb-3">{t('msg.start')}</p>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 [scrollbar-width:none]">
        {following.map(p => (
          <button key={p.id} onClick={() => openConversation(p)}
            className="flex flex-col items-center gap-1.5 w-16 shrink-0 active:scale-95 transition">
            <Avatar url={p.avatar_url} name={displayName(p)} size={52} />
            <span className="text-xs text-muted truncate w-full text-center">{firstName(p) || t('common.user')}</span>
          </button>
        ))}
      </div>
    </div>
  )

  const list = (
    <aside className={`${selected ? 'hidden md:flex' : 'flex'} ${fullHeight} flex-col w-full md:w-[340px] md:shrink-0 md:border-e border-line`}>
      <div className="px-4 pt-6 pb-4 space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">{t('msg.title')}</h1>
        {searchBlock}
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain">
        {loadingList ? (
          <div className="px-4 space-y-4 pt-2">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-12 h-12 rounded-full!" />
                <div className="flex-1 space-y-2"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-3 w-3/4" /></div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <>
            <EmptyState icon="send" title={t('msg.emptyTitle')} text={t('msg.emptyText')} />
            {startRow}
          </>
        ) : (
          <>
            {startRow}
            <ul className="px-2 pb-4">
              {conversations.map(({ user: other, lastMessage: last }) => {
                const mine = last.sender_id === me
                const unread = !mine && !last.is_read
                const active = selected?.id === other.id
                const convMuted = muted.includes(other.id)
                // Brouillon : celui de la conversation ouverte vient de l'état (à jour à chaque frappe)
                const pendingDraft = (active ? draft : readDraft(me, other.id)).trim()
                const photoOnly = !last.content && !!last.media_url
                const preview = photoOnly ? t('msg.photo') : last.content
                return (
                  <li key={other.id}>
                    <button onClick={() => openConversation(other)}
                      className={`w-full flex items-center gap-3 px-2 py-2.5 rounded-2xl transition text-start
                        ${active ? 'bg-surface-2' : 'hover:bg-surface'}`}>
                      <Avatar url={other.avatar_url} name={displayName(other)} size={48} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className={`text-sm truncate ${unread ? 'font-semibold text-fg' : 'font-medium'}`}>{displayName(other) || t('common.user')}</p>
                          <span className="flex items-center gap-1.5 shrink-0">
                            {convMuted && <span className="text-subtle" role="img" aria-label={t('msg.mutedLabel')}><Icon name="bellOff" size={13} /></span>}
                            <span className={`text-xs ${unread ? 'text-brand' : 'text-subtle'}`}>{timeAgo(last.created_at, true)}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {pendingDraft ? (
                            <p className="text-sm truncate flex-1 text-brand">{t('msg.draftPrefix', { text: pendingDraft })}</p>
                          ) : (
                            <p className={`text-sm truncate flex-1 flex items-center gap-1.5 ${unread ? 'text-fg font-semibold' : 'text-muted'}`}>
                              {photoOnly && <Icon name="image" size={14} />}
                              <span className="truncate">{mine ? t('msg.youPrefix', { text: preview }) : preview}</span>
                            </p>
                          )}
                          {unread && <span className="w-2.5 h-2.5 rounded-full bg-brand shrink-0" aria-label={t('msg.unread')} />}
                        </div>
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>
    </aside>
  )

  const conversation = selected && (
    <section className={`flex ${fullHeight} flex-col flex-1 min-w-0`}>
      {/* En-tête */}
      <header className="flex items-center gap-2 px-2 md:px-5 h-16 shrink-0 border-b border-line bg-ink/90 backdrop-blur-xl">
        <button onClick={() => setSelected(null)} aria-label={t('common.back')} className={`md:hidden inline-flex items-center justify-center w-10 h-10 rounded-xl text-muted hover:text-fg hover:bg-surface-2 transition`}>
          <Icon name="chevronLeft" size={24} />
        </button>
        <Link href={`/profile/${selected.id}`} className="flex items-center gap-3 min-w-0 rounded-xl pe-3 py-1 hover:bg-surface transition">
          <Avatar url={selected.avatar_url} name={displayName(selected)} size={36} />
          <div className="min-w-0">
            <p className="font-semibold text-sm truncate">{displayName(selected) || t('common.user')}</p>
            {selected.username && <p className="text-xs text-subtle truncate">@{selected.username}</p>}
          </div>
        </Link>
        {isMuted && <span className="text-subtle" role="img" aria-label={t('msg.mutedLabel')}><Icon name="bellOff" size={16} /></span>}
        <button onClick={() => setHeaderMenu(true)} aria-label={t('common.more')} className="ms-auto inline-flex items-center justify-center w-10 h-10 rounded-xl text-muted hover:text-fg hover:bg-surface-2 active:scale-95 transition">
          <Icon name="dots" size={22} />
        </button>
      </header>

      {/* Fil des messages */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-3 md:px-6 py-4">
        {loadingConv ? (
          <div className="flex justify-center pt-10"><Spinner size={24} /></div>
        ) : visible.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <Avatar url={selected.avatar_url} name={displayName(selected)} size={72} />
            <p className="font-semibold mt-4">{t('msg.firstTitle', { name: firstName(selected) || t('common.user') })}</p>
            <p className="text-sm text-muted mt-1 max-w-xs">{t('msg.firstText')}</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            {visible.map((m, i) => {
              const prev = visible[i - 1]
              const next = visible[i + 1]
              const mine = m.sender_id === me
              const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at)
              // Regroupement : même auteur, même jour, moins de 5 minutes d'écart
              const close = (a?: Message, b?: Message) => !!a && !!b && a.sender_id === b.sender_id
                && dayKey(a.created_at) === dayKey(b.created_at)
                && Math.abs(new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) < 5 * 60000
              const groupedWithPrev = !newDay && close(prev, m)
              const groupedWithNext = close(m, next)
              const corner = mine
                ? `${groupedWithPrev ? 'rounded-se-md' : ''} ${groupedWithNext ? 'rounded-ee-md' : ''}`
                : `${groupedWithPrev ? 'rounded-ss-md' : ''} ${groupedWithNext ? 'rounded-es-md' : ''}`
              const canManage = mine && !m.pending
              const mediaUrl = m.media_url
              const photoOnly = !!mediaUrl && !m.content
              return (
                <Fragment key={m.id}>
                  {newDay && (
                    <div className="flex justify-center my-4">
                      <span className="text-xs font-medium text-subtle bg-surface border border-line rounded-full px-3 py-1">{dayLabel(m.created_at)}</span>
                    </div>
                  )}
                  <div className={`group flex items-center gap-1 ${mine ? 'justify-end' : 'justify-start'} ${groupedWithPrev ? 'mt-0.5' : 'mt-3'}`}>
                    {/* Ordinateur : bouton « ⋯ » au survol, sur mes messages */}
                    {canManage && (
                      <button onClick={() => setMenuMsg(m)} aria-label={t('common.more')}
                        className="hidden md:inline-flex items-center justify-center w-8 h-8 rounded-full text-subtle hover:text-fg hover:bg-surface-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition">
                        <Icon name="dots" size={18} />
                      </button>
                    )}
                    <div
                      onTouchStart={canManage ? () => startPress(m) : undefined}
                      onTouchEnd={canManage ? cancelPress : undefined}
                      onTouchMove={canManage ? cancelPress : undefined}
                      onTouchCancel={canManage ? cancelPress : undefined}
                      // Sur téléphone, l'appui long déclenche aussi « contextmenu » : on le remplace par notre menu
                      onContextMenu={canManage ? e => {
                        if (window.matchMedia('(pointer: coarse)').matches) { e.preventDefault(); setMenuMsg(m) }
                      } : undefined}
                      className={`max-w-[80%] md:max-w-[65%] ${photoOnly ? 'p-1' : 'px-3.5 py-2'} rounded-2xl ${corner} text-[15px] leading-snug whitespace-pre-wrap break-words animate-fade-in
                      ${mine ? 'bg-brand text-ink' : 'bg-surface-2 text-fg'} ${m.pending ? 'opacity-60' : ''}`}>
                      {mediaUrl && (
                        <button type="button" aria-label={t('msg.photo')}
                          onClick={() => { if (pressFired.current) { pressFired.current = false; return } setViewImage(mediaUrl) }}
                          className={`block ${m.content ? 'mb-2' : ''} rounded-xl overflow-hidden active:opacity-80 transition`}>
                          <img src={mediaUrl} alt={t('msg.photo')} loading="lazy"
                            onLoad={() => { if (i >= visible.length - 2) endRef.current?.scrollIntoView({ block: 'end' }) }}
                            className="block w-60 max-w-full min-h-24 max-h-80 object-cover bg-surface-3" />
                        </button>
                      )}
                      {m.content}
                    </div>
                  </div>
                  {!groupedWithNext && (
                    <p className={`text-[11px] text-subtle mt-1 px-1 ${mine ? 'text-end' : 'text-start'}`}>
                      {timeOf(m.created_at)}
                      {m.id === lastMineId && ` · ${m.is_read ? t('msg.read') : t('msg.sent')}`}
                    </p>
                  )}
                </Fragment>
              )
            })}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Zone de saisie : toujours visible au-dessus de la barre du bas */}
      <div className="shrink-0 border-t border-line bg-ink px-3 md:px-6 py-3">
        <div className="max-w-3xl mx-auto">
          {/* Aperçu de la photo choisie */}
          {photo && (
            <div className="relative inline-block mb-3 animate-fade-in">
              <img src={photo.url} alt={t('msg.photo')} className="h-24 w-24 object-cover rounded-2xl border border-line" />
              {sendingPhoto && (
                <div className="absolute inset-0 rounded-2xl bg-black/50 flex items-center justify-center"><Spinner /></div>
              )}
              {!sendingPhoto && (
                <button onClick={clearPhoto} aria-label={t('msg.removePhoto')}
                  className="absolute -top-2 -end-2 w-7 h-7 rounded-full bg-surface-3 border border-line-strong text-fg flex items-center justify-center hover:bg-surface-2 active:scale-95 transition">
                  <Icon name="x" size={14} />
                </button>
              )}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { pickPhoto(e.target.files?.[0]); e.target.value = '' }} />
            <button onClick={() => fileRef.current?.click()} disabled={sendingPhoto} aria-label={t('msg.addPhoto')}
              className="w-11 h-11 shrink-0 rounded-full text-muted hover:text-fg hover:bg-surface-2 flex items-center justify-center active:scale-95 transition disabled:opacity-40 disabled:pointer-events-none">
              <Icon name="image" size={22} />
            </button>
            <textarea ref={textareaRef} rows={1} value={draft}
              onChange={e => updateDraft(e.target.value)}
              onKeyDown={e => {
                // Entrée = envoyer, Maj + Entrée = nouvelle ligne
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() }
              }}
              placeholder={t('msg.placeholder')} aria-label={t('msg.placeholder')}
              className="flex-1 resize-none bg-surface-2 text-fg placeholder:text-subtle px-4 py-2.5 rounded-3xl outline-none border border-line focus:border-brand/60 text-[15px] leading-5 max-h-[116px] transition" />
            <button onClick={send} disabled={(!draft.trim() && !photo) || sendingPhoto} aria-label={t('msg.send')}
              className="w-11 h-11 shrink-0 rounded-full bg-brand text-ink flex items-center justify-center hover:bg-brand-strong active:scale-95 transition disabled:opacity-40 disabled:pointer-events-none">
              {sendingPhoto ? <Spinner size={18} /> : <Icon name="send" size={19} />}
            </button>
          </div>
        </div>
      </div>
    </section>
  )

  return (
    <div className={`flex ${fullHeight} overflow-hidden`}>
      {list}
      {conversation || (
        <div className="hidden md:flex flex-1 items-center justify-center">
          <EmptyState icon="message" title={t('msg.pickTitle')} text={t('msg.pickText')} />
        </div>
      )}

      {/* Photo en grand */}
      <Sheet open={!!viewImage} onClose={() => setViewImage(null)} title={t('msg.photo')} wide>
        {viewImage && <img src={viewImage} alt={t('msg.photo')} className="w-full max-h-[75dvh] object-contain bg-ink" />}
      </Sheet>

      {/* Actions sur un de mes messages */}
      <Sheet open={!!menuMsg} onClose={() => setMenuMsg(null)} title={t('common.more')}>
        <div className="py-2">
          {menuMsg?.content && (
            <button onClick={() => copyText(menuMsg)} className={menuRow}>
              <Icon name="copy" size={20} />{t('msg.copyText')}
            </button>
          )}
          {menuMsg && (
            <button onClick={() => startDelete(menuMsg)} className={`${menuRow} text-danger`}>
              <Icon name="trash" size={20} />{t('common.delete')}
            </button>
          )}
        </div>
      </Sheet>

      {/* Menu de la conversation */}
      <Sheet open={headerMenu} onClose={() => setHeaderMenu(false)} title={displayName(selected) || t('common.more')}>
        <div className="py-2">
          {selected && (
            <Link href={`/profile/${selected.id}`} onClick={() => setHeaderMenu(false)} className={menuRow}>
              <Icon name="user" size={20} />{t('msg.viewProfile')}
            </Link>
          )}
          <button onClick={onToggleMute} className={menuRow}>
            <Icon name="bellOff" size={20} />{isMuted ? t('msg.unmute') : t('msg.mute')}
          </button>
          <button onClick={onBlock} className={`${menuRow} text-danger`}>
            <Icon name="ban" size={20} />{t('mod.block')}
          </button>
          <button onClick={onReport} className={`${menuRow} text-danger`}>
            <Icon name="flag" size={20} />{t('mod.report')}
          </button>
        </div>
      </Sheet>

      <ReportSheet target={reportTarget} onClose={() => setReportTarget(null)} />
    </div>
  )
}
