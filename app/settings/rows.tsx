'use client'
// Briques de la page Paramètres : groupe de lignes, ligne cliquable et interrupteur accessible.
import Link from 'next/link'
import { useId, type ReactNode } from 'react'
import Icon, { type IconName } from '../components/Icon'
import { Spinner, card } from '../components/ui'

// Un groupe = un titre de section + une carte avec des lignes séparées par un filet
export function Group({ title, danger = false, children }: { title: string, danger?: boolean, children: ReactNode }) {
  return (
    <section className="mt-8 first:mt-0">
      <h2 className={`text-sm font-semibold mb-2 px-1 ${danger ? 'text-danger' : ''}`}>{title}</h2>
      <div className={`${card} ${danger ? '!border-danger/30' : ''} divide-y divide-line overflow-hidden`}>{children}</div>
    </section>
  )
}

const rowBase = 'w-full flex items-center gap-3 px-4 min-h-14 py-2 text-start transition hover:bg-surface-2 active:bg-surface-3 focus-visible:outline-none focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/60 disabled:opacity-50'

function RowBody({ icon, title, hint, value, danger, busy, chevron }: {
  icon: IconName, title: string, hint?: string, value?: ReactNode, danger?: boolean, busy?: boolean, chevron?: boolean
}) {
  return (
    <>
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${danger ? 'bg-danger/15 text-danger' : 'bg-surface-2 text-muted'}`}>
        <Icon name={icon} size={18} />
      </span>
      <span className="flex-1 min-w-0">
        <span className={`block text-sm font-medium ${danger ? 'text-danger' : ''}`}>{title}</span>
        {hint && <span className="block text-xs text-muted mt-0.5 leading-snug">{hint}</span>}
      </span>
      {value != null && <span className="text-sm text-muted truncate max-w-[45%] [overflow-wrap:anywhere]">{value}</span>}
      {busy ? <Spinner size={16} /> : chevron && <Icon name="chevronRight" size={18} className="text-subtle shrink-0" />}
    </>
  )
}

// Ligne cliquable : lien interne (href), lien externe/mailto (external) ou bouton (onClick)
export function Row({ href, external, onClick, disabled, ...body }: {
  icon: IconName, title: string, hint?: string, value?: ReactNode, danger?: boolean, busy?: boolean, chevron?: boolean,
  href?: string, external?: boolean, onClick?: () => void, disabled?: boolean,
}) {
  if (href && external) return <a href={href} className={rowBase}><RowBody {...body} /></a>
  if (href) return <Link href={href} className={rowBase}><RowBody {...body} /></Link>
  // Ligne d'information seule (ni lien ni action)
  if (!onClick) return <div className="w-full flex items-center gap-3 px-4 min-h-14 py-2"><RowBody {...body} /></div>
  return <button type="button" onClick={onClick} disabled={disabled || body.busy} className={rowBase}><RowBody {...body} /></button>
}

// Interrupteur : zone de toucher de 44 px, role="switch" pour les lecteurs d'écran
export function Switch({ checked, onChange, label, disabled }: {
  checked: boolean, onChange: (v: boolean) => void, label: string, disabled?: boolean
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group relative w-14 h-11 shrink-0 flex items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/60 disabled:opacity-50">
      <span className={`relative block w-11 h-6 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-line-strong'}`}>
        <span className={`absolute top-0.5 start-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform group-active:scale-90 ${checked ? 'translate-x-5 rtl:-translate-x-5' : ''}`} />
      </span>
    </button>
  )
}

// Ligne avec interrupteur
export function ToggleRow({ icon, title, hint, checked, onChange, disabled }: {
  icon: IconName, title: string, hint?: string, checked: boolean, onChange: (v: boolean) => void, disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-center gap-3 ps-4 pe-2 min-h-14 py-1.5">
      <span className="w-9 h-9 rounded-xl bg-surface-2 text-muted flex items-center justify-center shrink-0"><Icon name={icon} size={18} /></span>
      <span className="flex-1 min-w-0">
        <span id={id} className="block text-sm font-medium">{title}</span>
        {hint && <span className="block text-xs text-muted mt-0.5 leading-snug">{hint}</span>}
      </span>
      <Switch checked={checked} onChange={onChange} label={title} disabled={disabled} />
    </div>
  )
}
