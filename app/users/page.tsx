'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'

export default function UsersPage() {
  const { t } = useI18n()
  const [user, setUser] = useState<any>(null)
  const [query, setQuery] = useState('')
  const [users, setUsers] = useState<any[]>([])
  const [following, setFollowing] = useState<string[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.href = '/login'; return }
      setUser(data.user)
      const { data: follows } = await supabase
        .from('follows')
        .select('following_id')
        .eq('follower_id', data.user.id)
      if (follows) setFollowing(follows.map(f => f.following_id))
    })
  }, [])

  const searchUsers = async () => {
    if (!query.trim()) return
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url, bio, is_private')
      .or(`username.ilike.%${query}%,full_name.ilike.%${query}%`)
      .neq('id', user?.id)
      .limit(20)
    setUsers(data || [])
    setLoading(false)
  }

  const toggleFollow = async (targetId: string, isPrivate: boolean) => {
    if (!user) return
    const isFollowing = following.includes(targetId)
    if (isFollowing) {
      await supabase.from('follows')
        .delete()
        .eq('follower_id', user.id)
        .eq('following_id', targetId)
      setFollowing(prev => prev.filter(id => id !== targetId))
    } else {
      await supabase.from('follows').insert({
        follower_id: user.id,
        following_id: targetId,
        status: isPrivate ? 'pending' : 'accepted'
      })
      setFollowing(prev => [...prev, targetId])
    }
  }

  return (
    <div className="min-h-screen bg-black text-white p-6 pb-20">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">{t('users.title')}</h1>

        <div className="flex gap-2 mb-6">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && searchUsers()}
            placeholder={t('users.placeholder')}
            className="flex-1 bg-zinc-900 text-white p-3 rounded-lg outline-none border border-zinc-800 focus:border-zinc-600"
          />
          <button onClick={searchUsers}
            className="bg-white text-black font-bold px-6 rounded-lg hover:bg-zinc-200 transition">
            🔍
          </button>
        </div>

        {loading && <p className="text-zinc-400 text-center">{t('common.searching')}</p>}

        <div className="space-y-3">
          {users.map(u => (
            <div key={u.id} className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 flex items-center gap-4 cursor-pointer hover:border-zinc-700 transition" onClick={() => window.location.href = `/profile/${u.id}`}>
              <div className="w-12 h-12 rounded-full bg-zinc-800 overflow-hidden flex-shrink-0">
                {u.avatar_url
                  ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-xl">👤</div>
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-bold truncate">{u.full_name || u.username || t('common.user')}</p>
                  {u.is_private && <span className="text-xs text-zinc-500">🔒</span>}
                </div>
                {u.username && <p className="text-zinc-400 text-sm">@{u.username}</p>}
                {u.bio && <p className="text-zinc-500 text-xs mt-1 line-clamp-1">{u.bio}</p>}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); toggleFollow(u.id, u.is_private); }}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition flex-shrink-0
                  ${following.includes(u.id)
                    ? 'bg-zinc-700 text-white hover:bg-zinc-600'
                    : 'bg-white text-black hover:bg-zinc-200'}`}
              >
                {following.includes(u.id)
                  ? t('users.following')
                  : u.is_private ? t('users.request') : t('users.follow')}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}