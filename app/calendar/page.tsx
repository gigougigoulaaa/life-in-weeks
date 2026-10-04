'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'

function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)
}

function getWeekDates(year: number, week: number): Date[] {
  const jan1 = new Date(year, 0, 1)
  const dayOfWeek = jan1.getDay()
  const daysToFirstWeek = (dayOfWeek <= 1 ? 1 - dayOfWeek : 8 - dayOfWeek)
  const firstMonday = new Date(year, 0, 1 + daysToFirstWeek)
  const weekStart = new Date(firstMonday)
  weekStart.setDate(firstMonday.getDate() + (week - 1) * 7)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(weekStart.getDate() + i)
    return d
  })
}

const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

type ThemeType = {
  name: string
  accent: string   // semaine actuelle
  past: string     // semaines passées
  bg: string       // fond
  text?: string    // titre, boutons
  label?: string   // années et numéros de semaines
  future?: string  // contour des semaines à venir
  filled?: string  // semaines remplies
  memory?: string  // semaines de souvenirs
}

const THEMES: ThemeType[] = [
  { name: 'Défaut', accent: '#ffffff', past: '#52525b', bg: '#000000' },
  { name: 'Océan', accent: '#38bdf8', past: '#0369a1', bg: '#0c1a2e' },
  { name: 'Forêt', accent: '#4ade80', past: '#166534', bg: '#0a1a0e' },
  { name: 'Coucher de soleil', accent: '#fb923c', past: '#9a3412', bg: '#1a0a00' },
  { name: 'Rose', accent: '#f472b6', past: '#9d174d', bg: '#1a0010' },
  { name: 'Violet', accent: '#a78bfa', past: '#5b21b6', bg: '#0d0a1a' },
  { name: 'Or', accent: '#fbbf24', past: '#92400e', bg: '#1a1400' },
]

const END_YEAR = 2150

// Éléments dont la couleur est modifiable
const COLOR_FIELDS: { key: keyof ThemeType, label: string }[] = [
  { key: 'bg', label: 'Fond' },
  { key: 'text', label: 'Texte (titre, boutons)' },
  { key: 'label', label: 'Années et numéros de semaines' },
  { key: 'past', label: 'Semaines passées' },
  { key: 'accent', label: 'Semaine actuelle' },
  { key: 'filled', label: 'Semaines remplies' },
  { key: 'memory', label: 'Semaines de souvenirs' },
  { key: 'future', label: 'Semaines à venir (contour)' },
]

const EMPTY_DAYS = () => Array(7).fill(null).map(() => ({ events: [] }))

function parseDays(raw: any): any[] {
  if (!Array.isArray(raw) || raw.length === 0) return EMPTY_DAYS()
  const result = EMPTY_DAYS()
  for (let i = 0; i < 7; i++) {
    if (raw[i] && Array.isArray(raw[i].events)) result[i] = { events: raw[i].events }
  }
  return result
}

// Sur téléphone : grosses cases fixes (16 px), toute la vie jusqu'à END_YEAR.
// La page défile normalement vers le bas ; seule la grille défile à l'horizontale.
// Sur ordinateur : les 52 semaines tiennent toujours dans la largeur disponible.
function computeLayout(containerWidth: number) {
  const isMobile = containerWidth < 600
  if (isMobile) {
    return { cellSize: 16, cellGap: 4, yearColWidth: 34, sideMargin: 4, isMobile }
  }
  const yearColWidth = 80
  const sideMargin = 35
  const available = containerWidth - sideMargin * 2 - yearColWidth
  const ratio = 1.3
  let cellSize = available / (52 * ratio)
  cellSize = Math.max(5, Math.min(cellSize, 16))
  const cellGap = cellSize * 0.3
  return { cellSize, cellGap, yearColWidth, sideMargin, isMobile }
}

export default function CalendarPage() {
  const [user, setUser] = useState<any>(null)
  const [birthDate, setBirthDate] = useState<Date | null>(null)
  const [inputDate, setInputDate] = useState('')
  const [selectedWeek, setSelectedWeek] = useState<{year: number, week: number} | null>(null)
  const [savedWeeks, setSavedWeeks] = useState<any[]>([])
  const [showThemes, setShowThemes] = useState(false)
  const [theme, setTheme] = useState<ThemeType>(THEMES[0])
  const [cellShape, setCellShape] = useState('rounded-full')
  const [bgImage, setBgImage] = useState('')
  const [uploadingBg, setUploadingBg] = useState(false)
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null)
  const [memories, setMemories] = useState<any[]>([])
  const [showMemories, setShowMemories] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [userResults, setUserResults] = useState<any[]>([])
  const [showSearch, setShowSearch] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<any[]>([])
  const [showNotifs, setShowNotifs] = useState(false)
  const [days, setDays] = useState<any[]>(EMPTY_DAYS())
  const [selectedDay, setSelectedDay] = useState<number | null>(null)
  const [showDays, setShowDays] = useState(false)
  const [newEventTitle, setNewEventTitle] = useState('')
  const [newEventDesc, setNewEventDesc] = useState('')
  const [newEventPhotos, setNewEventPhotos] = useState<string[]>([])
  const [uploadingEvent, setUploadingEvent] = useState(false)

  const [layout, setLayout] = useState(() =>
    computeLayout(typeof window !== 'undefined' ? window.innerWidth : 1000)
  )
  const containerRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const headerStripRef = useRef<HTMLDivElement>(null)

  const searchTimerRef = useRef<any>(null)
  const saveThemeTimerRef = useRef<any>(null)

  const currentYear = new Date().getFullYear()
  const currentWeek = getWeekNumber(new Date())

  useEffect(() => {
    const updateLayout = () => {
      const width = containerRef.current?.offsetWidth || window.innerWidth
      setLayout(computeLayout(width))
    }
    updateLayout()
    window.addEventListener('resize', updateLayout)
    return () => window.removeEventListener('resize', updateLayout)
  }, [birthDate])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.href = '/login'; return }
      setUser(data.user)
      loadWeeks(data.user.id)
      const { data: profile } = await supabase
        .from('profiles').select('birth_date, theme').eq('id', data.user.id).single()
      if (profile?.birth_date) setBirthDate(new Date(profile.birth_date))
      if (profile?.theme) {
        if (profile.theme.accent) setTheme(profile.theme)
        if (profile.theme.cellShape) setCellShape(profile.theme.cellShape)
        if (profile.theme.bgImage) setBgImage(profile.theme.bgImage)
      }
      loadMemories(data.user.id)
      loadNotifications(data.user.id)
    })
  }, [])

  const loadWeeks = async (userId: string) => {
    const { data } = await supabase.from('weeks').select('*').eq('user_id', userId)
    if (data) setSavedWeeks(data)
  }

  const loadMemories = async (userId: string) => {
    const { data: weeks } = await supabase.from('weeks').select('*').eq('user_id', userId)
      .eq('week_number', currentWeek).neq('year', currentYear).order('year', { ascending: false })
    if (weeks && weeks.length > 0) { setMemories(weeks); setShowMemories(true) }
  }

  const loadNotifications = async (userId: string) => {
    const { data } = await supabase.from('notifications').select('*').eq('user_id', userId)
      .order('created_at', { ascending: false }).limit(10)
    setNotifications(data || [])
    setUnreadCount((data || []).filter((n: any) => !n.is_read).length)
  }

  const markAllRead = async () => {
    if (!user) return
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }

  const handleSearch = async (q: string) => {
    setSearchQuery(q)
    if (!q.trim()) { setSearchResults([]); setUserResults([]); setShowSearch(false); return }
    setShowSearch(true)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(async () => {
      if (!user) return
      const words = q.split(' ').filter(w => w.length > 0)
      const orFilter = words.map(w => `title.ilike.%${w}%,content.ilike.%${w}%`).join(',')
      const { data: weeks } = await supabase.from('weeks').select('*').eq('user_id', user.id).or(orFilter).limit(4)
      setSearchResults(weeks || [])
      const { data: users } = await supabase.from('profiles').select('id, username, full_name, avatar_url')
        .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`).neq('id', user.id).limit(3)
      setUserResults(users || [])
    }, 300)
  }

  const saveTheme = async (newTheme: any, shape?: string, bg?: string) => {
    if (!user) return
    await supabase.from('profiles').upsert({ id: user.id, theme: { ...newTheme, cellShape: shape || cellShape, bgImage: bg !== undefined ? bg : bgImage } })
  }

  // Couleurs effectives (valeurs par défaut si l'utilisateur n'a rien choisi)
  const textColor = theme.text ?? '#ffffff'
  const labelColor = theme.label ?? theme.past
  const futureColor = theme.future ?? theme.past + '60'
  const fillColor = theme.filled ?? theme.accent
  const memoryColor = theme.memory ?? '#fbbf24'

  const getColor = (key: keyof ThemeType): string => {
    switch (key) {
      case 'text': return textColor
      case 'label': return labelColor
      case 'future': return theme.future ?? theme.past
      case 'filled': return fillColor
      case 'memory': return memoryColor
      default: return theme[key] as string
    }
  }

  // Change une couleur tout de suite à l'écran, puis l'enregistre une fois le choix terminé
  const updateColor = (key: keyof ThemeType, value: string) => {
    const newTheme: ThemeType = { ...theme, [key]: value, name: 'Personnalisé' }
    setTheme(newTheme)
    if (saveThemeTimerRef.current) clearTimeout(saveThemeTimerRef.current)
    saveThemeTimerRef.current = setTimeout(() => saveTheme(newTheme), 600)
  }

  const resetColors = () => {
    setTheme(THEMES[0])
    saveTheme(THEMES[0])
  }

  const uploadBgImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file || !user) return
    setUploadingBg(true)
    const filePath = `bg_${user.id}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage.from('avatars').upload(filePath, file, { upsert: true })
    if (!error) {
      const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
      setBgImage(data.publicUrl); saveTheme(theme, cellShape, data.publicUrl)
    }
    setUploadingBg(false)
  }

  const saveBirthDate = async () => {
    if (!inputDate || !user) return
    setBirthDate(new Date(inputDate))
    await supabase.from('profiles').upsert({ id: user.id, birth_date: inputDate })
  }

  const resetEventForm = () => {
    setNewEventTitle('')
    setNewEventDesc('')
    setNewEventPhotos([])
  }

  const openWeek = async (year: number, week: number) => {
    setSelectedWeek({ year, week })
    setShowDays(false)
    setSelectedDay(null)
    resetEventForm()
    setDays(EMPTY_DAYS())
    setSelectedWeekId(null)
    if (!user) return
    const { data, error } = await supabase
      .from('weeks').select('*')
      .eq('user_id', user.id).eq('year', year).eq('week_number', week)
    if (error || !data || data.length === 0) return
    const existing = data[0]
    setSelectedWeekId(existing.id)
    setDays(parseDays(existing.days))
  }

  const uploadEventPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || !user || !selectedWeek) return
    setUploadingEvent(true)
    const urls: string[] = []
    for (const file of Array.from(files)) {
      const filePath = `${user.id}/event_${Date.now()}_${file.name}`
      const { error } = await supabase.storage.from('weeks-media').upload(filePath, file)
      if (!error) {
        const { data } = supabase.storage.from('weeks-media').getPublicUrl(filePath)
        urls.push(data.publicUrl)
      }
    }
    setNewEventPhotos(prev => [...prev, ...urls])
    setUploadingEvent(false)
  }

  const addEventToDay = async (dayIndex: number) => {
    if (!newEventTitle.trim() || !user || !selectedWeek) return
    const newEvent = { text: newEventTitle.trim(), description: newEventDesc.trim(), photos: newEventPhotos }
    const updatedDays = days.map((d, i) =>
      i === dayIndex ? { events: [...(d?.events || []), newEvent] } : d
    )
    setDays(updatedDays)
    resetEventForm()
    if (selectedWeekId) {
      await supabase.from('weeks').update({ days: updatedDays }).eq('id', selectedWeekId)
    } else {
      const { data } = await supabase.from('weeks').insert({
        user_id: user.id, year: selectedWeek.year, week_number: selectedWeek.week,
        title: '', content: '', visibility: 'private', days: updatedDays
      }).select().single()
      if (data) setSelectedWeekId(data.id)
    }
    await loadWeeks(user.id)
  }

  const deleteEventFromDay = async (dayIndex: number, eventIndex: number) => {
    const updatedDays = days.map((d, i) =>
      i === dayIndex ? { events: (d?.events || []).filter((_: any, j: number) => j !== eventIndex) } : d
    )
    setDays(updatedDays)
    if (selectedWeekId) {
      await supabase.from('weeks').update({ days: updatedDays }).eq('id', selectedWeekId)
      await loadWeeks(user.id)
    }
  }

  const handleLogout = async () => { await supabase.auth.signOut(); window.location.href = '/login' }
  const timeAgo = (date: string) => {
    const diff = Date.now() - new Date(date).getTime()
    const mins = Math.floor(diff / 60000), hours = Math.floor(diff / 3600000), d2 = Math.floor(diff / 86400000)
    if (mins < 1) return "À l'instant"; if (mins < 60) return `${mins}m`; if (hours < 24) return `${hours}h`; return `${d2}j`
  }

  const startYear = birthDate ? birthDate.getFullYear() : null
  const years = startYear ? Array.from({ length: END_YEAR - startYear + 1 }, (_, i) => startYear + i) : []
  const weekDates = selectedWeek ? getWeekDates(selectedWeek.year, selectedWeek.week) : []
  const totalEvents = days.reduce((acc, d) => acc + (d?.events?.length || 0), 0)
  const { cellSize, cellGap, yearColWidth, sideMargin } = layout

  // Garde les numéros de semaines alignés avec la grille pendant le défilement horizontal
  const syncHeader = () => {
    const el = scrollRef.current
    const strip = headerStripRef.current
    if (el && strip) strip.style.transform = `translateX(${-el.scrollLeft}px)`
  }

  // Centre la semaine actuelle : horizontalement dans la grille, verticalement sur la page
  const focusCurrentWeek = (smooth = false) => {
    const el = scrollRef.current
    if (!el) return
    const x = yearColWidth + (currentWeek - 1) * (cellSize + cellGap) + cellSize / 2 - el.clientWidth / 2
    el.scrollTo({ left: Math.max(0, x), behavior: smooth ? 'smooth' : 'auto' })
    const row = el.querySelector(`[data-year="${currentYear}"]`) as HTMLElement | null
    if (row) {
      const y = row.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.4
      window.scrollTo({ top: Math.max(0, y), behavior: smooth ? 'smooth' : 'auto' })
    }
    syncHeader()
  }

  // Focus automatique : à l'ouverture et à la rotation de l'écran
  useEffect(() => {
    if (!birthDate || !layout.isMobile) return
    focusCurrentWeek()
  }, [birthDate, layout.isMobile, layout.cellSize])

  const renderCell = (year: number, weekNum: number) => {
    const isPast = year < currentYear || (year === currentYear && weekNum < currentWeek)
    const isCurrent = year === currentYear && weekNum === currentWeek
    const isBeforeBirth = birthDate && year === birthDate.getFullYear() && weekNum < getWeekNumber(birthDate)
    const hasSaved = savedWeeks.find(w => w.year === year && w.week_number === weekNum)
    const hasLocation = hasSaved?.location
    const isMemory = memories.find(m => m.year === year && m.week_number === weekNum)
    return (
      <div key={weekNum}
        onClick={() => !isBeforeBirth && openWeek(year, weekNum)}
        className={`${cellShape} transition-transform hover:scale-125 ${isBeforeBirth ? 'cursor-default' : 'cursor-pointer'}`}
        style={{
          width: cellSize, height: cellSize, marginRight: cellGap, flexShrink: 0,
          opacity: isBeforeBirth ? 0 : 1,
          backgroundColor: isBeforeBirth ? 'transparent' : isCurrent ? theme.accent : isMemory ? memoryColor : hasSaved ? fillColor + '99' : isPast ? theme.past : 'transparent',
          borderWidth: isBeforeBirth ? 0 : 1, borderStyle: 'solid',
          borderColor: isBeforeBirth ? 'transparent' : isCurrent ? theme.accent : isMemory ? memoryColor : hasSaved ? fillColor : isPast ? theme.past : futureColor,
          outline: hasLocation ? `2px solid ${theme.accent}` : undefined
        }} />
    )
  }

  return (
    <div className="min-h-screen pb-20" style={{
      color: textColor,
      backgroundColor: theme.bg,
      backgroundImage: bgImage ? `url(${bgImage})` : undefined,
      backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed'
    }}>
      <div className="px-4 pt-6 sm:pt-8">

        {/* Header */}
        <div className="flex justify-between items-center mb-6 sm:mb-16">
          <h1 className="text-xl sm:text-3xl font-bold whitespace-nowrap">Life in Weeks</h1>
          <div className="flex gap-1 sm:gap-2 items-center flex-shrink-0">
            {memories.length > 0 && (
              <button onClick={() => setShowMemories(true)}
                className="text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-yellow-500 text-yellow-400 hover:bg-yellow-500/10 transition whitespace-nowrap">
                ✨ {memories.length}
              </button>
            )}
            <button onClick={() => setShowNotifs(!showNotifs)}
              className="relative text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500 transition">
              🔔
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-white text-black font-bold w-4 h-4 rounded-full flex items-center justify-center text-xs">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <button onClick={() => setShowThemes(!showThemes)}
              className="text-xs sm:text-sm px-2 sm:px-3 py-1 sm:py-1.5 rounded-lg border border-zinc-700 hover:border-zinc-500 transition whitespace-nowrap">
              🎨 <span className="hidden sm:inline">Thème</span>
            </button>
            <button onClick={handleLogout} className="text-zinc-500 hover:text-white text-xs sm:text-sm whitespace-nowrap">
              <span className="sm:hidden">Sortir</span>
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>

        {/* Barre de recherche */}
        <div className="relative mb-4 sm:mb-8">
          <input type="text" value={searchQuery} onChange={e => handleSearch(e.target.value)}
            onFocus={() => searchQuery && setShowSearch(true)}
            onBlur={() => setTimeout(() => setShowSearch(false), 200)}
            placeholder="🔍 Rechercher..."
            className="w-full bg-zinc-900/90 text-white px-3 py-2 sm:py-2.5 rounded-xl outline-none border border-zinc-800 focus:border-zinc-600 text-sm" />
          {showSearch && (searchResults.length > 0 || userResults.length > 0) && (
            <div className="absolute left-0 right-0 mt-1 bg-zinc-900 rounded-xl border border-zinc-700 z-30 shadow-2xl overflow-hidden">
              {searchResults.length > 0 && (
                <div>
                  <p className="text-zinc-500 text-xs px-3 pt-2 pb-1">📅 Souvenirs</p>
                  {searchResults.map(week => (
                    <button key={week.id} onMouseDown={() => { openWeek(week.year, week.week_number); setShowSearch(false); setSearchQuery('') }}
                      className="w-full text-left px-3 py-2 hover:bg-zinc-800 border-b border-zinc-800 last:border-0">
                      <p className="text-sm font-medium">{week.title || `Semaine ${week.week_number}`}</p>
                      <p className="text-zinc-500 text-xs">Semaine {week.week_number} — {week.year}</p>
                    </button>
                  ))}
                </div>
              )}
              {userResults.length > 0 && (
                <div>
                  <p className="text-zinc-500 text-xs px-3 pt-2 pb-1">👥 Personnes</p>
                  {userResults.map(u => (
                    <button key={u.id} onMouseDown={() => { window.location.href = '/users'; setShowSearch(false) }}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-zinc-800">
                      <div className="w-7 h-7 rounded-full bg-zinc-700 overflow-hidden flex-shrink-0">
                        {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs">👤</div>}
                      </div>
                      <div>
                        <p className="text-sm">{u.full_name || u.username}</p>
                        {u.username && <p className="text-zinc-500 text-xs">@{u.username}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Panel notifications */}
        {showNotifs && (
          <div className="bg-zinc-900/90 rounded-2xl p-4 mb-3 border border-zinc-800">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-bold text-sm">Notifications</h3>
              <div className="flex gap-2">
                {unreadCount > 0 && <button onClick={markAllRead} className="text-xs text-zinc-400 hover:text-white">Tout lire</button>}
                <button onClick={() => setShowNotifs(false)} className="text-zinc-500 hover:text-white text-xs">✕</button>
              </div>
            </div>
            {notifications.length === 0 ? (
              <p className="text-zinc-500 text-sm text-center py-2">Pas encore de notifications</p>
            ) : (
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {notifications.map(notif => (
                  <div key={notif.id} className={`flex items-start gap-2 p-2 rounded-xl ${notif.is_read ? '' : 'bg-zinc-800'}`}>
                    <span>{notif.type === 'follow' ? '👤' : notif.type === 'comment' ? '💬' : '🔔'}</span>
                    <div className="flex-1">
                      <p className="text-xs">{notif.content}</p>
                      <p className="text-zinc-500 text-xs">{timeAgo(notif.created_at)}</p>
                    </div>
                    {!notif.is_read && <div className="w-1.5 h-1.5 bg-white rounded-full mt-1 flex-shrink-0" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Panel thème */}
        {showThemes && (
          <div className="bg-black/80 rounded-2xl p-4 mb-3 border border-zinc-800">
            <h2 className="font-bold mb-3 text-sm">🎨 Personnalisation</h2>
            <p className="text-zinc-400 text-xs mb-2">Couleur</p>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {THEMES.map(t => (
                <button key={t.name} onClick={() => { setTheme(t); saveTheme(t) }}
                  className={`p-1.5 rounded-xl border transition text-xs ${theme.name === t.name ? 'border-white' : 'border-zinc-700'}`}
                  style={{ backgroundColor: t.bg }}>
                  <div className="flex gap-1 justify-center mb-1">
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: t.past }} />
                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: t.accent }} />
                  </div>
                  <span style={{ color: t.accent, fontSize: '9px' }}>{t.name}</span>
                </button>
              ))}
            </div>
            <p className="text-zinc-400 text-xs mb-2">Couleurs personnalisées</p>
            <div className="space-y-2 mb-3">
              {COLOR_FIELDS.map(f => (
                <label key={f.key} className="flex items-center justify-between gap-3 text-xs text-zinc-300">
                  <span>{f.label}</span>
                  <input type="color" value={getColor(f.key)} onChange={e => updateColor(f.key, e.target.value)}
                    className="w-10 h-7 rounded cursor-pointer border border-zinc-700 bg-transparent p-0" />
                </label>
              ))}
            </div>
            <button onClick={resetColors}
              className="mb-4 px-3 py-1.5 rounded-lg text-xs border border-zinc-700 text-zinc-400 hover:border-zinc-500 transition">
              Réinitialiser les couleurs
            </button>
            <p className="text-zinc-400 text-xs mb-2">Forme des cases</p>
            <div className="flex gap-2 mb-4">
              {[{ label: 'Carré', value: 'rounded-none' }, { label: 'Rond', value: 'rounded-full' }].map(s => (
                <button key={s.value} onClick={() => { setCellShape(s.value); saveTheme(theme, s.value) }}
                  className={`px-3 py-1.5 rounded-lg text-xs border transition ${cellShape === s.value ? 'border-white text-white' : 'border-zinc-700 text-zinc-400'}`}>
                  {s.label}
                </button>
              ))}
            </div>
            <p className="text-zinc-400 text-xs mb-2">Fond</p>
            <div className="flex gap-2 flex-wrap">
              <label className="px-2 py-1 rounded-lg text-xs border border-zinc-700 cursor-pointer hover:border-zinc-500 transition">
                {uploadingBg ? 'Upload...' : '📷 Photo'}
                <input type="file" accept="image/*" onChange={uploadBgImage} className="hidden" />
              </label>
              {bgImage && (
                <button onClick={() => { setBgImage(''); saveTheme(theme, cellShape, '') }}
                  className="px-2 py-1 rounded-lg text-xs border border-zinc-700 text-zinc-400">✕ Supprimer</button>
              )}
            </div>
          </div>
        )}

        {!birthDate ? (
          <div className="bg-zinc-900 p-6 rounded-2xl max-w-sm mx-auto text-center mt-8">
            <h2 className="text-lg font-bold mb-3">Votre date de naissance ?</h2>
            <input type="date" value={inputDate} onChange={e => setInputDate(e.target.value)}
              className="w-full bg-zinc-800 text-white p-3 rounded-lg mb-3 outline-none" />
            <button onClick={saveBirthDate} className="w-full bg-white text-black font-bold p-3 rounded-lg hover:bg-zinc-200 transition">
              Générer mon calendrier
            </button>
          </div>
        ) : (
          <div ref={containerRef} className={layout.isMobile ? 'w-full' : 'w-full overflow-x-hidden'} style={{ paddingLeft: sideMargin, paddingRight: sideMargin }}>

            {layout.isMobile ? (
              <>
                {/* Numéros de semaines : restent en haut de l'écran quand on descend dans la page */}
                <div className="flex" style={{
                  position: 'sticky', top: 0, zIndex: 20, paddingBottom: 6, paddingTop: 4,
                  backgroundColor: theme.bg + 'f2'
                }}>
                  <div style={{ width: yearColWidth, flexShrink: 0 }} />
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div ref={headerStripRef} className="flex" style={{ width: 52 * (cellSize + cellGap), willChange: 'transform' }}>
                      {Array.from({ length: 52 }, (_, i) => {
                        const n = i + 1
                        const isNow = n === currentWeek
                        const show = n === 1 || n % 5 === 0 || isNow
                        return (
                          <div key={i} style={{
                            width: cellSize, marginRight: cellGap, flexShrink: 0, textAlign: 'center',
                            fontSize: '9px', lineHeight: 1,
                            color: isNow ? theme.accent : labelColor,
                            fontWeight: isNow ? 700 : 400
                          }}>
                            {show ? n : ''}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* Toute la vie : la page défile vers le bas, la grille défile à l'horizontale */}
                <div ref={scrollRef} onScroll={syncHeader} className="overflow-x-auto">
                  <div style={{ width: yearColWidth + 52 * (cellSize + cellGap), position: 'relative' }}>
                    {years.map(year => (
                      <div key={year} data-year={year} className="flex items-center" style={{ marginBottom: cellGap + 2 }}>
                        <div style={{
                          width: yearColWidth, flexShrink: 0, position: 'sticky', left: 0, zIndex: 5,
                          backgroundColor: theme.bg + 'e6', textAlign: 'right', paddingRight: 8,
                          color: year === currentYear ? theme.accent : labelColor,
                          fontWeight: year === currentYear ? 700 : 400,
                          fontSize: '11px', lineHeight: `${cellSize}px`
                        }}>
                          {year}
                        </div>
                        {Array.from({ length: 52 }, (_, i) => renderCell(year, i + 1))}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bouton flottant : retour à la semaine actuelle */}
                <button onClick={() => focusCurrentWeek(true)}
                  className="fixed right-4 bottom-24 z-30 px-3 h-9 rounded-full border text-xs font-medium whitespace-nowrap"
                  style={{ borderColor: theme.accent, color: theme.accent, backgroundColor: theme.bg + 'e6' }}>
                  Aujourd'hui
                </button>
              </>
            ) : (
              <>
                {/* Numéros de semaines */}
                <div className="flex" style={{ paddingLeft: yearColWidth, marginBottom: '5px' }}>
                  {Array.from({ length: 52 }, (_, i) => (
                    <div key={i} style={{
                      width: cellSize, marginRight: cellGap, flexShrink: 0,
                      textAlign: 'center', fontSize: cellSize < 6 ? '0px' : '9px', lineHeight: 1, color: labelColor
                    }}>
                      {(i + 1) % 5 === 0 ? i + 1 : ''}
                    </div>
                  ))}
                </div>

                {/* Grille complète (ordinateur) */}
                {years.map(year => (
                  <div key={year} className="flex items-center" style={{ marginBottom: cellGap }}>
                    <div style={{
                      width: yearColWidth, flexShrink: 0, textAlign: 'right',
                      paddingRight: '8px', color: labelColor, fontSize: cellSize < 6 ? '8px' : '11px', lineHeight: 1,
                      opacity: year % 5 === 0 ? 1 : 0
                    }}>
                      {year}
                    </div>
                    {Array.from({ length: 52 }, (_, i) => renderCell(year, i + 1))}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>

      {/* Panel Memories */}
      {showMemories && memories.length > 0 && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-xl font-bold">✨ Souvenirs</h2>
                <p className="text-zinc-400 text-sm">Cette semaine dans votre passé</p>
              </div>
              <button onClick={() => setShowMemories(false)} className="text-zinc-400 hover:text-white text-xl">✕</button>
            </div>
            <div className="space-y-4">
              {memories.map(memory => (
                <div key={memory.id} className="bg-zinc-800 rounded-xl p-4 border border-yellow-500/30">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-yellow-400 font-bold text-sm">Il y a {currentYear - memory.year} an{currentYear - memory.year > 1 ? 's' : ''}</span>
                    <span className="text-zinc-500 text-xs">— {memory.year}</span>
                  </div>
                  {memory.title && <h3 className="font-bold mb-1 text-sm">{memory.title}</h3>}
                  {memory.content && <p className="text-zinc-300 text-xs line-clamp-3">{memory.content}</p>}
                  <button onClick={() => { setShowMemories(false); openWeek(memory.year, memory.week_number) }}
                    className="mt-2 text-yellow-400 text-xs hover:text-yellow-300">Voir cette semaine →</button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Popup semaine */}
      {selectedWeek && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-zinc-900 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex border-b border-zinc-800 sticky top-0 bg-zinc-900 rounded-t-2xl z-10">
              <button onClick={() => setShowDays(false)}
                className={`flex-1 py-3 text-sm font-medium transition ${!showDays ? 'text-white border-b-2 border-white' : 'text-zinc-500'}`}>
                Vue d'ensemble
              </button>
              <button onClick={() => setShowDays(true)}
                className={`flex-1 py-3 text-sm font-medium transition ${showDays ? 'text-white border-b-2 border-white' : 'text-zinc-500'}`}>
                Journées
              </button>
              <button onClick={() => setSelectedWeek(null)} className="px-4 text-zinc-500 hover:text-white text-lg">✕</button>
            </div>

            <div className="p-5">
              <p className="text-zinc-500 text-xs mb-4">Semaine {selectedWeek.week} — {selectedWeek.year}</p>

              {!showDays ? (
                <div>
                  {totalEvents === 0 ? (
                    <div className="text-center py-12">
                      <p className="text-zinc-600 text-sm mb-3">Aucun évènement cette semaine</p>
                      <button onClick={() => setShowDays(true)}
                        className="text-sm px-4 py-2 rounded-xl border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition">
                        + Ajouter des évènements
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {DAY_NAMES.map((dayName, dayIndex) => {
                        const date = weekDates[dayIndex]
                        const events = days[dayIndex]?.events || []
                        if (events.length === 0) return null
                        return (
                          <div key={dayIndex}>
                            <div className="flex items-center gap-2 mb-2">
                              <span className="text-sm font-bold">{dayName}</span>
                              {date && <span className="text-zinc-600 text-xs">{date.getDate()}/{date.getMonth() + 1}</span>}
                            </div>
                            <div className="space-y-2 pl-3 border-l border-zinc-800">
                              {events.map((event: any, eventIndex: number) => (
                                <div key={eventIndex} className="bg-zinc-800/50 rounded-xl p-3">
                                  <p className="text-sm font-medium text-white">• {event.text}</p>
                                  {event.description && <p className="text-zinc-400 text-xs mt-1">{event.description}</p>}
                                  {event.photos?.length > 0 && (
                                    <div className="grid grid-cols-3 gap-1.5 mt-2">
                                      {event.photos.map((url: string, pi: number) => (
                                        <img key={pi} src={url} alt="" className="w-full h-14 object-cover rounded-lg" />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  {DAY_NAMES.map((dayName, dayIndex) => {
                    const date = weekDates[dayIndex]
                    const dayData = days[dayIndex] || { events: [] }
                    const isOpen = selectedDay === dayIndex
                    return (
                      <div key={dayIndex} className="bg-zinc-800 rounded-xl overflow-hidden">
                        <button
                          onClick={() => { setSelectedDay(isOpen ? null : dayIndex); resetEventForm() }}
                          className="w-full flex items-center justify-between px-4 py-3 hover:bg-zinc-700 transition">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-medium">{dayName}</span>
                            {date && <span className="text-zinc-500 text-xs">{date.getDate()}/{date.getMonth() + 1}</span>}
                            {dayData.events?.length > 0 && (
                              <span className="bg-zinc-700 text-zinc-300 text-xs px-1.5 py-0.5 rounded-full">{dayData.events.length}</span>
                            )}
                          </div>
                          <span className="text-zinc-500 text-xs">{isOpen ? '▲' : '▼'}</span>
                        </button>
                        {isOpen && (
                          <div className="px-4 pb-4">
                            {dayData.events?.length > 0 && (
                              <div className="space-y-2 mb-4">
                                {dayData.events.map((event: any, eventIndex: number) => (
                                  <div key={eventIndex} className="bg-zinc-900 rounded-xl p-3">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2">
                                          <div className="w-1.5 h-1.5 rounded-full bg-white flex-shrink-0" />
                                          <p className="text-sm font-medium text-zinc-200">{event.text}</p>
                                        </div>
                                        {event.description && <p className="text-zinc-500 text-xs mt-1 ml-3.5">{event.description}</p>}
                                        {event.photos?.length > 0 && (
                                          <div className="grid grid-cols-3 gap-1.5 mt-2 ml-3.5">
                                            {event.photos.map((url: string, pi: number) => (
                                              <img key={pi} src={url} alt="" className="w-full h-12 object-cover rounded-lg" />
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                      <button onClick={() => deleteEventFromDay(dayIndex, eventIndex)}
                                        className="text-zinc-600 hover:text-red-400 text-sm flex-shrink-0 transition">🗑️</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            <div className="bg-zinc-900 rounded-xl p-3 space-y-2">
                              <p className="text-zinc-500 text-xs font-medium">+ Nouvel évènement</p>
                              <input type="text" value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && addEventToDay(dayIndex)}
                                placeholder="Titre *"
                                className="w-full bg-zinc-800 text-white p-2 rounded-lg outline-none text-sm border border-zinc-700 focus:border-zinc-500" />
                              <textarea value={newEventDesc} onChange={e => setNewEventDesc(e.target.value)}
                                placeholder="Description (optionnel)" rows={2}
                                className="w-full bg-zinc-800 text-white p-2 rounded-lg outline-none text-sm border border-zinc-700 focus:border-zinc-500 resize-none" />
                              <div>
                                <label className="flex items-center gap-2 bg-zinc-800 text-zinc-400 p-2 rounded-lg cursor-pointer hover:bg-zinc-700 text-xs border border-zinc-700 transition">
                                  📷 {uploadingEvent ? 'Upload...' : `Ajouter des photos${newEventPhotos.length > 0 ? ` (${newEventPhotos.length})` : ''}`}
                                  <input type="file" accept="image/*" multiple onChange={uploadEventPhoto} className="hidden" />
                                </label>
                                {newEventPhotos.length > 0 && (
                                  <div className="grid grid-cols-3 gap-1.5 mt-2">
                                    {newEventPhotos.map((url, pi) => (
                                      <div key={pi} className="relative">
                                        <img src={url} alt="" className="w-full h-12 object-cover rounded-lg" />
                                        <button onClick={() => setNewEventPhotos(prev => prev.filter((_, j) => j !== pi))}
                                          className="absolute top-0.5 right-0.5 bg-black/70 text-white rounded-full w-4 h-4 text-xs flex items-center justify-center">×</button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <button onClick={() => addEventToDay(dayIndex)} disabled={!newEventTitle.trim()}
                                className="w-full bg-white text-black font-bold p-2 rounded-lg text-sm hover:bg-zinc-200 transition disabled:opacity-40">
                                Ajouter
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}