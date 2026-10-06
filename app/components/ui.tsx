'use client'
// Briques d'interface partagées par toutes les pages :
// Sheet (fenêtre qui monte du bas sur téléphone, centrée sur ordinateur), Avatar,
// EmptyState, Skeleton, Spinner, et useUI() pour les messages (toast) et confirmations.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import Icon, { type IconName } from './Icon'
import { useI18n } from '@/lib/i18n'

/* ------------------------------------------------------------------ */
/* Classes réutilisables                                               */
/* ------------------------------------------------------------------ */
export const btn = {
  primary: 'inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-brand text-ink font-semibold text-sm hover:bg-brand-strong active:scale-[0.98] transition disabled:opacity-40 disabled:pointer-events-none',
  secondary: 'inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-surface-2 text-fg font-medium text-sm border border-line hover:bg-surface-3 active:scale-[0.98] transition disabled:opacity-40 disabled:pointer-events-none',
  ghost: 'inline-flex items-center justify-center gap-2 h-10 px-3 rounded-xl text-muted text-sm hover:text-fg hover:bg-surface-2 transition',
  danger: 'inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-danger/15 text-danger font-medium text-sm border border-danger/30 hover:bg-danger/25 transition',
  icon: 'inline-flex items-center justify-center w-10 h-10 rounded-xl text-muted hover:text-fg hover:bg-surface-2 transition',
}
export const input = 'w-full h-11 bg-surface-2 text-fg placeholder:text-subtle px-3.5 rounded-xl outline-none border border-line focus:border-brand/60 text-sm transition'
export const card = 'bg-surface border border-line rounded-2xl'
export const page = 'mx-auto w-full max-w-2xl px-4 sm:px-6 pt-6 pb-nav animate-fade-in'

/* ------------------------------------------------------------------ */
/* Sheet : panneau modal                                               */
/* ------------------------------------------------------------------ */
export function Sheet({ open, onClose, title, children, side = 'center', wide = false, headerExtra }: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  side?: 'center' | 'right'
  wide?: boolean
  headerExtra?: ReactNode
}) {
  const { t } = useI18n()
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, onClose])

  if (!open) return null
  const right = side === 'right'
  return (
    <div className={`fixed inset-0 z-50 flex items-end ${right ? 'md:items-stretch md:justify-end' : 'md:items-center md:justify-center md:p-6'}`} role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className={`relative w-full max-h-[92dvh] flex flex-col bg-surface border border-line rounded-t-3xl shadow-2xl animate-sheet-up ${right
        ? 'md:h-full md:max-h-none md:w-[440px] md:rounded-none md:rounded-s-3xl md:animate-slide-in-right'
        : `${wide ? 'md:max-w-2xl' : 'md:max-w-lg'} md:max-h-[88vh] md:rounded-3xl md:animate-pop-in`}`}>
        <div className="md:hidden flex justify-center pt-2.5"><div className="w-10 h-1 rounded-full bg-line-strong" /></div>
        {(title || headerExtra) && (
          <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-3 md:pt-5 border-b border-line">
            <div className="min-w-0 font-semibold text-base truncate">{title}</div>
            <div className="flex items-center gap-1">
              {headerExtra}
              <button onClick={onClose} aria-label={t('common.close')} className={btn.icon}><Icon name="x" size={20} /></button>
            </div>
          </div>
        )}
        <div className="overflow-y-auto overscroll-contain flex-1 pb-[env(safe-area-inset-bottom)]">{children}</div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Avatar : photo, sinon initiales sur un dégradé                      */
/* ------------------------------------------------------------------ */
export function Avatar({ url, name, size = 40, ring = false }: { url?: string | null, name?: string | null, size?: number, ring?: boolean }) {
  const initials = (name || '?').replace(/^@/, '').trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?'
  return (
    <div className={`rounded-full overflow-hidden shrink-0 bg-surface-3 flex items-center justify-center ${ring ? 'ring-2 ring-brand ring-offset-2 ring-offset-ink' : ''}`}
      style={{ width: size, height: size }}>
      {url
        ? <img src={url} alt="" className="w-full h-full object-cover" />
        : <span className="w-full h-full flex items-center justify-center font-semibold text-ink"
            style={{ fontSize: size * 0.38, background: 'linear-gradient(135deg, #f5b544, #e07a5f)' }}>{initials}</span>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* États vides, chargement                                             */
/* ------------------------------------------------------------------ */
export function EmptyState({ icon, title, text, action }: { icon: IconName, title: string, text?: string, action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center px-6 py-14 animate-fade-in">
      <div className="w-14 h-14 rounded-2xl bg-brand-soft text-brand flex items-center justify-center mb-4">
        <Icon name={icon} size={26} />
      </div>
      <p className="font-semibold text-fg">{title}</p>
      {text && <p className="text-muted text-sm mt-1.5 max-w-xs leading-relaxed">{text}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-xl ${className}`} />
}

export function Spinner({ size = 20 }: { size?: number }) {
  return <span className="inline-block rounded-full border-2 border-line-strong border-t-brand animate-spin" style={{ width: size, height: size }} />
}

/* ------------------------------------------------------------------ */
/* Toasts + confirmations                                              */
/* ------------------------------------------------------------------ */
type ConfirmOptions = { title: string, message?: string, confirmLabel?: string, danger?: boolean }
type UIValue = {
  toast: (message: string, kind?: 'success' | 'error' | 'info') => void
  confirm: (options: ConfirmOptions) => Promise<boolean>
}
const UIContext = createContext<UIValue | null>(null)

export function UIProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n()
  const [toasts, setToasts] = useState<{ id: number, message: string, kind: string }[]>([])
  const [confirmState, setConfirmState] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((v: boolean) => void) | null>(null)

  const toast = useCallback((message: string, kind: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, kind }])
    setTimeout(() => setToasts(prev => prev.filter(x => x.id !== id)), 2800)
  }, [])

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>(resolve => {
    resolver.current = resolve
    setConfirmState(options)
  }), [])

  const answer = (v: boolean) => { resolver.current?.(v); resolver.current = null; setConfirmState(null) }

  return (
    <UIContext.Provider value={{ toast, confirm }}>
      {children}
      <div className="fixed inset-x-0 bottom-24 md:bottom-8 z-[70] flex flex-col items-center gap-2 pointer-events-none px-4">
        {toasts.map(x => (
          <div key={x.id} className="animate-toast-in flex items-center gap-2 bg-surface-2 border border-line-strong rounded-full ps-3 pe-4 py-2 text-sm shadow-2xl">
            <span className={x.kind === 'error' ? 'text-danger' : 'text-brand'}><Icon name={x.kind === 'error' ? 'info' : 'check'} size={16} /></span>
            {x.message}
          </div>
        ))}
      </div>
      {confirmState && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-6" role="alertdialog" aria-modal="true">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={() => answer(false)} />
          <div className="relative w-full max-w-sm bg-surface border border-line rounded-3xl p-6 animate-pop-in">
            <p className="font-semibold text-lg">{confirmState.title}</p>
            {confirmState.message && <p className="text-muted text-sm mt-2 leading-relaxed">{confirmState.message}</p>}
            <div className="flex gap-2 mt-6">
              <button onClick={() => answer(false)} className={`${btn.secondary} flex-1`}>{t('common.cancel')}</button>
              <button onClick={() => answer(true)} autoFocus className={`${confirmState.danger ? btn.danger : btn.primary} flex-1`}>
                {confirmState.confirmLabel || t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </UIContext.Provider>
  )
}

export function useUI(): UIValue {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI doit être utilisé dans <UIProvider>')
  return ctx
}
