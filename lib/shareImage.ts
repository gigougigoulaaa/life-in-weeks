// Crée une image « Ma vie en semaines » (format portrait 1080×1350, idéal pour Instagram)
// et la partage (menu de partage du téléphone) ou la télécharge (ordinateur).
// Les textes sont fournis par la page qui appelle : ce fichier ne traduit rien.

export const LIFE_YEARS = 90
export const LIFE_WEEKS = LIFE_YEARS * 52 // 4 680 semaines

// Même numérotation des semaines que le calendrier (semaine 1 = début janvier)
export function weekOfYear(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1)
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7)
}

// Clé « AAAA-NN » utilisée pour repérer une semaine remplie
export const weekKey = (year: number, week: number) => `${year}-${String(week).padStart(2, '0')}`

// Nombre de semaines vécues depuis la naissance
export function weeksLivedSince(birthDate: Date, now = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - birthDate.getTime()) / (7 * 86400000)))
}

export async function createLifeImage(opts: {
  name: string
  birthDate: Date
  filledWeeks: Set<string> // "AAAA-NN"
  accent?: string
  subtitle?: string // ex. « 1 234 semaines vécues · 27 % » (déjà traduit par l'appelant)
}): Promise<Blob> {
  const W = 1080, H = 1350
  const accent = opts.accent || '#f5b544'
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')

  // Attendre la police de l'app pour que le texte soit net et cohérent
  try { await document.fonts?.ready } catch {}
  const font = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif'

  // Fond
  ctx.fillStyle = '#0a0a0b'
  ctx.fillRect(0, 0, W, H)

  // Titre + sous-titre
  const now = new Date()
  const lived = weeksLivedSince(opts.birthDate, now)
  const pct = Math.min(100, Math.round((lived / LIFE_WEEKS) * 1000) / 10)
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#fafafa'
  ctx.font = `600 56px ${font}`
  ctx.fillText(fitText(ctx, opts.name, W - 160), 80, 140)
  ctx.fillStyle = '#a1a1aa'
  ctx.font = `400 30px ${font}`
  ctx.fillText(opts.subtitle || `${lived} · ${pct} %`, 80, 192)

  // Grille : 90 lignes (années de vie) × 52 colonnes (semaines)
  const gridTop = 250, gridBottom = H - 150
  const gridLeft = 80, gridRight = W - 80
  const stepX = (gridRight - gridLeft) / 52
  const stepY = (gridBottom - gridTop) / LIFE_YEARS
  const r = Math.min(stepX, stepY) * 0.36

  const birthYear = opts.birthDate.getFullYear()
  const birthWeek = weekOfYear(opts.birthDate)
  const curYear = now.getFullYear()
  const curWeek = weekOfYear(now)
  let current: { x: number, y: number } | null = null

  for (let row = 0; row < LIFE_YEARS; row++) {
    const year = birthYear + row
    for (let col = 0; col < 52; col++) {
      const week = col + 1
      const x = gridLeft + stepX * (col + 0.5)
      const y = gridTop + stepY * (row + 0.5)
      if (row === 0 && week < birthWeek) continue // avant la naissance : rien
      const isCurrent = year === curYear && week === curWeek
      const isPast = year < curYear || (year === curYear && week < curWeek)
      if (isCurrent) { current = { x, y }; continue }
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      if (opts.filledWeeks.has(weekKey(year, week))) {
        ctx.fillStyle = accent
        ctx.fill()
      } else if (isPast) {
        ctx.fillStyle = 'rgba(250,250,250,0.42)'
        ctx.fill()
      } else {
        ctx.strokeStyle = 'rgba(161,161,170,0.35)'
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }
  }

  // Semaine actuelle : plus grosse, avec un halo
  if (current) {
    ctx.save()
    ctx.shadowColor = accent
    ctx.shadowBlur = 18
    ctx.fillStyle = accent
    ctx.beginPath()
    ctx.arc(current.x, current.y, r * 2.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }

  // Pied de page : logo (grille 3×3) + « Life in Weeks »
  const logoSize = 44
  const lx = 80, ly = H - 92
  for (let i = 0; i < 9; i++) {
    const cx = lx + (4 + (i % 3) * 7) * (logoSize / 22)
    const cy = ly + (4 + Math.floor(i / 3) * 7) * (logoSize / 22)
    ctx.beginPath()
    ctx.arc(cx, cy, 2.4 * (logoSize / 22), 0, Math.PI * 2)
    if (i === 5) { ctx.fillStyle = accent; ctx.fill() }
    else if (i < 5) { ctx.fillStyle = '#fafafa'; ctx.fill() }
    else { ctx.strokeStyle = 'rgba(250,250,250,0.45)'; ctx.lineWidth = 2; ctx.stroke() }
  }
  ctx.fillStyle = '#fafafa'
  ctx.font = `600 30px ${font}`
  ctx.fillText('Life in Weeks', lx + logoSize + 18, ly + logoSize / 2 + 11)

  return await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob'))), 'image/png')
  )
}

// Raccourcit un texte trop long avec « … »
function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text
  let s = text
  while (s.length > 1 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1)
  return s + '…'
}

// Téléphone : ouvre le menu de partage (Instagram, Messages…). Sinon : télécharge le fichier.
export async function shareOrDownload(blob: Blob, filename: string, title: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type || 'image/png' })
  const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title })
      return
    } catch (e) {
      // L'utilisateur a fermé le menu de partage : on ne télécharge pas à sa place
      if ((e as Error)?.name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
