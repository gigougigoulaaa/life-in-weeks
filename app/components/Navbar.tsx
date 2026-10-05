'use client'
// Navigation principale : barre en bas sur téléphone, colonne à gauche sur ordinateur.
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import Icon, { type IconName } from './Icon'
import Logo from './Logo'
import { Avatar } from './ui'

const HIDDEN_ON = ['/login']

export default function Navbar() {
  const pathname = usePathname()
  const { t } = useI18n()
  const [signedIn, setSignedIn] = useState(false)
  const [unreadMessages, setUnreadMessages] = useState(0)
  const [avatarUrl, setAvatarUrl] = useState('')
  const [name, setName] = useState('')
  const [age, setAge] = useState<number | null>(null)

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user || cancelled) return
      const uid = data.user.id
      setSignedIn(true)

      const { data: profile } = await supabase
        .from('profiles').select('avatar_url, full_name, username, birth_date').eq('id', uid).single()
      if (profile?.avatar_url) setAvatarUrl(profile.avatar_url)
      setName(profile?.full_name || profile?.username || '')
      if (profile?.birth_date) {
        const b = new Date(profile.birth_date), now = new Date()
        let a = now.getFullYear() - b.getFullYear()
        if (now.getMonth() < b.getMonth() || (now.getMonth() === b.getMonth() && now.getDate() < b.getDate())) a--
        setAge(a)
      }

      const { count } = await supabase
        .from('messages').select('*', { count: 'exact', head: true })
        .eq('receiver_id', uid).eq('is_read', false)
      setUnreadMessages(count || 0)

      if (cancelled) return
      channel = supabase
        .channel(`navbar-messages-${uid}`)
        .on('postgres_changes', {
          event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${uid}`,
        }, () => setUnreadMessages(prev => prev + 1))
        .subscribe()
    })
    return () => { cancelled = true; if (channel) supabase.removeChannel(channel) }
  }, [])


  if (!signedIn || HIDDEN_ON.includes(pathname || '')) return null

  const links: { href: string, icon: IconName, label: string, badge?: number }[] = [
    { href: '/calendar', icon: 'calendar', label: t('nav.calendar') },
    { href: '/feed', icon: 'users', label: t('nav.feed') },
    { href: '/messages', icon: 'send', label: t('nav.messages'), badge: pathname?.startsWith('/messages') ? 0 : unreadMessages },
    { href: '/map', icon: 'map', label: t('nav.map') },
  ]
  const isActive = (href: string) => pathname === href || pathname?.startsWith(href + '/')
  const profileActive = isActive('/profile')

  return (
    <nav className="fixed z-40 bg-ink/90 backdrop-blur-xl border-line
      inset-x-0 bottom-0 border-t pb-[env(safe-area-inset-bottom)]
      md:inset-x-auto md:start-0 md:top-0 md:bottom-0 md:w-20 md:border-t-0 md:border-e md:pb-0">
      <div className="flex h-16 items-stretch justify-around px-1
        md:h-full md:flex-col md:justify-start md:items-center md:gap-2 md:px-0 md:py-6">
        <Link href="/calendar" className="hidden md:flex mb-6 text-fg" aria-label="Life in Weeks"><Logo size={28} /></Link>
        {links.map(link => {
          const active = isActive(link.href)
          return (
            <Link key={link.href} href={link.href}
              className={`relative flex flex-1 md:flex-none flex-col items-center justify-center gap-1 md:w-16 md:h-16 rounded-2xl transition
                ${active ? 'text-fg' : 'text-subtle hover:text-muted'}`}>
              <span className={`relative flex items-center justify-center w-11 h-7 rounded-full transition ${active ? 'bg-brand-soft text-brand' : ''}`}>
                <Icon name={link.icon} size={21} strokeWidth={active ? 2.1 : 1.8} />
                {link.href === '/calendar' && age !== null && (
                  <span className="absolute inset-0 flex items-center justify-center pt-[5px] text-[8.5px] font-bold leading-none tabular-nums">{age}</span>
                )}
                {!!link.badge && (
                  <span className="absolute -top-1 end-0.5 min-w-4 h-4 px-1 rounded-full bg-brand text-ink text-[10px] font-bold flex items-center justify-center">
                    {link.badge > 9 ? '9+' : link.badge}
                  </span>
                )}
              </span>
              <span className="text-[10px] leading-none font-medium">{link.label}</span>
            </Link>
          )
        })}
        <Link href="/profile"
          className={`relative flex flex-1 md:flex-none flex-col items-center justify-center gap-1 md:w-16 md:h-16 md:mt-auto rounded-2xl transition
            ${profileActive ? 'text-fg' : 'text-subtle hover:text-muted'}`}>
          <span className="flex items-center justify-center h-7">
            <Avatar url={avatarUrl} name={name} size={24} ring={profileActive} />
          </span>
          <span className="text-[10px] leading-none font-medium">{t('nav.profile')}</span>
        </Link>
      </div>
    </nav>
  )
}
