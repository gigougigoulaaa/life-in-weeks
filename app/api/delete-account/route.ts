// Suppression définitive IMMÉDIATE du compte de la personne connectée (RGPD : droit à l'effacement).
// Utilisée par le bouton « Supprimer définitivement maintenant » de la page /recover.
// (La suppression « normale » est différée de 30 jours : voir lib/account.ts et /api/cron/purge.)
//
// Ce code tourne UNIQUEMENT sur le serveur (Vercel), jamais dans le navigateur.
// Il a besoin de la clé secrète « service_role » de Supabase, seule capable de supprimer un utilisateur.
// Le travail d'effacement lui-même est dans lib/server/purgeUser.ts.
//
// À FAIRE UNE FOIS (propriétaire de l'app) :
//   1. Supabase → Project Settings → API → copier la clé « service_role » (secrète !).
//   2. Vercel → ton projet → Settings → Environment Variables → ajouter
//        Nom : SUPABASE_SERVICE_ROLE_KEY   Valeur : la clé copiée
//      (ne JAMAIS la préfixer par NEXT_PUBLIC_, sinon elle serait visible par tout le monde).
//   3. Redéployer. Tant que la clé n'est pas là, la route répond 501 « not_configured ».
import { createClient } from '@supabase/supabase-js'
import { purgeUser } from '@/lib/server/purgeUser'

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

  const ok = await purgeUser(admin, uid)
  if (!ok) return Response.json({ error: 'delete_failed' }, { status: 500 })

  return Response.json({ ok: true })
}
