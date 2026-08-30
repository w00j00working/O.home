'use client';
// 게시판 설정 (5.2 게시판 관리) — 말머리(카테고리) 목록 관리 + 뱃지(공지/비밀/접힘·말머리별) 색
import { useCallback, useEffect, useState } from 'react';
import { newId } from './postStore';
import { MAIN_SEC } from './sectionStore';

export interface BoardBadge { id: string; label: string; bg: string; border: string; fg: string }

/** 시스템 뱃지 3종 — 삭제 불가 (색·글씨는 수정 가능) */
export const DEFAULT_BOARD_SYSTEM: BoardBadge[] = [
  { id: 'notice', label: '공지', bg: '#1d2025', border: '#1d2025', fg: '#ffffff' },
  { id: 'secret', label: '비밀', bg: '#a63a45', border: '#8c2f39', fg: '#ffffff' },
  { id: 'fold', label: '접힘', bg: '#f2e6e7', border: '#d9b8bc', fg: '#a63a45' },
];

/** 기본 말머리 — 목록 자체를 환경설정에서 추가·삭제·순서 변경 */
export const DEFAULT_BOARD_CATS: BoardBadge[] = ['잡담', '설정', '합작', '기타'].map(c => ({
  id: `cat-${c}`, label: c, bg: '#eef0f2', border: '#d7dae0', fg: '#5d636d',
}));

/** 갤러리(그림백업) 유형 뱃지 2종 — 로그/단일 (라벨·색 수정 가능, 삭제 불가) */
export const DEFAULT_GALLERY_BADGES: BoardBadge[] = [
  { id: 'log', label: '로그', bg: '#1d2025', border: '#1d2025', fg: '#ffffff' },
  { id: 'single', label: '단일', bg: '#eef0f2', border: '#d7dae0', fg: '#5d636d' },
  // 단일(세로정렬) (v1.9) — 로그와 달리 이미지 사이 갭을 두고 세로로 죽 내려보는 게시글
  { id: 'vlist', label: '단일(세로)', bg: '#eef0f2', border: '#d7dae0', fg: '#5d636d' },
];

/** 갤러리 말머리 (v2.0) — 예전에는 코드에 박혀 있어 바꿀 수 없었다. 게시판 말머리처럼 자유롭게 관리 */
export const DEFAULT_GALLERY_CATS: BoardBadge[] = ['합작', '낙서', '커미션', '설정화'].map(c => ({
  id: `gcat-${c}`, label: c, bg: '#eef0f2', border: '#d7dae0', fg: '#5d636d',
}));

export interface BoardSettings {
  system: BoardBadge[]; cats: BoardBadge[]; gallery: BoardBadge[]; galleryCats: BoardBadge[];
  /** 갤러리마다 따로 쓰는 말머리 (v2.0 사용자 요청) — 정한 적 없으면 기본 갤러리 것을 그대로.
   *  새로 만들자마자 말머리가 비면 글부터 못 쓴다(감상타래·스케줄러와 같은 규칙). */
  secGalleryCats?: Record<string, BoardBadge[]>;
}
const DEFAULTS: BoardSettings = {
  system: DEFAULT_BOARD_SYSTEM, cats: DEFAULT_BOARD_CATS,
  gallery: DEFAULT_GALLERY_BADGES, galleryCats: DEFAULT_GALLERY_CATS,
};
const KEY = 'ohome.boardset.v1';

/** 그 갤러리에서 쓸 말머리 (v2.0) — 따로 정한 적이 없으면 기본 갤러리 것 */
export const galleryCatsOf = (s: BoardSettings, secId: string): BoardBadge[] =>
  (secId === MAIN_SEC ? s.galleryCats : s.secGalleryCats?.[secId] ?? s.galleryCats);

/** 그 갤러리의 말머리를 담은 patch — 기본 갤러리면 예전 자리에 그대로 저장한다 */
const galleryCatsPatch = (s: BoardSettings, secId: string, cats: BoardBadge[]): Partial<BoardSettings> =>
  (secId === MAIN_SEC ? { galleryCats: cats } : { secGalleryCats: { ...s.secGalleryCats, [secId]: cats } });

export function useBoardSettings() {
  const [st, setSt] = useState<BoardSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = getRawSetting(KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<BoardSettings>;
        setSt({
          /* **저장된 값을 먼저 펼친다** — 예전에는 아는 칸 넷만 골라 새 객체를 만들어서,
             나중에 늘어난 칸(갤러리별 말머리 `secGalleryCats`)이 읽을 때마다 조용히 사라졌다.
             저장은 되는데 새로고침하면 없어지는 형태라 원인을 찾기 어렵다 (v2.0) */
          ...DEFAULTS,
          ...p,
          system: DEFAULT_BOARD_SYSTEM.map(d => p.system?.find(s => s.id === d.id) ?? d),
          cats: p.cats ?? DEFAULT_BOARD_CATS,
          gallery: DEFAULT_GALLERY_BADGES.map(d => p.gallery?.find(g => g.id === d.id) ?? d),
          galleryCats: p.galleryCats ?? DEFAULT_GALLERY_CATS,
        });
      }
    } catch { /* 기본값 */ }
    setLoaded(true);
  }, []);
  const apply = useCallback((fn: (s: BoardSettings) => BoardSettings) => {
    setSt(s => {
      const n = fn(s);
      try { setSetting(KEY, n); } catch { /* 무시 */ }
      return n;
    });
  }, []);
  const patchSystem = useCallback((id: string, p: Partial<BoardBadge>) =>
    apply(s => ({ ...s, system: s.system.map(b => (b.id === id ? { ...b, ...p } : b)) })), [apply]);
  const patchCat = useCallback((id: string, p: Partial<BoardBadge>) =>
    apply(s => ({ ...s, cats: s.cats.map(b => (b.id === id ? { ...b, ...p } : b)) })), [apply]);
  const addCat = useCallback(() =>
    apply(s => ({ ...s, cats: [...s.cats, { id: newId(), label: '새 말머리', bg: '#eef0f2', border: '#d7dae0', fg: '#5d636d' }] })), [apply]);
  const removeCat = useCallback((id: string) =>
    apply(s => ({ ...s, cats: s.cats.filter(b => b.id !== id) })), [apply]);
  const setCats = useCallback((cats: BoardBadge[]) => apply(s => ({ ...s, cats })), [apply]);
  const patchGallery = useCallback((id: string, p: Partial<BoardBadge>) =>
    apply(s => ({ ...s, gallery: s.gallery.map(b => (b.id === id ? { ...b, ...p } : b)) })), [apply]);
  /* 갤러리 말머리 — 게시판 말머리와 같은 방식으로 추가·수정·삭제·정렬 (v2.0).
     **갤러리마다 따로** 가질 수 있다 (v2.0 사용자 요청) — 첫 인자가 어느 갤러리인지다.
     보고 있는 갤러리 것만 건드리므로 다른 갤러리 말머리가 지워지지 않는다. */
  const mutGalleryCats = useCallback((secId: string, fn: (cats: BoardBadge[]) => BoardBadge[]) =>
    apply(s => ({ ...s, ...galleryCatsPatch(s, secId, fn(galleryCatsOf(s, secId))) })), [apply]);
  const patchGalleryCat = useCallback((secId: string, id: string, p: Partial<BoardBadge>) =>
    mutGalleryCats(secId, cs => cs.map(b => (b.id === id ? { ...b, ...p } : b))), [mutGalleryCats]);
  const addGalleryCat = useCallback((secId: string) =>
    mutGalleryCats(secId, cs => [...cs, { id: newId(), label: '새 말머리', bg: '#eef0f2', border: '#d7dae0', fg: '#5d636d' }]), [mutGalleryCats]);
  const removeGalleryCat = useCallback((secId: string, id: string) =>
    mutGalleryCats(secId, cs => cs.filter(b => b.id !== id)), [mutGalleryCats]);
  const setGalleryCats = useCallback((secId: string, cats: BoardBadge[]) =>
    mutGalleryCats(secId, () => cats), [mutGalleryCats]);
  return {
    st, loaded, patchSystem, patchCat, addCat, removeCat, setCats, patchGallery,
    patchGalleryCat, addGalleryCat, removeGalleryCat, setGalleryCats,
  };
}

/** 게시글의 뱃지 결정 — 공지/비밀 우선, 그 외 말머리 매칭(라벨 기준·미등록 말머리는 중립색) */
export function badgeFor(st: BoardSettings, p: { notice?: boolean; secret?: boolean; category: string }, cats?: BoardBadge[]): BoardBadge {
  if (p.notice) return st.system[0];
  if (p.secret) return st.system[1];
  return (cats ?? st.cats).find(c => c.label === p.category)
    ?? { id: 'etc', label: p.category, bg: '#eef0f2', border: '#d7dae0', fg: '#5d636d' };
}

/* ---------- 게시판 다중 생성 (5.2 v1.9) ---------- */
// 같은 유형(리스트형) 게시판을 여러 개 — 게시판별 이름·말머리·권한·리스트 스킨(기본형/티켓형).
// 글은 ohome.board.v1 한 곳에 boardId로 구분 저장(게시판 삭제 시에도 글 데이터는 보존 — 3장 원칙).
export type BoardSkin = 'list' | 'ticket';
export type BoardPerm = 'guest' | 'member' | 'admin';

export interface Board {
  id: string;              // 'main' = 기본 게시판 (삭제 불가)
  name: string;            // 메뉴·페이지 타이틀 표시명
  desc: string;            // 페이지 설명 기본 문구
  skin: BoardSkin;         // 리스트 스킨 — 기본형 / 티켓형
  permWrite: BoardPerm;    // 글쓰기 권한 (mock 단계에선 로그인 전제 — 로드뷰와 동일)
  permComment: BoardPerm;  // 댓글 권한
  cats: BoardBadge[];      // 게시판별 말머리
  fg?: string;             // 목록 글씨색 (v1.9 — 미지정이면 테마 기본색)
}

const BOARDS_KEY = 'ohome.boards.v1';
export const MAIN_BOARD_ID = 'main';

export const DEFAULT_BOARDS: Board[] = [{
  id: MAIN_BOARD_ID, name: '리스트',
  desc: 'MD / HTML 작성 지원 · 스크립트 실행 불허 · 말머리 · 비밀글 · 접기',
  skin: 'list', permWrite: 'member', permComment: 'member', cats: DEFAULT_BOARD_CATS,
}];

export function useBoards(): {
  boards: Board[]; setBoards: (next: Board[]) => void; loaded: boolean;
  patchBoard: (id: string, p: Partial<Board>) => void;
} {
  const [boards, setSt] = useState<Board[]>(DEFAULT_BOARDS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = getRawSetting(BOARDS_KEY);
      if (raw) setSt(JSON.parse(raw));
      else {
        // 마이그레이션 — 구 전역 말머리(boardset.cats)를 기본 게시판으로 승계
        const old = getRawSetting(KEY);
        if (old) {
          const cats = (JSON.parse(old) as Partial<BoardSettings>).cats;
          if (cats?.length) setSt([{ ...DEFAULT_BOARDS[0], cats }]);
        }
      }
    } catch { /* 기본값 */ }
    setLoaded(true);
    const sync = () => {
      try {
        const raw = getRawSetting(BOARDS_KEY);
        if (raw) setSt(JSON.parse(raw));
      } catch { /* 무시 */ }
    };
    window.addEventListener('ohome-boards', sync);
    return () => window.removeEventListener('ohome-boards', sync);
  }, []);
  const setBoards = useCallback((next: Board[]) => {
    setSt(next);
    try { setSetting(BOARDS_KEY, next); } catch { /* 무시 */ }
    // 상단바 메뉴가 같은 탭에서 즉시 갱신되도록
    setTimeout(() => window.dispatchEvent(new Event('ohome-boards')), 0);
  }, []);
  const patchBoard = useCallback((id: string, p: Partial<Board>) => {
    setSt(s => {
      const n = s.map(b => (b.id === id ? { ...b, ...p } : b));
      try { setSetting(BOARDS_KEY, n); } catch { /* 무시 */ }
      setTimeout(() => window.dispatchEvent(new Event('ohome-boards')), 0);
      return n;
    });
  }, []);
  return { boards, setBoards, loaded, patchBoard };
}

/** 게시판 목록 페이지 경로 — 기본 게시판은 쿼리 없이 */
export const boardHref = (id: string) => (id === MAIN_BOARD_ID ? '/board' : `/board?b=${id}`);

/** 게시판 뱃지 스타일 — 알약형, 텍스트 정중앙 (배경까지 함께 칠해 글씨만 튀지 않게)
 *  한글 잉크는 폰트박스 위쪽에 몰려 line-height:1이면 위로 쏠려 보임 (v1.9 실측 보정) —
 *  line-height 11px + 위3/아래2 비대칭 패딩으로 잉크 중심 = 뱃지 중심, 총높이 18px 정수 */
export function boardBadgeStyle(b?: BoardBadge): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '3px 11px 2px', borderRadius: 999, lineHeight: 'calc(11px*var(--fs,1))',
    background: b?.bg ?? '#eef0f2', border: `1px solid ${b?.border ?? '#d7dae0'}`, color: b?.fg ?? '#5d636d',
    fontSize: 'calc(10.5px*var(--fs,1))', fontWeight: 700, letterSpacing: '.05em',
    fontFamily: 'var(--sans)', whiteSpace: 'nowrap',
  };
}
import type React from 'react';
import { getRawSetting, setSetting } from './settingStore';
