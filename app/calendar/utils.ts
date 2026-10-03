export function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)
}

export function getWeekDates(year: number, week: number): Date[] {
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

export function parseDays(raw: any): any[] {
  const empty = Array(7).fill(null).map(() => ({ events: [] }))
  if (!Array.isArray(raw) || raw.length === 0) return empty
  const result = Array(7).fill(null).map(() => ({ events: [] }))
  for (let i = 0; i < 7; i++) {
    if (raw[i] && Array.isArray(raw[i].events)) {
      result[i] = { events: raw[i].events }
    }
  }
  return result
}

export function timeAgo(date: string): string {
  const diff = Date.now() - new Date(date).getTime()
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (mins < 1) return "À l'instant"
  if (mins < 60) return `${mins}m`
  if (hours < 24) return `${hours}h`
  return `${days}j`
}