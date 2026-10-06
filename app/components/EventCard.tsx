'use client'
// Un évènement façon grosse appli : en-tête (pastille de date, titre, date · lieu), carrousel de photos/vidéos à balayer
// (compteur « 1/3 » et points), puis légende. Utilisé dans le calendrier et sur la fiche d'une semaine.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { isVideoUrl } from '@/lib/media'
import { useI18n } from '@/lib/i18n'
import Icon from './Icon'
import { btn } from './ui'

export type EventCardData = {
  text?: string | null, description?: string | null, photos?: string[] | null, place?: { name?: string } | null,
}

function Media({ url, className = '', controls = true }: { url: string, className?: string, controls?: boolean }) {
  if (isVideoUrl(url)) {
    return <video src={`${url}#t=0.1`} controls={controls} playsInline preload="metadata" muted={!controls} className={`bg-black ${className}`} />
  }
  return <img src={url} alt="" loading="lazy" className={`bg-surface-3 ${className}`} />
}

// Visionneuse plein écran : balayer pour passer d'un média à l'autre, vidéos avec leurs commandes, Échap ou ✕ pour fermer
function Lightbox({ urls, start, onClose }: { urls: string[], start: number, onClose: () => void }) {
  const { t } = useI18n()
  const box = useRef<HTMLDivElement>(null)
  const [idx, setIdx] = useState(start)

  useEffect(() => {
    const el = box.current
    if (el) el.scrollLeft = start * el.clientWidth
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose() }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
        const b = box.current
        if (b) b.scrollBy({ left: (e.key === 'ArrowRight' ? 1 : -1) * b.clientWidth, behavior: 'smooth' })
      }
    }
    // Phase de capture : le clavier est lu ici avant la fenêtre en dessous (qui se refermerait aussi avec Échap)
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const go = (dir: 1 | -1) => box.current?.scrollBy({ left: dir * box.current.clientWidth, behavior: 'smooth' })
  const circle = 'w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white inline-flex items-center justify-center backdrop-blur transition active:scale-90'

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col animate-fade-in" role="dialog" aria-modal="true">
      <div className="flex items-center justify-between px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 text-white">
        <span className="text-sm font-medium">{urls.length > 1 ? `${idx + 1} / ${urls.length}` : ''}</span>
        <div className="flex items-center gap-2">
          <a href={urls[idx]} target="_blank" rel="noreferrer" download aria-label={t('common.download')} className={circle}><Icon name="download" size={18} /></a>
          <button onClick={onClose} aria-label={t('common.close')} className={circle}><Icon name="x" size={20} /></button>
        </div>
      </div>
      <div className="relative flex-1 min-h-0">
        <div ref={box} onScroll={() => { const b = box.current; if (b) setIdx(Math.round(b.scrollLeft / b.clientWidth)) }}
          className="h-full flex overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {urls.map((u, i) => (
            <div key={u + i} onClick={e => { if (e.target === e.currentTarget) onClose() }} className="snap-center shrink-0 w-full h-full flex items-center justify-center p-2">
              {isVideoUrl(u)
                ? <video src={u} controls playsInline autoPlay={i === start} className="max-w-full max-h-full rounded-xl bg-black" />
                : <img src={u} alt="" className="max-w-full max-h-full object-contain rounded-xl select-none" />}
            </div>
          ))}
        </div>
        {urls.length > 1 && (
          <>
            {idx > 0 && <button onClick={() => go(-1)} aria-label={t('common.back')} className={`${circle} absolute start-3 top-1/2 -translate-y-1/2 hidden md:inline-flex`}><Icon name="chevronLeft" size={20} /></button>}
            {idx < urls.length - 1 && <button onClick={() => go(1)} className={`${circle} absolute end-3 top-1/2 -translate-y-1/2 hidden md:inline-flex`}><Icon name="chevronRight" size={20} /></button>}
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

export default function EventCard({ ev, date, onDelete }: { ev: EventCardData, date: string, onDelete?: () => void }) {
  const { t } = useI18n()
  const [idx, setIdx] = useState(0)
  const [more, setMore] = useState(false)
  const [open, setOpen] = useState<number | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const photos = (ev.photos || []).filter(Boolean)
  const title = ev.text || t('common.untitled')
  const place = ev.place?.name || ''
  const desc = ev.description || ''
  const long = desc.length > 140 || desc.split('\n').length > 3
  // Pastille : jour du mois et mois, tirés de la date déjà formatée (« lun. 12 oct. · 10:30 »)
  const m = date.match(/(\d{1,2})\s+([^\s.·,\d]+)/)
  const dayNum = m?.[1] || ''
  const month = (m?.[2] || '').slice(0, 4)

  const onScroll = () => {
    const el = scroller.current
    if (el) setIdx(Math.round(el.scrollLeft / el.clientWidth))
  }

  return (
    <article>
      {/* En-tête */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-11 h-11 shrink-0 rounded-2xl bg-brand-soft text-brand flex flex-col items-center justify-center leading-none">
          {dayNum ? (
            <>
              <span className="text-base font-bold">{dayNum}</span>
              <span className="text-[10px] font-semibold uppercase mt-0.5">{month}</span>
            </>
          ) : <Icon name="calendar" size={18} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[15px] leading-tight truncate">{title}</p>
          <p className="text-xs text-subtle mt-1 truncate">
            {date}
            {place && <><span> · </span><Icon name="mapPin" size={11} className="inline -mt-0.5 text-brand" /> {place}</>}
          </p>
        </div>
        {onDelete && (
          <button onClick={onDelete} aria-label={t('common.delete')} className={`${btn.icon} shrink-0 -me-2`}><Icon name="trash" size={17} /></button>
        )}
      </div>

      {/* Carrousel */}
      {photos.length > 0 && (
        <div className="relative">
          <div ref={scroller} onScroll={onScroll}
            className="flex overflow-x-auto snap-x snap-mandatory rounded-3xl bg-surface-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {photos.map((u, i) => (
              <div key={u + i} onClick={() => !isVideoUrl(u) && setOpen(i)}
                className={`snap-center shrink-0 w-full h-[22rem] sm:h-[28rem] relative bg-black ${isVideoUrl(u) ? '' : 'cursor-zoom-in'}`}>
                <Media url={u} controls className="absolute inset-0 w-full h-full object-cover" />
                {/* Bouton « agrandir » : seul moyen d'ouvrir une vidéo en plein écran sans lancer la lecture */}
                <button onClick={e => { e.stopPropagation(); setOpen(i) }} aria-label={t('week.openMedia')}
                  className="absolute top-3 start-3 w-9 h-9 rounded-full bg-black/60 text-white backdrop-blur inline-flex items-center justify-center active:scale-90 transition">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" /></svg>
                </button>
              </div>
            ))}
          </div>
          {photos.length > 1 && (
            <>
              <span className="absolute top-3 end-3 text-xs font-medium text-white bg-black/60 backdrop-blur rounded-full px-2.5 py-1 pointer-events-none">{idx + 1}/{photos.length}</span>
              <div className="flex justify-center gap-1.5 mt-2.5">
                {photos.map((_, i) => (
                  <span key={i} className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-4 bg-brand' : 'w-1.5 bg-line-strong'}`} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Légende */}
      {desc && (
        <div className="mt-3 px-0.5">
          <p className={`text-sm text-fg/90 leading-relaxed whitespace-pre-wrap ${long && !more ? 'line-clamp-3' : ''}`}>{desc}</p>
          {long && (
            <button onClick={() => setMore(v => !v)} className="text-sm text-subtle hover:text-fg mt-0.5">
              {t(more ? 'week.less' : 'week.more')}
            </button>
          )}
        </div>
      )}
      {open !== null && <Lightbox urls={photos} start={open} onClose={() => setOpen(null)} />}
    </article>
  )
}
