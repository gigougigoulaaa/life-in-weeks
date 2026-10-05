'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useI18n, type Key } from '@/lib/i18n'
import { uploadMedia, isVideoUrl, MAX_VIDEO_MB, type UploadError } from '@/lib/media'
import LanguageSelector from '../components/LanguageSelector'
import Icon, { type IconName } from '../components/Icon'
import Logo from '../components/Logo'
import { Sheet, Avatar, EmptyState, Skeleton, Spinner, useUI, btn, input, card } from '../components/ui'

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
const COLOR_FIELDS: { key: keyof ThemeType, labelKey: Key }[] = [
  { key: 'bg', labelKey: 'color.bg' },
  { key: 'text', labelKey: 'color.text' },
  { key: 'label', labelKey: 'color.label' },
  { key: 'past', labelKey: 'color.past' },
  { key: 'accent', labelKey: 'color.accent' },
  { key: 'filled', labelKey: 'color.filled' },
  { key: 'memory', labelKey: 'color.memory' },
  { key: 'future', labelKey: 'color.future' },
]

// Les noms de thèmes sont enregistrés en français dans le profil : on les traduit seulement à l'affichage
const THEME_KEYS: Record<string, Key> = {
  'Défaut': 'theme.name.default', 'Océan': 'theme.name.ocean', 'Forêt': 'theme.name.forest',
  'Coucher de soleil': 'theme.name.sunset', 'Rose': 'theme.name.pink', 'Violet': 'theme.name.violet',
  'Or': 'theme.name.gold', 'Personnalisé': 'theme.name.custom',
}

// Palette de 168 couleurs : 24 gris + 12 teintes × 12 luminosités (du plus clair au plus foncé)
function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const toHex = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`
}

const NEUTRALS = Array.from({ length: 24 }, (_, i) => {
  const v = Math.round((i * 255) / 23).toString(16).padStart(2, '0')
  return `#${v}${v}${v}`
})
const HUES = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
const LIGHTNESS = [94, 87, 80, 73, 66, 59, 52, 45, 38, 31, 24, 16]
const PALETTE: string[] = [
  ...NEUTRALS,
  ...LIGHTNESS.flatMap(l => HUES.map(h => hslToHex(h, 85, l))),
]
// Dispositions des évènements d'une semaine (chaque utilisateur choisit la sienne)
type EventLayout = 'journal' | 'mosaic' | 'cards' | 'album'
const LAYOUTS: { key: EventLayout, labelKey: Key, icon: IconName }[] = [
  { key: 'journal', labelKey: 'layout.journal', icon: 'rows' },
  { key: 'mosaic', labelKey: 'layout.mosaic', icon: 'grid' },
  { key: 'cards', labelKey: 'layout.cards', icon: 'cards' },
  { key: 'album', labelKey: 'layout.album', icon: 'album' },
]
const toInputDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const RATIOS = ['4 / 3', '3 / 4', '1 / 1', '4 / 5']

// Icône affichée pour chaque type de notification
const NOTIF_ICONS: Record<string, IconName> = { follow: 'userPlus', comment: 'message', reaction: 'heart' }

// Type de case de la grille : sert à la vraie grille ET aux aperçus (réglages, accueil)
type CellKind = 'before' | 'past' | 'filled' | 'memory' | 'current' | 'future'

// Photo ou vidéo, visible directement
function Media({ url, className, controls = true }: { url: string, className?: string, controls?: boolean }) {
  if (isVideoUrl(url)) {
    return <video src={`${url}#t=0.1`} controls={controls} playsInline preload="metadata" className={className} />
  }
  return <img src={url} alt="" loading="lazy" className={className} />
}

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
    return { cellSize: 16, cellGap: 4, yearColWidth: 40, sideMargin: 4, isMobile }
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

// Lecture/écriture « sans risque » du stockage du navigateur (peut être bloqué en navigation privée)
const readStore = (key: string) => { try { return localStorage.getItem(key) } catch { return null } }
const writeStore = (key: string, value: string) => { try { localStorage.setItem(key, value) } catch {} }

export default function CalendarPage() {
  const { t, timeAgo, yearsAgo, fmtStamp, fmtShortDate } = useI18n()
  const { toast, confirm } = useUI()
  const themeLabel = (name: string) => (THEME_KEYS[name] ? t(THEME_KEYS[name]) : name)
  const [user, setUser] = useState<any>(null)
  // Vrai tant que le profil n'est pas chargé : on affiche un squelette au lieu de la question de date de naissance
  const [loading, setLoading] = useState(true)
  const [birthDate, setBirthDate] = useState<Date | null>(null)
  const [inputDate, setInputDate] = useState('')
  const [onbStep, setOnbStep] = useState(0)
  const [selectedWeek, setSelectedWeek] = useState<{year: number, week: number} | null>(null)
  const [savedWeeks, setSavedWeeks] = useState<any[]>([])
  const [weeksLoaded, setWeeksLoaded] = useState(false)
  const [showThemes, setShowThemes] = useState(false)
  const [theme, setTheme] = useState<ThemeType>(THEMES[0])
  const [openColorKey, setOpenColorKey] = useState<keyof ThemeType | null>(null)
  const [cellShape, setCellShape] = useState('rounded-full')
  const [bgImage, setBgImage] = useState('')
  const [uploadingBg, setUploadingBg] = useState(false)
  const [selectedWeekId, setSelectedWeekId] = useState<string | null>(null)
  const [weekVisibility, setWeekVisibility] = useState<'private' | 'public'>('private')
  const [memories, setMemories] = useState<any[]>([])
  const [showMemories, setShowMemories] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [userResults, setUserResults] = useState<any[]>([])
  const [searching, setSearching] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState<any[]>([])
  const [showNotifs, setShowNotifs] = useState(false)
  const [days, setDays] = useState<any[]>(EMPTY_DAYS())
  const [newEventDate, setNewEventDate] = useState('')
  const [eventLayout, setEventLayout] = useState<EventLayout>('journal')
  const [newEventTime, setNewEventTime] = useState('')
  const [newEventTitle, setNewEventTitle] = useState('')
  const [newEventDesc, setNewEventDesc] = useState('')
  const [newEventPhotos, setNewEventPhotos] = useState<string[]>([])
  const [uploadingEvent, setUploadingEvent] = useState(false)
  const [addingEvent, setAddingEvent] = useState(false)

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
  const ritualKey = `liw-ritual-${currentYear}-${currentWeek}`
  // Bannière « raconte ta semaine » masquée pour cette semaine ? (lu dans le navigateur ; elle n'apparaît qu'après le chargement)
  const [ritualHidden, setRitualHidden] = useState(() => typeof window !== 'undefined' && readStore(ritualKey) === '1')

  useEffect(() => {
    const updateLayout = () => {
      const width = containerRef.current?.offsetWidth || window.innerWidth
      setLayout(computeLayout(width))
    }
    updateLayout()
    window.addEventListener('resize', updateLayout)
    return () => window.removeEventListener('resize', updateLayout)
  }, [birthDate])


  const loadWeeks = async (userId: string) => {
    const { data } = await supabase.from('weeks').select('*').eq('user_id', userId)
    if (data) setSavedWeeks(data)
    setWeeksLoaded(true)
  }

  const loadMemories = async (userId: string) => {
    const { data: weeks } = await supabase.from('weeks').select('*').eq('user_id', userId)
      .eq('week_number', currentWeek).neq('year', currentYear).order('year', { ascending: false })
    if (weeks && weeks.length > 0) {
      setMemories(weeks)
      // Pas d'ouverture automatique si on arrive par un lien vers une semaine précise
      if (!new URLSearchParams(window.location.search).has('w')) setShowMemories(true)
    }
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
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!q.trim()) { setSearchResults([]); setUserResults([]); setShowSearch(false); setSearching(false); return }
    setShowSearch(true)
    setSearching(true)
    searchTimerRef.current = setTimeout(async () => {
      if (!user) return
      const words = q.split(' ').filter(w => w.length > 0)
      const orFilter = words.map(w => `title.ilike.%${w}%,content.ilike.%${w}%`).join(',')
      const { data: weeks } = await supabase.from('weeks').select('*').eq('user_id', user.id).or(orFilter).limit(4)
      setSearchResults(weeks || [])
      const { data: users } = await supabase.from('profiles').select('id, username, full_name, avatar_url')
        .or(`username.ilike.%${q}%,full_name.ilike.%${q}%`).neq('id', user.id).limit(3)
      setUserResults(users || [])
      setSearching(false)
    }, 300)
  }

  const saveTheme = async (newTheme: any, shape?: string, bg?: string, layoutChoice?: EventLayout) => {
    if (!user) return
    await supabase.from('profiles').upsert({ id: user.id, theme: { ...newTheme, cellShape: shape || cellShape, bgImage: bg !== undefined ? bg : bgImage, eventLayout: layoutChoice || eventLayout } })
  }

  const chooseLayout = (choice: EventLayout) => {
    setEventLayout(choice)
    saveTheme(theme, undefined, undefined, choice)
  }

  // Couleurs effectives (valeurs par défaut si l'utilisateur n'a rien choisi)
  const textColor = theme.text ?? '#ffffff'
  const labelColor = theme.label ?? '#a1a1aa'
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

  // Apparence d'une case selon son type (même règle pour la grille et les aperçus)
  const cellStyle = (kind: CellKind): React.CSSProperties => {
    if (kind === 'before') return { opacity: 0, backgroundColor: 'transparent', borderWidth: 0, borderStyle: 'solid', borderColor: 'transparent' }
    const color = kind === 'current' ? theme.accent : kind === 'memory' ? memoryColor : kind === 'filled' ? fillColor : kind === 'past' ? theme.past : undefined
    return {
      // Semaines passées ordinaires : discrètes. Semaines avec souvenirs : pleines et lumineuses.
      opacity: kind === 'past' ? 0.55 : 1,
      backgroundColor: color ?? 'transparent',
      borderWidth: 1, borderStyle: 'solid',
      borderColor: color ?? futureColor,
      boxShadow: kind === 'current' ? `0 0 8px ${theme.accent}` : (kind === 'memory' || kind === 'filled') ? `0 0 5px ${color}` : undefined,
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

  // Message d'erreur clair selon le problème rencontré à l'envoi d'un fichier
  const mediaError = (error: UploadError) =>
    error === 'tooBig' ? t('media.tooBig', { n: MAX_VIDEO_MB }) : error === 'unsupported' ? t('media.unsupported') : t('media.failed')

  const uploadBgImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !user) return
    setUploadingBg(true)
    const { url, error } = await uploadMedia('avatars', '', file, { upsertName: `bg_${user.id}`, maxDim: 2560 })
    if (url) {
      setBgImage(url); saveTheme(theme, cellShape, url)
      toast(t('theme.bgSaved'))
    } else if (error) {
      toast(mediaError(error), 'error')
    }
    setUploadingBg(false)
  }

  const saveBirthDate = async () => {
    if (!inputDate || !user) return
    setBirthDate(new Date(inputDate))
    const { error } = await supabase.from('profiles').upsert({ id: user.id, birth_date: inputDate })
    if (error) toast(t('common.error'), 'error')
  }

  const resetEventForm = () => {
    setNewEventTitle('')
    setNewEventTime('')
    setNewEventDesc('')
    setNewEventPhotos([])
  }

  // userId : utile au chargement, quand « user » n'est pas encore disponible
  const openWeek = async (year: number, week: number, userId?: string) => {
    setSelectedWeek({ year, week })
    resetEventForm()
    // Date proposée par défaut : aujourd'hui si c'est la semaine en cours, sinon le premier jour de la semaine
    const dates = getWeekDates(year, week)
    setNewEventDate(toInputDate(year === currentYear && week === currentWeek ? new Date() : dates[0]))
    setDays(EMPTY_DAYS())
    setSelectedWeekId(null)
    setWeekVisibility('private')
    const uid = userId || user?.id
    if (!uid) return
    const { data, error } = await supabase
      .from('weeks').select('*')
      .eq('user_id', uid).eq('year', year).eq('week_number', week)
    if (error || !data || data.length === 0) return
    const existing = data[0]
    setSelectedWeekId(existing.id)
    setDays(parseDays(existing.days))
    setWeekVisibility(existing.visibility === 'public' ? 'public' : 'private')
  }

  // Au chargement : utilisateur, profil (date de naissance, thème), semaines, souvenirs, notifications
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.href = '/login'; return }
      setUser(data.user)
      const [{ data: profile }] = await Promise.all([
        supabase.from('profiles').select('birth_date, theme').eq('id', data.user.id).single(),
        loadWeeks(data.user.id),
      ])
      if (profile?.birth_date) setBirthDate(new Date(profile.birth_date))
      if (profile?.theme) {
        if (profile.theme.accent) setTheme(profile.theme)
        if (profile.theme.cellShape) setCellShape(profile.theme.cellShape)
        if (profile.theme.bgImage) setBgImage(profile.theme.bgImage)
        if (LAYOUTS.some(l => l.key === profile.theme.eventLayout)) setEventLayout(profile.theme.eventLayout)
      }
      setLoading(false)
      // Lien direct vers une semaine : /calendar?y=2026&w=41 → on l'ouvre, puis on nettoie l'adresse
      const params = new URLSearchParams(window.location.search)
      const y = Number(params.get('y'))
      const w = Number(params.get('w'))
      if (profile?.birth_date && y && w >= 1 && w <= 53) {
        openWeek(y, w, data.user.id)
        window.history.replaceState(null, '', window.location.pathname)
      }
      loadMemories(data.user.id)
      loadNotifications(data.user.id)
    })
  }, [])


  // Visible par mes abonnés : enregistré tout de suite si la semaine existe déjà,
  // sinon gardé en mémoire et appliqué à la création de la semaine (premier évènement)
  const toggleVisibility = async () => {
    const previous = weekVisibility
    const next = previous === 'public' ? 'private' : 'public'
    setWeekVisibility(next)
    if (!selectedWeekId) return
    const { error } = await supabase.from('weeks').update({ visibility: next }).eq('id', selectedWeekId)
    if (error) { setWeekVisibility(previous); toast(t('common.error'), 'error'); return }
    setSavedWeeks(prev => prev.map(w => (w.id === selectedWeekId ? { ...w, visibility: next } : w)))
    toast(t(next === 'public' ? 'week.nowPublic' : 'week.nowPrivate'))
  }

  // Envoie les fichiers un par un : un fichier refusé n'empêche pas les autres de partir
  const uploadEventPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    e.target.value = ''
    if (files.length === 0 || !user || !selectedWeek) return
    setUploadingEvent(true)
    for (const file of files) {
      const { url, error } = await uploadMedia('weeks-media', user.id, file)
      if (url) setNewEventPhotos(prev => [...prev, url])
      else if (error) toast(mediaError(error), 'error')
    }
    setUploadingEvent(false)
  }

  const addEvent = async () => {
    if (!newEventTitle.trim() || !user || !selectedWeek || addingEvent) return
    setAddingEvent(true)
    const found = weekDates.findIndex(d => toInputDate(d) === newEventDate)
    const dayIndex = found >= 0 ? found : 0
    const newEvent = { text: newEventTitle.trim(), description: newEventDesc.trim(), photos: newEventPhotos, time: newEventTime }
    const updatedDays = days.map((d, i) =>
      i === dayIndex ? { events: [...(d?.events || []), newEvent] } : d
    )
    setDays(updatedDays)
    resetEventForm()
    let failed = false
    if (selectedWeekId) {
      const { error } = await supabase.from('weeks').update({ days: updatedDays }).eq('id', selectedWeekId)
      failed = !!error
    } else {
      const { data, error } = await supabase.from('weeks').insert({
        user_id: user.id, year: selectedWeek.year, week_number: selectedWeek.week,
        title: '', content: '', visibility: weekVisibility, days: updatedDays
      }).select().single()
      if (data) setSelectedWeekId(data.id)
      failed = !!error
    }
    toast(failed ? t('common.error') : t('week.added'), failed ? 'error' : 'success')
    await loadWeeks(user.id)
    setAddingEvent(false)
  }

  const deleteEventFromDay = async (dayIndex: number, eventIndex: number) => {
    const ok = await confirm({ title: t('week.deleteTitle'), message: t('week.deleteText'), confirmLabel: t('common.delete'), danger: true })
    if (!ok) return
    const updatedDays = days.map((d, i) =>
      i === dayIndex ? { events: (d?.events || []).filter((_: any, j: number) => j !== eventIndex) } : d
    )
    setDays(updatedDays)
    if (selectedWeekId) {
      const { error } = await supabase.from('weeks').update({ days: updatedDays }).eq('id', selectedWeekId)
      if (error) { toast(t('common.error'), 'error'); return }
      await loadWeeks(user.id)
    }
    toast(t('week.deleted'))
  }

  const handleLogout = async () => {
    const ok = await confirm({ title: t('cal.logoutTitle'), message: t('cal.logoutText'), confirmLabel: t('cal.logout'), danger: true })
    if (!ok) return
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const hideRitual = () => { setRitualHidden(true); writeStore(ritualKey, '1') }

  const startYear = birthDate ? birthDate.getFullYear() : null
  const years = startYear ? Array.from({ length: END_YEAR - startYear + 1 }, (_, i) => startYear + i) : []
  const weekDates = selectedWeek ? getWeekDates(selectedWeek.year, selectedWeek.week) : []
  // Tous les évènements de la semaine, triés : jour, puis heure (sans heure en premier), puis ordre d'ajout
  const allEvents = days
    .flatMap((d, dayIndex) => (d?.events || []).map((event: any, eventIndex: number) => ({ event, dayIndex, eventIndex })))
    .sort((a, b) => a.dayIndex - b.dayIndex || (a.event.time || '').localeCompare(b.event.time || '') || a.eventIndex - b.eventIndex)
  const { cellSize, cellGap, yearColWidth, sideMargin } = layout

  // Rituel : la semaine actuelle n'a encore aucun évènement ?
  const currentRow = savedWeeks.find(w => w.year === currentYear && w.week_number === currentWeek)
  const currentWeekTold = !!currentRow && parseDays(currentRow.days).some(d => d.events.length > 0)
  const showRitual = !!birthDate && weeksLoaded && !currentWeekTold && !ritualHidden

  // Garde les numéros de semaines alignés avec la grille pendant le défilement horizontal
  const syncHeader = () => {
    const el = scrollRef.current
    const strip = headerStripRef.current
    if (el && strip) strip.style.transform = `translateX(${-el.scrollLeft}px)`
  }

  // Centre la semaine actuelle : horizontalement dans la grille (téléphone), verticalement sur la page
  const focusCurrentWeek = (smooth = false) => {
    const el = scrollRef.current
    if (el) {
      const x = yearColWidth + (currentWeek - 1) * (cellSize + cellGap) + cellSize / 2 - el.clientWidth / 2
      el.scrollTo({ left: Math.max(0, x), behavior: smooth ? 'smooth' : 'auto' })
    }
    const row = containerRef.current?.querySelector(`[data-year="${currentYear}"]`) as HTMLElement | null
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
    const kind: CellKind = isBeforeBirth ? 'before' : isCurrent ? 'current' : isMemory ? 'memory' : hasSaved ? 'filled' : isPast ? 'past' : 'future'
    return (
      <div key={weekNum}
        onClick={() => !isBeforeBirth && openWeek(year, weekNum)}
        className={`${cellShape} transition-transform hover:scale-125 ${isBeforeBirth ? 'cursor-default' : 'cursor-pointer'}`}
        style={{
          width: cellSize, height: cellSize, marginRight: cellGap, flexShrink: 0,
          ...cellStyle(kind),
          outline: hasLocation ? `2px solid ${theme.accent}` : undefined
        }} />
    )
  }

  // Petite grille d'exemple (aperçu du thème, écran d'accueil)
  const miniGrid = ({ rows, cols, now, filled = [], memory = [], size = 12, gap = 4 }: {
    rows: number, cols: number, now: number, filled?: number[], memory?: number[], size?: number, gap?: number
  }) => (
    <div dir="ltr" className="inline-grid" style={{ gridTemplateColumns: `repeat(${cols}, ${size}px)`, gap }}>
      {Array.from({ length: rows * cols }, (_, i) => {
        const kind: CellKind = i === now ? 'current' : memory.includes(i) ? 'memory' : filled.includes(i) ? 'filled' : i < now ? 'past' : 'future'
        return <div key={i} className={cellShape} style={{ width: size, height: size, ...cellStyle(kind) }} />
      })}
    </div>
  )

  const legend: { kind: CellKind, labelKey: Key }[] = [
    { kind: 'past', labelKey: 'theme.legend.past' },
    { kind: 'filled', labelKey: 'theme.legend.filled' },
    { kind: 'memory', labelKey: 'theme.legend.memory' },
    { kind: 'current', labelKey: 'theme.legend.now' },
    { kind: 'future', labelKey: 'theme.legend.future' },
  ]

  // Titre d'une section des réglages + aide
  const sectionTitle = ({ title, help }: { title: string, help?: string }) => (
    <div className="mb-3">
      <h3 className="text-sm font-semibold text-fg">{title}</h3>
      {help && <p className="text-muted text-sm mt-0.5">{help}</p>}
    </div>
  )

  // Bouton d'icône de l'en-tête (40 × 40)
  const headerBtn = 'relative inline-flex items-center justify-center w-10 h-10 rounded-xl bg-surface/70 backdrop-blur border border-line hover:bg-surface-3 active:scale-95 transition'

  const hasResults = searchResults.length > 0 || userResults.length > 0

  return (
    <div className="min-h-dvh pb-nav" style={{
      color: textColor,
      backgroundColor: theme.bg,
      backgroundImage: bgImage ? `url(${bgImage})` : undefined,
      backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed'
    }}>
      <div className="px-4 sm:px-6 pt-5 sm:pt-7">

        {/* En-tête : logo, recherche (sur la même ligne sur ordinateur), boutons */}
        <header className="flex flex-wrap items-center gap-x-3 gap-y-3 mb-4 sm:mb-6">
          <div className="order-1 flex items-center gap-2.5 min-w-0">
            <Logo accent={theme.accent} color={textColor} size={24} />
            <h1 className="text-lg sm:text-xl font-semibold whitespace-nowrap tracking-tight">Life in Weeks</h1>
          </div>

          <div className="order-2 md:order-3 ms-auto flex gap-2 items-center shrink-0 text-fg" style={{ color: textColor }}>
            {memories.length > 0 && (
              <button onClick={() => setShowMemories(true)} aria-label={t('mem.title')}
                className={`${headerBtn} w-auto min-w-10 px-2.5 gap-1.5`}>
                <Icon name="sparkles" size={18} className="text-brand" />
                <span className="text-sm font-semibold tabular-nums">{memories.length}</span>
              </button>
            )}
            <button onClick={() => setShowNotifs(true)} aria-label={t('notif.title')} className={headerBtn}>
              <Icon name="bell" size={19} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -end-1 min-w-5 h-5 px-1 rounded-full bg-brand text-ink text-[11px] font-bold flex items-center justify-center ring-2 ring-ink">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <button onClick={() => setShowThemes(true)} aria-label={t('cal.settings')} className={headerBtn}>
              <Icon name="sliders" size={19} />
            </button>
          </div>

          {/* Barre de recherche */}
          <div className="order-3 md:order-2 relative w-full md:w-auto md:flex-1 md:max-w-md md:ms-6">
            <Icon name="search" size={18} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" />
            <input type="search" value={searchQuery} onChange={e => handleSearch(e.target.value)}
              onFocus={() => searchQuery && setShowSearch(true)}
              onBlur={() => setTimeout(() => setShowSearch(false), 200)}
              placeholder={t('cal.searchPh')} aria-label={t('search.title')}
              className={`${input.replace('bg-surface-2', 'bg-surface/80')} ps-10 backdrop-blur [&::-webkit-search-cancel-button]:hidden`} />
            {showSearch && (
              <div className="absolute start-0 end-0 mt-2 bg-surface rounded-2xl border border-line z-30 shadow-2xl overflow-hidden animate-pop-in text-fg">
                {searching && !hasResults ? (
                  <div className="flex justify-center py-5"><Spinner /></div>
                ) : !hasResults ? (
                  <p className="text-muted text-sm text-center px-4 py-5">{t('search.noResult', { query: searchQuery })}</p>
                ) : (
                  <>
                    {searchResults.length > 0 && (
                      <div className="py-1">
                        <p className="text-subtle text-xs font-medium px-4 pt-2 pb-1">{t('cal.memories')}</p>
                        {searchResults.map(week => (
                          <button key={week.id} onMouseDown={() => { openWeek(week.year, week.week_number); setShowSearch(false); setSearchQuery('') }}
                            className="w-full flex items-center gap-3 text-start px-4 py-2.5 hover:bg-surface-2 transition">
                            <span className="w-9 h-9 rounded-xl bg-brand-soft text-brand flex items-center justify-center shrink-0"><Icon name="calendar" size={18} /></span>
                            <span className="min-w-0">
                              <span className="block text-sm font-medium truncate">{week.title || t('common.week', { n: week.week_number })}</span>
                              <span className="block text-muted text-xs">{t('common.weekOfYear', { n: week.week_number, year: week.year })}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    {userResults.length > 0 && (
                      <div className="py-1 border-t border-line">
                        <p className="text-subtle text-xs font-medium px-4 pt-2 pb-1">{t('cal.people')}</p>
                        {userResults.map(u => (
                          <button key={u.id} onMouseDown={() => { window.location.href = `/profile/${u.id}`; setShowSearch(false) }}
                            className="w-full flex items-center gap-3 text-start px-4 py-2.5 hover:bg-surface-2 transition">
                            <Avatar url={u.avatar_url} name={u.full_name || u.username} size={36} />
                            <span className="min-w-0">
                              <span className="block text-sm font-medium truncate">{u.full_name || u.username}</span>
                              {u.username && <span className="block text-muted text-xs truncate">@{u.username}</span>}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </header>

        {loading ? (
          /* Squelette pendant le chargement du profil */
          <div className="animate-fade-in space-y-3" aria-busy="true">
            <Skeleton className="h-16 w-full max-w-xl" />
            <div className="space-y-2 pt-2">
              {Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-3.5 w-full" />)}
            </div>
          </div>
        ) : !birthDate ? (
          /* Accueil en 3 étapes (première utilisation) */
          <div className="max-w-md mx-auto mt-6 sm:mt-12">
            <div className={`${card} p-6 sm:p-8 text-center text-fg`}>
              <div key={onbStep} className="animate-pop-in min-h-[260px] flex flex-col items-center">
                {onbStep === 0 && (
                  <>
                    <div className="h-36 flex items-center justify-center mb-6">
                      {miniGrid({ rows: 8, cols: 16, now: 83, size: 7, gap: 3, filled: [12, 30, 47, 61, 75], memory: [22, 54] })}
                    </div>
                    <h2 className="text-2xl font-semibold tracking-tight">{t('onb.step1Title')}</h2>
                    <p className="text-muted text-sm mt-2 leading-relaxed">{t('onb.step1Text')}</p>
                  </>
                )}
                {onbStep === 1 && (
                  <>
                    <div className="h-36 flex items-center justify-center mb-6">
                      {miniGrid({ rows: 3, cols: 9, now: 16, size: 18, gap: 6, filled: [1, 4, 8, 11, 14], memory: [6] })}
                    </div>
                    <h2 className="text-2xl font-semibold tracking-tight">{t('onb.step2Title')}</h2>
                    <p className="text-muted text-sm mt-2 leading-relaxed">{t('onb.step2Text')}</p>
                  </>
                )}
                {onbStep === 2 && (
                  <>
                    <div className="w-14 h-14 rounded-2xl bg-brand-soft text-brand flex items-center justify-center mb-6 mt-4">
                      <Icon name="calendar" size={26} />
                    </div>
                    <h2 className="text-2xl font-semibold tracking-tight">{t('onb.step3Title')}</h2>
                    <p className="text-muted text-sm mt-2 leading-relaxed">{t('onb.step3Text')}</p>
                    <input type="date" value={inputDate} onChange={e => setInputDate(e.target.value)}
                      max={toInputDate(new Date())} aria-label={t('onb.step3Title')}
                      className={`${input} mt-6 text-center`} />
                  </>
                )}
              </div>

              {/* Points de progression */}
              <div className="flex justify-center gap-2 mt-6" role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={onbStep + 1}
                aria-label={t('onb.progress', { n: onbStep + 1, total: 3 })}>
                {[0, 1, 2].map(i => (
                  <span key={i} className={`h-2 rounded-full transition-all ${i === onbStep ? 'w-6 bg-brand' : 'w-2 bg-line-strong'}`} />
                ))}
              </div>

              <div className="flex gap-2 mt-6">
                {onbStep > 0 && (
                  <button onClick={() => setOnbStep(s => s - 1)} className={`${btn.secondary} flex-1`}>
                    <Icon name="chevronLeft" size={18} />{t('common.back')}
                  </button>
                )}
                {onbStep < 2 ? (
                  <button onClick={() => setOnbStep(s => s + 1)} className={`${btn.primary} flex-1`}>
                    {t('common.next')}<Icon name="chevronRight" size={18} />
                  </button>
                ) : (
                  <button onClick={saveBirthDate} disabled={!inputDate} className={`${btn.primary} flex-1`}>
                    {t('onb.create')}
                  </button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Rituel hebdomadaire : invite à raconter la semaine en cours */}
            {showRitual && (
              <div className="mb-4 sm:mb-5 max-w-xl flex items-center gap-3 rounded-2xl bg-brand-soft border border-brand/20 backdrop-blur ps-4 pe-1.5 py-2.5 text-fg animate-fade-in">
                <Icon name="sparkles" size={20} className="text-brand" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{t('ritual.title', { n: currentWeek })}</p>
                  <p className="text-muted text-xs mt-0.5 hidden sm:block">{t('ritual.text')}</p>
                </div>
                <button onClick={() => openWeek(currentYear, currentWeek)}
                  className="h-10 px-3.5 rounded-xl bg-brand text-ink text-sm font-semibold hover:bg-brand-strong active:scale-95 transition whitespace-nowrap">
                  {t('ritual.cta')}
                </button>
                <button onClick={hideRitual} aria-label={t('ritual.dismiss')} className={btn.icon}>
                  <Icon name="x" size={18} />
                </button>
              </div>
            )}

            <div ref={containerRef} dir="ltr" className={layout.isMobile ? 'w-full' : 'w-full overflow-x-hidden'} style={{ paddingLeft: sideMargin, paddingRight: sideMargin }}>

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
                              fontSize: '10px', lineHeight: 1,
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
                        <div key={year} data-year={year} className="flex items-center"
                          style={{ marginBottom: cellGap + 2 + (startYear !== null && (year - startYear) % 10 === 9 ? 10 : 0) }}>
                          <div style={{
                            width: yearColWidth, flexShrink: 0, position: 'sticky', left: 0, zIndex: 5,
                            backgroundColor: theme.bg, textAlign: 'right', paddingRight: 8,
                            // Petit fondu à droite : les cases qui passent dessous disparaissent proprement
                            boxShadow: `8px 0 8px -2px ${theme.bg}`,
                            color: year === currentYear ? theme.accent : labelColor,
                            fontWeight: year === currentYear || (startYear !== null && (year - startYear) % 10 === 0) ? 700 : 400,
                            fontSize: '12px', lineHeight: `${cellSize}px`
                          }}>
                            {year}
                          </div>
                          {Array.from({ length: 52 }, (_, i) => renderCell(year, i + 1))}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Numéros de semaines */}
                  <div className="flex" style={{ paddingLeft: yearColWidth, marginBottom: '5px' }}>
                    {Array.from({ length: 52 }, (_, i) => (
                      <div key={i} style={{
                        width: cellSize, marginRight: cellGap, flexShrink: 0,
                        textAlign: 'center', fontSize: cellSize < 6 ? '0px' : '10px', lineHeight: 1, color: labelColor
                      }}>
                        {(i + 1) % 5 === 0 ? i + 1 : ''}
                      </div>
                    ))}
                  </div>

                  {/* Grille complète (ordinateur) */}
                  {years.map(year => (
                    <div key={year} data-year={year} className="flex items-center"
                      style={{ marginBottom: cellGap + (startYear !== null && (year - startYear) % 10 === 9 ? 8 : 0) }}>
                      <div style={{
                        width: yearColWidth, flexShrink: 0, textAlign: 'right',
                        paddingRight: '8px', fontSize: cellSize < 6 ? '9px' : '12px', lineHeight: 1,
                        color: year === currentYear ? theme.accent : labelColor,
                        fontWeight: year === currentYear ? 700 : 400,
                        opacity: year === currentYear || (startYear !== null && (year - startYear) % 5 === 0) ? 1 : 0
                      }}>
                        {year}
                      </div>
                      {Array.from({ length: 52 }, (_, i) => renderCell(year, i + 1))}
                    </div>
                  ))}
                </>
              )}
            </div>

            {/* Bouton flottant : retour à la semaine actuelle (au-dessus de la barre du bas sur téléphone) */}
            <button onClick={() => focusCurrentWeek(true)}
              className="fixed z-30 end-4 bottom-[calc(80px+env(safe-area-inset-bottom))] md:end-6 md:bottom-6 inline-flex items-center gap-2 h-11 ps-3.5 pe-4 rounded-full bg-surface/90 backdrop-blur border border-line-strong text-fg text-sm font-medium shadow-2xl hover:bg-surface-3 active:scale-95 transition">
              <Icon name="clock" size={18} className="text-brand" />
              {t('cal.today')}
            </button>
          </>
        )}
      </div>

      {/* Notifications */}
      <Sheet open={showNotifs} onClose={() => setShowNotifs(false)} title={t('notif.title')}
        headerExtra={unreadCount > 0 ? <button onClick={markAllRead} className={`${btn.ghost} text-xs`}>{t('notif.readAll')}</button> : undefined}>
        <div className="text-fg">
          {notifications.length === 0 ? (
            <EmptyState icon="bell" title={t('notif.empty')} text={t('cal.notifEmptyText')} />
          ) : (
            <ul className="p-2">
              {notifications.map(notif => (
                <li key={notif.id} className={`flex items-start gap-3 p-3 rounded-2xl ${notif.is_read ? '' : 'bg-surface-2'}`}>
                  <span className="w-10 h-10 rounded-full bg-brand-soft text-brand flex items-center justify-center shrink-0">
                    <Icon name={NOTIF_ICONS[notif.type] || 'bell'} size={18} />
                  </span>
                  <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-sm leading-snug">{notif.content}</p>
                    <p className="text-subtle text-xs mt-1">{timeAgo(notif.created_at)}</p>
                  </div>
                  {!notif.is_read && <span className="w-2 h-2 bg-brand rounded-full mt-2 shrink-0" />}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Sheet>

      {/* Réglages : thème, disposition, compte */}
      <Sheet open={showThemes} onClose={() => setShowThemes(false)} side="right" title={t('cal.settings')}>
        <div className="p-5 space-y-8 text-fg">

          {/* Aperçu en direct */}
          <section>
            {sectionTitle({ title: t('theme.preview') })}
            <div className="rounded-2xl border border-line p-4 flex flex-col items-center gap-4 overflow-hidden"
              style={{
                backgroundColor: theme.bg,
                backgroundImage: bgImage ? `url(${bgImage})` : undefined, backgroundSize: 'cover', backgroundPosition: 'center'
              }}>
              {miniGrid({ rows: 3, cols: 13, now: 22, size: 16, gap: 5, filled: [3, 9, 14, 18], memory: [6] })}
              <div className="flex flex-wrap justify-center gap-x-3 gap-y-1.5">
                {legend.map(l => (
                  <span key={l.kind} className="inline-flex items-center gap-1.5 text-xs" style={{ color: labelColor }}>
                    <span className={cellShape} style={{ width: 10, height: 10, ...cellStyle(l.kind) }} />
                    {t(l.labelKey)}
                  </span>
                ))}
              </div>
            </div>
          </section>

          {/* Disposition des évènements */}
          <section>
            {sectionTitle({ title: t('theme.layoutTitle'), help: t('theme.layoutHelp') })}
            <div className="grid grid-cols-4 gap-2">
              {LAYOUTS.map(l => {
                const active = eventLayout === l.key
                return (
                  <button key={l.key} onClick={() => chooseLayout(l.key)} aria-pressed={active}
                    className={`aspect-square flex flex-col items-center justify-center gap-1.5 rounded-2xl border text-xs font-medium transition active:scale-95 ${active ? 'border-brand bg-brand-soft text-fg' : 'border-line bg-surface-2 text-muted hover:text-fg hover:bg-surface-3'}`}>
                    <Icon name={l.icon} size={22} className={active ? 'text-brand' : ''} />
                    {t(l.labelKey)}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Couleurs */}
          <section>
            {sectionTitle({ title: t('theme.colorsTitle'), help: t('theme.colorsHelp') })}
            <div className="grid grid-cols-4 gap-x-2 gap-y-3 mb-5">
              {THEMES.map(th => {
                const active = theme.name === th.name
                return (
                  <button key={th.name} onClick={() => { setTheme(th); saveTheme(th) }} aria-pressed={active}
                    className="flex flex-col items-center gap-1.5 group">
                    <span className={`w-12 h-12 rounded-full border-2 flex items-center justify-center gap-1 transition group-active:scale-95 ${active ? 'border-brand' : 'border-line group-hover:border-line-strong'}`}
                      style={{ backgroundColor: th.bg }}>
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: th.past }} />
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: th.accent, boxShadow: `0 0 6px ${th.accent}` }} />
                    </span>
                    <span className={`text-xs text-center leading-tight ${active ? 'text-fg font-medium' : 'text-muted'}`}>{themeLabel(th.name)}</span>
                  </button>
                )
              })}
            </div>

            <p className="text-sm font-medium mb-2">{t('theme.custom')}</p>
            <div className="rounded-2xl border border-line divide-y divide-line overflow-hidden">
              {COLOR_FIELDS.map(f => {
                const current = getColor(f.key)
                const isOpen = openColorKey === f.key
                return (
                  <div key={f.key}>
                    <button onClick={() => setOpenColorKey(isOpen ? null : f.key)} aria-expanded={isOpen}
                      className="w-full min-h-12 flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-start hover:bg-surface-2 transition">
                      <span>{t(f.labelKey)}</span>
                      <span className="flex items-center gap-2.5 shrink-0">
                        <span className="w-8 h-6 rounded-lg border border-line-strong" style={{ backgroundColor: current }} />
                        <Icon name="chevronDown" size={16} className={`text-subtle transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </span>
                    </button>
                    {isOpen && (
                      <div className="px-4 pb-4 pt-1 animate-fade-in">
                        <div className="grid grid-cols-12 gap-1">
                          {PALETTE.map(c => {
                            const selected = current.toLowerCase() === c.toLowerCase()
                            return (
                              <button key={c} onClick={() => updateColor(f.key, c)} aria-label={c}
                                className={`aspect-square rounded-md border border-line ${selected ? 'ring-2 ring-brand ring-offset-1 ring-offset-surface' : ''}`}
                                style={{ backgroundColor: c }} />
                            )
                          })}
                        </div>
                        <label className="flex items-center justify-between gap-3 mt-3 text-sm text-muted">
                          <span>{t('theme.other')}</span>
                          <input type="color" value={current} onChange={e => updateColor(f.key, e.target.value)}
                            className="w-12 h-9 rounded-lg cursor-pointer border border-line bg-transparent p-0.5" />
                        </label>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <button onClick={resetColors} className={`${btn.ghost} mt-2 -ms-3`}>{t('theme.reset')}</button>
          </section>

          {/* Forme des cases */}
          <section>
            {sectionTitle({ title: t('theme.shape'), help: t('theme.shapeHelp') })}
            <div className="grid grid-cols-2 gap-2">
              {[{ label: t('theme.round'), value: 'rounded-full' }, { label: t('theme.square'), value: 'rounded-none' }].map(s => {
                const active = cellShape === s.value
                return (
                  <button key={s.value} onClick={() => { setCellShape(s.value); saveTheme(theme, s.value) }} aria-pressed={active}
                    className={`h-12 flex items-center justify-center gap-2.5 rounded-xl border text-sm font-medium transition active:scale-[0.98] ${active ? 'border-brand bg-brand-soft text-fg' : 'border-line bg-surface-2 text-muted hover:text-fg'}`}>
                    <span className={`w-3.5 h-3.5 ${s.value} ${active ? 'bg-brand' : 'bg-muted'}`} />
                    {s.label}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Fond */}
          <section>
            {sectionTitle({ title: t('theme.background'), help: t('theme.bgHelp') })}
            <div className="flex gap-2 flex-wrap items-center">
              {bgImage && <img src={bgImage} alt="" className="w-11 h-11 rounded-xl object-cover border border-line" />}
              <label className={`${btn.secondary} cursor-pointer ${uploadingBg ? 'opacity-60 pointer-events-none' : ''}`}>
                {uploadingBg ? <Spinner size={16} /> : <Icon name="image" size={18} />}
                {uploadingBg ? t('theme.uploading') : t('theme.photo')}
                <input type="file" accept="image/*" onChange={uploadBgImage} className="hidden" />
              </label>
              {bgImage && (
                <button onClick={() => { setBgImage(''); saveTheme(theme, cellShape, '') }} className={btn.ghost}>
                  <Icon name="x" size={16} />{t('theme.remove')}
                </button>
              )}
            </div>
          </section>

          {/* Compte */}
          <section className="pt-6 border-t border-line">
            {sectionTitle({ title: t('theme.account') })}
            <div className="flex items-center justify-between gap-3 mb-4">
              <span className="flex items-center gap-2 text-sm text-muted"><Icon name="globe" size={18} />{t('common.language')}</span>
              <LanguageSelector showName className={`${btn.secondary} h-10 px-4`} />
            </div>
            <button onClick={handleLogout} className={`${btn.danger} w-full`}>
              <Icon name="logOut" size={18} />{t('cal.logout')}
            </button>
          </section>
        </div>
      </Sheet>

      {/* Souvenirs : cette semaine, les années passées */}
      <Sheet open={showMemories && memories.length > 0} onClose={() => setShowMemories(false)}
        title={<span className="flex items-center gap-2"><Icon name="sparkles" size={18} className="text-brand" />{t('mem.title')}</span>}>
        <div className="p-5 text-fg">
          <p className="text-muted text-sm mb-4">{t('mem.subtitle')}</p>
          <div className="space-y-3">
            {memories.map(memory => {
              const events = parseDays(memory.days).flatMap(d => d.events)
              const photos: string[] = [...events.flatMap((e: any) => e.photos || []), ...(memory.media_urls || [])]
              const heading = memory.title || events[0]?.text || t('common.week', { n: memory.week_number })
              const text = memory.content || events[0]?.description || ''
              return (
                <button key={memory.id} onClick={() => { setShowMemories(false); openWeek(memory.year, memory.week_number) }}
                  className={`${card} w-full text-start overflow-hidden hover:border-line-strong active:scale-[0.99] transition`}>
                  {photos.length > 0 && (
                    <div className={`grid gap-0.5 ${photos.length > 1 ? 'grid-cols-3' : 'grid-cols-1'}`}>
                      {photos.slice(0, 3).map((u, i) => (
                        <div key={i} className={`relative bg-surface-2 ${photos.length > 1 ? 'h-24' : 'h-44'}`}>
                          <Media url={u} controls={false} className="absolute inset-0 w-full h-full object-cover" />
                          {isVideoUrl(u) && <span className="absolute inset-0 flex items-center justify-center text-white"><Icon name="play" size={22} filled /></span>}
                          {i === 2 && photos.length > 3 && (
                            <span className="absolute inset-0 bg-black/55 flex items-center justify-center text-white text-sm font-semibold">+{photos.length - 3}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="p-4">
                    <p className="text-xs"><span className="text-brand font-semibold">{yearsAgo(currentYear - memory.year)}</span><span className="text-subtle"> · {memory.year}</span></p>
                    <p className="font-semibold text-sm mt-1">{heading}</p>
                    {text && <p className="text-muted text-sm mt-1 line-clamp-2">{text}</p>}
                    <span className="inline-flex items-center gap-1 text-brand text-sm font-medium mt-3">
                      {t('mem.view')}<Icon name="arrowRight" size={16} />
                    </span>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </Sheet>

      {/* Fenêtre d'une semaine : évènements triés par ordre chronologique, médias visibles directement */}
      <Sheet wide open={!!selectedWeek} onClose={() => setSelectedWeek(null)}
        title={selectedWeek && (
          <div className="min-w-0">
            <p className="truncate">{t('common.weekOfYear', { n: selectedWeek.week, year: selectedWeek.year })}</p>
            {weekDates.length === 7 && (
              <p className="text-muted text-xs font-normal mt-0.5">
                {t('week.range', { from: fmtShortDate(weekDates[0].toISOString()), to: fmtShortDate(weekDates[6].toISOString()) })}
              </p>
            )}
          </div>
        )}>
        {selectedWeek && (
          <div className="p-5 text-fg">
            {/* Visible par mes abonnés */}
            <button onClick={toggleVisibility} role="switch" aria-checked={weekVisibility === 'public'}
              className="w-full flex items-center gap-3 text-start rounded-2xl border border-line bg-surface-2/60 px-4 py-3 mb-5 hover:bg-surface-2 transition">
              <span className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${weekVisibility === 'public' ? 'bg-brand-soft text-brand' : 'bg-surface-3 text-muted'}`}>
                <Icon name={weekVisibility === 'public' ? 'eye' : 'lock'} size={18} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium">{t('week.visibility')}</span>
                <span className="block text-muted text-xs mt-0.5">{t(weekVisibility === 'public' ? 'week.visibilityOn' : 'week.visibilityOff')}</span>
              </span>
              <span className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${weekVisibility === 'public' ? 'bg-brand' : 'bg-surface-3 border border-line-strong'}`}>
                <span className={`absolute top-0.5 start-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${weekVisibility === 'public' ? 'translate-x-5 rtl:-translate-x-5' : ''}`} />
              </span>
            </button>

            {allEvents.length === 0 ? (
              <div className="text-center py-8 mb-2">
                <div className="w-12 h-12 rounded-2xl bg-brand-soft text-brand flex items-center justify-center mx-auto mb-3"><Icon name="calendar" size={22} /></div>
                <p className="font-medium text-sm">{t('week.none')}</p>
                <p className="text-muted text-sm mt-1">{t('week.emptyText')}</p>
              </div>
            ) : (() => {
              const stamp = (ev: any) => fmtStamp(weekDates[ev.dayIndex], ev.event.time)
              // Corbeille (zone de toucher 40 × 40). « overlay » = posée sur une photo
              const del = (ev: any, overlay = false) => (
                <button onClick={() => deleteEventFromDay(ev.dayIndex, ev.eventIndex)} aria-label={t('common.delete')}
                  className={`w-10 h-10 shrink-0 rounded-full inline-flex items-center justify-center transition active:scale-90 ${overlay ? 'bg-black/55 text-white hover:bg-black/75 backdrop-blur' : 'text-subtle hover:text-danger hover:bg-surface-2'}`}>
                  <Icon name="trash" size={17} />
                </button>
              )

              if (eventLayout === 'journal') {
                return (
                  <div className="space-y-7 mb-6">
                    {allEvents.map(ev => {
                      const photos: string[] = ev.event.photos || []
                      return (
                        <div key={`${ev.dayIndex}-${ev.eventIndex}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 pt-0.5">
                              <p className="text-subtle text-xs">{stamp(ev)}</p>
                              <p className="text-base font-semibold mt-0.5">{ev.event.text}</p>
                            </div>
                            {del(ev)}
                          </div>
                          {photos.length > 0 && (
                            <div className={`grid gap-1.5 mt-2 ${photos.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                              {photos.map((u, i) => (
                                <Media key={i} url={u}
                                  className={`w-full object-cover rounded-xl bg-black ${photos.length === 1 ? 'max-h-80' : 'h-36'} ${photos.length > 1 && photos.length % 2 === 1 && i === 0 ? 'col-span-2 !h-48' : ''}`} />
                              ))}
                            </div>
                          )}
                          {ev.event.description && <p className="text-muted text-sm mt-2 leading-relaxed">{ev.event.description}</p>}
                        </div>
                      )
                    })}
                  </div>
                )
              }

              if (eventLayout === 'mosaic') {
                let n = 0
                return (
                  <div className="columns-2 gap-2 mb-6">
                    {allEvents.flatMap(ev => {
                      const photos: string[] = ev.event.photos || []
                      if (photos.length === 0) {
                        return [(
                          <div key={`${ev.dayIndex}-${ev.eventIndex}`} className="break-inside-avoid mb-2 rounded-xl bg-surface-2 border border-line p-3">
                            <div className="flex items-start justify-between gap-1">
                              <p className="text-sm font-medium pt-2">{ev.event.text}</p>
                              {del(ev)}
                            </div>
                            {ev.event.description && <p className="text-muted text-xs mt-1">{ev.event.description}</p>}
                            <p className="text-subtle text-xs mt-1.5">{stamp(ev)}</p>
                          </div>
                        )]
                      }
                      return photos.map((u, i) => (
                        <div key={`${ev.dayIndex}-${ev.eventIndex}-${i}`}
                          className="break-inside-avoid mb-2 relative rounded-xl overflow-hidden bg-surface-2"
                          style={{ aspectRatio: RATIOS[n++ % RATIOS.length] }}>
                          <Media url={u} className="absolute inset-0 w-full h-full object-cover" />
                          {i === 0 && (
                            <div className="absolute start-0 end-0 top-0 p-2.5 pe-12 pb-6 bg-gradient-to-b from-black/80 to-transparent pointer-events-none text-white">
                              <p className="text-xs font-semibold">{ev.event.text}</p>
                              <p className="text-[11px] text-white/75">{stamp(ev)}</p>
                            </div>
                          )}
                          {i === 0 && <div className="absolute top-1 end-1">{del(ev, true)}</div>}
                        </div>
                      ))
                    })}
                  </div>
                )
              }

              if (eventLayout === 'cards') {
                return (
                  <div className="flex gap-2.5 overflow-x-auto snap-x snap-mandatory pb-2 mb-6">
                    {allEvents.flatMap(ev => {
                      const photos: string[] = ev.event.photos || []
                      const base = 'snap-center shrink-0 w-[86%] h-[60vh] max-h-[460px] rounded-2xl relative overflow-hidden bg-surface-2 border border-line'
                      if (photos.length === 0) {
                        return [(
                          <div key={`${ev.dayIndex}-${ev.eventIndex}`} className={`${base} flex flex-col justify-end p-5`}>
                            <div className="absolute top-2 end-2">{del(ev)}</div>
                            <p className="text-subtle text-xs">{stamp(ev)}</p>
                            <p className="text-lg font-semibold">{ev.event.text}</p>
                            {ev.event.description && <p className="text-muted text-sm mt-1">{ev.event.description}</p>}
                          </div>
                        )]
                      }
                      return photos.map((u, i) => (
                        <div key={`${ev.dayIndex}-${ev.eventIndex}-${i}`} className={base}>
                          <Media url={u} className="absolute inset-0 w-full h-full object-cover" />
                          <div className={`absolute inset-x-0 bottom-0 p-4 pt-14 bg-gradient-to-t from-black/85 to-transparent pointer-events-none text-white ${isVideoUrl(u) ? 'pb-14' : ''}`}>
                            <p className="text-white/75 text-xs">{stamp(ev)}</p>
                            <p className="text-base font-semibold">{ev.event.text}</p>
                            {ev.event.description && i === 0 && <p className="text-white/80 text-xs mt-0.5">{ev.event.description}</p>}
                          </div>
                          <div className="absolute top-2 end-2">{del(ev, true)}</div>
                        </div>
                      ))
                    })}
                  </div>
                )
              }

              // album (style « papier » volontaire : post-it et photos polaroïd)
              return (
                <div className="space-y-5 mb-6 py-2">
                  {allEvents.map((ev, idx) => {
                    const photos: string[] = ev.event.photos || []
                    const tilt = { transform: `rotate(${idx % 2 ? 1.6 : -1.8}deg)` }
                    if (photos.length === 0) {
                      return (
                        <div key={`${ev.dayIndex}-${ev.eventIndex}`} style={tilt}
                          className="bg-amber-200 text-amber-950 text-sm p-3 pe-1 w-4/5 mx-auto shadow-lg flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{ev.event.text}</p>
                            {ev.event.description && <p className="text-xs mt-1">{ev.event.description}</p>}
                            <p className="text-[11px] opacity-70 mt-1">{stamp(ev)}</p>
                          </div>
                          <button onClick={() => deleteEventFromDay(ev.dayIndex, ev.eventIndex)} aria-label={t('common.delete')}
                            className="w-10 h-10 shrink-0 rounded-full inline-flex items-center justify-center text-amber-900/60 hover:text-red-700 transition">
                            <Icon name="trash" size={17} />
                          </button>
                        </div>
                      )
                    }
                    return (
                      <div key={`${ev.dayIndex}-${ev.eventIndex}`} style={tilt}
                        className="bg-zinc-100 text-zinc-900 p-2 pb-3 rounded-sm shadow-lg w-[92%] mx-auto">
                        <div className={`grid gap-1.5 ${photos.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                          {photos.map((u, i) => (
                            <Media key={i} url={u}
                              className={`w-full object-cover bg-black ${photos.length === 1 ? 'max-h-72' : 'h-32'} ${photos.length > 1 && photos.length % 2 === 1 && i === 0 ? 'col-span-2 !h-44' : ''}`} />
                          ))}
                        </div>
                        <div className="flex items-start justify-between gap-2 mt-2">
                          <div className="min-w-0">
                            <p className="font-semibold text-sm" style={{ fontFamily: 'Georgia, serif' }}>{ev.event.text}</p>
                            {ev.event.description && <p className="text-xs text-zinc-600 mt-0.5">{ev.event.description}</p>}
                            <p className="text-[11px] text-zinc-500 mt-0.5">{stamp(ev)}</p>
                          </div>
                          <button onClick={() => deleteEventFromDay(ev.dayIndex, ev.eventIndex)} aria-label={t('common.delete')}
                            className="w-10 h-10 shrink-0 rounded-full inline-flex items-center justify-center text-zinc-400 hover:text-red-600 transition">
                            <Icon name="trash" size={17} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {/* Nouvel évènement */}
            <div className="rounded-2xl border border-line bg-surface-2/40 p-4 space-y-3">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <span className="w-7 h-7 rounded-lg bg-brand-soft text-brand flex items-center justify-center"><Icon name="plus" size={16} /></span>
                {t('week.newEvent')}
              </p>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input type="date" value={newEventDate} onChange={e => setNewEventDate(e.target.value)}
                  min={weekDates[0] ? toInputDate(weekDates[0]) : undefined}
                  max={weekDates[6] ? toInputDate(weekDates[6]) : undefined}
                  aria-label={t('week.date')} className={`${input} min-w-0`} />
                <input type="time" value={newEventTime} onChange={e => setNewEventTime(e.target.value)}
                  aria-label={t('week.time')} className={`${input} w-28`} />
              </div>
              <input type="text" value={newEventTitle} onChange={e => setNewEventTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addEvent()}
                placeholder={t('week.titlePh')} className={input} />
              <textarea value={newEventDesc} onChange={e => setNewEventDesc(e.target.value)}
                placeholder={t('week.descPh')} rows={2}
                className={`${input.replace('h-11', '')} py-2.5 resize-none`} />

              {newEventPhotos.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {newEventPhotos.map((url, pi) => (
                    <div key={pi} className="relative rounded-xl overflow-hidden bg-surface-3 aspect-square">
                      <Media url={url} controls={false} className="absolute inset-0 w-full h-full object-cover" />
                      {isVideoUrl(url) && (
                        <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <span className="w-9 h-9 rounded-full bg-black/55 text-white flex items-center justify-center"><Icon name="play" size={16} filled /></span>
                        </span>
                      )}
                      {/* Zone de toucher 40 × 40, pastille visible plus petite */}
                      <button onClick={() => setNewEventPhotos(prev => prev.filter((_, j) => j !== pi))} aria-label={t('week.removeMedia')}
                        className="absolute top-0 end-0 w-10 h-10 flex items-start justify-end p-1.5">
                        <span className="w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center"><Icon name="x" size={14} /></span>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <label className={`${btn.secondary} cursor-pointer sm:flex-1 ${uploadingEvent ? 'opacity-60 pointer-events-none' : ''}`}>
                  {uploadingEvent ? <Spinner size={16} /> : <Icon name="camera" size={18} />}
                  {uploadingEvent ? t('theme.uploading') : t('week.addMedia')}
                  <input type="file" accept="image/*,video/*" multiple onChange={uploadEventPhoto} className="hidden" />
                </label>
                <button onClick={addEvent} disabled={!newEventTitle.trim() || uploadingEvent || addingEvent} className={`${btn.primary} sm:flex-1`}>
                  {addingEvent ? <Spinner size={16} /> : <Icon name="plus" size={18} />}
                  {t('week.add')}
                </button>
              </div>
            </div>
          </div>
        )}
      </Sheet>
    </div>
  )
}
