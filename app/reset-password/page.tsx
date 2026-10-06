'use client'
// Page ouverte depuis le lien reçu par e-mail (« mot de passe oublié »).
// supabase-js lit le lien et ouvre tout seul une session temporaire « recovery » :
// on attend qu'elle soit prête, puis on laisse choisir un nouveau mot de passe.
import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useI18n, type Key } from '@/lib/i18n'
import Logo from '../components/Logo'
import Icon from '../components/Icon'
import { btn, input, Spinner, useUI } from '../components/ui'

function errorKey(message: string, status?: number): Key {
  const m = message.toLowerCase()
  if (m.includes('should be different') || m.includes('same password')) return 'login.errSamePassword'
  if (m.includes('password should be at least') || m.includes('password is too short')) return 'login.errShort'
  if (m.includes('rate limit') || m.includes('too many') || status === 429) return 'login.errRate'
  if (m.includes('fetch') || m.includes('network')) return 'login.errNetwork'
  return 'common.error'
}

export default function ResetPasswordPage() {
  const { t } = useI18n()
  const { toast } = useUI()
  const [state, setState] = useState<'checking' | 'ready' | 'invalid'>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let done = false
    const ok = () => { done = true; setState('ready') }
    // L'événement PASSWORD_RECOVERY arrive quand le lien vient d'être lu
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) ok()
    })
    supabase.auth.getSession().then(({ data }) => { if (data.session) ok() })
    // Sans session au bout de quelques secondes, le lien est invalide ou expiré
    const timer = setTimeout(() => { if (!done) setState('invalid') }, 4000)
    return () => { sub.subscription.unsubscribe(); clearTimeout(timer) }
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) { setError(t('login.errShort')); return }
    if (password !== confirm) { setError(t('login.errMismatch')); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    if (error) { setError(t(errorKey(error.message, error.status))); setLoading(false); return }
    toast(t('account.resetDone'), 'success')
    window.location.href = '/calendar'
  }

  return (
    // Le layout ajoute une marge pour la navigation (cachée ici) : on la compense sur ordinateur
    <main className="relative min-h-dvh md:-ms-20 flex flex-col items-center justify-center px-4 py-10">
      <div className="pointer-events-none absolute -top-40 -start-40 w-[520px] h-[520px] rounded-full bg-brand/10 blur-3xl" />
      <div className="relative w-full max-w-sm animate-fade-in">
        <div className="flex justify-center"><Logo size={36} /></div>

        {state === 'checking' && (
          <div className="mt-12 flex flex-col items-center gap-3 text-sm text-muted" role="status">
            <Spinner size={28} />{t('account.resetChecking')}
          </div>
        )}

        {state === 'invalid' && (
          <div className="mt-10 flex flex-col items-center text-center">
            <span className="w-14 h-14 rounded-2xl bg-danger/10 text-danger flex items-center justify-center" aria-hidden="true">
              <Icon name="info" size={28} />
            </span>
            <h1 className="mt-5 text-2xl font-semibold tracking-tight">{t('account.resetInvalidTitle')}</h1>
            <p className="mt-2 text-sm text-muted">{t('account.resetInvalidText')}</p>
            <button type="button" onClick={() => { window.location.href = '/login' }} className={`${btn.primary} w-full mt-8`}>
              {t('account.resetNewLink')}
            </button>
          </div>
        )}

        {state === 'ready' && (
          <>
            <h1 className="mt-10 text-2xl font-semibold tracking-tight">{t('account.resetTitle')}</h1>
            <p className="text-muted text-sm mt-1.5">{t('account.resetText')}</p>
            <form onSubmit={submit} className="mt-8 flex flex-col gap-4" noValidate>
              <div>
                <label htmlFor="new-password" className="block text-sm font-medium mb-1.5">{t('account.resetNew')}</label>
                <div className="relative">
                  <input id="new-password" type={showPassword ? 'text' : 'password'} required minLength={6}
                    autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)}
                    placeholder={t('login.passwordPh')} className={`${input} pe-12`} />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                    aria-pressed={showPassword}
                    className={`${btn.icon} absolute end-0.5 top-1/2 -translate-y-1/2 ${showPassword ? 'text-brand' : ''}`}>
                    <Icon name="eye" size={18} />
                  </button>
                </div>
              </div>
              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium mb-1.5">{t('login.confirmPassword')}</label>
                <input id="confirm-password" type={showPassword ? 'text' : 'password'} required minLength={6}
                  autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  className={input} />
              </div>

              {error && (
                <p role="alert" className="flex items-start gap-2 text-sm text-danger bg-danger/10 border border-danger/25 rounded-xl px-3 py-2.5 animate-fade-in">
                  <Icon name="info" size={16} className="mt-0.5" />{error}
                </p>
              )}

              <button type="submit" disabled={loading || !password || !confirm} className={`${btn.primary} w-full mt-2`}>
                {loading && <Spinner size={16} />}{t('account.resetSave')}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  )
}
