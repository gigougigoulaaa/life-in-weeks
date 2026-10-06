'use client'
// Carte du monde : toutes les semaines qui ont un lieu, sur un fond de carte sombre.
// Leaflet utilise `window` : il est chargé uniquement dans le navigateur (imports dynamiques).
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import 'leaflet/dist/leaflet.css'
import type { DivIcon } from 'leaflet'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { isVideoUrl } from '@/lib/media'
import Icon from '@/app/components/Icon'
import { EmptyState, Skeleton, btn, useUI } from '@/app/components/ui'

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false })
const ZoomControl = dynamic(() => import('react-leaflet').then(m => m.ZoomControl), { ssr: false })

// Petit composant invisible qui cadre la carte pour montrer tous les lieux
const FitBounds = dynamic(() => import('react-leaflet').then(m => {
  function FitBoundsInner({ points }: { points: [number, number][] }) {
    const map = m.useMap()
    useEffect(() => {
      if (points.length === 0) return
      if (points.length === 1) { map.setView(points[0], 6); return }
      // Marge plus grande en haut pour la carte flottante du titre
      map.fitBounds(points, { paddingTopLeft: [40, 130], paddingBottomRight: [40, 40], maxZoom: 10 })
    }, [map, points])
    return null
  }
  return FitBoundsInner
}), { ssr: false })

type Place = { lat: number, lng: number, name?: string | null }
type Week = {
  id: string, year: number, week_number: number, title?: string | null, content?: string | null,
  location?: Place | null,
  media_urls?: string[] | null,
  days?: { events?: { text?: string, description?: string, photos?: string[], time?: string, place?: Place | null }[] }[] | null,
}
// Un point de la carte = un évènement précis (ou, pour les anciennes semaines, le lieu de la semaine)
type Item = {
  key: string, weekId: string, year: number, week: number, lat: number, lng: number, place: string,
  title: string, text: string, photos: string[], dayIndex: number | null,
}
const validPlace = (p?: Place | null): p is Place => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
const noVideo = (urls?: string[] | null) => (urls || []).filter(u => u && !isVideoUrl(u))
const cut = (t: string) => (t.length > 120 ? `${t.slice(0, 120).trim()}…` : t)

function itemsOf(weeks: Week[]): Item[] {
  const out: Item[] = []
  for (const w of weeks) {
    let any = false
    ;(w.days || []).forEach((d, di) => (d?.events || []).forEach((e, ei) => {
      if (!validPlace(e?.place)) return
      any = true
      out.push({
        key: `${w.id}-${di}-${ei}`, weekId: w.id, year: w.year, week: w.week_number,
        lat: e.place.lat, lng: e.place.lng, place: e.place.name?.trim() || '',
        title: e.text || '', text: cut((e.description || '').trim()), photos: noVideo(e.photos), dayIndex: di,
      })
    }))
    // Anciennes semaines : un lieu pour toute la semaine (affiché seulement si aucun évènement n'a son propre lieu)
    if (!any && validPlace(w.location)) {
      const evs = (w.days || []).flatMap(d => d?.events || [])
      out.push({
        key: `${w.id}-week`, weekId: w.id, year: w.year, week: w.week_number,
        lat: w.location.lat, lng: w.location.lng, place: w.location.name?.trim() || '',
        title: w.title || '', text: cut((w.content?.trim() || evs.map(e => e?.text).find(Boolean) || '')),
        photos: [...noVideo(w.media_urls), ...evs.flatMap(e => noVideo(e?.photos))], dayIndex: null,
      })
    }
  }
  return out
}

const escapeAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')

export default function MapPage() {
  const { t, fmtNumber } = useI18n()
  const { toast } = useUI()
  const router = useRouter()
  const [items, setItems] = useState<Item[] | null>(null)
  const [L, setL] = useState<typeof import('leaflet') | null>(null)

  useEffect(() => {
    // Leaflet n'est chargé que côté navigateur
    import('leaflet').then(mod => {
      const lib = mod as typeof import('leaflet') & { default?: typeof import('leaflet') }
      setL(lib.default ?? lib)
    })
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.href = '/login'; return }
      const { data: rows, error } = await supabase
        .from('weeks').select('*').eq('user_id', data.user.id)
      if (error) toast(t('map.loadError'), 'error')
      setItems(itemsOf((rows || []) as Week[]))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Marqueurs : vignette ronde de la 1re photo, sinon pastille ambrée avec halo
  const icons = useMemo(() => {
    const out = new Map<string, DivIcon>()
    if (!L || !items) return out
    const dot = L.divIcon({
      className: 'liw-marker',
      html: '<div style="width:18px;height:18px;border-radius:9999px;background:#f5b544;border:3px solid #0a0a0b;box-shadow:0 0 0 6px rgba(245,181,68,.28),0 4px 12px rgba(0,0,0,.6)"></div>',
      iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -12],
    })
    for (const w of items) {
      const photo = w.photos[0] || null
      out.set(w.key, photo ? L.divIcon({
        className: 'liw-marker',
        html: `<div style="width:44px;height:44px;border-radius:9999px;overflow:hidden;border:2px solid #f5b544;background:#141416;box-shadow:0 0 0 5px rgba(245,181,68,.22),0 6px 16px rgba(0,0,0,.6)"><img src="${escapeAttr(photo)}" alt="" style="width:100%;height:100%;object-fit:cover;display:block" /></div>`,
        iconSize: [44, 44], iconAnchor: [22, 22], popupAnchor: [0, -24],
      }) : dot)
    }
    return out
  }, [L, items])

  const points = useMemo<[number, number][]>(() => (items || []).map(w => [w.lat, w.lng]), [items])

  // Nombre de lieux distincts et de pays (pays = dernier morceau du nom après la virgule)
  const { places, countries } = useMemo(() => {
    const p = new Set<string>(), c = new Set<string>()
    for (const w of items || []) {
      p.add(w.place.toLowerCase() || `${w.lat.toFixed(3)},${w.lng.toFixed(3)}`)
      const country = w.place.split(',').pop()?.trim()
      if (country) c.add(country.toLowerCase())
    }
    return { places: p.size, countries: c.size }
  }, [items])

  const fullHeight = 'h-[calc(100dvh_-_4rem_-_env(safe-area-inset-bottom))] md:h-dvh'

  // Chargement
  if (!items || (items.length > 0 && !L)) {
    return <div className={`${fullHeight} p-0`}><Skeleton className="w-full h-full rounded-none!" /></div>
  }

  // Aucun lieu
  if (items.length === 0) {
    return (
      <div className={`${fullHeight} flex flex-col items-center justify-center px-4`}>
        <EmptyState icon="map" title={t('map.empty')} text={t('map.emptyHint')}
          action={<button onClick={() => router.push('/calendar')} className={btn.primary}><Icon name="calendar" size={18} />{t('map.goCalendar')}</button>} />
      </div>
    )
  }

  const pill = 'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-surface-2 border border-line text-xs font-medium text-muted'

  return (
    // `isolate` : les calques de Leaflet restent sous les toasts et fenêtres de l'app
    <div className={`relative isolate ${fullHeight} w-full`}>
      <MapContainer center={points[0]} zoom={3} minZoom={2} worldCopyJump zoomControl={false}
        style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap"
          className="map-tiles-dark" maxZoom={19} />
        <ZoomControl position="bottomright" />
        <FitBounds points={points} />
        {items.map(w => {
          const photos = w.photos.slice(0, 4)
          return (
            <Marker key={w.key} position={[w.lat, w.lng]} icon={icons.get(w.key)}>
              <Popup minWidth={220} maxWidth={260}>
                {/* div plutôt que p : Leaflet impose de grandes marges aux <p> des popups */}
                <div className="space-y-2">
                  <div className="font-semibold text-sm text-fg leading-snug">
                    {w.title || t('common.weekOfYear', { n: w.week, year: w.year })}
                  </div>
                  <div className="text-xs text-muted">{t('common.weekOfYear', { n: w.week, year: w.year })}</div>
                  {w.place && (
                    <div className="flex items-center gap-1 text-xs text-muted">
                      <Icon name="mapPin" size={14} className="text-brand" />
                      <span className="truncate">{w.place}</span>
                    </div>
                  )}
                  {photos.length > 0 && (
                    <div className={`grid gap-1 ${photos.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      {photos.map((u, i) => <img key={i} src={u} alt="" className={`w-full object-cover rounded-xl ${photos.length > 1 ? 'h-20' : 'h-28'}`} />)}
                    </div>
                  )}
                  {w.text && <div className="text-xs text-muted leading-relaxed whitespace-pre-line">{w.text}</div>}
                  <button onClick={() => router.push(`/calendar?y=${w.year}&w=${w.week}`)}
                    className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-xl bg-brand text-ink font-semibold text-xs hover:bg-brand-strong active:scale-[0.98] transition">
                    {t('map.openWeek')}<Icon name="arrowRight" size={14} />
                  </button>
                </div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>

      {/* Carte flottante avec le titre et les compteurs */}
      <div className="absolute z-[1000] top-4 inset-x-4 md:inset-x-auto md:start-6 md:top-6 md:w-auto
        bg-surface/90 backdrop-blur-xl border border-line rounded-2xl px-4 py-3 shadow-2xl animate-fade-in pointer-events-auto">
        <h1 className="text-lg md:text-xl font-semibold tracking-tight">{t('map.title')}</h1>
        <div className="flex flex-wrap gap-2 mt-2">
          <span className={pill}><Icon name="mapPin" size={14} className="text-brand" />
            {places === 1 ? t('map.place1') : t('map.places', { n: fmtNumber(places) })}</span>
          <span className={pill}><Icon name="globe" size={14} className="text-brand" />
            {countries === 1 ? t('map.country1') : t('map.countries', { n: fmtNumber(countries) })}</span>
        </div>
      </div>
    </div>
  )
}
