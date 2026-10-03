export const THEMES = [
  { name: 'Défaut', accent: '#ffffff', past: '#52525b', bg: '#000000' },
  { name: 'Océan', accent: '#38bdf8', past: '#0369a1', bg: '#0c1a2e' },
  { name: 'Forêt', accent: '#4ade80', past: '#166534', bg: '#0a1a0e' },
  { name: 'Coucher de soleil', accent: '#fb923c', past: '#9a3412', bg: '#1a0a00' },
  { name: 'Rose', accent: '#f472b6', past: '#9d174d', bg: '#1a0010' },
  { name: 'Violet', accent: '#a78bfa', past: '#5b21b6', bg: '#0d0a1a' },
  { name: 'Or', accent: '#fbbf24', past: '#92400e', bg: '#1a1400' },
]

export const END_YEAR = 2500
export const CELL_SIZE = 13
export const CELL_GAP = 4
export const DAY_NAMES = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']
export const COLORS = ['#ffffff', '#f87171', '#fb923c', '#fbbf24', '#4ade80', '#38bdf8', '#a78bfa', '#f472b6', '#000000']
export const EMPTY_DAYS = () => Array(7).fill(null).map(() => ({ events: [] }))