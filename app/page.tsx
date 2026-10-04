'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'

export default function ProfilePage() {
  const { t } = useI18n()
  const [user, setUser] = useState<any>(null)
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [uploading, setUploading] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.href = '/login'; return }
      setUser(data.user)
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', data.user.id)
        .single()
      if (profile) {
        setUsername(profile.username || '')
        setFullName(profile.full_name || '')
        setBio(profile.bio || '')
        setAvatarUrl(profile.avatar_url || '')
      }
    })
  }, [])

  const saveProfile = async () => {
    if (!user) return
    setSaving(true)
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      username,
      full_name: fullName,
      bio,
      avatar_url: avatarUrl
    })
    if (error) setMessage(t('home.error') + error.message)
    else setMessage(t('home.saved'))
    setSaving(false)
    setTimeout(() => setMessage(''), 3000)
  }

  const uploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setUploading(true)
    const fileExt = file.name.split('.').pop()
    const filePath = `${user.id}/avatar.${fileExt}`
    const { error } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
      setAvatarUrl(data.publicUrl)
    }
    setUploading(false)
  }

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => window.location.href = '/calendar'} className="text-zinc-400 hover:text-white">
            ← {t('common.back')}
          </button>
          <h1 className="text-2xl font-bold">{t('home.title')}</h1>
        </div>

        <div className="flex flex-col items-center mb-8">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-zinc-800 overflow-hidden mb-3">
              {avatarUrl ? (
                <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-3xl">👤</div>
              )}
            </div>
            <label className="absolute bottom-3 right-0 bg-white text-black rounded-full w-7 h-7 flex items-center justify-center cursor-pointer text-sm font-bold hover:bg-zinc-200">
              +
              <input type="file" accept="image/*" onChange={uploadAvatar} className="hidden" />
            </label>
          </div>
          {uploading && <p className="text-zinc-400 text-sm">{t('common.uploading')}</p>}
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-zinc-400 text-sm mb-1 block">{t('profile.username')}</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder={t('home.usernamePh')}
              className="w-full bg-zinc-900 text-white p-3 rounded-lg outline-none border border-zinc-800 focus:border-zinc-600"
            />
          </div>
          <div>
            <label className="text-zinc-400 text-sm mb-1 block">{t('profile.fullName')}</label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder={t('home.fullNamePh')}
              className="w-full bg-zinc-900 text-white p-3 rounded-lg outline-none border border-zinc-800 focus:border-zinc-600"
            />
          </div>
          <div>
            <label className="text-zinc-400 text-sm mb-1 block">{t('profile.bio')}</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              placeholder={t('profile.bioPh')}
              rows={4}
              className="w-full bg-zinc-900 text-white p-3 rounded-lg outline-none border border-zinc-800 focus:border-zinc-600 resize-none"
            />
          </div>

          <button
            onClick={saveProfile}
            disabled={saving}
            className="w-full bg-white text-black font-bold p-3 rounded-lg hover:bg-zinc-200 transition"
          >
            {saving ? t('common.saving') : t('home.saveProfile')}
          </button>

          {message && <p className="text-green-400 text-center">{message}</p>}
        </div>
      </div>
    </div>
  )
}