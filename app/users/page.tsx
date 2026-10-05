'use client'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import Icon from '../components/Icon'
import { Avatar, btn, card, input, page, EmptyState, Skeleton, Spinner, useUI } from '../components/ui'

type Person = { id: string, username?: string | null, full_name?: string | null, avatar_url?: string | null, bio?: string | null, is_private?: boolean | null }
type FollowStatus = 'pending' | 'accepted'

const FIELDS = 'id, username, full_name, avatar_url, bio, is_private'

export default function UsersPage() {
  const { t } = useI18n()
  const { toast } = useUI()
  const [me, setMe] = useState<{ id: string, name: string } | null>(null)
  const [query, setQuery] = useState('')
  const [people, setPeople] = useState<Person[]>([])
  const [suggestions, setSuggestions] = useState<Person[]>([])
  const [follows, setFollows] = useState<Record<string, FollowStatus>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const requestId = useRef(0)

  // Au chargement : mon profil, mes abonnements, puis des suggestions
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.href = '/login'; return }
      const uid = data.user.id
      const [{ data: prof }, { data: rows }] = await Promise.all([
        supabase.from('profiles').select('full_name, username').eq('id', uid).maybeSingle(),
        supabase.from('follows').select('following_id, status').eq('follower_id', uid),
      ])
      setMe({ id: uid, name: prof?.full_name || (prof?.username ? `@${prof.username}` : '') })
      const map: Record<string, FollowStatus> = {}
      for (const r of rows || []) map[r.following_id] = r.status === 'pending' ? 'pending' : 'accepted'
      setFollows(map)

      // Suggestions : profils récents que je ne suis pas encore
      const exclude = [uid, ...Object.keys(map)]
      const base = () => supabase.from('profiles').select(FIELDS).not('id', 'in', `(${exclude.join(',')})`).limit(12)
      const recent = await base().order('created_at', { ascending: false })
      // Si la colonne created_at n'existe pas, on prend des profils sans ordre particulier
      const sugg = recent.error ? (await base()).data : recent.data
      setSuggestions((sugg as Person[]) || [])
      setLoading(false)
    })
  }, [])

  // Recherche en direct, 300 ms après la dernière frappe
  useEffect(() => {
    const q = query.trim().replace(/[,()%*\\]/g, ' ').trim()
    if (!q || !me) return // champ vide : on affiche les suggestions
    const id = ++requestId.current
    const timer = setTimeout(async () => {
      setLoading(true)
      const { data } = await supabase.from('profiles').select(FIELDS)
        .or(`username.ilike.%${q.replace(/^@/, '')}%,full_name.ilike.%${q}%`)
        .neq('id', me.id).limit(20)
      // On ignore une réponse arrivée après une recherche plus récente
      if (id !== requestId.current) return
      setPeople((data as Person[]) || [])
      setLoading(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, me])

  const toggleFollow = async (p: Person) => {
    if (!me || busy) return
    setBusy(p.id)
    const current = follows[p.id]
    if (current) {
      const { error } = await supabase.from('follows').delete().eq('follower_id', me.id).eq('following_id', p.id)
      if (error) toast(t('common.error'), 'error')
      else setFollows(prev => { const next = { ...prev }; delete next[p.id]; return next })
    } else {
      const status: FollowStatus = p.is_private ? 'pending' : 'accepted'
      const { error } = await supabase.from('follows').insert({ follower_id: me.id, following_id: p.id, status })
      if (error) toast(t('common.error'), 'error')
      else {
        setFollows(prev => ({ ...prev, [p.id]: status }))
        // Prévenir la personne (si ça échoue, ce n'est pas grave)
        try {
          await supabase.from('notifications').insert({
            user_id: p.id, type: 'follow', is_read: false,
            content: t(status === 'pending' ? 'users.requestNotif' : 'users.followNotif', { name: me.name || t('common.user') }),
          })
        } catch {}
      }
    }
    setBusy(null)
  }

  const searching = query.trim().length > 0
  const list = searching ? people : suggestions

  return (
    <main className={page}>
      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">{t('users.title')}</h1>
        <p className="text-sm text-muted mt-1">{t('users.subtitle')}</p>
      </header>

      <div className="relative mb-6">
        <span className="absolute start-3.5 top-1/2 -translate-y-1/2 text-subtle pointer-events-none">
          {loading && searching ? <Spinner size={16} /> : <Icon name="search" size={18} />}
        </span>
        <input type="search" value={query} onChange={e => setQuery(e.target.value)} autoFocus
          placeholder={t('users.placeholder')} className={`${input} h-12 ps-11 text-base sm:text-sm`} />
      </div>

      <h2 className="text-sm font-semibold mb-3">{searching ? t('users.results') : t('users.suggestions')}</h2>

      {loading && list.length === 0 ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className={`${card} flex items-center gap-3 p-4`}>
              <Skeleton className="w-12 h-12 rounded-full" />
              <div className="flex-1 flex flex-col gap-2"><Skeleton className="h-3.5 w-1/2" /><Skeleton className="h-3 w-1/3" /></div>
              <Skeleton className="w-24 h-10" />
            </div>
          ))}
        </div>
      ) : list.length === 0 ? (
        searching
          ? <EmptyState icon="search" title={t('users.noResultTitle')} text={t('users.noResult', { query: query.trim() })} />
          : <EmptyState icon="users" title={t('users.noSuggestions')} text={t('users.noSuggestionsText')} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map(p => {
            const status = follows[p.id]
            const name = p.full_name || p.username || t('common.user')
            return (
              <li key={p.id}>
                <div role="link" tabIndex={0}
                  onClick={() => { window.location.assign(`/profile/${p.id}`) }}
                  onKeyDown={e => { if (e.key === 'Enter') window.location.assign(`/profile/${p.id}`) }}
                  className={`${card} h-full flex items-center gap-3 p-4 cursor-pointer transition hover:bg-surface-2 hover:border-line-strong active:scale-[0.99]`}>
                  <Avatar url={p.avatar_url} name={name} size={48} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate flex items-center gap-1.5">
                      <span className="truncate">{name}</span>
                      {p.is_private && <span className="text-subtle" title={t('users.private')}><Icon name="lock" size={13} /></span>}
                    </p>
                    {p.username && p.username !== p.full_name && <p className="text-sm text-muted truncate">@{p.username}</p>}
                    {p.bio && <p className="text-xs text-subtle mt-0.5 line-clamp-1">{p.bio}</p>}
                  </div>
                  <button type="button" disabled={busy === p.id}
                    onClick={e => { e.stopPropagation(); toggleFollow(p) }}
                    onKeyDown={e => e.stopPropagation()}
                    className={`${status ? btn.secondary : btn.primary} h-10 px-4 shrink-0`}>
                    {busy === p.id ? <Spinner size={14} /> : status === 'accepted' ? <Icon name="check" size={16} /> : status ? <Icon name="clock" size={16} /> : <Icon name="userPlus" size={16} />}
                    {status === 'accepted' ? t('users.followingState') : status === 'pending' ? t('users.requested') : p.is_private ? t('users.request') : t('users.follow')}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </main>
  )
}
