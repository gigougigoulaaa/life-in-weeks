// Préférences de notifications de la personne connectée (colonne profiles.notif_prefs).
// follow / comment / reaction : false = ne plus recevoir ce type de notification
// (le blocage est fait côté base de données, voir supabase/settings.sql).
// muted : identifiants des personnes dont la conversation est en sourdine.
import { supabase } from './supabase'

export type NotifPrefs = { follow?: boolean, comment?: boolean, reaction?: boolean, muted?: string[] }

async function myId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

export async function getNotifPrefs(): Promise<NotifPrefs> {
  const id = await myId()
  if (!id) return {}
  const { data } = await supabase.from('profiles').select('notif_prefs').eq('id', id).maybeSingle()
  return ((data?.notif_prefs as NotifPrefs | null) || {})
}

// Fusionne les nouvelles valeurs avec les anciennes (sans rien effacer d'autre)
export async function updateNotifPrefs(patch: Partial<NotifPrefs>): Promise<boolean> {
  const id = await myId()
  if (!id) return false
  const current = await getNotifPrefs()
  const { error } = await supabase.from('profiles').update({ notif_prefs: { ...current, ...patch } }).eq('id', id)
  return !error
}

// Met en sourdine / réactive une conversation. Renvoie le nouvel état (true = en sourdine), ou null en cas d'échec.
export async function toggleMuted(userId: string): Promise<boolean | null> {
  const current = await getNotifPrefs()
  const muted = new Set(current.muted || [])
  const nowMuted = !muted.has(userId)
  if (nowMuted) muted.add(userId); else muted.delete(userId)
  const ok = await updateNotifPrefs({ muted: Array.from(muted) })
  return ok ? nowMuted : null
}
