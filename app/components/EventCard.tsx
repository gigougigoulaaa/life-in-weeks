'use client'
// Un évènement, disposition « photo en tête » : la première photo prend toute la largeur avec le titre et la date dessus,
// puis le lieu, la description et de petites vignettes des autres photos/vidéos. Utilisé dans le calendrier et sur la fiche d'une semaine.
import { useState } from 'react'
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
  const [all, setAll] = useState(false)
  const photos = (ev.photos || []).filter(Boolean)
  const title = ev.text || t('common.untitled')
  const place = ev.place?.name || ''
  const heroIsImage = photos.length > 0 && !isVideoUrl(photos[0])
  const rest = photos.slice(1)
  const MAX = 4
  const shown = all ? rest : rest.slice(0, MAX)
  const hidden = rest.length - shown.length

  const placeChip = place && (
    <span className="inline-flex items-center gap-1.5 max-w-full text-xs text-muted bg-surface-3 border border-line rounded-full px-2.5 py-1">
      <Icon name="mapPin" size={12} className="text-brand shrink-0" /><span className="truncate">{place}</span>
    </span>
  )

  return (
    <article className="rounded-3xl overflow-hidden bg-surface-2/60 border border-line">
      {photos.length > 0 && (
        <div className="relative h-56 sm:h-72 bg-surface-3">
          <Media url={photos[0]} className="absolute inset-0 w-full h-full object-cover" />
          {heroIsImage && (
            <>
              <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/10 to-transparent pointer-events-none" />
              <div className="absolute inset-x-4 bottom-3 pointer-events-none">
                <p className="text-white text-xl font-semibold leading-snug drop-shadow">{title}</p>
                <p className="text-zinc-300 text-xs mt-1 inline-flex items-center gap-1.5"><Icon name="calendar" size={13} />{date}</p>
              </div>
            </>
          )}
          {onDelete && (
            <button onClick={onDelete} aria-label={t('common.delete')}
              className="absolute top-2 end-2 z-10 w-10 h-10 rounded-full inline-flex items-center justify-center bg-black/55 text-white hover:bg-black/75 backdrop-blur transition active:scale-90">
              <Icon name="trash" size={17} />
            </button>
          )}
        </div>
      )}

      <div className="p-4">
        {/* Titre et date : sous la photo seulement si elle ne les porte pas déjà (pas de photo, ou vidéo en premier) */}
        {!heroIsImage && (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-base font-semibold leading-snug">{title}</p>
              <p className="text-xs text-subtle mt-1 inline-flex items-center gap-1.5"><Icon name="calendar" size={13} />{date}</p>
            </div>
            {photos.length === 0 && onDelete && (
              <button onClick={onDelete} aria-label={t('common.delete')} className={`${btn.icon} shrink-0 -mt-2 -me-2`}><Icon name="trash" size={17} /></button>
            )}
          </div>
        )}
        {placeChip && <div className={heroIsImage ? '' : 'mt-2.5'}>{placeChip}</div>}
        {ev.description && <p className="text-sm text-muted mt-2.5 leading-relaxed whitespace-pre-wrap">{ev.description}</p>}

        {rest.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3.5">
            {shown.map((u, i) => {
              const last = !all && i === shown.length - 1 && hidden > 0
              return (
                <div key={u + i} onClick={() => !all && setAll(true)} className={`relative overflow-hidden rounded-xl bg-surface-3 ${all ? 'w-[calc(50%-3px)] h-32' : 'w-16 h-16 cursor-pointer'}`}>
                  <Media url={u} controls={all} className="absolute inset-0 w-full h-full object-cover" />
                  {isVideoUrl(u) && !all && (
                    <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <span className="w-6 h-6 rounded-full bg-black/55 text-white flex items-center justify-center"><Icon name="play" size={11} filled /></span>
                    </span>
                  )}
                  {last && <span className="absolute inset-0 bg-black/60 text-white text-sm font-semibold flex items-center justify-center pointer-events-none">+{hidden}</span>}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </article>
  )
}
