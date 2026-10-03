'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ProfilePage() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [editing, setEditing] = useState(false)
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedWeeks, setSavedWeeks] = useState<any[]>([])
  const [favoriteWeeks, setFavoriteWeeks] = useState<string[]>([])
  const [allWeeks, setAllWeeks] = useState<any[]>([])
  const [showFavoritePicker, setShowFavoritePicker] = useState(false)
  const [weeksLived, setWeeksLived] = useState(0)
  const [countriesVisited, setCountriesVisited] = useState(0)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.href = '/login'; return }
      setUser(data.user)
      loadProfile(data.user.id)
      loadWeeks(data.user.id)
    })
  }, [])

  const loadProfile = async (userId: string) => {
    const { data } = await supabase.from('profiles')
      .select('*').eq('id', userId).single()
    if (data) {
      setProfile(data)
      setUsername(data.username || '')
      setFullName(data.full_name || '')
      setBio(data.bio || '')
      setAvatarUrl(data.avatar_url || '')
      setFavoriteWeeks(data.favorite_weeks || [])
      if (data.birth_date) {
        const birth = new Date(data.birth_date)
        const now = new Date()
        const diff = Math.floor((now.getTime() - birth.getTime()) / (7 * 24 * 60 * 60 * 1000))
        setWeeksLived(diff)
      }
    }
  }

  const loadWeeks = async (userId: string) => {
    const { data } = await supabase.from('weeks').select('*').eq('user_id', userId)
      .order('year', { ascending: false })
    if (data) {
      setSavedWeeks(data)
      setAllWeeks(data)
      const countries = new Set<string>()
      data.forEach((w: any) => {
        if (w.location?.name) {
          const parts = w.location.name.split(',')
          if (parts.length > 0) countries.add(parts[parts.length - 1].trim())
        }
      })
      setCountriesVisited(countries.size)
    }
  }

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploading(true)
    const filePath = `avatar_${user.id}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
      setAvatarUrl(data.publicUrl)
    }
    setUploading(false)
  }

  const saveProfile = async () => {
    if (!user) return
    setSaving(true)
    await supabase.from('profiles').upsert({
      id: user.id, username, full_name: fullName, bio, avatar_url: avatarUrl,
      favorite_weeks: favoriteWeeks
    })
    await loadProfile(user.id)
    setSaving(false)
    setEditing(false)
  }

  const toggleFavorite = async (weekId: string) => {
    const updated = favoriteWeeks.includes(weekId)
      ? favoriteWeeks.filter(id => id !== weekId)
      : [...favoriteWeeks, weekId]
    setFavoriteWeeks(updated)
    await supabase.from('profiles').upsert({ id: user.id, favorite_weeks: updated })
  }

  const favoriteWeekData = allWeeks.filter(w => favoriteWeeks.includes(w.id))

  if (editing) {
    return (
      <div className="min-h-screen bg-black text-white pb-24">
        <div className="max-w-lg mx-auto px-4 pt-6">
          <div className="flex items-center gap-3 mb-8">
            <button onClick={() => setEditing(false)} className="text-zinc-400 hover:text-white text-sm">← Retour</button>
            <h1 className="text-xl font-bold">Modifier le profil</h1>
          </div>

          {/* Avatar */}
          <div className="flex justify-center mb-8">
            <div className="relative">
              <div className="w-24 h-24 rounded-full overflow-hidden bg-zinc-800 border-2 border-zinc-700">
                {avatarUrl
                  ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-4xl">👤</div>
                }
              </div>
              <label className="absolute bottom-0 right-0 w-7 h-7 bg-white rounded-full flex items-center justify-center cursor-pointer hover:bg-zinc-200 transition">
                <span className="text-black text-sm font-bold">+</span>
                <input type="file" accept="image/*" onChange={uploadAvatar} className="hidden" />
              </label>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-zinc-400 text-xs mb-1 block">Nom d'utilisateur</label>
              <input type="text" value={username} onChange={e => setUsername(e.target.value)}
                className="w-full bg-zinc-900 text-white p-3 rounded-xl outline-none border border-zinc-800 focus:border-zinc-600 text-sm" />
            </div>
            <div>
              <label className="text-zinc-400 text-xs mb-1 block">Nom complet</label>
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                className="w-full bg-zinc-900 text-white p-3 rounded-xl outline-none border border-zinc-800 focus:border-zinc-600 text-sm" />
            </div>
            <div>
              <label className="text-zinc-400 text-xs mb-1 block">Biographie</label>
              <textarea value={bio} onChange={e => setBio(e.target.value)} rows={4}
                placeholder="Parlez de vous..."
                className="w-full bg-zinc-900 text-white p-3 rounded-xl outline-none border border-zinc-800 focus:border-zinc-600 text-sm resize-none" />
            </div>

            {/* Sélection des semaines favorites */}
            <div>
              <label className="text-zinc-400 text-xs mb-2 block">Moments favoris sur votre profil</label>
              <button onClick={() => setShowFavoritePicker(!showFavoritePicker)}
                className="w-full bg-zinc-900 text-white p-3 rounded-xl border border-zinc-800 text-sm text-left hover:border-zinc-600 transition">
                {favoriteWeeks.length > 0 ? `${favoriteWeeks.length} moment${favoriteWeeks.length > 1 ? 's' : ''} sélectionné${favoriteWeeks.length > 1 ? 's' : ''}` : '+ Choisir des moments'}
              </button>
              {showFavoritePicker && (
                <div className="mt-2 bg-zinc-900 rounded-xl border border-zinc-800 max-h-60 overflow-y-auto">
                  {allWeeks.filter(w => w.title).map(week => (
                    <div key={week.id} onClick={() => toggleFavorite(week.id)}
                      className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer border-b border-zinc-800 last:border-0 hover:bg-zinc-800 transition ${favoriteWeeks.includes(week.id) ? 'bg-zinc-800' : ''}`}>
                      <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${favoriteWeeks.includes(week.id) ? 'bg-white border-white' : 'border-zinc-600'}`}>
                        {favoriteWeeks.includes(week.id) && <span className="text-black text-xs">✓</span>}
                      </div>
                      <div>
                        <p className="text-sm">{week.title}</p>
                        <p className="text-zinc-500 text-xs">Semaine {week.week_number} — {week.year}</p>
                      </div>
                    </div>
                  ))}
                  {allWeeks.filter(w => w.title).length === 0 && (
                    <p className="text-zinc-500 text-sm text-center py-4">Pas encore de semaines avec titre</p>
                  )}
                </div>
              )}
            </div>
          </div>

          <button onClick={saveProfile} disabled={saving}
            className="w-full bg-white text-black font-bold p-3 rounded-xl mt-6 hover:bg-zinc-200 transition">
            {saving ? 'Sauvegarde...' : 'Sauvegarder'}
          </button>
        </div>
      </div>
    )
  }

  // PAGE DE VISUALISATION
  return (
    <div className="min-h-screen bg-black text-white pb-24">
      <div className="max-w-lg mx-auto px-4 pt-8">

        {/* Header avec bouton modifier */}
        <div className="flex justify-end mb-6">
          <button onClick={() => setEditing(true)}
            className="text-xs px-3 py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white transition">
            ✏️ Modifier
          </button>
        </div>

        {/* Photo + nom */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-24 h-24 rounded-full overflow-hidden bg-zinc-800 border-2 border-zinc-700 mb-4">
            {avatarUrl
              ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
              : <div className="w-full h-full flex items-center justify-center text-4xl">👤</div>
            }
          </div>
          <h1 className="text-2xl font-bold mb-1">{fullName || username || 'Utilisateur'}</h1>
          {username && fullName && <p className="text-zinc-500 text-sm">@{username}</p>}
        </div>

        {/* Stats de vie */}
        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 text-center">
            <p className="text-3xl font-bold text-white">{weeksLived.toLocaleString()}</p>
            <p className="text-zinc-400 text-xs mt-1">semaines vécues</p>
          </div>
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 text-center">
            <p className="text-3xl font-bold text-white">{countriesVisited}</p>
            <p className="text-zinc-400 text-xs mt-1">pays visités</p>
          </div>
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 text-center">
            <p className="text-3xl font-bold text-white">{savedWeeks.length}</p>
            <p className="text-zinc-400 text-xs mt-1">souvenirs écrits</p>
          </div>
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 text-center">
            <p className="text-3xl font-bold text-white">{savedWeeks.filter(w => w.media_urls?.length > 0).length}</p>
            <p className="text-zinc-400 text-xs mt-1">semaines en photos</p>
          </div>
        </div>

        {/* Biographie */}
        {bio && (
          <div className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800 mb-8">
            <h2 className="text-sm font-bold text-zinc-400 mb-2 uppercase tracking-wider">À propos</h2>
            <p className="text-sm text-zinc-300 leading-relaxed">{bio}</p>
          </div>
        )}

        {/* Moments favoris */}
        {favoriteWeekData.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-bold text-zinc-400 mb-3 uppercase tracking-wider">✨ Moments favoris</h2>
            <div className="space-y-3">
              {favoriteWeekData.map(week => (
                <div key={week.id} className="bg-zinc-900 rounded-2xl p-4 border border-zinc-800">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-zinc-500 text-xs">Semaine {week.week_number} — {week.year}</span>
                  </div>
                  {week.title && <h3 className="font-bold text-sm mb-1">{week.title}</h3>}
                  {week.content && <p className="text-zinc-400 text-xs line-clamp-3">{week.content}</p>}
                  {week.media_urls?.length > 0 && (
                    <div className="grid grid-cols-3 gap-1.5 mt-3">
                      {week.media_urls.slice(0, 3).map((url: string, i: number) => (
                        <img key={i} src={url} alt="" className="w-full h-16 object-cover rounded-lg" />
                      ))}
                    </div>
                  )}
                  {week.location && (
                    <p className="text-zinc-500 text-xs mt-2">📍 {week.location.name}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pas encore de contenu */}
        {!bio && favoriteWeekData.length === 0 && (
          <div className="text-center py-12">
            <p className="text-zinc-600 text-sm">Votre profil est vide pour l'instant.</p>
            <button onClick={() => setEditing(true)}
              className="mt-4 text-sm px-4 py-2 rounded-xl border border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-white transition">
              Compléter mon profil
            </button>
          </div>
        )}
      </div>
    </div>
  )
}