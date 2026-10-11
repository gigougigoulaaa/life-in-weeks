'use client'
// Carte du monde : tous les évènements qui ont un lieu, sur un fond de carte vectoriel (OpenFreeMap + MapLibre).
// Les noms de pays, villes, mers… sont affichés dans la langue choisie dans l'application.
// MapLibre utilise `window` : il est chargé uniquement dans le navigateur (import dynamique).
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { Map as MLMap, Marker as MLMarker } from 'maplibre-gl'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { isVideoUrl } from '@/lib/media'
import Icon from '@/app/components/Icon'
import { EmptyState, Skeleton, btn, useUI } from '@/app/components/ui'

// Fond de carte gratuit, sans clé. Le style « positron » est clair : il est rendu sombre par le filtre CSS (.map-canvas-dark).
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'
// Extension qui sait écrire l'arabe, l'hébreu, le persan… de droite à gauche
const DARK_FILTER = 'invert(1) hue-rotate(180deg) brightness(0.8) contrast(0.9) saturate(0.55)'
const RTL_PLUGIN = 'https://unpkg.com/@mapbox/mapbox-gl-rtl-text@0.3.0/mapbox-gl-rtl-text.js'

// Clés de nom à essayer dans les données de la carte, selon la langue de l'application (puis anglais, puis nom local)
function nameKeys(lang: string): string[] {
  if (lang === 'zh-TW') return ['name:zh-Hant', 'name:zh']
  if (lang === 'zh') return ['name:zh-Hans', 'name:zh']
  if (lang === 'no') return ['name:no', 'name:nb']
  if (lang === 'tl') return ['name:tl', 'name:fil']
  return [`name:${lang}`]
}
function labelExpression(lang: string) {
  return ['coalesce', ...nameKeys(lang).map(k => ['get', k]), ['get', 'name_en'], ['get', 'name:latin'], ['get', 'name']]
}

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

// Repère en forme d'épingle miniature (28×36 px) avec la vignette de la 1re photo dedans
function pinElement(photo: string | null) {
  const el = document.createElement('div')
  el.style.cssText = 'width:28px;height:36px;position:relative;cursor:pointer;filter:drop-shadow(0 2px 3px rgba(0,0,0,.55))'
  el.innerHTML = `<svg width="28" height="36" viewBox="0 0 28 36" style="display:block"><path d="M14 .75C6.6.75.75 6.7.75 13.8.75 23.6 14 35.25 14 35.25S27.25 23.6 27.25 13.8C27.25 6.7 21.4.75 14 .75Z" fill="#f5b544" stroke="#0a0a0b" stroke-width="1.5"/></svg>`
    + (photo
      ? `<img src="${escapeAttr(photo)}" alt="" style="position:absolute;left:5.5px;top:5.3px;width:17px;height:17px;border-radius:9999px;object-fit:cover;background:#141416" />`
      : `<span style="position:absolute;left:9.5px;top:9.3px;width:9px;height:9px;border-radius:9999px;background:#0a0a0b"></span>`)
  return el
}

export default function MapPage() {
  const { t, fmtNumber, lang } = useI18n()
  const { toast } = useUI()
  const router = useRouter()
  const [items, setItems] = useState<Item[] | null>(null)
  const [selected, setSelected] = useState<Item | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.href = '/login'; return }
      const { data: rows, error } = await supabase
        .from('weeks').select('*').eq('user_id', data.user.id)
      if (error) toast(t('map.loadError'), 'error')
      setItems(itemsOf((rows || []) as Week[]))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Création de la carte et des repères, une fois les évènements chargés
  useEffect(() => {
    if (!items || items.length === 0 || !box.current) return
    let cancelled = false
    let map: MLMap | null = null
    const markers: MLMarker[] = []
    import('maplibre-gl').then(mod => {
      if (cancelled || !box.current) return
      const ml = (mod as typeof import('maplibre-gl') & { default?: typeof import('maplibre-gl') }).default ?? mod
      // Le « worker » (calcul de la carte en arrière-plan) est servi depuis public/ — voir scripts/copy-maplibre-worker.mjs
      try { ml.setWorkerUrl('/maplibre-gl-worker.mjs') } catch { /* déjà défini */ }
      try {
        if (ml.getRTLTextPluginStatus() === 'unavailable') ml.setRTLTextPlugin(RTL_PLUGIN, true)
      } catch { /* l'arabe s'affichera moins bien, sans bloquer la carte */ }
      map = new ml.Map({
        container: box.current, style: STYLE_URL, center: [items[0].lng, items[0].lat], zoom: 3, minZoom: 1.5,
        attributionControl: { compact: true }, dragRotate: false, pitchWithRotate: false,
      })
      mapRef.current = map
      // Seul le dessin de la carte (le canevas) est filtré : les épingles, qui sont dans le même conteneur, restent en couleur
      map.getCanvas().style.filter = DARK_FILTER
      map.touchZoomRotate.disableRotation()
      map.addControl(new ml.NavigationControl({ showCompass: false }), 'bottom-right')
      let warned = false, loaded = false
      // Message seulement si le fond de carte n'a pas pu se charger du tout (les petites erreurs de tuiles sont ignorées)
      map.on('error', () => { if (!loaded && !warned) { warned = true; toast(t('map.loadError'), 'error') } })
      map.on('load', () => { loaded = true; map?.resize(); setReady(true) })
      map.on('click', () => setSelected(null))
      for (const it of items) {
        const el = pinElement(it.photos[0] || null)
        el.addEventListener('click', e => {
          e.stopPropagation()
          setSelected(it)
          map?.easeTo({ center: [it.lng, it.lat], duration: 400 })
        })
        markers.push(new ml.Marker({ element: el, anchor: 'bottom' }).setLngLat([it.lng, it.lat]).addTo(map))
      }
      // Cadrer la carte pour montrer tous les lieux (marge en haut pour la carte du titre)
      if (items.length === 1) map.jumpTo({ center: [items[0].lng, items[0].lat], zoom: 6 })
      else {
        const b = new ml.LngLatBounds()
        items.forEach(i => b.extend([i.lng, i.lat]))
        map.fitBounds(b, { padding: { top: 130, bottom: 60, left: 40, right: 40 }, maxZoom: 10, duration: 0 })
      }
    })
    return () => { cancelled = true; markers.forEach(m => m.remove()); map?.remove(); mapRef.current = null; setReady(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items])

  // Noms des lieux dans la langue de l'application : se met à jour dès qu'on change de langue
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const expr = labelExpression(lang)
    for (const layer of map.getStyle().layers || []) {
      if (layer.type !== 'symbol') continue
      const tf = (layer.layout as Record<string, unknown> | undefined)?.['text-field']
      if (tf && JSON.stringify(tf).includes('name')) map.setLayoutProperty(layer.id, 'text-field', expr as never)
    }
  }, [lang, ready])

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
  if (!items) {
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

  const photos = selected ? selected.photos.slice(0, 4) : []

  return (
    // `isolate` : les calques de la carte restent sous les toasts et fenêtres de l'app
    <div className={`relative isolate ${fullHeight} w-full`}>
      <div className="absolute inset-0">
        <div ref={box} className="map-canvas-dark" style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Fiche de l'évènement touché */}
      {selected && (
        <div className="absolute z-[1000] inset-x-4 bottom-4 md:inset-x-auto md:start-6 md:bottom-6 md:w-80 bg-surface/95 backdrop-blur-xl border border-line rounded-2xl p-4 shadow-2xl animate-fade-in space-y-2">
          <button onClick={() => setSelected(null)} aria-label={t('common.close')} className={`${btn.icon} absolute top-2 end-2`}><Icon name="x" size={16} /></button>
          <div className="font-semibold text-sm text-fg leading-snug pe-8">
            {selected.title || t('common.weekOfYear', { n: selected.week, year: selected.year })}
          </div>
          <div className="text-xs text-muted">{t('common.weekOfYear', { n: selected.week, year: selected.year })}</div>
          {selected.place && (
            <div className="flex items-center gap-1 text-xs text-muted">
              <Icon name="mapPin" size={14} className="text-brand shrink-0" />
              <span className="truncate">{selected.place}</span>
            </div>
          )}
          {photos.length > 0 && (
            <div className={`grid gap-1 ${photos.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {photos.map((u, i) => <img key={i} src={u} alt="" className={`w-full object-cover rounded-xl ${photos.length > 1 ? 'h-20' : 'h-28'}`} />)}
            </div>
          )}
          {selected.text && <div className="text-xs text-muted leading-relaxed whitespace-pre-line">{selected.text}</div>}
          <button onClick={() => router.push(`/calendar?y=${selected.year}&w=${selected.week}`)}
            className="w-full inline-flex items-center justify-center gap-1.5 h-9 rounded-xl bg-brand text-ink font-semibold text-xs hover:bg-brand-strong active:scale-[0.98] transition">
            {t('map.openWeek')}<Icon name="arrowRight" size={14} />
          </button>
        </div>
      )}

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
