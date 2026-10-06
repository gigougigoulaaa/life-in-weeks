// Nettoyage automatique : efface pour de bon les comptes supprimés depuis plus de 30 jours.
//
// Vercel appelle cette adresse tout seul chaque nuit (réglage dans vercel.json).
// Ce code tourne UNIQUEMENT sur le serveur.
//
// À FAIRE UNE FOIS (propriétaire de l'app) :
//   1. Inventer une longue chaîne aléatoire (ex. 40 lettres et chiffres au hasard) : c'est CRON_SECRET.
//   2. Vercel → ton projet → Settings → Environment Variables → ajouter
//        Nom : CRON_SECRET   Valeur : la chaîne inventée
//      Vercel l'envoie alors automatiquement avec chaque appel (« Authorization: Bearer ... »).
//      Sans elle, n'importe qui pourrait déclencher la route : on répond donc 401 à tous les autres.
//   3. Avoir aussi SUPABASE_SERVICE_ROLE_KEY (voir app/api/delete-account/route.ts), puis redéployer.
import { createClient } from '@supabase/supabase-js'
import { purgeUser } from '@/lib/server/purgeUser'
import { DELETION_GRACE_DAYS } from '@/lib/appInfo'

export const dynamic = 'force-dynamic'

// Maximum de comptes traités par passage (pour rester sous la limite de durée de Vercel)
const BATCH = 25

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET
  const header = request.headers.get('authorization') || ''
  if (!secret || header !== `Bearer ${secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401 })
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceKey || !url) {
    return Response.json({ error: 'not_configured' }, { status: 501 })
  }

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Comptes dont la demande de suppression date de plus de 30 jours
  const limit = new Date(Date.now() - DELETION_GRACE_DAYS * 86400000).toISOString()
  const { data, error } = await admin.from('profiles').select('id')
    .not('deleted_at', 'is', null).lt('deleted_at', limit).limit(BATCH)
  if (error) return Response.json({ error: 'query_failed' }, { status: 500 })

  // Un par un : plus simple et plus doux pour la base
  let purged = 0
  for (const row of data || []) {
    if (await purgeUser(admin, row.id as string)) purged++
  }
  return Response.json({ purged })
}
