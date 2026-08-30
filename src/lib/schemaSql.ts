'use client';
// 설치 화면에서 복사해 쓰는 스키마 SQL — 원본: supabase/schema.sql
// (원본을 고치면 이 파일도 함께 갱신)

export const SCHEMA_SQL = `-- ============================================================
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

-- ── 6. 콘텐츠 테이블 21종 ────────────────────────────────────
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
  'trpg_logs',        -- TRPG 로그(목록 문서 — 본문 제외)
  'trpg_log_bodies',  -- TRPG 로그 본문 (v2.0, 목록과 분리 저장 — 나만보기 로그의 본문 보호용)
  'trpg_chars',   -- TRPG 캐릭터
  'dotori',       -- 도토리
  'playlog',      -- 플레이기록
  'rp_rooms',     -- 역극 방
  'threads',      -- 감상타래
  'diary',        -- 다이어리
  'memos',        -- 스티커 메모
  'commissions',  -- 커미션
  'applicants',   -- 신청자
  'moods',        -- 무드 목록
  'comments',     -- 댓글 (v2.0 — 글 안이 아니라 자기 행으로. 글을 수정하지 않고 댓글을 달 수 있게)
  'qa_answers',   -- 자관 문답 답변 (v2.0 — 같은 이유로 자관 안이 아니라 자기 행으로)
  'rp_messages',  -- 역극 발화 (v2.0 — 같은 이유로 방 안이 아니라 자기 행으로)
  'notifications' -- 알림 (v2.0 — 기기 보관이던 것을 서버로: 받은 사람 계정으로 어느 기기에서나)
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

    -- 편집 권한을 받은 회원 (v2.0) — 캐릭터 grants의 「편집까지」 대상. 이미 만든 테이블에도 붙는다
    execute format($f$
      alter table public.%I add column if not exists editor_ids text[] not null default '{}'::text[]
    $f$, t);

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

    -- 수정·삭제: 본인 · 편집 권한을 받은 회원(editor_ids) · 관리자
    execute format('drop policy if exists "update" on public.%I', t);
    execute format($p$
      create policy "update" on public.%I for update to authenticated
        using (author_id = auth.uid() or public.is_admin()
               or auth.uid()::text = any(editor_ids))$p$, t);

    execute format('drop policy if exists "delete" on public.%I', t);
    execute format($p$
      create policy "delete" on public.%I for delete to authenticated
        using (author_id = auth.uid() or public.is_admin()
               or auth.uid()::text = any(editor_ids))$p$, t);
  end loop;
end $$;

-- 방명록·게시판 댓글은 비로그인 방문자도 남길 수 있음 (닉네임+비밀번호 방식)
drop policy if exists "insert" on public.guestbook;
create policy "insert" on public.guestbook for insert with check (true);

-- 댓글도 비로그인 방문자가 남길 수 있다 (닉네임+비밀번호 방식 — 방명록과 동일, v2.0).
-- 수정·삭제는 위 공통 정책 그대로: 작성자 본인 또는 관리자.
drop policy if exists "insert" on public.comments;
create policy "insert" on public.comments for insert with check (true);

-- 알림도 비로그인 방문자가 만들 수 있다 (v2.0) — 손님 댓글·방명록이 관리자에게 알림을 남겨야 하므로.
-- 행의 주인(author_id)은 받는 사람이라, 읽기·수정·삭제는 받는 사람과 관리자만 (공통 정책 그대로).
drop policy if exists "insert" on public.notifications;
create policy "insert" on public.notifications for insert with check (true);

-- ── 7. 사이트 설정 권한 (읽기 공개 · 쓰기 관리자) ────────────
alter table public.profiles enable row level security;
alter table public.invite_codes enable row level security;
alter table public.site_settings enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (true);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (auth.uid() = id or public.is_admin());
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
  -- 발화·답변·댓글이 각자 행으로 분리됐으므로(v2.0) 실시간도 그 테이블을 봐야 한다
  foreach t in array array['rp_rooms', 'rp_messages', 'relations', 'qa_answers', 'posts', 'comments', 'guestbook', 'notifications'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null;  -- 이미 추가돼 있으면 무시
    end;
  end loop;
end $$;

-- ── 10. 스키마 캐시 갱신 (중요) ──────────────────────────────
-- PostgREST(= REST API)는 테이블·컬럼 목록을 캐시해 둔다. SQL로 컬럼을 새로 추가해도
-- 캐시가 갱신되기 전에는 API가 그 컬럼을 모른다 —
--   Could not find the 'editor_ids' column of 'posts' in the schema cache (PGRST204)
-- 실제로 업데이트 후 「글을 저장하지 못했습니다」로 나타났다. 마지막에 캐시를 새로 읽게 한다.
notify pgrst, 'reload schema';

-- ── 완료 ─────────────────────────────────────────────────────
-- 이 스크립트를 실행한 뒤, 홈의 설치 화면에서 [연결 확인]을 누르면 검증됩니다.
-- 첫 번째로 가입하는 계정이 자동으로 관리자가 됩니다.
`;
