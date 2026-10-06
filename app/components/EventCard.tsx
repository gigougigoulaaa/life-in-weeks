'use client'
// Un évènement façon grosse appli : en-tête (pastille de date, titre, date · lieu), carrousel de photos/vidéos à balayer
// (compteur « 1/3 » et points), puis légende. Utilisé dans le calendrier et sur la fiche d'une semaine.
import { useRef, useState } from 'react'
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

export default function EventCard({ ev, date, onDelete }: { ev: EventCardData, date: string, onDelete?: () => void }) {
  const { t } = useI18n()
  const [idx, setIdx] = useState(0)
  const [more, setMore] = useState(false)
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
              <div key={u + i} className="snap-center shrink-0 w-full h-[22rem] sm:h-[28rem] relative bg-black">
                <Media url={u} controls className="absolute inset-0 w-full h-full object-cover" />
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
    </article>
  )
}
