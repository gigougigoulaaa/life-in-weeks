// Effacement DÉFINITIF d'un utilisateur : fichiers, données, puis compte.
//
// Code serveur uniquement (ne jamais l'importer depuis une page ou un composant du navigateur).
// Utilisé par deux routes :
//   - /api/delete-account : « Supprimer définitivement maintenant »
//   - /api/cron/purge     : nettoyage automatique des comptes supprimés depuis plus de 30 jours
import type { SupabaseClient } from '@supabase/supabase-js'

// Renvoie true si le compte (email + mot de passe) a bien été supprimé
export async function purgeUser(admin: SupabaseClient, uid: string): Promise<boolean> {
  // 1. Fichiers : photos/vidéos des semaines et images jointes aux messages
  //    (tout est rangé sous weeks-media/<uid>/, y compris messages/), photo de profil, fond du calendrier
  try {
    const mediaPaths = await listAll(admin, 'weeks-media', uid)
    await removeInChunks(admin, 'weeks-media', mediaPaths)
  } catch {}
  try {
    const mine: string[] = []
    for (const prefix of [`avatar_${uid}`, `bg_${uid}`]) {
      const { data } = await admin.storage.from('avatars').list('', { search: prefix, limit: 100 })
      for (const f of data || []) if (f.name.startsWith(prefix)) mine.push(f.name)
    }
    await removeInChunks(admin, 'avatars', mine)
  } catch {}

  // 2. Données. Chaque suppression est indépendante : si une table n'existe pas encore
  //    (ex. reactions, comments, blocks, reports), l'erreur est ignorée et on continue.
  const run = async (q: PromiseLike<unknown>) => { try { await q } catch {} }

  // Réactions et commentaires laissés par d'autres sur MES semaines
  let weekIds: string[] = []
  try {
    const { data } = await admin.from('weeks').select('id').eq('user_id', uid)
    weekIds = (data || []).map((w: { id: string }) => w.id)
  } catch {}
  if (weekIds.length) {
    await run(admin.from('reactions').delete().in('week_id', weekIds))
    await run(admin.from('comments').delete().in('week_id', weekIds))
  }

  await run(admin.from('reactions').delete().eq('user_id', uid))
  await run(admin.from('comments').delete().eq('user_id', uid))
  await run(admin.from('notifications').delete().eq('user_id', uid))
  await run(admin.from('messages').delete().eq('sender_id', uid))
  await run(admin.from('messages').delete().eq('receiver_id', uid))
  await run(admin.from('follows').delete().eq('follower_id', uid))
  await run(admin.from('follows').delete().eq('following_id', uid))
  await run(admin.from('blocks').delete().eq('blocker_id', uid))
  await run(admin.from('blocks').delete().eq('blocked_id', uid))
  await run(admin.from('reports').delete().eq('reporter_id', uid))
  await run(admin.from('weeks').delete().eq('user_id', uid))
  await run(admin.from('profiles').delete().eq('id', uid))

  // 3. Le compte lui-même (email + mot de passe)
  try {
    const { error } = await admin.auth.admin.deleteUser(uid)
    return !error
  } catch {
    return false
  }
}

// Liste tous les fichiers d'un dossier (et de ses sous-dossiers), page par page
async function listAll(admin: SupabaseClient, bucket: string, folder: string): Promise<string[]> {
  const out: string[] = []
  const pageSize = 1000
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: pageSize, offset })
    if (error || !data || data.length === 0) break
    for (const item of data) {
      const path = `${folder}/${item.name}`
      // Un élément sans id est un sous-dossier
      if (item.id === null) out.push(...await listAll(admin, bucket, path))
      else out.push(path)
    }
    if (data.length < pageSize) break
  }
  return out
}

async function removeInChunks(admin: SupabaseClient, bucket: string, paths: string[]) {
  for (let i = 0; i < paths.length; i += 500) {
    await admin.storage.from(bucket).remove(paths.slice(i, i + 500))
  }
}
