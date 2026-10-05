'use client'
import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useI18n, type Key } from '@/lib/i18n'
import LanguageSelector from '../components/LanguageSelector'
import Link from 'next/link'
import Logo from '../components/Logo'
import Icon from '../components/Icon'
import { btn, input, Spinner } from '../components/ui'

// Traduit les messages d'erreur de Supabase (en anglais) en phrases claires
function errorKey(message: string, status?: number): Key {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'login.errInvalid'
  if (m.includes('email not confirmed')) return 'login.errNotConfirmed'
  if (m.includes('password should be at least') || m.includes('password is too short')) return 'login.errShort'
  if (m.includes('already registered') || m.includes('already exists')) return 'login.errExists'
  if (m.includes('rate limit') || m.includes('too many') || status === 429) return 'login.errRate'
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

export default function LoginPage() {
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

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
      else { window.location.href = '/calendar'; return }
    }
    setLoading(false)
  }

  const switchMode = () => { setIsSignUp(v => !v); setError(''); setSent(false) }

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
            </div>

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

            <button type="submit" disabled={loading || !email || !password} className={`${btn.primary} w-full mt-2`}>
              {loading && <Spinner size={16} />}
              {isSignUp ? t('login.create') : t('login.signin')}
            </button>
          </form>

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
    </main>
  )
}
