'use client';
// 페이지 타이틀/설명 문구 편집 (5.2) — 관리자가 각 페이지 상단 설명을 자유 수정
// 호버 시 좌우반전 연필(✎)이 표시되고, 클릭하면 그 자리에서 입력 (localStorage → DB 이전 예정)
import React, { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useMenuSettings, pageTitleFor, menuLabelOf } from '@/lib/menuStore';
import { canonSecKey } from '@/lib/sectionStore';
import { refreshPage } from '@/lib/pageRefresh';
import { getRawSetting, setSetting } from '@/lib/settingStore';

const STORAGE_KEY = 'ohome.pagetext.v1';

/** 페이지 상단 대제목 — 클릭하면 해당 메뉴의 초기 페이지로 이동 (기본: 경로 첫 세그먼트).
 *  메뉴 관리에서 페이지 타이틀을 지정했으면 그 값이 기본 텍스트를 대체 (5.2 v1.9) —
 *  키는 href prop(게시판 등) 또는 현재 경로가 기능 href와 정확히 일치할 때만 (하위 경로 무영향) */
export function PageTitle({ children, href, style }: {
  children: React.ReactNode; href?: string; style?: React.CSSProperties;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ms] = useMenuSettings();
  /* 여러 개로 만든 섹션·게시판은 **같은 경로에 쿼리로** 갈린다 (`/gallery?s=fan`).
     예전에는 쿼리를 뺀 경로로만 찾아서, 추가한 메뉴에 붙인 타이틀·이름이 페이지에 안 나왔다
     (v2.0 사용자 발견 — 「메뉴 이름을 바꿔도 큰 글씨가 안 바뀐다」).
     useSearchParams를 쓰면 이 컴포넌트를 쓰는 **모든 페이지**가 Suspense 경계를 요구하므로
     주소를 직접 읽는다 — 매 렌더 뒤에 맞춰 두면 이동에도 따라온다. */
  const [search, setSearch] = useState('');
  useEffect(() => { setSearch(window.location.search); });
  const q = new URLSearchParams(search);
  // ?s=는 별명(slug)으로 통일해 찾는다 (v2.0 사용자 제보) — 메뉴에는 별명 주소가 적혀 있는데
  // 글쓰기 취소 등 코드가 만든 이동은 id 주소여서, 같은 페이지인데 타이틀을 못 찾았다
  const sq0 = q.get('s');
  const sq = sq0 ? canonSecKey(pathname, sq0) : sq0;
  const bq = q.get('b');
  const full = pathname + (sq ? `?s=${sq}` : bq ? `?b=${bq}` : '');
  const target = href ?? (full || `/${pathname.split('/')[1] ?? ''}`);
  /* 큰 글씨는 ① 메뉴 관리에서 정한 타이틀 ② (추가 메뉴면) 메뉴에 적은 이름 ③ 페이지 기본 제목.
     추가 메뉴에서만 이름을 끌어온다 — 원래 메뉴는 「리스트 → BOARD」처럼 이름과 제목이
     일부러 다르므로 여기서 바꾸면 기존 홈의 제목이 전부 달라진다.
     href로 받은 주소도 쿼리(?s=/?b=)가 있으면 추가 메뉴다 — 상세·글쓰기 페이지가 소속을 href로
     알려 주는 경우로, 여기서도 메뉴에 적은 이름까지 끌어온다 (v2.0 사용자 제보 — 「추가한
     게시판의 상세로 가면 원래 페이지 제목이 뜬다」) */
  const isExtra = (h: string) => /[?&][sb]=/.test(h);
  const custom = href
    ? pageTitleFor(ms, href) ?? (isExtra(href) ? menuLabelOf(ms, href) : null)
    : full !== pathname
      ? pageTitleFor(ms, full) ?? menuLabelOf(ms, full)
      : pageTitleFor(ms, pathname);
  // 지금 있는 페이지면 다시 불러오기 — 상단 메뉴 재클릭과 동일 동작 (v1.9 사용자 요청).
  // 추가 게시판·섹션의 목록(쿼리 포함 주소)에서도 같은 동작이 되게 full과도 비교한다 (v2.0)
  return (
    <h1 style={style} onClick={() => {
      const t = target || '/';
      if (t === pathname || t === full) refreshPage();   // 새로고침 아님 — 페이지만 처음 상태로 (v1.9)
      else router.push(t);
    }}>
      {custom ?? children}
    </h1>
  );
}

function load(): Record<string, string> {
  try { return JSON.parse(getRawSetting(STORAGE_KEY) ?? '{}'); } catch { return {}; }
}

/** 페이지 문구 직접 읽기/쓰기 — 환경설정 등 다른 화면에서 편집할 때 (v1.9) */
export function getPageText(k: string, def: string): string {
  const v = load()[k];
  return v !== undefined ? v : def;
}
export function setPageText(k: string, v: string) {
  const map = load();
  if (v.trim()) map[k] = v; else delete map[k];
  try { setSetting(STORAGE_KEY, map); } catch { /* 무시 */ }
}

/** always — 헤더 표시 옵션(제목만/안 띄움)에도 숨지 않는 상태·안내 문구용 (예: 역극 비로그인 안내, v1.9) */
export function EditableDesc({ k, def, always }: { k: string; def: string; always?: boolean }) {
  const { isAdmin } = useAuth();
  const [text, setText] = useState(def);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const v = load()[k];
    setText(v !== undefined ? v : def); // 키 변경 시(다른 캐릭터 등) 기본값으로 리셋
  }, [k, def]);

  const save = () => {
    const v = draft.trim();
    const map = load();
    if (v) map[k] = v; else delete map[k];
    try { setSetting(STORAGE_KEY, map); } catch { /* 무시 */ }
    setText(v || def);
    setEditing(false);
  };

  if (editing) {
    // 보기(p)와 동일한 크기·여백의 심리스 인풋 — 전환 시 레이아웃이 덜컹거리지 않음
    return (
      <input
        autoFocus
        className="desc-edit"
        defaultValue={text}
        onChange={e => setDraft(e.target.value)}
        onFocus={e => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={e => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }

  return (
    // .editable — 관리자 연필 표시는 이 클래스에만 (동적 메타 문구에는 연필 없음)
    <p className={`editable${always ? ' gate' : ''}`} onClick={() => { if (isAdmin) { setDraft(text); setEditing(true); } }}>
      {text}
    </p>
  );
}
