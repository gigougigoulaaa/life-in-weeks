-- =====================================================================
-- Life in Weeks — visibilité d'une semaine : tout le monde / abonnés / amis / moi seul
-- =====================================================================
-- QUOI FAIRE (une seule fois, AVANT de mettre en ligne la nouvelle version de l'application) :
--   1. Ouvre https://supabase.com, puis ton projet.
--   2. Menu de gauche : « SQL Editor » > bouton « New query ».
--   3. Copie TOUT ce fichier, colle-le, puis clique sur « Run ».
--   4. Le message « Success. No rows returned » signifie que tout est bon.
--
-- Valeurs possibles de la colonne weeks.visibility :
--   'private'   → moi seul
--   'friends'   → mes amis : les personnes que je suis ET qui me suivent en retour
--   'followers' → mes abonnés : les personnes qui me suivent
--   'public'    → tout le monde (toute personne connectée)
-- Tu peux relancer ce script sans risque.
-- =====================================================================


-- 1) Les semaines qui étaient « partagées » (ancien réglage « Abonnés ») deviennent « abonnés »,
--    pour que personne ne voie plus de monde qu'avant. Ne s'applique qu'une fois :
--    quand la règle ci-dessous existe déjà, les anciennes valeurs 'public' sont de vrais « tout le monde ».
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'weeks'
                 and policyname = 'visibilite: semaines partagees lisibles') then
    update public.weeks set visibility = 'followers' where visibility = 'public';
  end if;
end $$;

-- 2) Valeurs autorisées
alter table public.weeks drop constraint if exists weeks_visibility_check;
alter table public.weeks add constraint weeks_visibility_check
  check (visibility in ('private', 'friends', 'followers', 'public'));

-- 3) Qui peut LIRE une semaine qui n'est pas la sienne
drop policy if exists "social: semaines publiques lisibles" on public.weeks;
drop policy if exists "visibilite: semaines partagees lisibles" on public.weeks;
create policy "visibilite: semaines partagees lisibles"
  on public.weeks for select
  to authenticated
  using (
    -- Tout le monde : toute personne connectée, sauf si l'auteur a un profil privé
    -- (dans ce cas, seulement ses abonnés acceptés)
    (
      visibility = 'public'
      and (
        not exists (select 1 from public.profiles p where p.id = weeks.user_id and p.is_private = true)
        or exists (
          select 1 from public.follows f
          where f.follower_id = auth.uid() and f.following_id = weeks.user_id and f.status = 'accepted'
        )
      )
    )
    -- Abonnés : je suis abonné(e) à l'auteur
    or (
      visibility in ('followers', 'friends')
      and exists (
        select 1 from public.follows f
        where f.follower_id = auth.uid() and f.following_id = weeks.user_id and f.status = 'accepted'
      )
      -- Amis : l'auteur me suit aussi en retour
      and (
        visibility = 'followers'
        or exists (
          select 1 from public.follows f2
          where f2.follower_id = weeks.user_id and f2.following_id = auth.uid() and f2.status = 'accepted'
        )
      )
    )
  );

-- 4) J'aime et commentaires : possibles sur toute semaine que je peux voir
--    (la règle ci-dessus filtre déjà qui voit quoi : on exclut seulement les semaines « moi seul »)
drop policy if exists "social: lire les reactions" on public.reactions;
create policy "social: lire les reactions"
  on public.reactions for select to authenticated
  using (exists (select 1 from public.weeks w where w.id = reactions.week_id and (w.user_id = auth.uid() or w.visibility <> 'private')));

drop policy if exists "social: ajouter ma reaction" on public.reactions;
create policy "social: ajouter ma reaction"
  on public.reactions for insert to authenticated
  with check (auth.uid() = user_id
    and exists (select 1 from public.weeks w where w.id = reactions.week_id and (w.user_id = auth.uid() or w.visibility <> 'private')));

drop policy if exists "social: lire les commentaires" on public.comments;
create policy "social: lire les commentaires"
  on public.comments for select to authenticated
  using (exists (select 1 from public.weeks w where w.id = comments.week_id and (w.user_id = auth.uid() or w.visibility <> 'private')));

drop policy if exists "social: ecrire un commentaire" on public.comments;
create policy "social: ecrire un commentaire"
  on public.comments for insert to authenticated
  with check (auth.uid() = user_id
    and exists (select 1 from public.weeks w where w.id = comments.week_id and (w.user_id = auth.uid() or w.visibility <> 'private')));

-- 5) Index pour le fil
drop index if exists public.weeks_public_feed_idx;
create index if not exists weeks_shared_feed_idx
  on public.weeks (user_id, year desc, week_number desc) where visibility <> 'private';
