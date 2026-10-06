'use client'
// Choix du lieu d'une semaine : recherche d'une ville ou d'un endroit (OpenStreetMap / Nominatim),
// ou position actuelle. Le lieu choisi apparaît ensuite sur la carte du monde.
import { useEffect, useRef, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import Icon from '../components/Icon'
import { Sheet, Spinner, btn, input, useUI } from '../components/ui'

export type Place = { lat: number, lng: number, name: string }

type Hit = { lat: string, lon: string, display_name: string, name?: string, address?: Record<string, string> }

// « Ville, Pays » (le dernier morceau sert à compter les pays sur la carte)
function shortName(h: Hit): string {
  const a = h.address || {}
  const local = h.name || a.city || a.town || a.village || a.municipality || a.county || a.state || ''
  const city = a.city || a.town || a.village || a.municipality || ''
  const parts = [local, city && city !== local ? city : '', a.country || ''].filter(Boolean)
  return parts.length ? parts.join(', ') : h.display_name.split(',').slice(0, 2).join(',').trim()
}

export default function PlacePicker({ open, onClose, value, onChange }: {
  open: boolean, onClose: () => void, value: Place | null, onChange: (p: Place | null) => void
}) {
  const { t, lang } = useI18n()
  const { toast } = useUI()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Hit[]>([])
  const [busy, setBusy] = useState(false)
  const [locating, setLocating] = useState(false)
  const seq = useRef(0)

  // Recherche avec une petite pause après la frappe
  useEffect(() => {
    const text = q.trim()
    const id = ++seq.current
    const timer = setTimeout(async () => {
      if (text.length < 2) { setHits([]); setBusy(false); return }
      setBusy(true)
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&accept-language=${lang || 'fr'}&q=${encodeURIComponent(text)}`)
        const json = (await res.json()) as Hit[]
        if (id === seq.current) setHits(Array.isArray(json) ? json : [])
      } catch {
        if (id === seq.current) { setHits([]); toast(t('place.error'), 'error') }
      }
      if (id === seq.current) setBusy(false)
    }, text.length < 2 ? 0 : 450)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const pick = (h: Hit) => {
    onChange({ lat: Number(h.lat), lng: Number(h.lon), name: shortName(h) })
    onClose()
  }

  const useMyPosition = () => {
    if (!navigator.geolocation) { toast(t('place.noGeo'), 'error'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(async pos => {
      const { latitude: lat, longitude: lng } = pos.coords
      let name = `${lat.toFixed(2)}, ${lng.toFixed(2)}`
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&accept-language=${lang || 'fr'}&lat=${lat}&lon=${lng}`)
        const h = (await res.json()) as Hit
        if (h?.address) name = shortName(h)
      } catch { /* on garde les coordonnées */ }
      setLocating(false)
      onChange({ lat, lng, name })
      onClose()
    }, () => { setLocating(false); toast(t('place.noGeo'), 'error') }, { timeout: 10000 })
  }

  return (
    <Sheet open={open} onClose={onClose} title={t('place.title')}>
      <div key={String(open)} className="p-5 space-y-3">
        <div className="relative">
          <Icon name="search" size={18} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-subtle pointer-events-none" />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder={t('place.search')}
            className={`${input} ps-10`} />
          {busy && <span className="absolute end-3.5 top-1/2 -translate-y-1/2"><Spinner size={16} /></span>}
        </div>

        <button onClick={useMyPosition} disabled={locating} className={`${btn.secondary} w-full`}>
          {locating ? <Spinner size={16} /> : <Icon name="mapPin" size={18} />}{t('place.here')}
        </button>

        {hits.length > 0 && (
          <ul className="rounded-2xl border border-line divide-y divide-line overflow-hidden">
            {hits.map((h, i) => (
              <li key={i}>
                <button onClick={() => pick(h)} className="w-full text-start px-4 py-3 hover:bg-surface-2 transition flex items-start gap-3">
                  <Icon name="mapPin" size={18} className="text-brand shrink-0 mt-0.5" />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium truncate">{shortName(h)}</span>
                    <span className="block text-xs text-muted truncate">{h.display_name}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!busy && q.trim().length >= 2 && hits.length === 0 && <p className="text-sm text-muted text-center py-3">{t('place.none')}</p>}

        {value && (
          <button onClick={() => { onChange(null); onClose() }} className={`${btn.danger} w-full`}>
            <Icon name="trash" size={18} />{t('place.remove')}
          </button>
        )}
      </div>
    </Sheet>
  )
}
