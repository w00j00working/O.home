'use client';
// 메인 위젯 시스템 + 편집모드 상태 (기획서 4.0)
// 저장소: localStorage → 추후 Supabase site_settings 로 이전
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ConfirmModal } from '@/components/ui/Modal';
import { useAuth } from './auth';
import { getRawSetting, setSetting } from './settingStore';

export type WidgetType =
  | 'banner' | 'member'                 // 고정 요소 (삭제 불가)
  | 'menu' | 'memo' | 'diary' | 'latest'
  | 'dday' | 'todo' | 'upcoming' | 'freetext' | 'deco' | 'memoboard'
  | 'apply';   // 'image'는 deco(장식 이미지+링크)로 일원화 (v1.9) · apply = 커미션 신청자 (v2.0)

export interface WidgetConf {
  id: string;
  type: WidgetType;
  col: 1 | 2 | 3;                       // PC 배치 열
  enabled: boolean;
  fixed?: boolean;                      // 고정 요소 여부
  // 편집모드 배치값 (그리드 원점 = 첫 위치, v1.8)
  tx: number; ty: number;
  w?: number; h?: number; z?: number;
  freeMove?: boolean;   // 그리드 무시 요소 (v1.9 — 우클릭 토글, 텍스트·이미지 자유 배치용)
  mOff?: boolean;       // 모바일에서 제외 (v1.9 사용자 확정 — 토글은 모바일 표시만 제어, PC 제거는 우클릭 삭제)
  rot?: number;         // 기울기(도) — 이미지·자유 텍스트, 편집모드 왼쪽 위 핸들 드래그 (v1.9 사용자 요청)
  // PC 절대배치 좌표 (v1.9 사용자 확정 — PC 캔버스에는 문서 흐름이 없음: 겹칠 수 있고 서로 밀지 않음.
  // 흐름 스택은 모바일 뷰 전용). 기존 흐름+오프셋 배치는 최초 1회 이 좌표로 스냅샷 마이그레이션.
  ax?: number; ay?: number;
  settings: Record<string, unknown>;
}

export type LayoutMode = 'fixed' | 'fluid'; // 고정 캔버스(기본) / 반응형 (v1.9)

interface MainState {
  layoutMode: LayoutMode;
  widgets: WidgetConf[];
  mobileOrder: string[];                // 모바일 세로 나열 순서 (위젯 id)
  removedIds?: string[];                // 삭제한 기본 위젯 id — 로드 시 기본값 병합에서 되살아나지 않게 (v1.9)
}

export const WIDGET_META: Record<WidgetType, { title: string; desc: string }> = {
  banner: { title: '슬라이드 배너', desc: '고정 요소 — 최상단' },
  member: { title: '회원정보창', desc: '고정 요소 — 로그인/프로필' },
  menu: { title: '메뉴리스트', desc: '모바일 전용 — PC에서는 상단 메뉴가 대신함' },
  memo: { title: 'MEMO', desc: '관리자 메모 (클릭 시 관리 모달)' },
  diary: { title: 'DIARY', desc: '최근 일기 (무드 아이콘 · 비공개 미노출)' },
  latest: { title: 'LATEST', desc: '최신 그림 3장' },
  dday: { title: 'D-DAY', desc: '디데이 목록' },
  todo: { title: 'TO-DO', desc: '관리자 투두 (방문자는 열람만)' },
  upcoming: { title: 'UPCOMING', desc: '다가오는 일정' },
  freetext: { title: '자유 텍스트', desc: '패널 없이 문구만' },
  deco: { title: '이미지', desc: '패널 없이 이미지만' },
  memoboard: { title: 'STICKY', desc: '스티커 메모 미니보드 — 클릭 시 메모장 (4.6)' },
  apply: { title: 'COMMISSION', desc: '커미션 신청자 — 마감 빠른 순 (몇 명까지 볼지 설정)' },
};

/** 같은 종류를 여러 개 추가할 수 있는 위젯 (v1.9 사용자 확정 — 나머지는 하나만) */
export const MULTI_TYPES: WidgetType[] = ['freetext', 'deco', 'banner'];   // banner: v2.0 사용자 요청 — 슬라이드 배너 여러 개

/** 위젯 표시 이름 — 중복 추가 가능한 위젯이 2개 이상이면 번호를 붙여 구분 (v1.9) */
export function widgetLabel(widgets: WidgetConf[], w: WidgetConf): string {
  const t = WIDGET_META[w.type].title;
  if (!MULTI_TYPES.includes(w.type)) return t;
  const same = widgets.filter(x => x.type === w.type);
  return same.length > 1 ? `${t} ${same.findIndex(x => x.id === w.id) + 1}` : t;
}

// 기본 배치는 절대 좌표로 못 박음 (v1.9 사용자 피드백) — 예전에는 흐름 렌더를 측정해 스냅샷했는데
// 측정값이 위젯 최소 높이에 걸리면서 D-DAY·TO-DO가 간격 0으로 붙어버렸다. 세로 간격은 전부 10px.
const DEFAULT_STATE: MainState = {
  layoutMode: 'fixed',
  widgets: [
    // 배포 기본 — 더미 콘텐츠 없이 빈 위젯으로 시작 (v1.9)
    // 메뉴리스트는 모바일 전용(PC 숨김)이라 좌표는 의미 없음
    { id: 'menu', type: 'menu', col: 1, enabled: true, tx: 0, ty: 0, ax: 0, ay: 0, w: 230, h: 80, settings: {} },
    { id: 'memo', type: 'memo', col: 1, enabled: true, tx: 0, ty: 0, ax: 0, ay: 0, w: 230, h: 80, settings: { text: '' } },
    { id: 'banner', type: 'banner', col: 2, enabled: true, fixed: true, tx: 0, ty: 0, ax: 240, ay: 0, w: 610, h: 210, settings: {} },
    { id: 'diary', type: 'diary', col: 2, enabled: true, tx: 0, ty: 0, ax: 240, ay: 220, w: 300, h: 150, settings: {} },
    { id: 'latest', type: 'latest', col: 2, enabled: true, tx: 0, ty: 0, ax: 550, ay: 220, w: 300, h: 150, settings: {} },
    // 회원정보창은 로그인 상태 내용(프로필+버튼)에 딱 맞는 높이 — 더 키우면 아래가 비어 보임 (v1.9 사용자 확정)
    { id: 'member', type: 'member', col: 3, enabled: true, fixed: true, tx: 0, ty: 0, ax: 860, ay: 0, w: 260, h: 150, settings: {} },
    { id: 'dday', type: 'dday', col: 3, enabled: true, tx: 0, ty: 0, ax: 860, ay: 160, w: 260, h: 90, settings: { items: [] } },
    { id: 'todo', type: 'todo', col: 3, enabled: true, tx: 0, ty: 0, ax: 860, ay: 260, w: 260, h: 90, settings: { items: [] } },
    // UPCOMING은 기본 구성에서 제외 — 필요하면 [＋ 위젯]으로 추가 (v1.9: 켬/끔 대신 추가/삭제 모델)
  ],
  mobileOrder: ['menu', 'memo', 'diary', 'latest', 'dday', 'todo'],
};

const STORAGE_KEY = 'ohome.main.v1';
/** 편집모드를 지원하는 페이지 (v1.9 — 카드 그리드 드래그 정렬 포함)
 *  /trpg 로그 백업이 빠져 있던 것은 실수 — 드래그 정렬·목록 숨김 확인 모두 이 토글이 있어야 켜진다
 *  (v2.0 사용자 발견 — 목록 숨김 기능을 만들다 보니 편집모드 자체가 이 페이지에서 켜지지 않는 걸 발견) */
const EDIT_PAGES = ['/', '/comm-apply', '/chars', '/rels', '/comm', '/gallery', '/dotori', '/tchars', '/playlog', '/trpg'];
const EDIT_PAGE_NAMES = '메인 · 신청자 리스트 · 캐릭터 · 자관 · 커미션 · 갤러리 · 도토리 · TRPG 캐릭터 · 플레이기록 · TRPG 로그';

interface MainCtx {
  state: MainState;
  editOn: boolean;
  editAvailable: boolean;               // 현재 페이지에서 편집모드를 켤 수 있는지 (메뉴 노출 조건)
  gridOn: boolean;
  setGridOn: (v: boolean) => void;
  toggleEdit: () => void;               // 프로필 드롭다운의 편집모드 항목
  requestExit: (pendingHref?: string) => void; // 편집중 표시 클릭·페이지 이동 시
  guardNav: (href: string) => boolean;  // true = 이동 차단(모달 표시)
  updateWidget: (id: string, patch: Partial<WidgetConf>, opts?: { persist?: boolean }) => void;
  addWidget: (type: WidgetType, col: 1 | 2 | 3) => string;   // 새 위젯 id 반환 (v1.9)
  removeWidget: (id: string) => void;
  setLayoutMode: (m: LayoutMode) => void;
  setMobileOff: (id: string, v: boolean) => void;  // 모바일에서 제외 토글 (v1.9 — PC 제거는 우클릭 삭제)
  setMobileOrder: (ids: string[]) => void;
  saveNow: () => void;                  // 환경설정 등 편집모드 밖에서의 변경 즉시 저장
  resetMain: () => void;                // 메인 페이지를 기본 구성으로 되돌리기 (v1.9 — 즉시 저장)
}

const Ctx = createContext<MainCtx | null>(null);

export function MainStoreProvider({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<MainState>(DEFAULT_STATE);
  const [editOn, setEditOn] = useState(false);
  const [gridOn, setGridOn] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const pendingNav = useRef<string | null>(null);
  const snapshot = useRef<MainState | null>(null);

  // 로드
  useEffect(() => {
    try {
      const raw = getRawSetting(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MainState;
        // 새 위젯 타입이 추가돼도 기본값과 병합 · 제거된 'image' 위젯은 걸러냄 (v1.9 — deco로 일원화)
        // 구 enabled:false(전체 숨김)는 삭제로 이관 — 토글은 이제 모바일 표시만 제어 (v1.9 사용자 확정)
        const removed = new Set(parsed.removedIds ?? []);
        const kept: WidgetConf[] = [];
        for (const w of parsed.widgets) {
          if ((w.type as string) === 'image') continue;
          if (!w.enabled && !w.fixed) { removed.add(w.id); continue; }
          kept.push(w.enabled ? w : { ...w, enabled: true });
        }
        const ids = new Set(kept.map(w => w.id));
        // 삭제한 기본 위젯은 병합으로 되살리지 않음
        const merged = [...kept, ...DEFAULT_STATE.widgets.filter(w => !ids.has(w.id) && !removed.has(w.id))];
        setState({ ...DEFAULT_STATE, ...parsed, widgets: merged, removedIds: [...removed] });
      }
    } catch { /* 기본값 사용 */ }
  }, []);

  const persist = useCallback((s: MainState) => {
    try { setSetting(STORAGE_KEY, s); } catch { /* 무시 */ }
  }, []);

  // 고정 캔버스 body 클래스 (v1.9 — 메인은 항상 고정, 반응형 옵션 제거: PC/모바일 두 가지만)
  useEffect(() => {
    document.body.classList.toggle('main-fixed', pathname === '/');
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle('edit-on', editOn);
  }, [editOn]);

  const startEdit = useCallback(() => {
    if (window.matchMedia('(max-width:620px)').matches) {
      setNotice('모바일에서는 편집모드를 사용할 수 없습니다. PC에서 해주세요.');
      return;
    }
    if (!EDIT_PAGES.includes(pathname)) {
      setNotice(`이 페이지에서는 편집모드를 켤 수 없습니다.\n가능한 페이지: ${EDIT_PAGE_NAMES}`);
      return;
    }
    snapshot.current = JSON.parse(JSON.stringify(state));
    setEditOn(true);
  }, [pathname, state]);

  const endEdit = useCallback((save: boolean) => {
    if (save) persist(state);
    // 되돌릴 때도 저장 — 편집 중 위젯 설정 모달이 즉시 저장한 값까지 스냅샷으로 원복 (v1.9)
    else if (snapshot.current) { setState(snapshot.current); persist(snapshot.current); }
    snapshot.current = null;
    setEditOn(false);
    setGridOn(false); // 편집 종료 시 그리드 자동 해제 (v1.8)
    setExitOpen(false);
    if (pendingNav.current) {
      const t = pendingNav.current;
      pendingNav.current = null;
      router.push(t);
    }
  }, [state, persist, router]);

  const toggleEdit = useCallback(() => {
    if (!isAdmin) return;
    if (editOn) setExitOpen(true);
    else startEdit();
  }, [isAdmin, editOn, startEdit]);

  const requestExit = useCallback((pendingHref?: string) => {
    pendingNav.current = pendingHref ?? null;
    setExitOpen(true);
  }, []);

  const guardNav = useCallback((href: string) => {
    if (!editOn) return false;
    requestExit(href);
    return true;
  }, [editOn, requestExit]);

  // opts.persist: 상태 갱신과 동시에 저장 (모달 SAVE 등 — saveNow는 클로저가 이전 상태를 보므로 사용 금지)
  const updateWidget = useCallback((id: string, patch: Partial<WidgetConf>, opts?: { persist?: boolean }) => {
    setState(s => {
      const n = { ...s, widgets: s.widgets.map(w => (w.id === id ? { ...w, ...patch } : w)) };
      if (opts?.persist) persist(n);
      return n;
    });
  }, [persist]);

  const addWidget = useCallback((type: WidgetType, col: 1 | 2 | 3): string => {
    const id = `${type}-${Date.now().toString(36)}`;
    setState(s => {
      // 중복 추가 방지 (v1.9) — 이미지·자유 텍스트 외에는 종류당 하나만 (UI에서도 막지만 안전장치)
      if (!MULTI_TYPES.includes(type) && s.widgets.some(w => w.type === type)) return s;
      // 절대배치 기본 좌표 (v1.9) — 선택한 열 상단 근처, 기존 위젯들 아래
      const colX = { 1: 0, 2: 240, 3: 880 } as const;
      const maxY = Math.max(60, ...s.widgets.filter(w => w.enabled && w.col === col && w.ay != null)
        .map(w => (w.ay ?? 0) + (w.h ?? 200) + 10));
      const w: WidgetConf = {
        id, type, col, enabled: true, tx: 0, ty: 0,
        ax: colX[col], ay: maxY,
        settings: type === 'freetext' ? { text: '자유 텍스트' } : {},
      };
      return { ...s, widgets: [...s.widgets, w], mobileOrder: [...s.mobileOrder, id] };
    });
    return id;   // 추가 위젯으로 스크롤 안내용 (v1.9)
  }, []);

  const removeWidget = useCallback((id: string) => {
    setState(s => ({
      ...s,
      widgets: s.widgets.filter(w => w.id !== id || w.fixed),
      mobileOrder: s.mobileOrder.filter(x => x !== id),
      removedIds: [...(s.removedIds ?? []), id],   // 기본 위젯이면 다음 로드의 병합에서도 제외 (v1.9)
    }));
  }, []);

  const setLayoutMode = useCallback((m: LayoutMode) => {
    setState(s => { const n = { ...s, layoutMode: m }; persist(n); return n; });
  }, [persist]);

  // 토글은 모바일 표시만 제어 (v1.9 사용자 확정) — PC 메인에서 빼려면 편집모드 우클릭 삭제
  const setMobileOff = useCallback((id: string, v: boolean) => {
    setState(s => {
      const n = { ...s, widgets: s.widgets.map(w => (w.id === id ? { ...w, mOff: v } : w)) };
      persist(n); return n;
    });
  }, [persist]);

  const setMobileOrder = useCallback((ids: string[]) => {
    setState(s => { const n = { ...s, mobileOrder: ids }; persist(n); return n; });
  }, [persist]);

  const saveNow = useCallback(() => persist(state), [persist, state]);

  // 메인 페이지 기본 구성으로 되돌리기 (v1.9 사용자 요청) — 위젯 구성·배치·크기·모바일 순서 전부 초기화
  const resetMain = useCallback(() => {
    const fresh: MainState = JSON.parse(JSON.stringify(DEFAULT_STATE));
    setState(fresh);
    persist(fresh);
  }, [persist]);

  return (
    <Ctx.Provider value={{
      state, editOn, editAvailable: EDIT_PAGES.includes(pathname), gridOn, setGridOn, toggleEdit, requestExit, guardNav,
      updateWidget, addWidget, removeWidget, setLayoutMode, setMobileOff, setMobileOrder, saveNow, resetMain,
    }}>
      {children}

      {/* 편집 종료 확인 (v1.8 — 3버튼) */}
      <ConfirmModal
        open={exitOpen}
        title="편집을 종료하시겠습니까?"
        body="저장하지 않고 종료하면 이번 편집에서 바꾼 배치·크기·순서가 편집 시작 시점으로 복원됩니다."
        onClose={() => { pendingNav.current = null; setExitOpen(false); }}
        buttons={[
          { label: '저장 후 종료', kind: 'dark', onClick: () => endEdit(true) },
          { label: '저장하지 않고 종료', kind: 'ghost', onClick: () => endEdit(false) },
          { label: 'CANCEL', kind: 'ghost', onClick: () => { pendingNav.current = null; setExitOpen(false); } },
        ]}
      />

      {/* 편집모드 진입 불가 안내 (v1.9) */}
      <ConfirmModal
        open={notice !== null}
        title="편집모드"
        body={<span style={{ whiteSpace: 'pre-line' }}>{notice}</span>}
        onClose={() => setNotice(null)}
        buttons={[{ label: '확인', kind: 'dark', onClick: () => setNotice(null) }]}
      />
    </Ctx.Provider>
  );
}

export function useMainStore(): MainCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMainStore must be used within MainStoreProvider');
  return ctx;
}

/* ---------- 이미지 위젯 슬라이드 (v2.0) ---------- */

export interface DecoSlide {
  id: string;
  imgId: string;
  crop?: import('@/components/ui/CropEditor').CropValue;
  link?: string;
}

/**
 * 이미지 위젯의 장면 목록.
 * 예전에는 이미지 한 장(imgId/crop/link)만 담았다 — 그 저장분도 한 장짜리 목록으로 읽어
 * 화면·편집기가 슬라이드 하나로만 다루면 되게 한다.
 */
export function decoSlides(settings: Record<string, unknown>): DecoSlide[] {
  const list = settings.slides as DecoSlide[] | undefined;
  if (Array.isArray(list) && list.length) return list.filter(s => s?.imgId);
  const imgId = settings.imgId as string | undefined;
  if (!imgId) return [];
  return [{
    id: 'legacy',
    imgId,
    crop: settings.crop as DecoSlide['crop'],
    link: settings.link as string | undefined,
  }];
}
