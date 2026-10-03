'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export default function SearchPage() {
  const [user, setUser] = useState<any>(null)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [suggestions, setSuggestions] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { window.location.href = '/login'; return }
      setUser(data.user)
    })
  }, [])

  // Suggestions en temps réel pendant la frappe
  const fetchSuggestions = useCallback(async (q: string) => {
    if (!q.trim() || !user || q.length < 2) { setSuggestions([]); return }
    const words = q.split(' ').filter(w => w.length > 0)
    const orFilter = words.map(w => `title.ilike.%${w}%,content.ilike.%${w}%`).join(',')
    const { data } = await supabase
      .from('weeks')
      .select('id, title, week_number, year, content')
      .eq('user_id', user.id)
      .or(orFilter)
      .limit(5)
    setSuggestions(data || [])
  }, [user])

  useEffect(() => {
    const timer = setTimeout(() => fetchSuggestions(query), 200)
    return () => clearTimeout(timer)
  }, [query, fetchSuggestions])

  const search = async (q?: string) => {
    const searchQuery = q || query
    if (!searchQuery.trim() || !user) return
    setLoading(true)
    setShowSuggestions(false)
    const words = searchQuery.split(' ').filter(w => w.length > 0)
    const orFilter = words.map(w => `title.ilike.%${w}%,content.ilike.%${w}%`).join(',')
    const { data } = await supabase
      .from('weeks')
      .select('*')
      .eq('user_id', user.id)
      .or(orFilter)
      .order('year', { ascending: false })
    setResults(data || [])
    setLoading(false)
  }

  const pickSuggestion = (week: any) => {
    setQuery(week.title || `Semaine ${week.week_number} ${week.year}`)
    setSuggestions([])
    setShowSuggestions(false)
    search(week.title || '')
  }

  const highlight = (text: string, q: string) => {
    if (!q || !text) return text
    const words = q.split(' ').filter(w => w.length > 0)
    let result = text
    words.forEach(word => {
      const regex = new RegExp(`(${word})`, 'gi')
      result = result.replace(regex, '**$1**')
    })
    return result.split('**').map((part, i) =>
      words.some(w => part.toLowerCase() === w.toLowerCase())
        ? <mark key={i} className="bg-yellow-400/30 text-yellow-200 rounded px-0.5">{part}</mark>
        : part
    )
  }

  return (
    <div className="min-h-screen bg-black text-white p-6 pb-20">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Recherche</h1>

        <div className="relative mb-6">
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={e => { setQuery(e.target.value); setShowSuggestions(true) }}
              onKeyDown={e => e.key === 'Enter' && search()}
              onFocus={() => setShowSuggestions(true)}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Rechercher un souvenir..."
              className="flex-1 bg-zinc-900 text-white p-3 rounded-lg outline-none border border-zinc-800 focus:border-zinc-600"
            />
            <button onClick={() => search()}
              className="bg-white text-black font-bold px-6 rounded-lg hover:bg-zinc-200 transition">
              🔍
            </button>
          </div>

          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-zinc-900 border border-zinc-700 rounded-xl mt-1 overflow-hidden z-50 shadow-xl">
              {suggestions.map(week => (
                <button
                  key={week.id}
                  onMouseDown={() => pickSuggestion(week)}
                  className="w-full text-left px-4 py-3 hover:bg-zinc-800 transition border-b border-zinc-800 last:border-0"
                >
                  <div className="flex justify-between items-center">
                    <span className="font-medium text-sm">{week.title || 'Sans titre'}</span>
                    <span className="text-zinc-500 text-xs">S{week.week_number} {week.year}</span>
                  </div>
                  {week.content && (
                    <p className="text-zinc-400 text-xs mt-0.5 line-clamp-1">{week.content}</p>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {loading && <p className="text-zinc-400 text-center">Recherche en cours...</p>}

        {results.length === 0 && query && !loading && (
          <p className="text-zinc-400 text-center">Aucun résultat pour "{query}"</p>
        )}

        <div className="space-y-4">
          {results.map(week => (
            <div key={week.id} className="bg-zinc-900 rounded-2xl p-5 border border-zinc-800">
              <div className="flex justify-between items-start mb-2">
                <span className="text-zinc-400 text-sm">Semaine {week.week_number} — {week.year}</span>
                <span className="text-xs px-2 py-1 rounded-full bg-zinc-800 text-zinc-400">
                  {week.visibility === 'private' ? '🔒' : week.visibility === 'friends' ? '👥' : '🌍'}
                </span>
              </div>
              {week.title && (
                <h3 className="font-bold text-lg mb-1">{highlight(week.title, query)}</h3>
              )}
              {week.content && (
                <p className="text-zinc-300 text-sm line-clamp-3">{highlight(week.content, query)}</p>
              )}
              {week.media_urls?.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mt-3">
                  {week.media_urls.slice(0, 3).map((url: string, i: number) => (
                    <img key={i} src={url} alt="" className="w-full h-20 object-cover rounded-lg" />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}