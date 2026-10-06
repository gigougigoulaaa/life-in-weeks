'use client'
// « Tirer vers le bas pour actualiser », comme dans les apps mobiles.
// Ne fait rien sur ordinateur (pas de toucher) ni quand la page n'est pas tout en haut.
import { useEffect, useRef, useState } from 'react'

export function usePullToRefresh(onRefresh: () => Promise<void> | void) {
  const [pull, setPull] = useState(0)          // distance tirée (px), pour l'indicateur
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef<number | null>(null)
  const pullRef = useRef(0)
  const cb = useRef(onRefresh)
  useEffect(() => { cb.current = onRefresh })

  useEffect(() => {
    const THRESHOLD = 70
    const onStart = (e: TouchEvent) => {
      startY.current = window.scrollY <= 0 ? e.touches[0].clientY : null
    }
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0) { pullRef.current = 0; setPull(0); return }
      pullRef.current = Math.min(dy * 0.5, 100)
      setPull(pullRef.current)
    }
    const onEnd = async () => {
      const done = pullRef.current >= THRESHOLD
      startY.current = null; pullRef.current = 0; setPull(0)
      if (!done) return
      try { navigator.vibrate?.(8) } catch { /* ignoré */ }
      setRefreshing(true)
      try { await cb.current() } finally { setRefreshing(false) }
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
    }
  }, [])

  return { pull, refreshing }
}
