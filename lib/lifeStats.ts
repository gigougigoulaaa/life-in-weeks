// Calculs des « Statistiques de vie » : fonctions pures (sans React, sans réseau), faciles à tester.
// Elles ne parlent que de ce qui est DÉJÀ vécu ou accompli : jamais de durée de vie ni de « reste ».
import { weekOfYear, weekKey, weeksLivedSince } from './shareImage'

/* ---------------- Types ---------------- */
export type StatEvent = { text?: string, description?: string, photos?: string[] }
export type StatWeek = {
  id: string, year: number, week_number: number, title?: string | null, content?: string | null,
  days?: { events?: StatEvent[] }[] | null, media_urls?: string[] | null, location?: { name?: string } | null,
}

/* ---------------- Contenu d'une semaine (même règles que le profil) ---------------- */
// Même détection vidéo que lib/media.ts (recopiée pour garder ce fichier sans dépendance)
const isVideo = (url: string) => /\.(mp4|mov|webm|m4v|ogv)(\?|#|$)/i.test(url)

// Toutes les photos/vidéos d'une semaine (galerie + photos des évènements), sans doublon
export function mediaOf(w: StatWeek): string[] {
  const all = [...(w.media_urls || []), ...(w.days || []).flatMap(d => (d?.events || []).flatMap(e => e?.photos || []))]
  return Array.from(new Set(all.filter(Boolean)))
}

// Une semaine est « remplie » si elle contient un titre, un contenu, des médias ou un évènement
export function isFilled(w: StatWeek): boolean {
  return !!(w.title || w.content || mediaOf(w).length || (w.days || []).some(d => (d?.events || []).length > 0))
}

const eventsOf = (w: StatWeek) => (w.days || []).flatMap(d => d?.events || [])
const hasText = (e: StatEvent) => !!(e?.text?.trim() || e?.description?.trim())
const countWords = (s?: string | null) => (s ? s.trim().split(/\s+/).filter(Boolean).length : 0)

/* ---------------- Numérotation des semaines ---------------- */
// Dernière semaine d'une année (52 ou 53), avec la même numérotation que le calendrier
export const weeksInYear = (year: number) => weekOfYear(new Date(year, 11, 31))

const prevWeek = (y: number, w: number): [number, number] => (w > 1 ? [y, w - 1] : [y - 1, weeksInYear(y - 1)])
const nextWeek = (y: number, w: number): [number, number] => (w < weeksInYear(y) ? [y, w + 1] : [y + 1, 1])

// Le dimanche qui ouvre la semaine n° w (la semaine 1 contient le 1er janvier)
function weekStart(year: number, week: number): Date {
  const jan1 = new Date(year, 0, 1)
  return new Date(year, 0, 1 - jan1.getDay() + (week - 1) * 7)
}

// Mois (0 à 11) d'une semaine, d'après la date de son lundi. Si le lundi tombe hors de
// l'année (début janvier / fin décembre), on le ramène dans l'année pour rester cohérent.
export function monthOfWeek(year: number, week: number): number {
  const monday = weekStart(year, week)
  monday.setDate(monday.getDate() + 1)
  if (monday.getFullYear() < year) return 0
  if (monday.getFullYear() > year) return 11
  return monday.getMonth()
}

/* ---------------- Âge exact ---------------- */
// Date de naissance « AAAA-MM-JJ » lue en heure locale (évite le décalage d'un jour du fuseau horaire)
export function parseBirth(s?: string | null): Date | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  const d = m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(s)
  return isNaN(d.getTime()) ? null : d
}

export type Age = { years: number, months: number, days: number }

// Âge en années, mois et jours révolus
export function exactAge(birth: Date, now: Date): Age {
  let years = now.getFullYear() - birth.getFullYear()
  let months = now.getMonth() - birth.getMonth()
  let days = now.getDate() - birth.getDate()
  if (days < 0) {
    // On emprunte les jours du mois précédent
    days += new Date(now.getFullYear(), now.getMonth(), 0).getDate()
    months--
  }
  if (months < 0) { months += 12; years-- }
  return { years: Math.max(0, years), months: Math.max(0, months), days: Math.max(0, days) }
}

export function timeLived(birth: Date, now: Date) {
  const ms = Math.max(0, now.getTime() - birth.getTime())
  return {
    days: Math.floor(ms / 86400000),
    weeks: weeksLivedSince(birth, now),
    hours: Math.floor(ms / 3600000),
  }
}

/* ---------------- Régularité ---------------- */
// Série en cours : semaines consécutives remplies. La semaine actuelle peut encore être vide.
export function currentStreak(filled: Set<string>, now: Date): number {
  let y = now.getFullYear()
  let w = weekOfYear(now)
  if (!filled.has(weekKey(y, w))) [y, w] = prevWeek(y, w)
  let n = 0
  while (filled.has(weekKey(y, w)) && n < 6000) { n++; [y, w] = prevWeek(y, w) }
  return n
}

// Record de série : plus longue suite de semaines remplies (jusqu'à la semaine actuelle)
export function bestStreak(weeks: StatWeek[], now: Date): number {
  const curKey = weekKey(now.getFullYear(), weekOfYear(now))
  const list = Array.from(new Set(weeks.filter(isFilled).map(w => weekKey(w.year, w.week_number))))
    .filter(k => k <= curKey) // clés « AAAA-NN » : l'ordre texte = l'ordre du temps
    .sort()
  let best = 0, run = 0
  let prev: string | null = null
  for (const k of list) {
    const [y, w] = k.split('-').map(Number)
    if (prev) {
      const [py, pw] = prev.split('-').map(Number)
      const [ny, nw] = nextWeek(py, pw)
      run = ny === y && nw === w ? run + 1 : 1
    } else run = 1
    best = Math.max(best, run)
    prev = k
  }
  return best
}

/* ---------------- Calcul global ---------------- */
export type YearCount = { year: number, count: number }
export type PlaceCount = { name: string, count: number }
export type DotState = 'past' | 'filled' | 'current' | 'upcoming'

export type LifeStats = {
  filledCount: number
  filledThisYear: number
  yearRate: number              // % de semaines remplies parmi celles écoulées de l'année en cours
  streak: number
  bestStreak: number
  byYear: YearCount[]           // années ayant des semaines remplies, de la plus ancienne à la plus récente
  yearDots: DotState[]          // une pastille par semaine de l'année en cours
  byMonth: number[]             // 12 valeurs : semaines remplies par mois, année en cours
  countries: number
  places: number
  topPlaces: PlaceCount[]
  events: number
  words: number
  photos: number
  videos: number
  busiest: { year: number, week: number, score: number } | null
}

export function computeStats(weeks: StatWeek[], now: Date): LifeStats {
  const curYear = now.getFullYear()
  const curWeek = weekOfYear(now)
  const filledWeeks = weeks.filter(isFilled)
  const filled = new Set(filledWeeks.map(w => weekKey(w.year, w.week_number)))

  // Par année et par mois
  const yearMap = new Map<number, number>()
  const byMonth = Array<number>(12).fill(0)
  const seen = new Set<string>()
  for (const w of filledWeeks) {
    const k = weekKey(w.year, w.week_number)
    if (seen.has(k)) continue // sécurité : une même semaine ne compte qu'une fois
    seen.add(k)
    yearMap.set(w.year, (yearMap.get(w.year) || 0) + 1)
    if (w.year === curYear) byMonth[monthOfWeek(w.year, w.week_number)]++
  }
  const byYear = Array.from(yearMap, ([year, count]) => ({ year, count })).sort((a, b) => a.year - b.year)
  const filledThisYear = yearMap.get(curYear) || 0

  // Grille de l'année en cours
  const yearDots: DotState[] = Array.from({ length: weeksInYear(curYear) }, (_, i) => {
    const wn = i + 1
    if (wn === curWeek) return 'current'
    if (filled.has(weekKey(curYear, wn))) return 'filled'
    return wn < curWeek ? 'past' : 'upcoming'
  })

  // Lieux : le dernier segment du nom est le pays (même logique que le profil)
  const countrySet = new Set<string>()
  const placeMap = new Map<string, { name: string, count: number }>()
  for (const w of weeks) {
    const name = w.location?.name?.trim()
    if (!name) continue
    const parts = name.split(',')
    countrySet.add(parts[parts.length - 1].trim().toLowerCase())
    const key = name.toLowerCase()
    const p = placeMap.get(key)
    if (p) p.count++
    else placeMap.set(key, { name, count: 1 })
  }
  const topPlaces = Array.from(placeMap.values()).sort((a, b) => b.count - a.count).slice(0, 3)

  // Contenu
  let events = 0, words = 0, photos = 0, videos = 0
  let busiest: LifeStats['busiest'] = null
  for (const w of weeks) {
    const evs = eventsOf(w)
    const written = evs.filter(hasText)
    events += written.length
    words += countWords(w.title) + countWords(w.content)
      + written.reduce((s, e) => s + countWords(e.text) + countWords(e.description), 0)
    const media = mediaOf(w)
    const v = media.filter(isVideo).length
    videos += v
    photos += media.length - v
    const score = evs.length + media.length
    if (score > 0 && (!busiest || score > busiest.score)) busiest = { year: w.year, week: w.week_number, score }
  }

  return {
    filledCount: filled.size,
    filledThisYear,
    yearRate: Math.min(100, Math.round((filledThisYear / Math.max(1, curWeek)) * 100)),
    streak: currentStreak(filled, now),
    bestStreak: bestStreak(weeks, now),
    byYear, yearDots, byMonth,
    countries: countrySet.size,
    places: placeMap.size,
    topPlaces, events, words, photos, videos, busiest,
  }
}

/* ---------------- Jalons (badges) ---------------- */
export type BadgeKind = 'memories' | 'countries' | 'streak' | 'photos' | 'words'
export type Badge = { kind: BadgeKind, target: number, value: number, unlocked: boolean }

const BADGE_TARGETS: Record<BadgeKind, number[]> = {
  memories: [10, 50, 100, 250],
  countries: [1, 5, 10],
  streak: [4, 12, 26],
  photos: [10, 50, 200],
  words: [10000, 50000],
}

export function computeBadges(s: LifeStats): Badge[] {
  // Pour la série, c'est le record qui compte : un jalon obtenu ne se perd pas
  const values: Record<BadgeKind, number> = {
    memories: s.filledCount, countries: s.countries, streak: Math.max(s.streak, s.bestStreak),
    photos: s.photos, words: s.words,
  }
  return (Object.keys(BADGE_TARGETS) as BadgeKind[]).flatMap(kind =>
    BADGE_TARGETS[kind].map(target => ({ kind, target, value: values[kind], unlocked: values[kind] >= target })))
}
