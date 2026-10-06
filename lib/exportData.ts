// Export de TOUTES les données de la personne connectée dans un fichier JSON (droit d'accès, RGPD).
// Chaque table est lue séparément : si une table ou une colonne n'existe pas encore, on l'ignore sans planter.
import { supabase } from './supabase'

async function readRows(table: string, column: string, userId: string): Promise<unknown[] | null> {
  try {
    const { data, error } = await supabase.from(table).select('*').eq(column, userId)
    return error ? null : (data || [])
  } catch {
    return null
  }
}

// Récupère les données sous forme d'objet (null si personne n'est connecté)
export async function collectMyData(): Promise<Record<string, unknown> | null> {
  const { data } = await supabase.auth.getUser()
  const user = data.user
  if (!user) return null

  const [profile, weeks, sent, received, following, followers, comments, reactions] = await Promise.all([
    readRows('profiles', 'id', user.id),
    readRows('weeks', 'user_id', user.id),
    readRows('messages', 'sender_id', user.id),
    readRows('messages', 'receiver_id', user.id),
    readRows('follows', 'follower_id', user.id),
    readRows('follows', 'following_id', user.id),
    readRows('comments', 'user_id', user.id),
    readRows('reactions', 'user_id', user.id),
  ])

  const result: Record<string, unknown> = {
    exported_at: new Date().toISOString(),
    account: { id: user.id, email: user.email, created_at: user.created_at },
  }
  // On n'ajoute que ce qui a pu être lu
  const parts: Record<string, unknown[] | null> = {
    profile, weeks, messages_sent: sent, messages_received: received,
    following, followers, comments, reactions,
  }
  for (const [key, rows] of Object.entries(parts)) if (rows) result[key] = rows
  return result
}

// Télécharge le fichier « life-in-weeks-export-AAAA-MM-JJ.json ». Renvoie false en cas d'échec.
export async function exportMyData(): Promise<boolean> {
  try {
    const all = await collectMyData()
    if (!all) return false
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const d = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const a = document.createElement('a')
    a.href = url
    a.download = `life-in-weeks-export-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
  } catch {
    return false
  }
}
