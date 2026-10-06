'use client'
import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useI18n, type Key } from '@/lib/i18n'
import LanguageSelector from '../components/LanguageSelector'
import Link from 'next/link'
import Logo from '../components/Logo'
import Icon from '../components/Icon'
import { btn, input, Sheet, Spinner } from '../components/ui'

// Traduit les messages d'erreur de Supabase (en anglais) en phrases claires
function errorKey(message: string, status?: number): Key {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'login.errInvalid'
  if (m.includes('email not confirmed')) return 'login.errNotConfirmed'
  if (m.includes('password should be at least') || m.includes('password is too short')) return 'login.errShort'
  if (m.includes('already registered') || m.includes('already exists')) return 'login.errExists'
  if (m.includes('rate limit') || m.includes('too many') || status === 429) return 'login.errRate'
  if (m.includes('fetch') || m.includes('network')) return 'login.errNetwork'
  if (m.includes('email') && (m.includes('invalid') || m.includes('validate'))) return 'login.errEmail'
  return 'common.error'
}

// Petite illustration : une grille de semaines qui s'allument une à une
const COLS = 16, ROWS = 11, TOTAL = COLS * ROWS, TARGET = Math.round(TOTAL * 0.62)
// Quelques semaines « souvenirs » (toujours les mêmes, pour un rendu stable)
const MEMORIES = new Set([7, 19, 23, 40, 51, 58, 66, 79, 88, 94, 101])

function WeeksIllustration() {
  const [lit, setLit] = useState(0)
  useEffect(() => {
    // Si l'utilisateur a demandé moins d'animations, on affiche directement l'état final
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const timer = setInterval(() => {
      setLit(n => {
        const next = reduce ? TARGET : n + 1
        if (next >= TARGET) clearInterval(timer)
        return Math.min(next, TARGET)
      })
    }, reduce ? 0 : 28)
    return () => clearInterval(timer)
  }, [])

  return (
    <div dir="ltr" className="grid gap-[6px] md:gap-2 w-full max-w-[340px] md:max-w-[420px]" style={{ gridTemplateColumns: `repeat(${COLS}, minmax(0, 1fr))` }} aria-hidden="true">
      {Array.from({ length: TOTAL }, (_, i) => {
        const past = i < lit
        const current = i === lit && lit > 0
        const memory = past && MEMORIES.has(i)
        return (
          <span key={i}
            className={`aspect-square rounded-full transition-all duration-300 ${current ? 'bg-brand scale-150 shadow-[0_0_12px_#f5b544]' : memory ? 'bg-brand/80' : past ? 'bg-fg/45' : 'border border-line-strong'}`} />
        )
      })}
    </div>
  )
}

// Logo Google (couleurs officielles), dessiné en SVG pour ne dépendre d'aucune image externe
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

// Le bouton Google n'apparaît que si le propriétaire l'a activé (voir NEXT_PUBLIC_GOOGLE_AUTH dans Vercel)
const GOOGLE_ENABLED = process.env.NEXT_PUBLIC_GOOGLE_AUTH === '1'

export default function LoginPage() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState('')
  // Fenêtre « mot de passe oublié »
  const [forgotOpen, setForgotOpen] = useState(false)
  const [forgotEmail, setForgotEmail] = useState('')
  const [forgotLoading, setForgotLoading] = useState(false)
  const [forgotDone, setForgotDone] = useState(false)
  const [forgotError, setForgotError] = useState('')

  // Déjà connecté : direction le calendrier
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace('/calendar')
    })
  }, [])

  const handleAuth = async (e: FormEvent) => {
    e.preventDefault()
    setError('')
    setSent(false)
    if (isSignUp && password.length < 6) { setError(t('login.errShort')); return }
    if (isSignUp && password !== confirmPassword) { setError(t('login.errMismatch')); return }
    setLoading(true)
    if (isSignUp) {
      const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
      if (error) setError(t(errorKey(error.message, error.status)))
      // Supabase renvoie un compte « vide » quand l'email est déjà utilisé
      else if (data.user && data.user.identities?.length === 0) setError(t('login.errExists'))
      else if (data.session) { window.location.href = '/calendar'; return }
      else setSent(true)
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (error) setError(t(errorKey(error.message, error.status)))
      else {
        // Compte en cours de suppression : on propose de le récupérer
        const { data } = await supabase.auth.getUser()
        let deleted = false
        if (data.user) {
          const { data: profile } = await supabase.from('profiles').select('deleted_at').eq('id', data.user.id).maybeSingle()
          deleted = !!profile?.deleted_at
        }
        window.location.href = deleted ? '/recover' : '/calendar'
        return
      }
    }
    setLoading(false)
  }

  const switchMode = () => { setIsSignUp(v => !v); setError(''); setSent(false); setConfirmPassword('') }

  const openForgot = () => {
    setForgotEmail(email); setForgotDone(false); setForgotError(''); setForgotOpen(true)
  }

  // Message de succès volontairement neutre : on ne révèle pas quelles adresses ont un compte
  const sendReset = async (e: FormEvent) => {
    e.preventDefault()
    setForgotError('')
    setForgotLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setForgotLoading(false)
    // Seules les erreurs « générales » (trop d'essais, réseau, adresse mal écrite) sont montrées
    if (error && (error.status === 429 || /rate limit|too many|fetch|network|invalid/i.test(error.message))) {
      setForgotError(t(errorKey(error.message, error.status)))
      return
    }
    setForgotDone(true)
  }

  const signInWithGoogle = async () => {
    setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/calendar` },
    })
    if (error) setError(t(errorKey(error.message, error.status)))
  }

  return (
    // Le layout ajoute une marge pour la navigation (cachée ici) : on la compense sur ordinateur
    <main className="relative min-h-dvh md:-ms-20 flex flex-col md:flex-row">
      <div className="absolute top-4 end-4 z-10"><LanguageSelector showName /></div>

      {/* Colonne marque : logo, accroche, illustration */}
      <section className="relative flex flex-col items-center md:items-start justify-center gap-8 px-6 pt-16 pb-8 md:p-16 md:flex-1 md:bg-surface md:border-e md:border-line overflow-hidden">
        <div className="pointer-events-none absolute -top-40 -start-40 w-[520px] h-[520px] rounded-full bg-brand/10 blur-3xl" />
        <div className="relative flex flex-col items-center md:items-start text-center md:text-start gap-3">
          <Logo size={40} />
          <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Life in Weeks</h1>
          <p className="text-muted text-base md:text-lg max-w-sm">{t('app.tagline')}</p>
        </div>
        <div className="relative"><WeeksIllustration /></div>
        <ul className="relative hidden md:flex flex-col gap-3 text-sm text-muted">
          {(['login.feature1', 'login.feature2', 'login.feature3'] as const).map(k => (
            <li key={k} className="flex items-center gap-3">
              <span className="w-7 h-7 rounded-lg bg-brand-soft text-brand flex items-center justify-center"><Icon name="check" size={16} /></span>
              {t(k)}
            </li>
          ))}
        </ul>
      </section>

      {/* Colonne formulaire */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 pb-10 md:p-16">
        <div className="w-full max-w-sm animate-fade-in">
          <h2 className="text-2xl font-semibold tracking-tight">{isSignUp ? t('login.createTitle') : t('login.welcome')}</h2>
          <p className="text-muted text-sm mt-1.5">{isSignUp ? t('login.createText') : t('login.welcomeText')}</p>

          <form onSubmit={handleAuth} className="mt-8 flex flex-col gap-4" noValidate>
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-1.5">{t('login.email')}</label>
              <input id="email" type="email" inputMode="email" autoComplete="email" required
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder={t('login.emailPh')} className={input} />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-1.5">{t('login.password')}</label>
              <div className="relative">
                <input id="password" type={showPassword ? 'text' : 'password'} required minLength={6}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder={isSignUp ? t('login.passwordPh') : ''} className={`${input} pe-12`} />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? t('login.hidePassword') : t('login.showPassword')}
                  aria-pressed={showPassword}
                  className={`${btn.icon} absolute end-0.5 top-1/2 -translate-y-1/2 ${showPassword ? 'text-brand' : ''}`}>
                  <Icon name="eye" size={18} />
                </button>
              </div>
              {!isSignUp && (
                <div className="mt-2 text-end">
                  <button type="button" onClick={openForgot}
                    className="text-sm text-muted hover:text-brand transition underline-offset-4 hover:underline">
                    {t('login.forgot')}
                  </button>
                </div>
              )}
            </div>
            {isSignUp && (
              <div>
                <label htmlFor="confirm-password" className="block text-sm font-medium mb-1.5">{t('login.confirmPassword')}</label>
                <input id="confirm-password" type={showPassword ? 'text' : 'password'} required minLength={6}
                  autoComplete="new-password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                  className={input} />
              </div>
            )}

            {error && (
              <p role="alert" className="flex items-start gap-2 text-sm text-danger bg-danger/10 border border-danger/25 rounded-xl px-3 py-2.5 animate-fade-in">
                <Icon name="info" size={16} className="mt-0.5" />{error}
              </p>
            )}
            {sent && (
              <p role="status" className="flex items-start gap-2 text-sm text-brand bg-brand-soft border border-brand/25 rounded-xl px-3 py-2.5 animate-fade-in">
                <Icon name="check" size={16} className="mt-0.5" />{t('login.sent')}
              </p>
            )}

            <button type="submit" disabled={loading || !email || !password || (isSignUp && !confirmPassword)} className={`${btn.primary} w-full mt-2`}>
              {loading && <Spinner size={16} />}
              {isSignUp ? t('login.create') : t('login.signin')}
            </button>
            {isSignUp && (
              <p className="text-xs text-subtle text-center">
                {t('login.consentPre')}{' '}
                <Link href="/terms" className="underline underline-offset-2 hover:text-muted">{t('login.termsLink')}</Link>{' '}
                {t('login.consentAnd')}{' '}
                <Link href="/privacy" className="underline underline-offset-2 hover:text-muted">{t('login.privacyLink')}</Link>.
              </p>
            )}
          </form>

          {GOOGLE_ENABLED && (
            <>
              <div className="mt-6 flex items-center gap-3 text-xs text-subtle" role="separator">
                <span className="flex-1 h-px bg-line" />{t('login.or')}<span className="flex-1 h-px bg-line" />
              </div>
              <button type="button" onClick={signInWithGoogle} className={`${btn.secondary} w-full mt-6`}>
                <GoogleLogo />{t('login.google')}
              </button>
            </>
          )}

          <p className="text-sm text-muted text-center mt-6">
            {isSignUp ? t('login.askHave') : t('login.askNo')}{' '}
            <button type="button" onClick={switchMode} className="text-fg font-medium hover:text-brand transition underline-offset-4 hover:underline">
              {isSignUp ? t('login.toSignin') : t('login.toSignup')}
            </button>
          </p>

          <div className="mt-10 flex justify-center">
            <Link href="/privacy" className="inline-flex items-center gap-1.5 text-xs text-subtle hover:text-muted transition">
              <Icon name="shield" size={14} />{t('nav.privacy')}
            </Link>
          </div>
        </div>
      </section>

      <Sheet open={forgotOpen} onClose={() => setForgotOpen(false)} title={t('login.forgotTitle')}>
        <form onSubmit={sendReset} className="p-5 flex flex-col gap-4" noValidate>
          <p className="text-sm text-muted">{t('login.forgotText')}</p>
          <div>
            <label htmlFor="forgot-email" className="block text-sm font-medium mb-1.5">{t('login.email')}</label>
            <input id="forgot-email" type="email" inputMode="email" autoComplete="email" required
              value={forgotEmail} onChange={e => setForgotEmail(e.target.value)}
              placeholder={t('login.emailPh')} className={input} />
          </div>
          {forgotError && (
            <p role="alert" className="flex items-start gap-2 text-sm text-danger bg-danger/10 border border-danger/25 rounded-xl px-3 py-2.5">
              <Icon name="info" size={16} className="mt-0.5" />{forgotError}
            </p>
          )}
          {forgotDone && (
            <p role="status" className="flex items-start gap-2 text-sm text-brand bg-brand-soft border border-brand/25 rounded-xl px-3 py-2.5 animate-fade-in">
              <Icon name="check" size={16} className="mt-0.5" />{t('login.forgotSent')}
            </p>
          )}
          <button type="submit" disabled={forgotLoading || !forgotEmail.trim()} className={`${btn.primary} w-full`}>
            {forgotLoading && <Spinner size={16} />}{t('login.sendLink')}
          </button>
        </form>
      </Sheet>
    </main>
  )
}
