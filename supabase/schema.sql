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
-- p = {id, tipo, materia, tema, started_at, finished_at, duracion_seg, n_preguntas, n_correctas, puntos,
--      answers: [{question_id, posicion, opcion, correcta, tiempo_ms, answered_at}, ...]}
-- The app gives each Prueba its id, so a retry after a dropped connection is ignored (no duplicates).
create or replace function public.save_prueba(p jsonb) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare pid uuid; wanted uuid := coalesce((p ->> 'id')::uuid, gen_random_uuid());
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if jsonb_array_length(p -> 'answers') <> (p ->> 'n_preguntas')::int then
    raise exception 'answers do not match n_preguntas';
  end if;
  insert into public.pruebas (id, student_id, tipo, materia, tema, started_at, finished_at,
                              duracion_seg, n_preguntas, n_correctas, puntos)
  values (wanted, auth.uid(), p ->> 'tipo', p ->> 'materia', p ->> 'tema',
          (p ->> 'started_at')::timestamptz, (p ->> 'finished_at')::timestamptz,
          (p ->> 'duracion_seg')::int, (p ->> 'n_preguntas')::int,
          (p ->> 'n_correctas')::int, (p ->> 'puntos')::int)
  on conflict (id) do nothing
  returning id into pid;
  if pid is null then return wanted; end if;   -- already saved
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
       round(avg(a.correcta::int) filter (where a.question_id like 'SOC%') * 100) as pct_sociales,
       -- added 3 November 2026 (at the end, so the view can be replaced in place)
       (u.last_sign_in_at at time zone 'America/Caracas')::timestamp(0) as ultimo_login,
       (max(p.finished_at) at time zone 'America/Caracas')::timestamp(0) as ultima_prueba,
       (now() at time zone 'America/Caracas')::date
         - max((p.finished_at at time zone 'America/Caracas')::date)   as dias_sin_jugar,
       count(distinct p.id) filter (where p.finished_at > now() - interval '7 days') as pruebas_7_dias,
       round(avg(a.correcta::int) * 100)                               as pct_total,
       (select count(*) from public.ratings r where r.student_id = s.id) as pulgares_dados
from public.students s
join auth.users u on u.id = s.id
left join public.pruebas p on p.student_id = s.id
left join public.answers a on a.prueba_id = p.id
group by s.id, u.email, u.last_sign_in_at;

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

-- One row per question with at least one thumb, thumbs down first (added 3 November 2026).
-- Stems are not in the database; look them up in the master workbook by question_id.
create or replace view backstage.votos as
select question_id,
       left(question_id, 3)                     as materia,
       split_part(question_id, '-', 2)          as tema,
       split_part(question_id, '-', 3)          as subtema,
       count(*) filter (where valor = 1)        as votos_arriba,
       count(*) filter (where valor = -1)       as votos_abajo,
       (max(updated_at) at time zone 'America/Caracas')::date as ultimo_voto
from public.ratings
group by question_id
order by votos_abajo desc, votos_arriba desc, question_id;
-- ---------- Tabla de posiciones (leaderboard, v0.2 step 5, defined 4 November 2026) ----------
-- Score = points: every correct answer, repeats included. Only students who opted in appear.
-- Returns ONLY rank, nickname, points and whether the row is the caller's; never the email or anything else,
-- and nothing about students who did not opt in.
--   periodo: 'semana' (this week), 'mes' (this month) or 'siempre' (all time)
--   materia: null for the whole grade, or 'CIE', 'LEN', 'MAT', 'SOC'. Per-Materia points are counted from the
--            answers (correct answers of that Materia × points per correct answer), because a whole-grade
--            Prueba mixes Materias; whole-grade points use the points saved on each Prueba.
--   top_n, inicio_semana, zona, pts_correcta: from the app's settings (tablaTop, inicioSemana, zonaHoraria,
--            puntosPorCorrecta). Weeks and months are worked out in that time zone.
-- Rows: the top_n students with points in the period (ties share a rank: 1, 1, 3), plus the caller's own row
-- if the caller opted in and is not among them (rank null when the caller has no points in the period).
create or replace function public.tabla_posiciones(
  p_periodo text, p_materia text default null, p_top_n int default 8,
  p_inicio_semana text default 'lunes', p_zona text default 'America/Caracas', p_pts_correcta int default 10)
returns table (rango int, apodo text, puntos int, soy_yo boolean)
language plpgsql stable security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  loc timestamp;
  desde timestamptz;
begin
  if me is null then raise exception 'not signed in'; end if;
  if p_periodo not in ('semana', 'mes', 'siempre') then raise exception 'periodo must be semana, mes or siempre'; end if;
  if p_materia is not null and p_materia not in ('CIE', 'LEN', 'MAT', 'SOC') then raise exception 'unknown materia'; end if;
  if p_inicio_semana not in ('lunes', 'domingo') then raise exception 'inicio_semana must be lunes or domingo'; end if;
  p_top_n := least(greatest(coalesce(p_top_n, 8), 1), 50);
  p_pts_correcta := least(greatest(coalesce(p_pts_correcta, 10), 0), 100);
  loc := now() at time zone p_zona;                       -- fails on an unknown time zone
  desde := case p_periodo
    when 'semana' then (case p_inicio_semana
                          when 'lunes' then date_trunc('week', loc)
                          else date_trunc('week', loc + interval '1 day') - interval '1 day' end) at time zone p_zona
    when 'mes' then date_trunc('month', loc) at time zone p_zona
    else '-infinity'::timestamptz end;
  return query
  with pts as (
    select s.id, s.nickname,
           coalesce(case when p_materia is null
             then (select sum(p.puntos) from public.pruebas p
                   where p.student_id = s.id and p.finished_at >= desde)
             else (select count(*) * p_pts_correcta from public.answers a
                   join public.pruebas p on p.id = a.prueba_id
                   where a.student_id = s.id and a.correcta and p.finished_at >= desde
                     and left(a.question_id, 3) = p_materia) end, 0)::int as total
    from public.students s
    where s.leaderboard and s.nickname is not null),
  ranked as (
    select (rank() over (order by total desc))::int as r,
           row_number() over (order by total desc, lower(nickname)) as rn,
           nickname, total, id
    from pts where total > 0)
  select x.r, x.nickname, x.total, x.id = me from ranked x where x.rn <= p_top_n
  union all
  select y.r, y.nickname, y.total, true from (
    select k.r, k.nickname, k.total, k.rn from ranked k where k.id = me
    union all
    select null, p.nickname, 0, null from pts p where p.id = me and p.total = 0) y
  where y.rn is null or y.rn > p_top_n
  order by 1 nulls last, 2;
end $$;
revoke all on function public.tabla_posiciones(text, text, int, text, text, int) from public, anon;
grant execute on function public.tabla_posiciones(text, text, int, text, text, int) to authenticated;
