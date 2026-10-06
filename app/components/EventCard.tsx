'use client'
// Un évènement, disposition « mosaïque » : une grande photo avec le titre dessus, deux petites vignettes,
// puis la date, le lieu et la description juste en dessous. Utilisé dans le calendrier et sur la fiche d'une semaine.
import { useState } from 'react'
import { isVideoUrl } from '@/lib/media'
import { useI18n } from '@/lib/i18n'
import Icon from './Icon'
import { btn } from './ui'

export type EventCardData = {
  text?: string | null, description?: string | null, photos?: string[] | null, place?: { name?: string } | null,
}

function Media({ url, className = '' }: { url: string, className?: string }) {
  if (isVideoUrl(url)) {
    return <video src={`${url}#t=0.1`} controls playsInline preload="metadata" className={`bg-black ${className}`} />
  }
  return <img src={url} alt="" loading="lazy" className={`bg-surface-3 ${className}`} />
}

export default function EventCard({ ev, date, onDelete }: { ev: EventCardData, date: string, onDelete?: () => void }) {
  const { t } = useI18n()
  const [all, setAll] = useState(false)
  const photos = (ev.photos || []).filter(Boolean)
  const title = ev.text || t('common.untitled')
  const place = ev.place?.name || ''
  const heroIsImage = photos.length > 0 && !isVideoUrl(photos[0])
  const rest = photos.slice(1)
  const shown = all ? rest : rest.slice(0, 2)
  const hidden = rest.length - shown.length

  const del = onDelete && (
    <button onClick={onDelete} aria-label={t('common.delete')}
      className={heroIsImage || photos.length > 0
        ? 'absolute top-2 end-2 z-10 w-10 h-10 rounded-full inline-flex items-center justify-center bg-black/55 text-white hover:bg-black/75 backdrop-blur transition active:scale-90'
        : `${btn.icon} shrink-0`}>
      <Icon name="trash" size={17} />
    </button>
  )

  return (
    <article>
      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5 rounded-3xl overflow-hidden">
          <div className="col-span-2 relative h-52 sm:h-64 bg-surface-3">
            <Media url={photos[0]} className="absolute inset-0 w-full h-full object-cover" />
            {heroIsImage && (
              <>
                <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/85 to-transparent pointer-events-none" />
                <p className="absolute inset-x-4 bottom-3 text-white text-lg font-semibold leading-snug drop-shadow pointer-events-none">{title}</p>
              </>
            )}
            {del}
          </div>
          {shown.map((u, i) => {
            const last = !all && i === shown.length - 1 && hidden > 0
            return (
              <div key={u + i} className={`relative h-28 sm:h-36 bg-surface-3 ${shown.length % 2 === 1 && i === shown.length - 1 ? 'col-span-2' : ''}`}>
                <Media url={u} className="absolute inset-0 w-full h-full object-cover" />
                {last && (
                  <button onClick={() => setAll(true)} className="absolute inset-0 bg-black/55 text-white text-lg font-semibold flex items-center justify-center">+{hidden}</button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className={photos.length > 0 ? 'pt-2.5 px-1' : 'flex items-start justify-between gap-2'}>
        <div className="min-w-0">
          {(!heroIsImage) && <p className="text-base font-semibold leading-snug">{title}</p>}
          <div className={`flex flex-wrap items-center gap-2 ${heroIsImage ? '' : 'mt-1.5'}`}>
            <span className="inline-flex items-center gap-1.5 text-xs text-subtle"><Icon name="calendar" size={13} />{date}</span>
            {place && (
              <span className="inline-flex items-center gap-1.5 max-w-full text-xs text-muted bg-surface-2 border border-line rounded-full px-2.5 py-1">
                <Icon name="mapPin" size={12} className="text-brand shrink-0" /><span className="truncate">{place}</span>
              </span>
            )}
          </div>
          {ev.description && <p className="text-sm text-muted mt-2 leading-relaxed whitespace-pre-wrap">{ev.description}</p>}
        </div>
        {photos.length === 0 && del}
      </div>
    </article>
  )
}
