'use client';
// 메뉴 관리 (5.2 — 메뉴 선택제) — 상위 메뉴를 자유롭게 만들고(생성·삭제·이름·순서)
// 하위 메뉴(기능 모듈)를 원하는 상위에 배치하는 자유 트리 (v1.9 개편).
// 트리에서 뺀 기능은 노출만 사라지고 데이터는 보존 (3장 원칙).
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_MENU, FEATURES, MenuItem } from './menu';
import { newId } from './postStore';
import { getRawSetting, setSetting } from './settingStore';

export type MenuPerm = 'guest' | 'member' | 'admin';

/** 메뉴 공개범위 (v1.9) — all: 전부 보임 / member: 비로그인에게 숨김 / admin: 관리자에게만 */
export type MenuVis = 'all' | 'member' | 'admin';

/** 트리의 하위 메뉴 한 항목 — label 없으면 기본 이름(FEATURES/게시판명) · pageTitle은 페이지 상단 큰 제목 덮어쓰기 */
export interface MenuLeaf { href: string; label?: string; pageTitle?: string; vis?: MenuVis; open?: boolean }
/** 트리의 상위 한 항목 — href가 있으면 단독 메뉴(하위 없음) */
export interface MenuGroupNode { id: string; label: string; href?: string; items: MenuLeaf[]; pageTitle?: string; vis?: MenuVis; open?: boolean }

export interface MenuSettings {
  tree?: MenuGroupNode[];            // 자유 메뉴 트리 (v1.9 — 없으면 v1 설정에서 마이그레이션)
  removedBoards: string[];           // 메뉴에서 뺀 추가 게시판 href (자동 배치 제외)
  // v1 유산 — 트리 마이그레이션 재료로만 사용
  groupOrder: string[];
  hidden: string[];
  labels: Record<string, string>;
  // 메뉴별 부속 설정 (스펙상 "메뉴 관리에서" 지정하는 것들)
  playlogPc: string[];               // 플레이기록 표시 열 — PC (4.16 v1.8)
  playlogMobile: string[];           //   〃 모바일 (기본 Date/Scenario/Role/Playtime)
  roadUpload: MenuPerm;              // 로드뷰 업로드 권한 (4.10 v1.7)
  roadComment: MenuPerm;             // 로드뷰 댓글 권한
  backupView: 'gal' | 'list';        // 갤러리(그림백업) 기본 보기 (5.2)
  calTitle: 'en' | 'num';            // 스케줄러 달 표기 (v1.9) — AUGUST 2026 / 2026.08
  imgProtect: ImgProtectArea[];      // 이미지 저장 방지 영역 (v1.9 — 우클릭·드래그 차단, 관리자 제외)
}

/** 이미지 저장 방지 영역 (v1.9) — 게시판은 갤러리·로드비 포함 */
export type ImgProtectArea = 'board' | 'comm' | 'tchar' | 'chars' | 'rels';

export const IMG_PROTECT_AREAS: { key: ImgProtectArea; label: string; paths: string[] }[] = [
  { key: 'board', label: '게시판 (갤러리·로드비 포함)', paths: ['/board', '/gallery', '/loadb'] },
  { key: 'comm', label: '커미션', paths: ['/comm', '/comm-apply'] },
  { key: 'tchar', label: 'TRPG 캐릭터', paths: ['/tchars'] },
  { key: 'chars', label: '자캐 (캐릭터)', paths: ['/chars'] },
  { key: 'rels', label: '자관', paths: ['/rels'] },
];

/** 현재 경로가 속한 이미지 보호 영역 — 없으면 null */
export function imgProtectAreaFor(pathname: string): ImgProtectArea | null {
  for (const a of IMG_PROTECT_AREAS) {
    if (a.paths.some(p => pathname === p || pathname.startsWith(p + '/'))) return a.key;
  }
  return null;
}

/** 기본 트리 — DEFAULT_MENU 구조 그대로 */
export function defaultTree(): MenuGroupNode[] {
  return DEFAULT_MENU.map(m => m.children
    ? { id: `g-${m.label}`, label: m.label, items: m.children.map(c => ({ href: c.href })) }
    : { id: `g-${m.label}`, label: m.label, href: m.href, items: [] });
}

/** v1 설정(groupOrder/hidden/labels) → 트리 마이그레이션 */
function migrateTree(p: Partial<MenuSettings>): MenuGroupNode[] {
  const order = [
    ...(p.groupOrder ?? []).filter(k => DEFAULT_MENU.some(m => m.label === k)),
    ...DEFAULT_MENU.map(m => m.label).filter(k => !(p.groupOrder ?? []).includes(k)),
  ];
  const hidden = p.hidden ?? [];
  const labels = p.labels ?? {};
  return order
    .map(k => DEFAULT_MENU.find(m => m.label === k)!)
    .filter(m => !hidden.includes(m.label))
    .map(m => m.children
      ? {
        id: `g-${m.label}`, label: labels[m.label] ?? m.label,
        items: m.children.filter(c => !hidden.includes(c.href))
          .map(c => ({ href: c.href, ...(labels[c.href] ? { label: labels[c.href] } : {}) })),
      }
      : { id: `g-${m.label}`, label: labels[m.label] ?? m.label, href: m.href, items: [] });
}

export const newGroupId = () => `g-${newId()}`;

export const PLAYLOG_COLS: { key: string; label: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'scenario', label: 'Scenario' },
  { key: 'writer', label: 'Writer' },
  { key: 'with', label: 'With' },
  { key: 'role', label: 'Role' },
  { key: 'playtime', label: 'Playtime' },
  { key: 'url', label: 'Url' },
];

export const DEFAULT_MENU_SETTINGS: MenuSettings = {
  removedBoards: [],
  groupOrder: DEFAULT_MENU.map(m => m.label),
  hidden: [],
  labels: {},
  playlogPc: PLAYLOG_COLS.map(c => c.key),                       // PC 기본 전체 7열
  playlogMobile: ['date', 'scenario', 'role', 'playtime'],       // 모바일 기본 4열 (v1.8)
  roadUpload: 'member', roadComment: 'guest',
  backupView: 'gal',
  calTitle: 'en',
  imgProtect: [],
};

const KEY = 'ohome.menuset.v1';

/** 주소를 바꾼 메뉴 (v2.0 사용자 요청) — 옛 이름이 그대로였던 것들 */
const MOVED: Record<string, string> = { '/roadview': '/loadb', '/backup': '/gallery' };

/**
 * 저장된 메뉴의 옛 주소를 새 주소로 (v2.0).
 *
 * 메뉴 트리에는 주소가 **문자열로** 적혀 있어서, 주소를 바꾸면 저장해 둔 배치가
 * 「없는 기능」으로 취급돼 메뉴에서 통째로 사라진다. 읽을 때 한 번 바꿔 준다 —
 * 저장은 그다음 SAVE 때 자연히 새 주소로 남는다.
 * 여러 개로 만든 섹션 주소(`/backup?s=fan`)도 앞부분만 갈아 끼운다.
 */
function moveHrefs(p: Partial<MenuSettings>): Partial<MenuSettings> {
  const mv = (h: string) => {
    for (const [from, to] of Object.entries(MOVED)) {
      if (h === from) return to;
      if (h.startsWith(`${from}?`)) return to + h.slice(from.length);
    }
    return h;
  };
  return {
    ...p,
    ...(p.tree ? {
      tree: p.tree.map(g => ({
        ...g,
        ...(g.href ? { href: mv(g.href) } : {}),
        items: (g.items ?? []).map(it => ({ ...it, href: mv(it.href) })),
      })),
    } : {}),
    ...(p.removedBoards ? { removedBoards: p.removedBoards.map(mv) } : {}),
  };
}

/**
 * 훅 없이 지금 저장된 메뉴 설정 읽기 (v2.0).
 * 저장 시점에 글 공개범위를 정할 때처럼 **렌더 밖에서** 필요하다 — 그쪽은 훅을 쓸 수 없다.
 */
export function currentMenuSettings(): MenuSettings {
  try {
    const raw = getRawSetting(KEY);
    if (raw) {
      const p = moveHrefs(JSON.parse(raw) as Partial<MenuSettings>);
      return { ...DEFAULT_MENU_SETTINGS, ...p, tree: p.tree ?? migrateTree(p) };
    }
  } catch { /* 기본값 */ }
  return DEFAULT_MENU_SETTINGS;
}

export function useMenuSettings(): [MenuSettings, (patch: Partial<MenuSettings>) => void, boolean] {
  const [st, setSt] = useState<MenuSettings>(DEFAULT_MENU_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = getRawSetting(KEY);
      if (raw) {
        const p = moveHrefs(JSON.parse(raw) as Partial<MenuSettings>);
        setSt({
          ...DEFAULT_MENU_SETTINGS,
          ...p,
          // v1(노출 온오프) 설정만 있으면 자유 트리로 마이그레이션 (v1.9)
          tree: p.tree ?? migrateTree(p),
        });
      }
    } catch { /* 기본값 */ }
    setLoaded(true);
    const sync = () => {
      try {
        const raw = getRawSetting(KEY);
        if (raw) setSt(s => ({ ...s, ...moveHrefs(JSON.parse(raw)) }));
      } catch { /* 무시 */ }
    };
    window.addEventListener('ohome-menuset', sync);
    return () => window.removeEventListener('ohome-menuset', sync);
  }, []);
  const patch = useCallback((p: Partial<MenuSettings>) => {
    setSt(s => {
      const n = { ...s, ...p };
      try { setSetting(KEY, n); } catch { /* 무시 */ }
      // 상단바(TopBar)가 같은 탭에서 즉시 갱신되도록
      setTimeout(() => window.dispatchEvent(new Event('ohome-menuset')), 0);
      return n;
    });
  }, []);
  return [st, patch, loaded];
}

/** 게시판 href — 추가 게시판은 /board?b=<id> */
export const extraBoardHref = (id: string) => `/board?b=${id}`;

/** 메뉴에 얹는 추가 항목 (v2.0) — 게시판뿐 아니라 갤러리·다이어리 등 「여러 개로 만든 섹션」 공통.
 *  anchor = 이 항목을 어느 기본 메뉴 뒤에 끼울지 (예: /diary 뒤) */
export interface ExtraEntry { id: string; name: string; href: string; anchor: string }

/** 게시판 목록을 추가 항목 형태로 (기본 게시판은 이미 메뉴에 있으므로 뺀다) */
export const boardEntries = (boards?: { id: string; name: string }[]): ExtraEntry[] =>
  (boards ?? []).filter(b => b.id !== 'main')
    .map(b => ({ id: b.id, name: b.name, href: extraBoardHref(b.id), anchor: '/board' }));

/** 메뉴 관리에서 지정한 페이지 상단 큰 제목 (5.2 v1.9) — 정확히 일치하는 href만, 없으면 null */
export function pageTitleFor(s: MenuSettings, href: string): string | null {
  for (const g of s.tree ?? []) {
    if (g.href === href) return g.pageTitle?.trim() || null;
    for (const it of g.items) if (it.href === href) return it.pageTitle?.trim() || null;
  }
  return null;
}

/** 기능 href의 기본 이름 — FEATURES + 추가 게시판명 (없으면 null = 사라진 기능) */
export function menuLabelFor(href: string, extra?: ExtraEntry[]): string | null {
  const f = FEATURES.find(x => x.href === href);
  if (f) return f.label;
  const e = extra?.find(x => x.href === href);
  return e ? e.name : null;
}

/**
 * 이 주소가 메뉴에서 어떤 공개범위인지 (v2.0 사용자 발견 — 비공개로 둔 게시판이 위젯으로 샜다).
 *
 * 공개범위는 지금까지 **메뉴를 그릴 때만** 쓰였다. 링크가 안 보일 뿐이라, 메인 위젯은
 * 그 게시판의 글을 그대로 꺼내 보여 줬다 — 로그인하지 않은 방문자에게도. 위젯이 메뉴와
 * 같은 기준을 보도록 판정을 여기로 모은다.
 *
 * · 상세 페이지(`/board/123`)는 목록(`/board`)의 범위를 따른다.
 * · 경계는 `/`와 `?`로 끊는다 — 안 그러면 `/comm-apply`가 `/comm`에 딸려 들어간다.
 * · 여러 곳에 걸려 있으면 **더 구체적인 주소**가 이긴다(`/gallery?s=fan` > `/gallery`).
 *   같은 구체성이면 느슨한 쪽 — 그 링크가 실제로 보이는 경로가 하나라도 있다는 뜻이므로.
 */
const VIS_RANK: Record<MenuVis, number> = { all: 0, member: 1, admin: 2 };

/** 이 주소에 걸린 메뉴 항목의 공개범위 + 「주소로는 열람 허용」 여부 (v2.0) */
function hrefEntry(s: MenuSettings, path: string): { vis: MenuVis; open: boolean } {
  const covers = (href: string) =>
    path === href || path.startsWith(`${href}/`) || path.startsWith(`${href}?`);
  let bestLen = -1;
  let best: { vis: MenuVis; open: boolean } = { vis: 'all', open: false };
  const take = (href: string, e: { vis: MenuVis; open: boolean }) => {
    if (href.length > bestLen) { bestLen = href.length; best = e; }
    else if (href.length === bestLen && VIS_RANK[e.vis] < VIS_RANK[best.vis]) best = e;
  };
  for (const g of s.tree ?? defaultTree()) {
    const gv = g.vis ?? 'all';
    if (g.href && covers(g.href)) take(g.href, { vis: gv, open: !!g.open });
    // 상위가 더 좁으면 하위는 그 뒤에 숨는다 — 상위가 안 보이면 하위도 안 보이므로
    for (const it of g.items) {
      if (!covers(it.href)) continue;
      const iv = it.vis ?? 'all';
      const narrower = VIS_RANK[gv] >= VIS_RANK[iv];
      take(it.href, { vis: narrower ? gv : iv, open: narrower ? !!g.open : !!it.open });
    }
  }
  return best;
}

export function hrefVis(s: MenuSettings, path: string): MenuVis {
  return hrefEntry(s, path).vis;
}

/**
 * **들어갈 수 있는가**의 기준 (v2.0 사용자 요청) — 「숨기되 주소로는 열람 허용」.
 *
 * 공개범위는 원래 「메뉴에 보이는가」와 「들어갈 수 있는가」를 한꺼번에 정했다.
 * 그래서 **링크로만 돌리고 싶은 게시판**을 만들 수가 없었다 — 메뉴에서 감추면 남에게
 * 주소를 줘도 못 열었기 때문. 항목마다 「주소로는 열람 허용」을 켜면 **메뉴·위젯에서는
 * 그대로 감추되 들어오는 것만 열어 준다.**
 */
export function hrefAccess(s: MenuSettings, path: string): MenuVis {
  const e = hrefEntry(s, path);
  return e.open ? 'all' : e.vis;
}

const allows = (v: MenuVis, viewer: { loggedIn: boolean; isAdmin: boolean }) =>
  v === 'all' || (v === 'member' && viewer.loggedIn) || (v === 'admin' && viewer.isAdmin);

/** 이 방문자에게 **드러내도 되는가** (v2.0) — 메뉴·위젯이 쓴다.
 *  「주소로는 열람 허용」이어도 여기서는 감춘다 — 링크로만 돌리려는 것이지 알리려는 게 아니다 */
export function canViewHref(
  s: MenuSettings, path: string, viewer: { loggedIn: boolean; isAdmin: boolean },
): boolean {
  return allows(hrefVis(s, path), viewer);
}

/** 이 방문자가 **들어갈 수 있는가** (v2.0) — 페이지 차단·서버 저장값이 쓴다 */
export function canAccessHref(
  s: MenuSettings, path: string, viewer: { loggedIn: boolean; isAdmin: boolean },
): boolean {
  return allows(hrefAccess(s, path), viewer);
}

/** 메뉴 트리에 적힌 이 주소의 이름 (v2.0) — 이름을 따로 준 적이 없으면 null */
export function menuLabelOf(s: MenuSettings, href: string): string | null {
  for (const g of s.tree ?? []) {
    if (g.href === href) return g.label?.trim() || null;
    for (const it of g.items) if (it.href === href) return it.label?.trim() || null;
  }
  return null;
}

/** 설정을 적용한 실제 메뉴 트리 — 자유 트리(v1.9) 기반.
 *  extraBoards: 추가 생성한 게시판(5.2) — 트리에 아직 없으면 /board가 든 그룹에 자동 배치.
 *  viewer: 공개범위 필터(v1.9) — all/member/admin. 없으면 전부 표시(관리 화면용) */
export function buildMenu(
  s: MenuSettings,
  extra?: ExtraEntry[],
  viewer?: { loggedIn: boolean; isAdmin: boolean },
): MenuItem[] {
  const tree = s.tree ?? defaultTree();
  const placed = new Set(tree.flatMap(g => (g.href ? [g.href] : g.items.map(it => it.href))));
  const canSee = (vis?: MenuVis) => !viewer
    || (vis ?? 'all') === 'all'
    || (vis === 'member' && viewer.loggedIn)
    || (vis === 'admin' && viewer.isAdmin);

  const menu: MenuItem[] = tree
    .filter(g => canSee(g.vis))
    .map((g): MenuItem | null => {
      if (g.href) {
        return menuLabelFor(g.href, extra) === null ? null : { label: g.label, href: g.href };
      }
      const children = g.items
        .filter(it => canSee(it.vis))
        .map(it => {
          const def = menuLabelFor(it.href, extra);
          return def === null ? null : { href: it.href, label: it.label ?? def };
        })
        .filter((c): c is { href: string; label: string } => !!c);
      return { label: g.label, children };
    })
    .filter((m): m is MenuItem => !!m);

  /* 새로 만든 섹션·게시판은 **자동으로 배치하지 않는다** (v2.0 사용자 확정).
     예전에는 원래 메뉴 뒤에 저절로 끼워 넣었는데, 그러면 메뉴 관리의 「미배치」에
     한 번 보였다가 다음에 들어가면 사라져 있어 어디로 갔는지 알 수 없었다.
     이제 만들면 미배치에 머물고, 원하는 상위 메뉴에 직접 넣어야 메뉴에 나온다. */

  // 하위가 하나도 없는 그룹은 통째로 숨김
  return menu.filter(m => !m.children || m.children.length > 0);
}
