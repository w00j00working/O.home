'use client';
// 폰트 라이브러리 (5.1) — 내장(구글폰트) + 웹폰트 URL 등록
// 내장 폰트도 삭제·수정 가능 — 원하는 폰트만 남길 수 있음. 삭제된 폰트를 쓰던 기존 데이터는
// familyOf가 전체 풀에서 계속 해석하므로 표시가 깨지지 않음.
// 캐릭터 프로필·자관 이름·시나리오 타이틀 등에서 선택해 사용 (4.4, 4.5, 4.3)
// TODO(후속): 폰트 파일 업로드(woff2 등) · 영문/한글 페어링 저장
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { newId } from './postStore';
import { putBlob, getBlob } from './blobStore';
import { getRawSetting, setSetting } from './settingStore';

export interface FontDef {
  id: string;
  name: string;        // 표시명
  family: string;      // CSS font-family 값
  gfont?: string;      // 구글폰트 패밀리 쿼리 (내장)
  cssUrl?: string;     // 웹폰트 CSS URL (직접 등록 또는 내장 수정)
  builtin?: boolean;
  locked?: boolean;    // 사이트 기본 폰트 — 삭제 불가 (폴백 스택이라 URL 없음)
  fileId?: string;     // 업로드한 폰트 파일 (IndexedDB — woff2/woff/ttf/otf, v1.9)
  fileName?: string;   // 업로드 파일 이름 (목록 표시용)
  pairId?: string;     // 영문 폰트일 때 한글 폴백 페어 — 목록의 다른 폰트 id (v1.9)
}

/** 「기본」·「기본 세리프」의 family는 var(--sans)/var(--serif)인데, 그 두 변수는 **역할 폰트가
 *  덮어쓰는 자리**다. 그대로 쓰면 「기본 세리프」가 「지금 타이틀에 지정된 폰트」를 뜻하게 된다
 *  (v2.0 사용자 발견 — 「기본 세리프가 내가 업로드한 폰트를 계속 잡아」).
 *  원본 스택(--sans-base/--serif-base)으로 풀어 그 별칭 고리를 끊는다. */
export const deVarFamily = (fam: string): string =>
  (fam === 'var(--sans)' ? 'var(--sans-base)' : fam === 'var(--serif)' ? 'var(--serif-base)' : fam);

export const BUILTIN_FONTS: FontDef[] = [
  { id: 'default', name: '기본 (프리텐다드)', family: 'var(--sans)', builtin: true, locked: true },
  { id: 'serif', name: '기본 세리프 (Cormorant + Noto Serif KR)', family: 'var(--serif)', builtin: true, locked: true },
  { id: 'notoserif', name: 'Noto Serif KR', family: "'Noto Serif KR', serif", builtin: true },
  { id: 'gowun', name: '고운바탕', family: "'Gowun Batang', serif", gfont: 'Gowun+Batang:wght@400;700', builtin: true },
  { id: 'nanummj', name: '나눔명조', family: "'Nanum Myeongjo', serif", gfont: 'Nanum+Myeongjo:wght@400;700', builtin: true },
  { id: 'songmyung', name: '송명', family: "'Song Myung', serif", gfont: 'Song+Myung', builtin: true },
  { id: 'dohyeon', name: '도현', family: "'Do Hyeon', sans-serif", gfont: 'Do+Hyeon', builtin: true },
  { id: 'blackhan', name: '검은고딕', family: "'Black Han Sans', sans-serif", gfont: 'Black+Han+Sans', builtin: true },
  // 눈누식 CSS URL 등록 예시 (v1.9 사용자 요청) — 목록에서 URL·family 형식을 그대로 참고
  { id: 'nanumsqneo', name: '나눔스퀘어 네오 (눈누식 예시)', family: "'NanumSquareNeo', sans-serif",
    cssUrl: 'https://hangeul.pstatic.net/hangeul_static/css/nanum-square-neo.css', builtin: true },
];

/** 폰트가 실제로 로드되는 CSS URL — 내장 구글폰트는 gfont 쿼리에서 파생 */
export function fontCssUrl(f: FontDef): string | undefined {
  if (f.cssUrl) return f.cssUrl;
  if (f.gfont) return `https://fonts.googleapis.com/css2?family=${f.gfont}&display=swap`;
  return undefined;
}

const STORAGE_KEY = 'ohome.fonts.v2';
const LEGACY_KEY = 'ohome.fonts.v1'; // 구버전: 커스텀 폰트 배열만 저장

/** 사이트 역할 폰트 (환경설정 > 디자인) — 폰트 + 굵기 + 크기 배율 (폰트별 체감 크기 보정) */
export type FontRole = 'title' | 'pagetitle' | 'subtitle' | 'logosub' | 'menu' | 'dropdown' | 'body';
/** 드롭다운 역할의 특수값 — 메뉴 폰트를 그대로 따라감 (기본) */
export const FOLLOW_MENU = '_menu';
/** 메뉴 타이틀 역할의 특수값 — 타이틀 폰트를 그대로 따라감 (기본) */
export const FOLLOW_TITLE = '_title';
export interface RoleSetting {
  id: string;        // 폰트 id
  weight?: number;   // 굵기 (300/400/700) — 없으면 역할별 기본
  scale?: number;    // 크기 % (기본 100)
}
// desc는 선택 — 굳이 설명이 필요 없는 역할은 비워 둔다 (v2.0 사용자 요청: 메뉴 타이틀 폰트 설명 제거)
export const ROLE_LABEL: Record<FontRole, { label: string; desc?: string }> = {
  title: { label: '타이틀 폰트', desc: '배너 캡션 등 세리프 자리 전체' },
  pagetitle: { label: '메뉴 타이틀 폰트' },
  subtitle: { label: '서브타이틀 폰트', desc: '타이틀 아래 설명 문구' },
  logosub: { label: '로고 서브타이틀 폰트', desc: '상단바 로고 아랫줄 문구 — TRPG 티켓 하단 문구도 따라감' },
  menu: { label: '메뉴 폰트', desc: '상단 메뉴' },
  dropdown: { label: '드롭다운 폰트', desc: '하위메뉴 드롭다운 — 기본은 메뉴 폰트를 따라감' },
  body: { label: '본문 폰트', desc: '사이트 기본 글꼴 — 별도 폰트를 지정하지 않은 모든 텍스트' },
};
const DEFAULT_ROLES: Record<FontRole, RoleSetting> = {
  title: { id: 'serif' }, pagetitle: { id: FOLLOW_TITLE }, subtitle: { id: 'default' },
  logosub: { id: 'default' },
  menu: { id: 'default' }, dropdown: { id: FOLLOW_MENU }, body: { id: 'default' },
};

interface FontState {
  custom: FontDef[];
  hidden: string[];                              // 삭제(숨김)된 내장 폰트 id
  overrides: Record<string, Partial<FontDef>>;   // 내장 폰트 수정값 (name/family/cssUrl)
  roles: Record<FontRole, RoleSetting>;          // 역할 → 폰트/굵기/크기
}

const EMPTY: FontState = { custom: [], hidden: [], overrides: {}, roles: DEFAULT_ROLES };

/** 저장값 정규화 — 구버전(역할=문자열 id)도 수용 */
function normRoles(raw?: Record<string, unknown>): Record<FontRole, RoleSetting> {
  const out = { ...DEFAULT_ROLES };
  if (!raw) return out;
  (Object.keys(DEFAULT_ROLES) as FontRole[]).forEach(r => {
    const v = raw[r];
    if (typeof v === 'string') out[r] = { id: v };
    else if (v && typeof v === 'object') out[r] = { ...DEFAULT_ROLES[r], ...(v as RoleSetting) };
  });
  return out;
}

interface FontCtx {
  fonts: FontDef[];                              // 선택 목록 (숨김 제외 · 수정 반영)
  hiddenCount: number;
  roles: Record<FontRole, RoleSetting>;          // 드래프트가 있으면 드래프트 (미리보기)
  setRole: (role: FontRole, patch: Partial<RoleSetting>) => void;  // 드래프트에만 — SAVE로 확정 (v1.9)
  rolesDirty: boolean;                           // 역할 폰트에 저장 안 된 변경 존재
  saveRoles: () => void;                         // 역할 폰트 드래프트 → 실제 저장
  discardRoles: () => void;                      // 역할 폰트 드래프트 폐기
  addFont: (name: string, family: string, cssUrl: string, pairId?: string) => boolean;
  addFontFile: (name: string, file: File, pairId?: string) => Promise<boolean>;  // 파일 업로드 등록 (v1.9)
  setFontPair: (id: string, pairId?: string) => void;                            // 한글 페어 지정/해제 (v1.9)
  updateFont: (id: string, patch: { name: string; family: string; cssUrl: string }) => boolean;
  removeFont: (id: string) => void;              // 내장이면 숨김, 커스텀이면 삭제
  resetFont: (id: string) => void;               // 내장 폰트 수정값 초기화 (v2.0)
  restoreBuiltins: () => void;                   // 숨긴 내장 폰트 전부 복원
  familyOf: (id?: string) => string | undefined; // 숨긴 폰트도 해석 (기존 데이터 보호)
}

const Ctx = createContext<FontCtx | null>(null);

function ensureLink(id: string, href: string) {
  const ex = document.getElementById(id) as HTMLLinkElement | null;
  if (ex) { if (ex.href !== href) ex.href = href; return; }
  const l = document.createElement('link');
  l.id = id; l.rel = 'stylesheet'; l.href = href;
  document.head.appendChild(l);
}

export function FontProvider({ children }: { children: React.ReactNode }) {
  const [st, setSt] = useState<FontState>(EMPTY);
  // 역할 폰트 드래프트 (v1.9) — 디자인 탭 SAVE 통합: 변경은 미리보기로만, SAVE로 확정
  const [draftRoles, setDraftRoles] = useState<Record<FontRole, RoleSetting> | null>(null);
  const roles = draftRoles ?? st.roles;

  useEffect(() => {
    try {
      const raw = getRawSetting(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<FontState>;
        setSt({ ...EMPTY, ...p, roles: normRoles(p.roles as Record<string, unknown> | undefined) });
        return;
      }
      const legacy = getRawSetting(LEGACY_KEY);
      if (legacy) setSt({ ...EMPTY, custom: JSON.parse(legacy) });
    } catch { /* 무시 */ }
  }, []);

  // 수정값 반영된 내장 + 커스텀 (전체 풀 — familyOf 용)
  const pool: FontDef[] = [
    ...BUILTIN_FONTS.map(f => ({ ...f, ...(st.overrides[f.id] ?? {}) })),
    ...st.custom,
  ];
  const fonts = pool.filter(f => !st.hidden.includes(f.id));

  // 웹폰트 로드 — 수정 안 된 내장 구글폰트는 한 번에, 나머지는 URL별로
  useEffect(() => {
    const plain = BUILTIN_FONTS.filter(f => f.gfont && !st.overrides[f.id]?.cssUrl);
    const gf = plain.map(f => `family=${f.gfont}`).join('&');
    if (gf) ensureLink('ohome-gfonts', `https://fonts.googleapis.com/css2?${gf}&display=swap`);
    pool.forEach(f => { if (f.cssUrl) ensureLink(`ohome-font-${f.id}`, f.cssUrl); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st]);

  // 업로드 폰트 파일 로드 (v1.9) — IndexedDB blob → FontFace 등록 (폰트당 1회)
  const loadedFiles = useRef<Set<string>>(new Set());
  useEffect(() => {
    pool.forEach(f => {
      if (!f.fileId || loadedFiles.current.has(f.id)) return;
      loadedFiles.current.add(f.id);
      /* 서버 모드의 파일은 저장소 공개 URL — **폰트는 CORS 강제 자원**이라 저장소가 허용 헤더를
         안 주면 직접 로드가 조용히 거부된다 (v2.0 사용자 제보 — 「등록한 폰트가 적용이 안 돼요」,
         화면 전체가 폴백 세리프로 남던 원인). 같은 출처 중계(/api/font)로 받아 CORS를 피한다 */
      if (/^https?:/.test(f.fileId)) {
        const face = new FontFace(f.family, `url("/api/font?u=${encodeURIComponent(f.fileId)}")`);
        face.load().then(fc => document.fonts.add(fc)).catch(() => { /* 접근 불가 — 폴백 렌더 */ });
        return;
      }
      getBlob(f.fileId).then(b => {
        if (!b) return;
        const face = new FontFace(f.family, `url(${URL.createObjectURL(b)})`);
        face.load().then(fc => document.fonts.add(fc)).catch(() => { /* 손상 파일 — 폴백 렌더 */ });
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st]);

  // 역할 폰트 적용 — 패밀리(--sans/--serif/--font-menu/--font-subtitle) + 굵기(--fw-*) + 크기 배율(--fs-*)
  // 원본 스택은 --sans-base/--serif-base에 보존
  useEffect(() => {
    // '기본'류(family가 var(--sans)/var(--serif))는 원본 스택으로 풀어 순환 참조 방지.
    // 페어(pairId)가 있으면 "영문 폰트, 한글 페어" 스택으로 합성 (v1.9)
    const deVar = deVarFamily;
    /* 지정한 폰트가 사라졌으면 **그 역할의 기본값**으로 (v2.0 사용자 발견 — 「폰트를 지우니
       기본 세리프체가 이상해졌다」). 예전에는 무조건 `var(--sans-base)`로 떨어져,
       타이틀처럼 세리프여야 할 자리가 소리 없이 고딕이 됐다. 내장 폰트는 지워도 pool에 남아
       (숨김일 뿐) 여기 걸리지 않는다 — 직접 등록했다 지운 폰트만 해당된다. */
    const resolve = (id: string, role?: FontRole): string => {
      if (id === FOLLOW_MENU) return 'var(--font-menu)';   // 드롭다운: 메뉴 폰트 따라감
      if (id === FOLLOW_TITLE) return 'var(--serif)';      // 메뉴 타이틀: 타이틀 폰트 따라감
      const f = pool.find(x => x.id === id);
      if (!f) {
        const back = role ? DEFAULT_ROLES[role].id : 'default';
        // 기본값이 또 「따라가기」이거나 자기 자신이면 더 파고들지 않는다 (무한 재귀 방지)
        return back === id ? 'var(--sans-base)' : resolve(back);
      }
      const p = f.pairId ? pool.find(x => x.id === f.pairId) : undefined;
      return p ? `${deVar(f.family)}, ${deVar(p.family)}` : deVar(f.family);
    };
    const root = document.documentElement.style;
    root.setProperty('--sans', resolve(roles.body.id, 'body'));
    root.setProperty('--serif', resolve(roles.title.id, 'title'));
    root.setProperty('--font-menu', resolve(roles.menu.id, 'menu'));
    root.setProperty('--font-dropdown', resolve(roles.dropdown.id, 'dropdown'));
    root.setProperty('--font-pagetitle', resolve(roles.pagetitle.id, 'pagetitle'));
    root.setProperty('--font-subtitle', resolve(roles.subtitle.id, 'subtitle'));
    root.setProperty('--font-logosub', resolve(roles.logosub.id, 'logosub'));
    (Object.keys(roles) as FontRole[]).forEach(r => {
      const cfg = roles[r];
      root.setProperty(`--fs-${r}`, String((cfg.scale ?? 100) / 100));
      if (cfg.weight) root.setProperty(`--fw-${r}`, String(cfg.weight));
      else root.removeProperty(`--fw-${r}`); // 역할별 기본 굵기로
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, draftRoles]);

  const persist = (next: FontState) => {
    try { setSetting(STORAGE_KEY, next); } catch { /* 무시 */ }
  };
  const apply = (fn: (s: FontState) => FontState) =>
    setSt(s => { const next = fn(s); persist(next); return next; });

  const addFont = useCallback((name: string, family: string, cssUrl: string, pairId?: string): boolean => {
    if (!name.trim() || !family.trim()) return false;
    apply(s => ({
      ...s,
      custom: [...s.custom, {
        id: newId(), name: name.trim(), family: family.trim(),
        cssUrl: cssUrl.trim() || undefined, pairId: pairId || undefined,
      }],
    }));
    return true;
  }, []);

  // 폰트 파일 업로드 등록 (v1.9) — family는 자동 부여(upfont-id), 영문 폰트면 한글 페어 지정 가능
  const addFontFile = useCallback(async (name: string, file: File, pairId?: string): Promise<boolean> => {
    if (!name.trim()) return false;
    const fileId = await putBlob(file);
    const id = newId();
    apply(s => ({
      ...s,
      custom: [...s.custom, {
        id, name: name.trim(), family: `upfont-${id}`,
        fileId, fileName: file.name, pairId: pairId || undefined,
      }],
    }));
    return true;
  }, []);

  const setFontPair = useCallback((id: string, pairId?: string) => {
    apply(s => BUILTIN_FONTS.some(f => f.id === id)
      ? { ...s, overrides: { ...s.overrides, [id]: { ...s.overrides[id], pairId } } }
      : { ...s, custom: s.custom.map(f => (f.id === id ? { ...f, pairId } : f)) });
  }, []);

  const updateFont = useCallback((id: string, patch: { name: string; family: string; cssUrl: string }): boolean => {
    if (!patch.name.trim() || !patch.family.trim()) return false;
    const p = { name: patch.name.trim(), family: patch.family.trim(), cssUrl: patch.cssUrl.trim() || undefined };
    apply(s => BUILTIN_FONTS.some(f => f.id === id)
      // 통째로 덮어쓰면 한글 페어가 조용히 사라진다 — 기존 값 위에 얹는다 (v2.0)
      ? { ...s, overrides: { ...s.overrides, [id]: { ...s.overrides[id], ...p } } }
      : { ...s, custom: s.custom.map(f => (f.id === id ? { ...f, ...p } : f)) });
    return true;
  }, []);

  const removeFont = useCallback((id: string) => {
    apply(s => {
      const builtin = BUILTIN_FONTS.some(f => f.id === id);
      const base = builtin
        ? { ...s, hidden: s.hidden.includes(id) ? s.hidden : [...s.hidden, id] }
        : { ...s, custom: s.custom.filter(f => f.id !== id) };
      // 내장은 목록에서 숨겨질 뿐 정의가 남으므로(기존 데이터 보호) 가리키던 자리를 건드리지 않는다
      if (builtin) return base;
      /* 직접 등록한 폰트는 **정의째 사라진다** — 그것을 가리키던 자리를 함께 정리한다
         (v2.0 사용자 발견: 「직접 등록한 폰트를 지웠더니 기본 세리프가 망가졌다」).
         한글 페어로 물려 있으면 없는 짝을 계속 들고 있게 되고, 목록에는 사라진 이름이
         그대로 남아 무엇이 적용된 것인지 알 수 없게 된다. */
      const custom = base.custom.map(f => (f.pairId === id ? { ...f, pairId: undefined } : f));
      const overrides = Object.fromEntries(
        Object.entries(base.overrides).map(([k, v]) => [k, v.pairId === id ? { ...v, pairId: undefined } : v]),
      ) as FontState['overrides'];
      // 역할이 그 폰트를 쓰고 있었으면 그 역할의 기본값으로 (안 그러면 지정이 허공을 가리킨다)
      const roles = Object.fromEntries((Object.keys(base.roles) as FontRole[]).map(r =>
        [r, base.roles[r].id === id ? { ...base.roles[r], id: DEFAULT_ROLES[r].id } : base.roles[r]]),
      ) as Record<FontRole, RoleSetting>;
      return { ...base, custom, overrides, roles };
    });
  }, []);

  /** 내장 폰트를 처음 상태로 (v2.0 사용자 발견) — 수정값(overrides)을 지운다.
   *  잘못 들어간 값(엉뚱한 family·없는 페어)을 되돌릴 방법이 UI에 아예 없었다. */
  const resetFont = useCallback((id: string) => {
    apply(s => {
      const { [id]: _drop, ...rest } = s.overrides;
      return { ...s, overrides: rest };
    });
  }, []);

  const restoreBuiltins = useCallback(() => apply(s => ({ ...s, hidden: [] })), []);

  // 역할 폰트는 드래프트에만 반영 (v1.9) — 디자인 탭 SAVE로 확정
  const setRole = useCallback((role: FontRole, patch: Partial<RoleSetting>) =>
    setDraftRoles(d => {
      const base = d ?? st.roles;
      return { ...base, [role]: { ...base[role], ...patch } };
    }), [st.roles]);
  const rolesDirty = draftRoles !== null && JSON.stringify(draftRoles) !== JSON.stringify(st.roles);
  const saveRoles = useCallback(() => {
    setDraftRoles(d => {
      if (d) apply(s => ({ ...s, roles: d }));
      return null;
    });
  }, []);
  const discardRoles = useCallback(() => setDraftRoles(null), []);

  // 페어(pairId) 반영 스택 — 영문 폰트를 골라도 한글은 페어 폰트로 렌더 (v1.9)
  const familyOf = useCallback((id?: string) => {
    const f = pool.find(x => x.id === id);
    if (!f) return undefined;
    const p = f.pairId ? pool.find(x => x.id === f.pairId) : undefined;
    // 원본 스택으로 풀어 준다 — 안 그러면 「기본 세리프」가 지금 타이틀 폰트를 뜻하게 된다 (v2.0)
    return p ? `${deVarFamily(f.family)}, ${deVarFamily(p.family)}` : deVarFamily(f.family);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st]);

  return (
    <Ctx.Provider value={{
      fonts, hiddenCount: st.hidden.length, roles, setRole, rolesDirty, saveRoles, discardRoles,
      addFont, addFontFile, setFontPair, updateFont, removeFont, resetFont, restoreBuiltins, familyOf,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useFonts(): FontCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFonts must be used within FontProvider');
  return ctx;
}
