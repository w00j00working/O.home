-- ============================================================
-- O.HOME 서버 스키마 (공개 홈용)
-- Supabase → SQL Editor 에 통째로 붙여넣고 [Run].
-- 여러 번 실행해도 안전합니다 (이미 있으면 건너뜀).
-- ============================================================

-- ── 1. 회원 프로필 ───────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  avatar_url text,
  avatar_color text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ── 2. 가입코드 (초대코드 방식) ──────────────────────────────
create table if not exists public.invite_codes (
  code text primary key,
  created_at timestamptz not null default now(),
  used_by uuid references auth.users(id),
  used_at timestamptz
);

-- ── 3. 사이트 설정 (테마·폰트·메뉴·메인 위젯·게시판 설정 등) ──
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ── 4. 관리자 판별 함수 ──────────────────────────────────────
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
$$;

-- ── 5. 가입 시 프로필 자동 생성 (첫 가입자 = 관리자) ─────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare existing int;
begin
  select count(*) into existing from public.profiles;
  insert into public.profiles (id, nickname, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1)),
    case when existing = 0 then 'admin' else 'member' end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 5b. 프로필 권한(role) 서버 잠금 (v2.0 보안 — 관리자 탈취 방지) ───────────
-- RLS의 profiles_update_own은 「자기 행인지」만 보고 바뀐 role 값은 검사하지 않았다.
-- 그래서 로그인한 누구나 콘솔에서  update profiles set role='admin' 한 줄로 관리자가 될 수 있었다.
-- 이 트리거가 서버에서 role을 고정한다(RLS로는 컬럼 단위 제어가 안 되므로 트리거가 확실하다):
--   · 기존 관리자(is_admin)는 회원 권한을 자유롭게 바꿀 수 있다
--   · 그 외에는 수정으로 role을 절대 못 바꾸고(old 값 유지),
--     신규 프로필은 관리자가 하나도 없을 때(최초 소유자 부트스트랩 = handle_new_user)만 admin 허용 —
--     이후의 모든 가입은 콘솔로 role='admin'을 넣어도 member로 고정된다.
create or replace function public.guard_profile_role()
returns trigger language plpgsql security definer set search_path = public as $$
declare admin_count int;
begin
  if public.is_admin() then
    return new;                                   -- 관리자는 권한 관리 허용
  end if;
  if tg_op = 'UPDATE' then
    new.role := old.role;                         -- 수정으로는 role 변경 불가
  else
    select count(*) into admin_count from public.profiles where role = 'admin';
    if admin_count > 0 then
      new.role := 'member';                       -- 관리자가 이미 있으면 신규는 member 고정
    end if;                                       -- (admin_count = 0 일 때만 최초 소유자 admin 통과)
  end if;
  return new;
end $$;

drop trigger if exists guard_profile_role on public.profiles;
create trigger guard_profile_role
  before insert or update on public.profiles
  for each row execute function public.guard_profile_role();

-- ── 6. 콘텐츠 테이블 17종 ────────────────────────────────────
-- 항목 하나 = 행 하나 (행 단위 권한·실시간). 항목의 세부 필드는 data(jsonb)에 담고,
-- 권한·정렬·필터에 쓰는 값만 별도 컬럼으로 뽑아 둔다.
do $$
declare t text;
declare content_tables text[] := array[
  'posts',        -- 게시판 글
  'guestbook',    -- 방명록
  'characters',   -- 캐릭터
  'relations',    -- 자관
  'gallery',      -- 그림 백업(갤러리)
  'roadview',     -- 로드뷰
  'trpg_logs',    -- TRPG 로그
  'trpg_chars',   -- TRPG 캐릭터
  'dotori',       -- 도토리
  'playlog',      -- 플레이기록
  'rp_rooms',     -- 역극 방
  'threads',      -- 감상타래
  'diary',        -- 다이어리
  'memos',        -- 스티커 메모
  'commissions',  -- 커미션
  'applicants',   -- 신청자
  'moods'         -- 무드 목록
];
begin
  foreach t in array content_tables loop
    execute format($f$
      create table if not exists public.%I (
        id          text primary key,
        data        jsonb not null default '{}'::jsonb,
        author_id   uuid references auth.users(id) on delete set null,
        visibility  text not null default 'public',
        sort        double precision not null default 0,
        created_at  timestamptz not null default now(),
        updated_at  timestamptz not null default now()
      )$f$, t);

    execute format('alter table public.%I enable row level security', t);
    execute format('create index if not exists %I on public.%I (sort)', t || '_sort_idx', t);

    -- 읽기: 전체공개 / 멤버공개(로그인) / 본인 글 / 관리자
    execute format('drop policy if exists "read" on public.%I', t);
    execute format($p$
      create policy "read" on public.%I for select using (
        visibility = 'public'
        or (visibility = 'member' and auth.uid() is not null)
        or author_id = auth.uid()
        or public.is_admin()
      )$p$, t);

    -- 쓰기: 로그인 회원 (방명록만 아래에서 비로그인 허용으로 덮어씀)
    execute format('drop policy if exists "insert" on public.%I', t);
    execute format($p$
      create policy "insert" on public.%I for insert to authenticated with check (true)$p$, t);

    -- 수정: 본인 또는 관리자 · 삭제: 본인 또는 관리자
    execute format('drop policy if exists "update" on public.%I', t);
    execute format($p$
      create policy "update" on public.%I for update to authenticated
        using (author_id = auth.uid() or public.is_admin())$p$, t);

    execute format('drop policy if exists "delete" on public.%I', t);
    execute format($p$
      create policy "delete" on public.%I for delete to authenticated
        using (author_id = auth.uid() or public.is_admin())$p$, t);
  end loop;
end $$;

-- 방명록·게시판 댓글은 비로그인 방문자도 남길 수 있음 (닉네임+비밀번호 방식)
drop policy if exists "insert" on public.guestbook;
create policy "insert" on public.guestbook for insert with check (true);

-- ── 7. 사이트 설정 권한 (읽기 공개 · 쓰기 관리자) ────────────
alter table public.profiles enable row level security;
alter table public.invite_codes enable row level security;
alter table public.site_settings enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (true);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());   -- 바뀐 행도 검사 — 남의 행으로 바꿔치기 방지 (role은 위 트리거가 고정)
-- 프로필 저장은 upsert(INSERT 경로)라 INSERT 정책이 없으면 행이 이미 있어도 거부된다
-- ("new row violates row-level security policy" — v2.0 포크 제보). 자기 행만 만들 수 있게 허용.
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated
  with check (auth.uid() = id);
drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles for delete to authenticated
  using (public.is_admin());

drop policy if exists "invite_select" on public.invite_codes;
create policy "invite_select" on public.invite_codes for select using (true);
drop policy if exists "invite_write" on public.invite_codes;
create policy "invite_write" on public.invite_codes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "invite_use" on public.invite_codes;
create policy "invite_use" on public.invite_codes for update using (used_by is null);

drop policy if exists "settings_select" on public.site_settings;
create policy "settings_select" on public.site_settings for select using (true);
drop policy if exists "settings_write" on public.site_settings;
create policy "settings_write" on public.site_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── 8. 이미지 저장소 (Storage 버킷) ──────────────────────────
insert into storage.buckets (id, name, public)
values ('ohome', 'ohome', true)
on conflict (id) do nothing;

drop policy if exists "ohome_read" on storage.objects;
create policy "ohome_read" on storage.objects for select using (bucket_id = 'ohome');
drop policy if exists "ohome_write" on storage.objects;
create policy "ohome_write" on storage.objects for insert to authenticated with check (bucket_id = 'ohome');
drop policy if exists "ohome_update" on storage.objects;
create policy "ohome_update" on storage.objects for update to authenticated using (bucket_id = 'ohome');
drop policy if exists "ohome_delete" on storage.objects;
create policy "ohome_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'ohome' and (owner = auth.uid() or public.is_admin()));

-- ── 9. 실시간 (역극·문답 티키타카) ───────────────────────────
do $$
declare t text;
begin
  foreach t in array array['rp_rooms', 'relations', 'posts', 'guestbook'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null;  -- 이미 추가돼 있으면 무시
    end;
  end loop;
end $$;

-- ── 완료 ─────────────────────────────────────────────────────
-- 이 스크립트를 실행한 뒤, 홈의 설치 화면에서 [연결 확인]을 누르면 검증됩니다.
-- 첫 번째로 가입하는 계정이 자동으로 관리자가 됩니다.
