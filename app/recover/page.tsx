'use client'
// Page affichée quand un compte est « en cours de suppression » (récupérable pendant 30 jours).
// Plein écran, sans barre de navigation.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { recoverAccount, deleteAccountNow, purgeDate, daysLeft } from '@/lib/account'
import Logo from '../components/Logo'
import Icon from '../components/Icon'
import { btn, Spinner, useUI } from '../components/ui'

export default function RecoverPage() {
  const { t, fmtShortDate } = useI18n()
  const { toast, confirm } = useUI()
  const [deletedAt, setDeletedAt] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState<'' | 'recover' | 'delete'>('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data } = await supabase.auth.getSession()
      const uid = data.session?.user.id
      // Pas connecté : direction la connexion
      if (!uid) { window.location.replace('/login'); return }
      const { data: profile } = await supabase.from('profiles').select('deleted_at').eq('id', uid).maybeSingle()
      // Compte normal : rien à récupérer
      if (!profile?.deleted_at) { window.location.replace('/calendar'); return }
      if (!cancelled) { setDeletedAt(profile.deleted_at as string); setReady(true) }
    })()
    return () => { cancelled = true }
  }, [])

  const onRecover = async () => {
    setBusy('recover')
    if (await recoverAccount()) {
      toast(t('account.recovered'), 'success')
      // Rechargement complet : la barre de navigation se met à jour
      window.location.href = '/calendar'
      return
    }
    toast(t('account.recoverFailed'), 'error')
    setBusy('')
  }

  const onSignOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const onDeleteNow = async () => {
    const ok = await confirm({
      title: t('account.deleteNowTitle'), message: t('account.deleteNowText'),
      confirmLabel: t('account.deleteNowConfirm'), danger: true,
    })
    if (!ok) return
    setBusy('delete')
    const result = await deleteAccountNow()
    if (result === 'ok') {
      toast(t('account.deleteNowDone'), 'success')
      window.location.href = '/login'
      return
    }
    toast(result === 'not_configured' ? t('account.deleteNowNotConfigured') : t('account.deleteNowFailed'), 'error')
    setBusy('')
  }

  const n = deletedAt ? daysLeft(deletedAt) : 0
  const date = deletedAt ? fmtShortDate(purgeDate(deletedAt).toISOString()) : ''
  const text = n === 0 ? t('account.recoverTextToday')
    : n === 1 ? t('account.recoverTextOne', { date })
    : t('account.recoverText', { date, n })

  return (
    // Le layout ajoute une marge pour la navigation (cachée ici) : on la compense sur ordinateur
    <main className="relative min-h-dvh md:-ms-20 flex flex-col items-center justify-center px-4 py-10">
      <div className="pointer-events-none absolute -top-40 -start-40 w-[520px] h-[520px] rounded-full bg-brand/10 blur-3xl" />
      <div className="relative w-full max-w-sm flex flex-col items-center text-center animate-fade-in">
        <Logo size={36} />
        {!ready ? (
          <div className="mt-16" role="status" aria-label={t('common.loading')}><Spinner size={28} /></div>
        ) : (
          <>
            <span className="mt-10 w-14 h-14 rounded-2xl bg-brand-soft text-brand flex items-center justify-center" aria-hidden="true">
              <Icon name="refresh" size={28} />
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">{t('account.recoverTitle')}</h1>
            <p className="mt-2 text-sm text-muted">{text}</p>

            <div className="mt-8 w-full flex flex-col gap-3">
              <button type="button" onClick={onRecover} disabled={!!busy} className={`${btn.primary} w-full`}>
                {busy === 'recover' && <Spinner size={16} />}{t('account.recoverBtn')}
              </button>
              <button type="button" onClick={onSignOut} disabled={!!busy} className={`${btn.secondary} w-full`}>
                {t('account.signOut')}
              </button>
            </div>

            <button type="button" onClick={onDeleteNow} disabled={!!busy}
              className="mt-8 inline-flex items-center gap-2 text-xs text-danger/80 hover:text-danger underline-offset-4 hover:underline transition disabled:opacity-40">
              {busy === 'delete' && <Spinner size={14} />}{t('account.deleteNow')}
            </button>
          </>
        )}
      </div>
    </main>
  )
}
