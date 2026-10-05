'use client'
import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function HomePage() {
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) {
        window.location.href = '/login'
      } else {
        window.location.href = '/calendar'
      }
    })
  }, [])

  return null
}
