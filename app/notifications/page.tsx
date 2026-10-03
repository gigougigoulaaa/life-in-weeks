'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function NotificationsPage() {
  const [user, setUser] = useState<any>(null)
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.href = '/login'; return }
      setUser(data.user)
      loadNotifications(data.user.id)

      // Écouter les nouvelles notifications en temps réel
      const channel = supabase
        .channel('notifications')
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${data.user.id}`
        }, payload => {
          setNotifications(prev => [payload.new, ...prev])
        })
        .subscribe()

      return () => { supabase.removeChannel(channel) }
    })
  }, [])

  const loadNotifications = async (userId: string) => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
    setNotifications(data || [])
    setLoading(false)
  }

  const markAllRead = async () => {
    if (!user) return
    await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('user_id', user.id)
      .eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'follow': return '👤'
      case 'comment': return '💬'
      case 'like': return '❤️'
      case 'message': return '📨'
      default: return '🔔'
    }
  }

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    if (mins < 1) return "À l'instant"
    if (mins < 60) return `Il y a ${mins}m`
    if (hours < 24) return `Il y a ${hours}h`
    return `Il y a ${days}j`
  }

  const unreadCount = notifications.filter(n => !n.is_read).length

  return (
    <div className="min-h-screen bg-black text-white p-6 pb-20">
      <div className="max-w-2xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold">Notifications</h1>
            {unreadCount > 0 && (
              <span className="bg-white text-black text-xs font-bold px-2 py-1 rounded-full">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="text-zinc-400 text-sm hover:text-white">
              Tout marquer comme lu
            </button>
          )}
        </div>

        {loading && <p className="text-zinc-400 text-center">Chargement...</p>}

        {!loading && notifications.length === 0 && (
          <div className="text-center mt-20">
            <p className="text-4xl mb-4">🔔</p>
            <p className="text-zinc-400">Pas encore de notifications</p>
          </div>
        )}

        <div className="space-y-2">
          {notifications.map(notif => (
            <div
              key={notif.id}
              onClick={() => {
                markRead(notif.id)
                if (notif.link) window.location.href = notif.link
              }}
              className={`flex items-start gap-4 p-4 rounded-2xl cursor-pointer transition
                ${notif.is_read ? 'bg-zinc-900' : 'bg-zinc-800 border border-zinc-700'}`}
            >
              <span className="text-2xl">{getIcon(notif.type)}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm">{notif.content}</p>
                <p className="text-zinc-500 text-xs mt-1">{timeAgo(notif.created_at)}</p>
              </div>
              {!notif.is_read && (
                <div className="w-2 h-2 bg-white rounded-full mt-2 flex-shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}