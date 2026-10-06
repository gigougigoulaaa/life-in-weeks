// Suppression « différée » du compte : récupérable pendant 30 jours.
//  - requestAccountDeletion : marque le compte comme supprimé (rien n'est effacé) puis déconnecte.
//  - recoverAccount          : annule la suppression.
//  - deleteAccountNow        : effacement définitif immédiat (route serveur /api/delete-account).
//  - Passé 30 jours, la route /api/cron/purge (lancée chaque nuit par Vercel) efface le compte pour de bon.
import { supabase } from './supabase'
import { DELETION_GRACE_DAYS } from './appInfo'

export async function requestAccountDeletion(): Promise<boolean> {
  const { data } = await supabase.auth.getUser()
  if (!data.user) return false
  const { error } = await supabase.from('profiles')
    .upsert({ id: data.user.id, deleted_at: new Date().toISOString() })
  if (error) return false
  await supabase.auth.signOut()
  return true
}

export async function recoverAccount(): Promise<boolean> {
  const { data } = await supabase.auth.getUser()
  if (!data.user) return false
  const { error } = await supabase.from('profiles').update({ deleted_at: null }).eq('id', data.user.id)
  return !error
}

// Renvoie 'ok', 'not_configured' (clé serveur absente) ou 'failed'
export async function deleteAccountNow(): Promise<'ok' | 'not_configured' | 'failed'> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return 'failed'
  try {
    const res = await fetch('/api/delete-account', { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 501) return 'not_configured'
    if (!res.ok) return 'failed'
    await supabase.auth.signOut()
    return 'ok'
  } catch {
    return 'failed'
  }
}

// Date (objet Date) à laquelle le compte sera effacé définitivement
export function purgeDate(deletedAt: string | Date): Date {
  const d = new Date(deletedAt)
  d.setDate(d.getDate() + DELETION_GRACE_DAYS)
  return d
}

// Nombre de jours restants avant l'effacement définitif (0 si c'est aujourd'hui ou dépassé)
export function daysLeft(deletedAt: string | Date): number {
  return Math.max(0, Math.ceil((purgeDate(deletedAt).getTime() - Date.now()) / 86400000))
}
