-- =====================================================================
-- Life in Weeks — couche sociale (J'aime, commentaires, fil)
-- =====================================================================
-- QUOI FAIRE (une seule fois) :
--   1. Ouvre https://supabase.com, puis ton projet.
--   2. Menu de gauche : « SQL Editor » > bouton « New query ».
--   3. Copie TOUT ce fichier, colle-le, puis clique sur « Run ».
--   4. Le message « Success. No rows returned » signifie que tout est bon.
--
-- Tu peux relancer ce script sans risque : il ne crée que ce qui manque
-- et remplace ses propres règles de sécurité sans toucher à tes données.
-- Il ne modifie PAS les règles déjà existantes sur tes semaines.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Table des « J'aime » : une ligne = une personne aime une semaine.
--    La clé (week_id, user_id) empêche d'aimer deux fois la même semaine.
--    Si la semaine ou le compte est supprimé, les J'aime partent avec.
-- ---------------------------------------------------------------------
create table if not exists public.reactions (
  week_id    uuid not null references public.weeks(id) on delete cascade,
  user_id    uuid not null references auth.users(id)   on delete cascade,
  created_at timestamptz not null default now(),
  primary key (week_id, user_id)
);

-- ---------------------------------------------------------------------
-- 2) Table des commentaires (1 à 1000 caractères).
-- ---------------------------------------------------------------------
create table if not exists public.comments (
  id         uuid primary key default gen_random_uuid(),
  week_id    uuid not null references public.weeks(id) on delete cascade,
  user_id    uuid not null references auth.users(id)   on delete cascade,
  content    text not null check (char_length(content) between 1 and 1000),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3) Index : rendent rapides les recherches les plus fréquentes
--    (compter les J'aime / commentaires d'une semaine, le fil, les abonnés).
-- ---------------------------------------------------------------------
create index if not exists reactions_user_idx       on public.reactions (user_id);
create index if not exists comments_week_idx        on public.comments (week_id, created_at);
create index if not exists comments_user_idx        on public.comments (user_id);
create index if not exists weeks_public_feed_idx    on public.weeks (user_id, year desc, week_number desc) where visibility = 'public';
create index if not exists follows_follower_idx     on public.follows (follower_id, status);
create index if not exists follows_following_idx    on public.follows (following_id, status);


-- ---------------------------------------------------------------------
-- 4) Semaines publiques lisibles par les autres.
--    Ajoute UNE règle de lecture (les règles existantes du propriétaire
--    restent en place). Une semaine « public » est visible par toute
--    personne connectée, SAUF si son auteur a un profil privé : dans ce
--    cas, seulement par ses abonnés acceptés.
-- ---------------------------------------------------------------------
-- (On n'active/désactive pas la sécurité de la table weeks : ce réglage
--  reste tel que tu l'as configuré.)
drop policy if exists "social: semaines publiques lisibles" on public.weeks;
create policy "social: semaines publiques lisibles"
  on public.weeks for select
  to authenticated
  using (
    visibility = 'public'
    and (
      not exists (
        select 1 from public.profiles p
        where p.id = weeks.user_id and p.is_private = true
      )
      or exists (
        select 1 from public.follows f
        where f.follower_id = auth.uid()
          and f.following_id = weeks.user_id
          and f.status = 'accepted'
      )
    )
  );


-- ---------------------------------------------------------------------
-- 5) Sécurité des J'aime.
--    - Lecture : si la semaine est à moi ou publique (et lisible pour moi).
--    - Ajout : uniquement en mon nom, et sur une semaine que je peux voir.
--    - Retrait : uniquement mes propres J'aime.
--    Remarque : « select from weeks » ci-dessous applique déjà les règles
--    de lecture des semaines, donc un profil privé reste protégé.
-- ---------------------------------------------------------------------
alter table public.reactions enable row level security;

drop policy if exists "social: lire les reactions" on public.reactions;
create policy "social: lire les reactions"
  on public.reactions for select
  to authenticated
  using (
    exists (
      select 1 from public.weeks w
      where w.id = reactions.week_id
        and (w.user_id = auth.uid() or w.visibility = 'public')
    )
  );

drop policy if exists "social: ajouter ma reaction" on public.reactions;
create policy "social: ajouter ma reaction"
  on public.reactions for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.weeks w
      where w.id = reactions.week_id
        and (w.user_id = auth.uid() or w.visibility = 'public')
    )
  );

drop policy if exists "social: retirer ma reaction" on public.reactions;
create policy "social: retirer ma reaction"
  on public.reactions for delete
  to authenticated
  using (auth.uid() = user_id);


-- ---------------------------------------------------------------------
-- 6) Sécurité des commentaires.
--    - Lecture : mêmes conditions que les J'aime.
--    - Ajout : uniquement en mon nom, sur une semaine que je peux voir.
--    - Suppression : mes propres commentaires, OU n'importe quel
--      commentaire posé sur MA semaine (je modère chez moi).
-- ---------------------------------------------------------------------
alter table public.comments enable row level security;

drop policy if exists "social: lire les commentaires" on public.comments;
create policy "social: lire les commentaires"
  on public.comments for select
  to authenticated
  using (
    exists (
      select 1 from public.weeks w
      where w.id = comments.week_id
        and (w.user_id = auth.uid() or w.visibility = 'public')
    )
  );

drop policy if exists "social: ecrire un commentaire" on public.comments;
create policy "social: ecrire un commentaire"
  on public.comments for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.weeks w
      where w.id = comments.week_id
        and (w.user_id = auth.uid() or w.visibility = 'public')
    )
  );

drop policy if exists "social: supprimer un commentaire" on public.comments;
create policy "social: supprimer un commentaire"
  on public.comments for delete
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.weeks w
      where w.id = comments.week_id and w.user_id = auth.uid()
    )
  );


-- ---------------------------------------------------------------------
-- 7) Notifications : permettre d'en envoyer une à quelqu'un d'autre
--    (« X aime ta semaine », « X a commenté », « X s'est abonné »).
--    Toute personne connectée peut CRÉER une notification ; seule la
--    personne destinataire peut les lire (règles déjà existantes).
-- ---------------------------------------------------------------------
drop policy if exists "social: envoyer une notification" on public.notifications;
create policy "social: envoyer une notification"
  on public.notifications for insert
  to authenticated
  with check (auth.uid() is not null);
