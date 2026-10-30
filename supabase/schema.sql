-- aPrueba v0.2: database for accounts, Pruebas, answers and ratings (Supabase / Postgres).
-- Source: Aprueba – Data Structure, section 10 (draft of 29 Oct 2026) and decisions of 30 Oct 2026:
--   testers sign up themselves (adult confirms on sign-up); nicknames unique ignoring case and accents;
--   backstage = Supabase dashboard + Excel export, through the views in schema "backstage".
-- Questions are NOT stored here: they live in questions.json and are referred to by ID (e.g. CIE5-T05-S01-010).
-- Run once in the Supabase SQL Editor. Safe to re-run: it only creates what is missing.

create extension if not exists unaccent with schema extensions;

-- ---------- students: one row per account ----------
create table if not exists public.students (
  id               uuid primary key references auth.users (id) on delete cascade,
  nickname         text check (nickname is null or char_length(btrim(nickname)) between 2 and 20),
  nickname_key     text,              -- lower case, no accents: used for uniqueness
  leaderboard      boolean not null default false,   -- opted in to the leaderboard
  adult_confirmed  boolean not null default false,   -- the adult ticked the box on sign-up
  created_at       timestamptz not null default now()
);
create unique index if not exists students_nickname_key on public.students (nickname_key);

create or replace function public.set_nickname_key() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.nickname := nullif(btrim(new.nickname), '');
  new.nickname_key := case when new.nickname is null then null
                           else lower(extensions.unaccent(new.nickname)) end;
  return new;
end $$;
drop trigger if exists students_nickname_key on public.students;
create trigger students_nickname_key before insert or update of nickname on public.students
  for each row execute function public.set_nickname_key();

-- A student row is created automatically when an account signs up.
create or replace function public.on_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.students (id, adult_confirmed)
  values (new.id, coalesce((new.raw_user_meta_data ->> 'adult_confirmed')::boolean, false))
  on conflict (id) do nothing;
  return new;
end $$;
-- Trigger functions run on their own; nobody needs to call them through the API.
revoke execute on function public.on_new_user() from public, anon, authenticated;
revoke execute on function public.set_nickname_key() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.on_new_user();

-- ---------- pruebas: one row per finished Prueba (an abandoned Prueba is not saved) ----------
create table if not exists public.pruebas (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null default auth.uid() references public.students (id) on delete cascade,
  tipo          text not null check (tipo in ('grado', 'materia', 'tema')),
  materia       text check (materia in ('CIE', 'LEN', 'MAT', 'SOC')),   -- empty for a whole-grade Prueba
  tema          text check (tema ~ '^T[0-9]{2}$'),                     -- empty unless a Tema Prueba
  started_at    timestamptz not null,
  finished_at   timestamptz not null,
  duracion_seg  integer not null check (duracion_seg >= 0),
  n_preguntas   smallint not null check (n_preguntas between 1 and 30),
  n_correctas   smallint not null check (n_correctas between 0 and n_preguntas),
  puntos        integer not null check (puntos >= 0),                  -- as awarded at the time
  created_at    timestamptz not null default now()
);
create index if not exists pruebas_student on public.pruebas (student_id, finished_at);

-- ---------- answers: one row per question answered ----------
create table if not exists public.answers (
  id           bigint generated always as identity primary key,
  prueba_id    uuid not null references public.pruebas (id) on delete cascade,
  student_id   uuid not null default auth.uid() references public.students (id) on delete cascade,
  question_id  text not null check (question_id ~ '^[A-Z]{3}[0-9]-T[0-9]{2}-S[0-9]{2}-[0-9]{3}$'),
  posicion     smallint not null check (posicion between 1 and 30),
  opcion       text not null check (opcion in ('K', 'D1', 'D2', 'D3')),  -- K = the correct answer
  correcta     boolean not null,
  tiempo_ms    integer not null check (tiempo_ms >= 0),
  answered_at  timestamptz not null,
  check (correcta = (opcion = 'K'))
);
create index if not exists answers_student on public.answers (student_id);
create index if not exists answers_question on public.answers (question_id);
create index if not exists answers_prueba on public.answers (prueba_id);

-- ---------- ratings: one thumb per student and question; removing a rating deletes the row ----------
create table if not exists public.ratings (
  student_id   uuid not null default auth.uid() references public.students (id) on delete cascade,
  question_id  text not null check (question_id ~ '^[A-Z]{3}[0-9]-T[0-9]{2}-S[0-9]{2}-[0-9]{3}$'),
  valor        smallint not null check (valor in (-1, 1)),
  updated_at   timestamptz not null default now(),
  primary key (student_id, question_id)
);

-- ---------- Saving a Prueba: the Prueba and its answers in one step (all or nothing) ----------
-- p = {tipo, materia, tema, started_at, finished_at, duracion_seg, n_preguntas, n_correctas, puntos,
--      answers: [{question_id, posicion, opcion, correcta, tiempo_ms, answered_at}, ...]}
create or replace function public.save_prueba(p jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare pid uuid;
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if jsonb_array_length(p -> 'answers') <> (p ->> 'n_preguntas')::int then
    raise exception 'answers do not match n_preguntas';
  end if;
  insert into public.pruebas (student_id, tipo, materia, tema, started_at, finished_at,
                              duracion_seg, n_preguntas, n_correctas, puntos)
  values (auth.uid(), p ->> 'tipo', p ->> 'materia', p ->> 'tema',
          (p ->> 'started_at')::timestamptz, (p ->> 'finished_at')::timestamptz,
          (p ->> 'duracion_seg')::int, (p ->> 'n_preguntas')::int,
          (p ->> 'n_correctas')::int, (p ->> 'puntos')::int)
  returning id into pid;
  insert into public.answers (prueba_id, student_id, question_id, posicion, opcion, correcta, tiempo_ms, answered_at)
  select pid, auth.uid(), a ->> 'question_id', (a ->> 'posicion')::int, a ->> 'opcion',
         (a ->> 'correcta')::boolean, (a ->> 'tiempo_ms')::int, (a ->> 'answered_at')::timestamptz
  from jsonb_array_elements(p -> 'answers') a;
  return pid;
end $$;
revoke all on function public.save_prueba(jsonb) from public, anon;
grant execute on function public.save_prueba(jsonb) to authenticated;

-- ---------- Access rules: each student sees and writes only their own rows ----------
alter table public.students enable row level security;
alter table public.pruebas  enable row level security;
alter table public.answers  enable row level security;
alter table public.ratings  enable row level security;

drop policy if exists "own row: read"   on public.students;
drop policy if exists "own row: update" on public.students;
create policy "own row: read"   on public.students for select to authenticated using (id = (select auth.uid()));
create policy "own row: update" on public.students for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- adult_confirmed is set only at sign-up; the app cannot change it.
revoke update on public.students from anon, authenticated;
grant update (nickname, leaderboard) on public.students to authenticated;

drop policy if exists "own pruebas: read" on public.pruebas;
drop policy if exists "own pruebas: add"  on public.pruebas;
create policy "own pruebas: read" on public.pruebas for select to authenticated using (student_id = (select auth.uid()));
create policy "own pruebas: add"  on public.pruebas for insert to authenticated with check (student_id = (select auth.uid()));

drop policy if exists "own answers: read" on public.answers;
drop policy if exists "own answers: add"  on public.answers;
create policy "own answers: read" on public.answers for select to authenticated using (student_id = (select auth.uid()));
create policy "own answers: add"  on public.answers for insert to authenticated
  with check (student_id = (select auth.uid())
              and exists (select 1 from public.pruebas p where p.id = prueba_id and p.student_id = (select auth.uid())));

drop policy if exists "own ratings" on public.ratings;
create policy "own ratings" on public.ratings for all to authenticated
  using (student_id = (select auth.uid())) with check (student_id = (select auth.uid()));

-- Saved Pruebas and answers are a record of what happened: no edits or deletes from the app.
revoke update, delete on public.pruebas, public.answers from anon, authenticated;
revoke all on public.students, public.pruebas, public.answers, public.ratings from anon;

-- ---------- Backstage views (author only) ----------
-- Schema "backstage" is not exposed to the app: only the Supabase dashboard can read it.
-- Days are counted in Venezuela time.
create schema if not exists backstage;
revoke all on schema backstage from public, anon, authenticated;

create or replace view backstage.por_tester as
select s.nickname,
       u.email,
       s.adult_confirmed,
       s.leaderboard,
       s.created_at::date                                              as alta,
       count(distinct p.id)                                            as pruebas,
       count(distinct (p.finished_at at time zone 'America/Caracas')::date) as dias_jugados,
       min((p.finished_at at time zone 'America/Caracas')::date)       as primer_dia,
       max((p.finished_at at time zone 'America/Caracas')::date)       as ultimo_dia,
       round(avg(a.correcta::int) filter (where a.question_id like 'CIE%') * 100) as pct_ciencias,
       round(avg(a.correcta::int) filter (where a.question_id like 'LEN%') * 100) as pct_lengua,
       round(avg(a.correcta::int) filter (where a.question_id like 'MAT%') * 100) as pct_matematicas,
       round(avg(a.correcta::int) filter (where a.question_id like 'SOC%') * 100) as pct_sociales
from public.students s
join auth.users u on u.id = s.id
left join public.pruebas p on p.student_id = s.id
left join public.answers a on a.prueba_id = p.id
group by s.id, u.email;

create or replace view backstage.por_pregunta as
with r as (
  select question_id,
         count(*) filter (where valor = 1)  as votos_arriba,
         count(*) filter (where valor = -1) as votos_abajo
  from public.ratings group by question_id),
a as (
  select question_id,
         count(*)                                  as veces,
         round(avg(correcta::int) * 100)           as pct_correcta,
         count(*) filter (where opcion = 'K')      as opcion_k,
         count(*) filter (where opcion = 'D1')     as opcion_d1,
         count(*) filter (where opcion = 'D2')     as opcion_d2,
         count(*) filter (where opcion = 'D3')     as opcion_d3,
         round(avg(tiempo_ms) / 1000.0, 1)         as tiempo_medio_seg
  from public.answers group by question_id)
select coalesce(a.question_id, r.question_id) as question_id,
       coalesce(a.veces, 0) as veces, a.pct_correcta,
       coalesce(a.opcion_k, 0) as opcion_k, coalesce(a.opcion_d1, 0) as opcion_d1,
       coalesce(a.opcion_d2, 0) as opcion_d2, coalesce(a.opcion_d3, 0) as opcion_d3,
       a.tiempo_medio_seg,
       coalesce(r.votos_arriba, 0) as votos_arriba, coalesce(r.votos_abajo, 0) as votos_abajo
from a full join r on r.question_id = a.question_id;

create or replace view backstage.resumen as
select count(*)                                   as testers,
       count(*) filter (where pruebas > 0)        as testers_con_pruebas,
       coalesce(sum(pruebas), 0)                  as pruebas,
       round(avg(pruebas) filter (where pruebas > 0), 1)      as pruebas_por_tester,
       round(avg(dias_jugados) filter (where pruebas > 0), 1) as dias_por_tester
from backstage.por_tester;
