'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import Icon, { type IconName } from '../components/Icon'
import { btn, page, EmptyState, Skeleton, useUI } from '../components/ui'

type Notif = { id: string, type: string, content: string, is_read: boolean, created_at: string, link?: string | null }

// Icône selon le type de notification
const ICONS: Record<string, IconName> = { follow: 'userPlus', comment: 'message', reaction: 'heart', like: 'heart' }

export default function NotificationsPage() {
  const { t, timeAgo } = useI18n()
  const { toast } = useUI()
  const [userId, setUserId] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<Notif[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // « cancelled » évite de créer un abonnement si on quitte la page avant la fin du chargement
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null

    supabase.auth.getUser().then(async ({ data }) => {
      if (cancelled) return
      if (!data.user) { window.location.href = '/login'; return }
      const uid = data.user.id
      setUserId(uid)

      const { data: rows } = await supabase.from('notifications').select('*')
        .eq('user_id', uid).order('created_at', { ascending: false }).limit(50)
      if (cancelled) return
      setNotifications((rows as Notif[]) || [])
      setLoading(false)

      // Nouvelles notifications en temps réel
      channel = supabase
        .channel(`notifications-page-${uid}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${uid}` },
          payload => setNotifications(prev => prev.some(n => n.id === (payload.new as Notif).id) ? prev : [payload.new as Notif, ...prev]))
        .subscribe()
    })

    // Nettoyage au démontage : on ferme l'abonnement temps réel
    return () => {
      cancelled = true
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  const markAllRead = async () => {
    if (!userId) return
    const before = notifications
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    const { error } = await supabase.from('notifications').update({ is_read: true })
      .eq('user_id', userId).eq('is_read', false)
    if (error) { setNotifications(before); toast(t('common.error'), 'error') }
  }

  const open = async (n: Notif) => {
    if (!n.is_read) {
      setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x))
      await supabase.from('notifications').update({ is_read: true }).eq('id', n.id)
    }
    if (n.link) window.location.assign(n.link)
  }

  const unread = notifications.filter(n => !n.is_read).length

  return (
    <main className={page}>
      <header className="flex items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('notif.title')}</h1>
          {!loading && notifications.length > 0 && (
            <p className="text-sm text-muted mt-1">{unread > 0 ? t('notif.unread', { n: unread }) : t('notif.allRead')}</p>
          )}
        </div>
        {unread > 0 && (
          <button onClick={markAllRead} className={btn.ghost}>
            <Icon name="check" size={16} />{t('notif.markAll')}
          </button>
        )}
      </header>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 p-3">
              <Skeleton className="w-10 h-10 rounded-full" />
              <div className="flex-1 flex flex-col gap-2"><Skeleton className="h-3.5 w-3/4" /><Skeleton className="h-3 w-1/4" /></div>
            </div>
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <EmptyState icon="bell" title={t('notif.empty')} text={t('notif.emptyText')} />
      ) : (
        <ul className="flex flex-col gap-1">
          {notifications.map(n => (
            <li key={n.id}>
              <button onClick={() => open(n)}
                className={`w-full flex items-start gap-3 p-3 rounded-2xl text-start transition active:scale-[0.99] hover:bg-surface-2 ${n.is_read ? '' : 'bg-surface'}`}>
                <span className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center ${n.is_read ? 'bg-surface-2 text-muted' : 'bg-brand-soft text-brand'}`}>
                  <Icon name={ICONS[n.type] || 'bell'} size={18} filled={n.type === 'reaction' && !n.is_read} />
                </span>
                <span className="flex-1 min-w-0 pt-0.5">
                  <span className={`block text-sm leading-snug ${n.is_read ? 'text-muted' : 'text-fg'}`}>{n.content}</span>
                  <span className="block text-xs text-subtle mt-1">{timeAgo(n.created_at, true)}</span>
                </span>
                {!n.is_read && <span className="w-2 h-2 mt-2 shrink-0 rounded-full bg-brand" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
