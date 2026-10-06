'use client'
// Un évènement, disposition « mosaïque » : une grande photo avec le titre dessus, deux vignettes à côté (la dernière avec « +N »),
// puis la date, le lieu et la description juste en dessous. Utilisé dans le calendrier et sur la fiche d'une semaine.
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
  // Replié : 2 vignettes (la 2e porte « +N » s'il en reste). Déplié : toutes les médias restants, 2 par ligne.
  const MAX = 2
  const shown = all ? rest : rest.slice(0, MAX)
  const hidden = rest.length - shown.length

  const placeChip = place && (
    <span className="inline-flex items-center gap-1.5 max-w-full text-xs text-muted bg-surface-2 border border-line rounded-full px-2.5 py-1">
      <Icon name="mapPin" size={12} className="text-brand shrink-0" /><span className="truncate">{place}</span>
    </span>
  )
  const trash = (overlay: boolean) => onDelete && (
    <button onClick={onDelete} aria-label={t('common.delete')}
      className={overlay
        ? 'absolute top-2 end-2 z-10 w-10 h-10 rounded-full inline-flex items-center justify-center bg-black/55 text-white hover:bg-black/75 backdrop-blur transition active:scale-90'
        : `${btn.icon} shrink-0 -mt-2 -me-2`}>
      <Icon name="trash" size={17} />
    </button>
  )
  const dateLine = (
    <span className="text-xs text-subtle inline-flex items-center gap-1.5"><Icon name="calendar" size={13} />{date}</span>
  )

  return (
    <article>
      {photos.length > 0 && (
        <div className="grid grid-cols-2 gap-1.5 rounded-3xl overflow-hidden">
          <div className="relative col-span-2 h-56 sm:h-72 bg-surface-3">
            <Media url={photos[0]} className="absolute inset-0 w-full h-full object-cover" />
            {heroIsImage && (
              <>
                <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/10 to-transparent pointer-events-none" />
                <p className="absolute inset-x-4 bottom-3 text-white text-xl font-semibold leading-snug drop-shadow pointer-events-none">{title}</p>
              </>
            )}
            {trash(true)}
          </div>
          {shown.map((u, i) => {
            const last = !all && i === shown.length - 1 && hidden > 0
            return (
              <div key={u + i} onClick={() => !all && hidden > 0 && setAll(true)}
                className={`relative overflow-hidden bg-surface-3 ${all ? 'h-36' : 'h-28'} ${!all && shown.length === 1 ? 'col-span-2' : ''}`}>
                <Media url={u} controls={all} className="absolute inset-0 w-full h-full object-cover" />
                {isVideoUrl(u) && !all && (
                  <span className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="w-9 h-9 rounded-full bg-black/55 text-white flex items-center justify-center"><Icon name="play" size={16} filled /></span>
                  </span>
                )}
                {last && <span className="absolute inset-0 bg-black/60 text-white text-lg font-semibold flex items-center justify-center pointer-events-none">+{hidden}</span>}
              </div>
            )
          })}
        </div>
      )}

      <div className={photos.length > 0 ? 'pt-3 px-1' : 'rounded-3xl bg-surface-2/60 border border-line p-4'}>
        {/* Titre : sous la mosaïque seulement si elle ne le porte pas déjà (pas de photo, ou vidéo en premier) */}
        {!heroIsImage && (
          <div className="flex items-start justify-between gap-2 mb-1.5">
            <p className="text-base font-semibold leading-snug min-w-0">{title}</p>
            {photos.length === 0 && trash(false)}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">{dateLine}{placeChip}</div>
        {ev.description && <p className="text-sm text-muted mt-2.5 leading-relaxed whitespace-pre-wrap">{ev.description}</p>}
      </div>
    </article>
  )
}
