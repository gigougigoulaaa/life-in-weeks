'use client'
// Messagerie privée : liste des conversations + fil de discussion.
// Téléphone : liste OU conversation en plein écran. Ordinateur : deux colonnes.
import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import Icon from '@/app/components/Icon'
import { Avatar, EmptyState, Skeleton, Spinner, useUI, input } from '@/app/components/ui'
import type { RealtimeChannel } from '@supabase/supabase-js'

type Profile = { id: string, username?: string | null, full_name?: string | null, avatar_url?: string | null }
type Message = {
  id: string, sender_id: string, receiver_id: string, content: string,
  is_read: boolean, created_at: string, pending?: boolean,
}
type Conversation = { user: Profile, lastMessage: Message }

const PROFILE_FIELDS = 'id, username, full_name, avatar_url'
const displayName = (p?: Profile | null) => p?.full_name || p?.username || ''
const firstName = (p?: Profile | null) => (p?.full_name || '').split(' ')[0] || p?.username || ''
// Même jour calendaire (pour les séparateurs « Aujourd'hui », « Hier »…)
const dayKey = (d: string) => new Date(d).toDateString()

// Ajoute un message sans jamais créer de doublon (il peut arriver deux fois : envoi + temps réel)
const addUnique = (list: Message[], m: Message) => list.some(x => x.id === m.id) ? list : [...list, m]

export default function MessagesPage() {
  const { t, lang, timeAgo, fmtShortDate } = useI18n()
  const { toast } = useUI()

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

  // Un seul abonnement temps réel à la fois pour la conversation ouverte
  const convChannel = useRef<RealtimeChannel | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
        if (p && !cancelled) { setLoadingConv(true); setSelected(p) }
      }
    })
    return () => { cancelled = true }
  }, [loadConversations])

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
    convChannel.current = supabase
      .channel(`conv-${me}-${otherId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${me}` }, onInsert)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `sender_id=eq.${me}` }, onInsert)
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

  // Ouvre une conversation (vide d'abord l'ancienne, le chargement se fait dans l'effet ci-dessus)
  const openConversation = (p: Profile) => {
    if (p.id !== selected?.id) { setMessages([]); setLoadingConv(true) }
    setSelected(p)
    setQuery('')
    setResults([])
    setDraft('')
  }

  /* ---------------- Envoi (optimiste : affiché tout de suite) ---------------- */
  const resizeTextarea = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 116)}px` // 4 lignes maximum
  }

  const send = async () => {
    const content = draft.trim()
    if (!content || !me || !selected) return
    const to = selected
    const tempId = `tmp-${Date.now()}`
    const temp: Message = { id: tempId, sender_id: me, receiver_id: to.id, content, is_read: false, created_at: new Date().toISOString(), pending: true }
    setMessages(prev => [...prev, temp])
    setDraft('')
    requestAnimationFrame(resizeTextarea)

    const { data, error } = await supabase.from('messages')
      .insert({ sender_id: me, receiver_id: to.id, content }).select().single()
    if (error || !data) {
      setMessages(prev => prev.filter(m => m.id !== tempId))
      setDraft(content)
      toast(t('msg.sendError'), 'error')
      return
    }
    // Remplace le message temporaire par le vrai (sauf s'il est déjà arrivé par le temps réel)
    setMessages(prev => prev.some(m => m.id === data.id)
      ? prev.filter(m => m.id !== tempId)
      : prev.map(m => m.id === tempId ? (data as Message) : m))
    // Met la conversation en tête de liste
    setConversations(prev => [{ user: to, lastMessage: data as Message }, ...prev.filter(c => c.user.id !== to.id)])
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

  // Hauteur disponible : tout l'écran moins la barre du bas sur téléphone
  const fullHeight = 'h-[calc(100dvh_-_4rem_-_env(safe-area-inset-bottom))] md:h-dvh'

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
                return (
                  <li key={other.id}>
                    <button onClick={() => openConversation(other)}
                      className={`w-full flex items-center gap-3 px-2 py-2.5 rounded-2xl transition text-start
                        ${active ? 'bg-surface-2' : 'hover:bg-surface'}`}>
                      <Avatar url={other.avatar_url} name={displayName(other)} size={48} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className={`text-sm truncate ${unread ? 'font-semibold text-fg' : 'font-medium'}`}>{displayName(other) || t('common.user')}</p>
                          <span className={`text-xs shrink-0 ${unread ? 'text-brand' : 'text-subtle'}`}>{timeAgo(last.created_at, true)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <p className={`text-sm truncate flex-1 ${unread ? 'text-fg font-semibold' : 'text-muted'}`}>
                            {mine ? t('msg.youPrefix', { text: last.content }) : last.content}
                          </p>
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
      </header>

      {/* Fil des messages */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-3 md:px-6 py-4">
        {loadingConv ? (
          <div className="flex justify-center pt-10"><Spinner size={24} /></div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <Avatar url={selected.avatar_url} name={displayName(selected)} size={72} />
            <p className="font-semibold mt-4">{t('msg.firstTitle', { name: firstName(selected) || t('common.user') })}</p>
            <p className="text-sm text-muted mt-1 max-w-xs">{t('msg.firstText')}</p>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto">
            {messages.map((m, i) => {
              const prev = messages[i - 1]
              const next = messages[i + 1]
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
              return (
                <Fragment key={m.id}>
                  {newDay && (
                    <div className="flex justify-center my-4">
                      <span className="text-xs font-medium text-subtle bg-surface border border-line rounded-full px-3 py-1">{dayLabel(m.created_at)}</span>
                    </div>
                  )}
                  <div className={`flex ${mine ? 'justify-end' : 'justify-start'} ${groupedWithPrev ? 'mt-0.5' : 'mt-3'}`}>
                    <div className={`max-w-[80%] md:max-w-[65%] px-3.5 py-2 rounded-2xl ${corner} text-[15px] leading-snug whitespace-pre-wrap break-words animate-fade-in
                      ${mine ? 'bg-brand text-ink' : 'bg-surface-2 text-fg'} ${m.pending ? 'opacity-60' : ''}`}>
                      {m.content}
                    </div>
                  </div>
                  {!groupedWithNext && (
                    <p className={`text-[11px] text-subtle mt-1 px-1 ${mine ? 'text-end' : 'text-start'}`}>{timeOf(m.created_at)}</p>
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
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <textarea ref={textareaRef} rows={1} value={draft}
            onChange={e => { setDraft(e.target.value); resizeTextarea() }}
            onKeyDown={e => {
              // Entrée = envoyer, Maj + Entrée = nouvelle ligne
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send() }
            }}
            placeholder={t('msg.placeholder')} aria-label={t('msg.placeholder')}
            className="flex-1 resize-none bg-surface-2 text-fg placeholder:text-subtle px-4 py-2.5 rounded-3xl outline-none border border-line focus:border-brand/60 text-[15px] leading-5 max-h-[116px] transition" />
          <button onClick={send} disabled={!draft.trim()} aria-label={t('msg.send')}
            className="w-11 h-11 shrink-0 rounded-full bg-brand text-ink flex items-center justify-center hover:bg-brand-strong active:scale-95 transition disabled:opacity-40 disabled:pointer-events-none">
            <Icon name="send" size={19} />
          </button>
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
    </div>
  )
}
