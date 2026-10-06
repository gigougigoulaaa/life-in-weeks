-- =====================================================================
-- Life in Weeks — paramètres, blocage, signalement, suppression différée
-- =====================================================================
-- QUOI FAIRE (une seule fois, APRÈS social.sql) :
--   1. Ouvre https://supabase.com, puis ton projet.
--   2. Menu de gauche : « SQL Editor » > bouton « New query ».
--   3. Copie TOUT ce fichier, colle-le, puis clique sur « Run ».
--   4. En bas, un tableau s'affiche : la colonne « rowsecurity » doit valoir
--      « true » pour profiles, weeks, messages, follows, comments, reactions,
--      notifications. Sinon, préviens-moi (c'est une faille de sécurité).
--
-- Tu peux relancer ce script sans risque : il ne crée que ce qui manque.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) Nouvelles colonnes
-- ---------------------------------------------------------------------
-- Suppression différée : date à laquelle la personne a demandé la suppression.
-- Tant que la valeur est vide, le compte est normal. Après 30 jours, il est effacé pour de bon.
alter table public.profiles add column if not exists deleted_at timestamptz;
-- Préférences de notifications : {"follow": false, "comment": true, "reaction": true, "muted": ["<id>"]}
alter table public.profiles add column if not exists notif_prefs jsonb not null default '{}'::jsonb;
-- Qui peut m'écrire : 'everyone' (tout le monde) ou 'following' (seulement les personnes que je suis)
alter table public.profiles add column if not exists who_can_message text not null default 'everyone';
alter table public.profiles drop constraint if exists profiles_who_can_message_check;
alter table public.profiles add constraint profiles_who_can_message_check check (who_can_message in ('everyone', 'following'));

-- Messages : photo jointe (adresse publique) ; le texte peut être vide si une photo est jointe
alter table public.messages add column if not exists media_url text;
alter table public.messages alter column content drop not null;

-- Commentaires : réponse à un autre commentaire, et date de modification
alter table public.comments add column if not exists parent_id uuid references public.comments(id) on delete cascade;
alter table public.comments add column if not exists edited_at timestamptz;
create index if not exists comments_parent_idx on public.comments (parent_id);


-- ---------------------------------------------------------------------
-- 2) Blocages et signalements
-- ---------------------------------------------------------------------
create table if not exists public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.blocks enable row level security;

drop policy if exists "blocks: voir mes blocages" on public.blocks;
create policy "blocks: voir mes blocages" on public.blocks for select to authenticated
  using (blocker_id = auth.uid());
drop policy if exists "blocks: retirer mon blocage" on public.blocks;
create policy "blocks: retirer mon blocage" on public.blocks for delete to authenticated
  using (blocker_id = auth.uid());
-- (Ajouter un blocage passe par la fonction block_user ci-dessous.)

create table if not exists public.reports (
  id             uuid primary key default gen_random_uuid(),
  reporter_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  target_type    text not null check (target_type in ('profile', 'week', 'comment', 'message')),
  target_id      text not null,
  target_user_id uuid,
  reason         text not null,
  details        text,
  created_at     timestamptz not null default now()
);
alter table public.reports enable row level security;
drop policy if exists "reports: envoyer un signalement" on public.reports;
create policy "reports: envoyer un signalement" on public.reports for insert to authenticated
  with check (reporter_id = auth.uid());
-- Personne ne peut relire les signalements depuis l'app : tu les consultes dans Supabase > Table Editor > reports.


-- ---------------------------------------------------------------------
-- 3) Petites fonctions de sécurité (elles lisent les tables sans être gênées par les règles)
-- ---------------------------------------------------------------------
create or replace function public.is_account_deleted(uid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = uid and deleted_at is not null)
$$;

create or replace function public.is_blocked_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select a is not null and b is not null and exists (
    select 1 from public.blocks
    where (blocker_id = a and blocked_id = b) or (blocker_id = b and blocked_id = a)
  )
$$;

create or replace function public.week_owner(week uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select user_id from public.weeks where id = week
$$;

-- La personne « receiver » accepte-t-elle les messages de « sender » ?
create or replace function public.can_message(sender uuid, receiver uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles p
    where p.id = receiver
      and (
        p.who_can_message = 'everyone'
        or exists (
          select 1 from public.follows f
          where f.follower_id = receiver and f.following_id = sender and f.status = 'accepted'
        )
      )
  ) or not exists (select 1 from public.profiles where id = receiver)
$$;

-- Bloquer : enregistre le blocage ET supprime les abonnements dans les deux sens
create or replace function public.block_user(target uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or target is null or target = auth.uid() then return; end if;
  insert into public.blocks (blocker_id, blocked_id) values (auth.uid(), target) on conflict do nothing;
  delete from public.follows
    where (follower_id = auth.uid() and following_id = target)
       or (follower_id = target and following_id = auth.uid());
end $$;

create or replace function public.unblock_user(target uuid) returns void
language sql security definer set search_path = public as $$
  delete from public.blocks where blocker_id = auth.uid() and blocked_id = target
$$;

-- Liste des personnes que j'ai bloquées (avec leur nom, que les règles de lecture cacheraient sinon)
create or replace function public.get_blocked_profiles()
returns table (id uuid, username text, full_name text, avatar_url text, blocked_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.username, p.full_name, p.avatar_url, b.created_at
  from public.blocks b
  left join public.profiles p on p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc
$$;

grant execute on function public.block_user(uuid), public.unblock_user(uuid), public.get_blocked_profiles() to authenticated;
grant execute on function public.is_account_deleted(uuid), public.is_blocked_between(uuid, uuid),
  public.week_owner(uuid), public.can_message(uuid, uuid) to authenticated, anon;


-- ---------------------------------------------------------------------
-- 4) Règles « restrictives » : elles s'ajoutent aux règles existantes (les deux doivent être vraies)
--    - un compte en cours de suppression disparaît pour les autres ;
--    - une personne bloquée ne voit plus (et ne peut plus contacter) celle qui l'a bloquée, et inversement.
-- ---------------------------------------------------------------------
drop policy if exists "paramètres: profils cachés" on public.profiles;
create policy "paramètres: profils cachés" on public.profiles as restrictive for select
  using (id = auth.uid() or (deleted_at is null and not public.is_blocked_between(auth.uid(), id)));

drop policy if exists "paramètres: semaines cachées" on public.weeks;
create policy "paramètres: semaines cachées" on public.weeks as restrictive for select
  using (user_id = auth.uid() or (not public.is_account_deleted(user_id) and not public.is_blocked_between(auth.uid(), user_id)));

drop policy if exists "paramètres: abonnements cachés" on public.follows;
create policy "paramètres: abonnements cachés" on public.follows as restrictive for select
  using (
    (follower_id = auth.uid() or not public.is_account_deleted(follower_id))
    and (following_id = auth.uid() or not public.is_account_deleted(following_id))
  );

drop policy if exists "paramètres: abonnement impossible" on public.follows;
create policy "paramètres: abonnement impossible" on public.follows as restrictive for insert
  with check (not public.is_blocked_between(follower_id, following_id) and not public.is_account_deleted(following_id));

drop policy if exists "paramètres: commentaires cachés" on public.comments;
create policy "paramètres: commentaires cachés" on public.comments as restrictive for select
  using (user_id = auth.uid() or (not public.is_account_deleted(user_id) and not public.is_blocked_between(auth.uid(), user_id)));

drop policy if exists "paramètres: commentaire impossible" on public.comments;
create policy "paramètres: commentaire impossible" on public.comments as restrictive for insert
  with check (not public.is_blocked_between(auth.uid(), public.week_owner(week_id)));

drop policy if exists "paramètres: reactions cachées" on public.reactions;
create policy "paramètres: reactions cachées" on public.reactions as restrictive for select
  using (user_id = auth.uid() or (not public.is_account_deleted(user_id) and not public.is_blocked_between(auth.uid(), user_id)));

drop policy if exists "paramètres: reaction impossible" on public.reactions;
create policy "paramètres: reaction impossible" on public.reactions as restrictive for insert
  with check (not public.is_blocked_between(auth.uid(), public.week_owner(week_id)));

drop policy if exists "paramètres: messages cachés" on public.messages;
create policy "paramètres: messages cachés" on public.messages as restrictive for select
  using (
    (sender_id = auth.uid() or not public.is_account_deleted(sender_id))
    and (receiver_id = auth.uid() or not public.is_account_deleted(receiver_id))
    and not public.is_blocked_between(sender_id, receiver_id)
  );

drop policy if exists "paramètres: message impossible" on public.messages;
create policy "paramètres: message impossible" on public.messages as restrictive for insert
  with check (
    not public.is_blocked_between(sender_id, receiver_id)
    and not public.is_account_deleted(receiver_id)
    and public.can_message(sender_id, receiver_id)
  );


-- ---------------------------------------------------------------------
-- 5) Modifier ou supprimer ses propres commentaires et messages
-- ---------------------------------------------------------------------
drop policy if exists "paramètres: modifier mon commentaire" on public.comments;
create policy "paramètres: modifier mon commentaire" on public.comments for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "paramètres: supprimer mon message" on public.messages;
create policy "paramètres: supprimer mon message" on public.messages for delete to authenticated
  using (sender_id = auth.uid());


-- ---------------------------------------------------------------------
-- 6) Préférences de notifications : une notification éteinte par la personne n'est jamais créée
-- ---------------------------------------------------------------------
create or replace function public.respect_notif_prefs() returns trigger
language plpgsql security definer set search_path = public as $$
declare prefs jsonb;
begin
  select notif_prefs into prefs from public.profiles where id = new.user_id;
  if prefs is not null and (prefs ->> new.type) = 'false' then return null; end if;
  return new;
end $$;

drop trigger if exists respect_notif_prefs on public.notifications;
create trigger respect_notif_prefs before insert on public.notifications
  for each row execute function public.respect_notif_prefs();


-- ---------------------------------------------------------------------
-- 7) Vérification : toutes les valeurs « rowsecurity » doivent être « true »
-- ---------------------------------------------------------------------
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
  and tablename in ('profiles', 'weeks', 'messages', 'follows', 'comments', 'reactions', 'notifications', 'blocks', 'reports')
order by tablename;
