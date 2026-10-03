'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export default function MessagesPage() {
  const [user, setUser] = useState<any>(null)
  const [conversations, setConversations] = useState<any[]>([])
  const [selectedUser, setSelectedUser] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const messagesEndRef = useRef<any>(null)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.href = '/login'; return }
      setUser(data.user)
      loadConversations(data.user.id)
    })
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadConversations = async (userId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*, sender:sender_id(id, username, full_name, avatar_url), receiver:receiver_id(id, username, full_name, avatar_url)')
      .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
      .order('created_at', { ascending: false })

    if (!data) return
    const seen = new Set()
    const convos: any[] = []
    data.forEach(msg => {
      const otherId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id
      if (!seen.has(otherId)) {
        seen.add(otherId)
        const other = msg.sender_id === userId ? msg.receiver : msg.sender
        convos.push({ user: other, lastMessage: msg })
      }
    })
    setConversations(convos)
  }

  const loadMessages = async (otherUserId: string) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`)
      .order('created_at', { ascending: true })
    setMessages(data || [])

    // Marquer comme lus
    await supabase.from('messages')
      .update({ is_read: true })
      .eq('sender_id', otherUserId)
      .eq('receiver_id', user.id)
      .eq('is_read', false)

    // Écouter les nouveaux messages
    const channel = supabase
      .channel(`messages-${otherUserId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages'
      }, payload => {
        const msg = payload.new as any
        if (
          (msg.sender_id === user.id && msg.receiver_id === otherUserId) ||
          (msg.sender_id === otherUserId && msg.receiver_id === user.id)
        ) {
          setMessages(prev => [...prev, msg])
        }
      })
      .subscribe()
  }

  const selectUser = async (other: any) => {
    setSelectedUser(other)
    setSearchResults([])
    setSearchQuery('')
    await loadMessages(other.id)
  }

  const sendMessage = async () => {
    if (!newMessage.trim() || !user || !selectedUser) return
    await supabase.from('messages').insert({
      sender_id: user.id,
      receiver_id: selectedUser.id,
      content: newMessage.trim()
    })
    setNewMessage('')
    loadConversations(user.id)
  }

  const searchUsers = async (q: string) => {
    setSearchQuery(q)
    if (!q.trim()) { setSearchResults([]); return }
    const { data } = await supabase
      .from('profiles')
      .select('id, username, full_name, avatar_url')
      .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`)
      .neq('id', user?.id)
      .limit(5)
    setSearchResults(data || [])
  }

  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    if (mins < 1) return "À l'instant"
    if (mins < 60) return `${mins}m`
    if (hours < 24) return `${hours}h`
    return new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
  }

  return (
    <div className="min-h-screen bg-black text-white pb-16">
      <div className="flex h-screen">

        {/* Liste des conversations */}
        <div className={`${selectedUser ? 'hidden md:flex' : 'flex'} flex-col w-full md:w-80 border-r border-zinc-800`}>
          <div className="p-4 border-b border-zinc-800">
            <h1 className="text-xl font-bold mb-3">Messages</h1>
            <input
              type="text"
              value={searchQuery}
              onChange={e => searchUsers(e.target.value)}
              placeholder="Nouvelle conversation..."
              className="w-full bg-zinc-900 text-white p-2 rounded-lg outline-none border border-zinc-800 text-sm"
            />
            {searchResults.length > 0 && (
              <div className="mt-2 bg-zinc-900 rounded-xl border border-zinc-700 overflow-hidden">
                {searchResults.map(u => (
                  <button key={u.id} onClick={() => selectUser(u)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-zinc-800 transition">
                    <div className="w-8 h-8 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
                      {u.avatar_url
                        ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center text-sm">👤</div>}
                    </div>
                    <span className="text-sm">{u.full_name || u.username}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 && (
              <p className="text-zinc-500 text-sm text-center mt-8">Aucune conversation</p>
            )}
            {conversations.map(({ user: other, lastMessage }) => (
              <button key={other?.id} onClick={() => selectUser(other)}
                className={`w-full flex items-center gap-3 p-4 hover:bg-zinc-900 transition border-b border-zinc-900
                  ${selectedUser?.id === other?.id ? 'bg-zinc-900' : ''}`}>
                <div className="w-10 h-10 rounded-full bg-zinc-800 overflow-hidden flex-shrink-0">
                  {other?.avatar_url
                    ? <img src={other.avatar_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full flex items-center justify-center">👤</div>}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <p className="font-medium text-sm truncate">{other?.full_name || other?.username || 'Utilisateur'}</p>
                  <p className="text-zinc-500 text-xs truncate">{lastMessage.content}</p>
                </div>
                <span className="text-zinc-600 text-xs">{timeAgo(lastMessage.created_at)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Conversation */}
        {selectedUser ? (
          <div className="flex flex-col flex-1">
            <div className="flex items-center gap-3 p-4 border-b border-zinc-800">
              <button onClick={() => setSelectedUser(null)} className="text-zinc-400 hover:text-white md:hidden">←</button>
              <div className="w-8 h-8 rounded-full bg-zinc-800 overflow-hidden">
                {selectedUser.avatar_url
                  ? <img src={selectedUser.avatar_url} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-sm">👤</div>}
              </div>
              <p className="font-bold">{selectedUser.full_name || selectedUser.username}</p>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.sender_id === user?.id ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-xs px-4 py-2 rounded-2xl text-sm
                    ${msg.sender_id === user?.id ? 'bg-white text-black' : 'bg-zinc-800 text-white'}`}>
                    {msg.content}
                    <p className={`text-xs mt-1 ${msg.sender_id === user?.id ? 'text-zinc-500' : 'text-zinc-500'}`}>
                      {timeAgo(msg.created_at)}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <div className="p-4 border-t border-zinc-800 flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendMessage()}
                placeholder="Écrire un message..."
                className="flex-1 bg-zinc-900 text-white p-3 rounded-xl outline-none border border-zinc-800 focus:border-zinc-600 text-sm"
              />
              <button onClick={sendMessage}
                className="bg-white text-black font-bold px-4 rounded-xl hover:bg-zinc-200 transition">
                ➤
              </button>
            </div>
          </div>
        ) : (
          <div className="hidden md:flex flex-1 items-center justify-center text-zinc-600">
            <p>Sélectionnez une conversation</p>
          </div>
        )}
      </div>
    </div>
  )
}