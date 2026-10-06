'use client'
// Page 404 : affichée quand l'adresse n'existe pas.
import Link from 'next/link'
import { useI18n } from '@/lib/i18n'
import Icon from './components/Icon'
import Logo from './components/Logo'
import { btn } from './components/ui'

export default function NotFound() {
  const { t } = useI18n()
  return (
    <main className="min-h-dvh flex flex-col items-center justify-center text-center px-6 pb-nav animate-fade-in">
      <Logo size={40} className="text-muted mb-8" />
      <p className="text-6xl font-semibold tracking-tight text-brand tabular-nums" aria-hidden="true">404</p>
      <h1 className="text-2xl font-semibold tracking-tight mt-4">{t('notfound.title')}</h1>
      <p className="text-muted text-sm mt-2 max-w-xs leading-relaxed">{t('notfound.text')}</p>
      <Link href="/calendar" className={`${btn.primary} mt-8`}>
        <Icon name="calendar" size={18} />{t('notfound.back')}
      </Link>
    </main>
  )
}
