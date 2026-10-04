'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'

function getAge(birthDate: string): number {
  const birth = new Date(birthDate)
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return age
}

export default function Navbar() {
  const pathname = usePathname()
  const { t } = useI18n()
  const [unread, setUnread] = useState(0)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [age, setAge] = useState<number | null>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return

      const { data: profile } = await supabase
        .from('profiles').select('avatar_url, birth_date').eq('id', data.user.id).single()
      if (profile?.avatar_url) setAvatarUrl(profile.avatar_url)
      if (profile?.birth_date) setAge(getAge(profile.birth_date))

      const { count } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', data.user.id)
        .eq('is_read', false)
      setUnread(count || 0)

      const channel = supabase
        .channel('navbar-notifs')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${data.user.id}`
        }, () => setUnread(prev => prev + 1))
        .subscribe()

      return () => { supabase.removeChannel(channel) }
    })
  }, [])

  const links = [
    { href: '/calendar', emoji: '📅', title: t('nav.calendar') },
    { href: '/messages', emoji: '✈️', title: t('nav.messages') },
    { href: '/map', emoji: '🌍', title: t('nav.map') },
    { href: '/profile', emoji: '', title: t('nav.profile') },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-zinc-900 border-t border-zinc-800 flex justify-around items-center h-16 z-40 px-1">
      {links.map(link => {
        const isActive = pathname === link.href
        const isProfile = link.href === '/profile'
        const isCalendar = link.href === '/calendar'
        return (
          <button
            key={link.href}
            onClick={() => window.location.href = link.href}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-2 transition
              ${isActive ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            {isProfile ? (
              <div className={`w-6 h-6 rounded-full overflow-hidden bg-zinc-700 flex-shrink-0 ${isActive ? 'ring-2 ring-white' : ''}`}>
                {avatarUrl
                  ? <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-xs">👤</div>
                }
              </div>
            ) : (
              <span className="text-xl leading-none relative block h-6">
                {link.emoji}
                {isCalendar && age !== null && (
                  <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-black" style={{ marginTop: '2px' }}>
                    {age}
                  </span>
                )}
              </span>
            )}
            <span className="text-[10px] leading-none">{link.title}</span>
          </button>
        )
      })}
    </nav>
  )
}