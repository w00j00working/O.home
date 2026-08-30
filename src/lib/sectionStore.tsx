'use client';
/**
 * 목록형 섹션을 여러 개로 (v2.0 사용자 요청).
 *
 * 게시판이 이미 하던 방식을 그대로 일반화했다 — **목록은 설정에, 항목은 원래 테이블에**.
 * 갤러리를 3개 만들어도 그림은 전부 `gallery` 테이블 한 곳에 들어가고, 각 항목이 `secId`로
 * 어디 소속인지만 들고 있다. 그래서 **DB 구조를 바꿀 필요가 없다**(포크 쓰는 사람이 SQL을
 * 다시 실행하지 않아도 된다 — 스키마 캐시 문제를 겪은 뒤라 이게 중요하다).
 *
 * 개별로 두는 것은 **이름뿐**이고 말머리·무드 같은 세부 설정은 함께 쓴다(사용자 확정).
 * 그래야 설정 화면에 「어느 것을 편집할지」 고르는 줄이 안 생겨 지금처럼 깔끔하게 남는다.
 * **예외는 분류/카테고리다** — 감상타래와 스케줄러는 다루는 것이 달라지면 분류도 달라지므로
 * 각자 따로 갖는다(사용자 요청). 정한 적이 없으면 기본 것을 그대로 쓴다.
 *
 * 섹션을 지워도 **항목 데이터는 남긴다**(3장 원칙) — 메뉴에서만 사라진다.
 */
import { useCallback, useEffect, useReducer } from 'react';
import { useSearchParams } from 'next/navigation';
import { getRawSetting, setSetting } from './settingStore';
import { newId } from './postStore';

export type SectionKind =
  | 'gallery' | 'roadview' | 'trpg' | 'dotori' | 'playlog' | 'comm' | 'diary' | 'threads' | 'sched' | 'chars';

/** 섹션 종류별 기본 정보 — 설정 탭 이름과 페이지 주소 */
export const SECTION_META: Record<SectionKind, { label: string; href: string; defName: string }> = {
  gallery:  { label: '갤러리',    href: '/gallery',   defName: '갤러리' },
  roadview: { label: '로드비',    href: '/loadb', defName: '로드비' },
  trpg:     { label: '로그 백업', href: '/trpg',     defName: '로그 백업' },
  dotori:   { label: '도토리',    href: '/dotori',   defName: '도토리' },
  playlog:  { label: '플레이기록', href: '/playlog', defName: '플레이기록' },
  comm:     { label: '커미션',    href: '/comm',     defName: '커미션' },
  diary:    { label: '다이어리',  href: '/diary',    defName: '다이어리' },
  threads:  { label: '감상타래',  href: '/threads',  defName: '감상타래' },
  sched:    { label: '스케줄러',  href: '/cal',      defName: '스케줄러' },
  chars:    { label: '캐릭터',    href: '/chars',    defName: '캐릭터' },
};

export const SECTION_KINDS = Object.keys(SECTION_META) as SectionKind[];

/** 기본 섹션 id — 이 id는 만들지도 지우지도 않는다(원래 있던 그 페이지) */
export const MAIN_SEC = 'main';

export interface SectionItem {
  id: string;
  name: string;
  /** 주소에 쓸 별명 (v2.0 사용자 요청) — 없으면 id가 그대로 주소에 나온다(`?s=mt9ipt`처럼 안 예쁘다).
   *  **소속 표시(secId)는 언제나 id로 저장한다** — 별명을 바꿔도 글이 떨어져 나가지 않는다. */
  slug?: string;
}

/** 주소·별명으로 쓸 수 있는 형태만 남긴다 — 영소문자·숫자·하이픈·밑줄 */
export const cleanSlug = (v: string) =>
  v.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);

type SectionMap = Partial<Record<SectionKind, SectionItem[]>>;

const KEY = 'ohome.sections.v1';
const EVT = 'ohome-sections';

/** 저장된 목록 + 항상 맨 앞의 기본 섹션 */
export function sectionsOf(map: SectionMap, kind: SectionKind): SectionItem[] {
  const base: SectionItem = { id: MAIN_SEC, name: SECTION_META[kind].defName };
  const extra = (map[kind] ?? []).filter(s => s.id !== MAIN_SEC);
  // 기본 섹션 이름을 바꿔 뒀으면 그 이름을 쓴다
  const named = (map[kind] ?? []).find(s => s.id === MAIN_SEC);
  return [named ? { ...base, ...named } : base, ...extra];
}

/** 주소에 쓸 값 — 별명을 정했으면 그것, 아니면 id (v2.0) */
export function secKeyOf(kind: SectionKind, id: string): string {
  load();
  const s = (cache[kind] ?? []).find(x => x.id === id);
  return s?.slug?.trim() || id;
}

/** 이 섹션의 주소 — 기본은 원래 주소 그대로, 나머지는 ?s=별명(없으면 id) */
export const sectionHref = (kind: SectionKind, id: string) =>
  (id === MAIN_SEC ? SECTION_META[kind].href : `${SECTION_META[kind].href}?s=${secKeyOf(kind, id)}`);

/** 항목이 이 섹션 것인가 — 예전 데이터(secId 없음)는 전부 기본 섹션 소속 */
export const inSection = (secId: string | undefined, cur: string) =>
  (cur === MAIN_SEC ? !secId || secId === MAIN_SEC : secId === cur);

/* ---------- 저장 ---------- */
let cache: SectionMap = {};
let loaded = false;

function load() {
  if (loaded) return;
  try {
    const raw = getRawSetting(KEY);
    if (raw) cache = JSON.parse(raw) as SectionMap;
  } catch { /* 기본값 */ }
  loaded = true;
}

function notify() { try { window.dispatchEvent(new Event(EVT)); } catch { /* 무시 */ } }

/** 섹션 목록 — 설정 화면·메뉴 공용 */
export function useSections(): {
  map: SectionMap;
  list: (kind: SectionKind) => SectionItem[];
  setList: (kind: SectionKind, next: SectionItem[]) => void;
  add: (kind: SectionKind) => void;
  loaded: boolean;
} {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const h = () => force();
    window.addEventListener(EVT, h);
    window.addEventListener('ohome-setting', h);
    return () => { window.removeEventListener(EVT, h); window.removeEventListener('ohome-setting', h); };
  }, []);
  load();

  const setList = useCallback((kind: SectionKind, next: SectionItem[]) => {
    cache = { ...cache, [kind]: next };
    try { setSetting(KEY, cache); } catch { /* 무시 */ }
    notify();
  }, []);

  const add = useCallback((kind: SectionKind) => {
    const cur = sectionsOf(cache, kind);
    const next = [...(cache[kind] ?? []), { id: newId(), name: `새 ${SECTION_META[kind].label} ${cur.length}` }];
    cache = { ...cache, [kind]: next };
    try { setSetting(KEY, cache); } catch { /* 무시 */ }
    notify();
  }, []);

  return {
    map: cache,
    list: (kind: SectionKind) => sectionsOf(cache, kind),
    setList,
    add,
    loaded,
  };
}

/**
 * 지금 보고 있는 섹션 (v2.0) — 주소의 `?s=`를 읽는다. 없으면 기본 섹션.
 *
 * 지워진 섹션의 주소로 들어오면 기본 섹션으로 돌린다 — 빈 화면 대신 원래 페이지가 나오게.
 * `useSearchParams`는 Suspense 경계가 필요하므로 쓰는 쪽 페이지를 감싸 준다(자관 수정과 같은 방식).
 */
export function useSectionParam(kind: SectionKind): { id: string; name: string; items: SectionItem[] } {
  const sp = useSearchParams();
  const { list } = useSections();
  const items = list(kind);
  const want = sp.get('s') ?? MAIN_SEC;
  // 별명으로도 찾는다 (v2.0) — 예전에 공유한 id 주소도 그대로 열려야 한다
  const found = items.find(s => s.id === want || (s.slug ?? '') === want) ?? items[0];
  return { id: found.id, name: found.name, items };
}

/** 상세·작성 페이지의 큰 글씨 + 큰 글씨를 눌렀을 때 돌아갈 주소 (v2.0 사용자 제보 —
 *  추가 섹션의 상세로 가면 원래 페이지 제목(CHARACTERS 등)이 떴고, 눌러도 리스트로 안 갔다).
 *  추가 섹션이면 그 이름을, 기본 섹션이면 def(페이지 원래 제목)를 준다.
 *  PageTitle에 href로 함께 넘기면 메뉴 관리에서 정한 타이틀·이름이 이보다 우선한다. */
export function useSectionTitle(
  kind: SectionKind, secId: string | undefined, def: string,
): { title: string; href: string } {
  const { list } = useSections();
  const id = secId ?? MAIN_SEC;
  const name = id === MAIN_SEC ? null : list(kind).find(s => s.id === id)?.name;
  return { title: name || def, href: sectionHref(kind, id) };
}

/** 목록에서 이 섹션 것만 (v2.0) — 예전 데이터는 전부 기본 섹션 소속 */
export function filterSection<T extends { secId?: string }>(rows: T[], cur: string): T[] {
  return rows.filter(r => inSection(r.secId, cur));
}

/**
 * 이 섹션만 갈아 끼우는 저장 함수 (v2.0) — **다른 섹션 것을 지우지 않게 하는 핵심**.
 *
 * 화면은 걸러진 목록만 보므로 `setItems(items.filter(...))`처럼 쓰면 **보이지 않던 다른 섹션이
 * 통째로 사라진다**. 그래서 저장 함수를 이걸로 바꿔 두면 기존 코드를 한 줄도 안 고치고도
 * 「이 섹션 자리만 교체 + 나머지는 그대로」가 된다. 새로 들어온 항목에는 소속을 찍어 준다.
 */
export function sectionSetter<T extends { secId?: string }>(
  all: T[], cur: string, setAll: (next: T[]) => void,
): (next: T[]) => void {
  return (next: T[]) => {
    const others = all.filter(r => !inSection(r.secId, cur));
    // 기본 섹션은 표시를 남기지 않는다 — 예전 데이터와 같은 모습이라 되돌리기도 쉽다
    const mine = cur === MAIN_SEC ? next : next.map(r => (r.secId === cur ? r : { ...r, secId: cur }));
    setAll([...mine, ...others]);
  };
}

/** 새로 만들기 페이지로 넘길 때 지금 섹션을 달고 간다 — 기본 섹션이면 아무것도 안 붙인다.
 *  **별명(slug)을 정했으면 별명으로** (v2.0 사용자 제보) — 메뉴 주소는 별명인데 여기서 만든
 *  주소만 id면, 같은 페이지인데 주소 문자열이 달라 메뉴 타이틀·이름 찾기가 전부 빗나간다. */
export const secQuery = (kind: SectionKind, id: string) =>
  (id === MAIN_SEC ? '' : `?s=${secKeyOf(kind, id)}`);

/** 주소의 ?s= 값을 그 섹션의 대표 표기(별명 우선)로 통일 (v2.0 사용자 제보).
 *  옛 공유 주소·구버전이 만든 id 주소로 들어와도 메뉴 타이틀·이름이 제대로 잡히게 —
 *  pathname이 섹션 목록 페이지가 아니면 받은 값을 그대로 돌려준다. */
export function canonSecKey(pathname: string, key: string): string {
  const kind = SECTION_KINDS.find(k => SECTION_META[k].href === pathname);
  if (!kind) return key;
  load();
  const hit = (cache[kind] ?? []).find(s => s.id === key || (s.slug ?? '') === key);
  return hit ? (hit.slug?.trim() || hit.id) : key;
}

/** 새 항목에 찍을 소속 — 기본 섹션은 표시를 남기지 않는다(예전 데이터와 같은 모습) */
export const secStamp = (id: string): { secId?: string } => (id === MAIN_SEC ? {} : { secId: id });

/** 메뉴에 얹을 추가 항목 — 기본 섹션은 원래 메뉴가 이미 있으므로 뺀다 */
export function sectionMenuEntries(map: SectionMap): { id: string; name: string; href: string; anchor: string }[] {
  const out: { id: string; name: string; href: string; anchor: string }[] = [];
  for (const kind of SECTION_KINDS) {
    for (const s of sectionsOf(map, kind)) {
      if (s.id === MAIN_SEC) continue;
      out.push({ id: s.id, name: s.name, href: sectionHref(kind, s.id), anchor: SECTION_META[kind].href });
    }
  }
  return out;
}
