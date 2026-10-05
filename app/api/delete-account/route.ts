// Suppression définitive d'un compte (RGPD : droit à l'effacement).
//
// Ce code tourne UNIQUEMENT sur le serveur (Vercel), jamais dans le navigateur.
// Il a besoin de la clé secrète « service_role » de Supabase, seule capable de supprimer un utilisateur.
//
// À FAIRE UNE FOIS (propriétaire de l'app) :
//   1. Supabase → Project Settings → API → copier la clé « service_role » (secrète !).
//   2. Vercel → ton projet → Settings → Environment Variables → ajouter
//        Nom : SUPABASE_SERVICE_ROLE_KEY   Valeur : la clé copiée
//      (ne JAMAIS la préfixer par NEXT_PUBLIC_, sinon elle serait visible par tout le monde).
//   3. Redéployer. Tant que la clé n'est pas là, la route répond 501 « not_configured ».
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export async function POST(request: Request) {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !url) {
    return Response.json({ error: 'not_configured' }, { status: 501 })
  }

  // Le navigateur envoie le jeton de session : « Authorization: Bearer <jeton> »
  const header = request.headers.get('authorization') || ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!token) return Response.json({ error: 'unauthorized' }, { status: 401 })

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // On vérifie à qui appartient le jeton : on ne peut supprimer QUE son propre compte
  const { data: userData, error: userError } = await admin.auth.getUser(token)
  const uid = userData?.user?.id
  if (userError || !uid) return Response.json({ error: 'unauthorized' }, { status: 401 })

  // 1. Fichiers : photos/vidéos des semaines, photo de profil, fond du calendrier
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
  //    (ex. reactions, comments), l'erreur est ignorée et on continue.
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
  await run(admin.from('weeks').delete().eq('user_id', uid))
  await run(admin.from('profiles').delete().eq('id', uid))

  // 3. Le compte lui-même (email + mot de passe)
  const { error: deleteError } = await admin.auth.admin.deleteUser(uid)
  if (deleteError) return Response.json({ error: 'delete_failed' }, { status: 500 })

  return Response.json({ ok: true })
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
