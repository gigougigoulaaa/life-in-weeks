'use client'
// Installation de l'app sur l'écran d'accueil.
//  - Android / ordinateur : le navigateur envoie « beforeinstallprompt » ; on le garde pour le déclencher à la demande.
//  - iPhone / iPad (Safari) : pas d'invite possible, on affiche une petite aide « Partager → Sur l'écran d'accueil ».
//  - Déjà installée (mode « standalone ») : on masque la ligne.
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

type InstallEvent = Event & { prompt: () => Promise<void>, userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> }

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  const nav = window.navigator as Navigator & { standalone?: boolean }
  return window.matchMedia('(display-mode: standalone)').matches || nav.standalone === true
}

function isIos(): boolean {
  const ua = window.navigator.userAgent
  const iPadOs = /Macintosh/.test(ua) && window.navigator.maxTouchPoints > 1 // iPad récent se présente comme un Mac
  return /iPhone|iPad|iPod/.test(ua) || iPadOs
}

// Ces valeurs ne changent pas pendant la visite : pas besoin d'abonnement
const subscribeNone = () => () => {}
// 'ssr' côté serveur ; côté navigateur : 1er chiffre = déjà installée, 2e = iPhone/iPad
const readEnv = () => `${isStandalone() ? 1 : 0}${isIos() ? 1 : 0}`

export function useInstallPrompt() {
  const env = useSyncExternalStore(subscribeNone, readEnv, () => 'ssr')
  const [justInstalled, setJustInstalled] = useState(false)
  const [event, setEvent] = useState<InstallEvent | null>(null)

  useEffect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); setEvent(e as InstallEvent) }
    const onInstalled = () => { setJustInstalled(true); setEvent(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const ready = env !== 'ssr' // faux tant qu'on n'a pas regardé (évite un clignotement)
  const installed = justInstalled || env[0] === '1'
  const ios = env[1] === '1'

  // Lance l'invite du navigateur. Renvoie true si la personne a accepté.
  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (!event) return false
    await event.prompt()
    const choice = await event.userChoice
    setEvent(null)
    return choice.outcome === 'accepted'
  }, [event])

  return {
    ready,
    installed,
    canInstall: !!event && !installed,
    showIosHelp: ios && !installed,
    promptInstall,
  }
}
