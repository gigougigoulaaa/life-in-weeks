'use client'
// Bandeau affiché quand la connexion internet est perdue.
import { useEffect, useState } from 'react'
import { useI18n } from '@/lib/i18n'
import Icon from './Icon'

export default function OfflineBanner() {
  const { t } = useI18n()
  const [online, setOnline] = useState(true)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  if (online) return null
  return (
    <div role="status" className="fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 bg-danger/90 text-white text-sm font-medium px-4 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] animate-fade-in">
      <Icon name="wifiOff" size={16} />{t('net.offline')}
    </div>
  )
}
