'use client';
// 테마 컨텍스트 (5.1, v1.9 개정) — 모드별 독립 설정값 + 드래프트/저장 분리 + 프리셋
// · 모드 전환은 각 모드의 수정본을 불러올 뿐 리셋하지 않음
// · 포인트 자동은 기준색/톤을 "변경했을 때만" 전체 재파생
// · 변경은 즉시 미리보기(DOM)되지만 저장은 [SAVE]를 눌러야 확정 — 새로고침 시 저장본으로 복귀
// TODO(0차→): Supabase 연결 시 site_settings 테이블로 저장 위치 이동
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import {
  ThemeMode, PointTone, ThemeVars, ThemeState, ThemeStore, ThemePreset,
  DARK_THEME, DEFAULT_THEME_STORE, defaultVarsFor, derivePointTheme, themeToCssVars,
} from './theme';
import { newId } from './postStore';
import { getBlob } from './blobStore';
import { getRawSetting, setSetting } from './settingStore';

/** 페이지 배경 그라데이션 (자관별 지정, v2.0) — 색 2개 + 각도 */
export interface PageBg { g1: string; g2: string; angle: number }

interface ThemeCtx {
  /** 페이지 임시 테마 (자관·커미션 페이지 테마컬러) — 벗어나면 null로 원복, 저장되지 않음 */
  setPageTheme: (color: string | null, tone?: PointTone) => void;
  /** 페이지 배경만 따로 (v2.0 사용자 요청 — 자관별 배경 그라데이션).
   *  테마컬러(setPageTheme)가 팔레트 전체를 바꾸는 것과 달리 배경 두 색·각도만 덮어쓴다. */
  setPageBg: (bg: PageBg | null) => void;
  /** 현재(드래프트) 상태 — 기존 소비자 호환 형태 {mode, pointTone, vars} */
  state: ThemeState;
  dirty: boolean;                              // 저장 안 된 변경 존재
  setMode: (m: ThemeMode) => void;             // 모드 전환 — 그 모드의 수정본 로드 (리셋 아님)
  setPointAccent: (hex: string) => void;       // 포인트 자동: 변경 시에만 재파생
  setPointTone: (t: PointTone) => void;
  setVar: <K extends keyof ThemeVars>(key: K, value: ThemeVars[K]) => void; // 현재 모드의 수정본에 반영
  resetMode: (m: ThemeMode) => void;           // 선택 리셋 — 해당 모드만 초기값으로
  save: () => void;                            // 드래프트 → 실제 저장 (localStorage + FOUC 맵)
  discard: () => void;                         // 드래프트 폐기 → 저장본으로 복귀
  presets: ThemePreset[];
  savePreset: (name: string) => void;          // 현재 모드의 드래프트 값을 프리셋으로 저장 (즉시 저장)
  applyPreset: (id: string) => void;           // 프리셋 → 커스텀 모드에 적용 (드래프트)
  removePreset: (id: string) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);
const STORAGE_KEY = 'ohome.theme.v2';
const LEGACY_KEY = 'ohome.theme.v1';
/** 첫 페인트 전에 적용할 CSS 변수 맵 (layout.tsx 인라인 스크립트가 읽음 — FOUC 방지) */
const CSS_KEY = 'ohome.themeCss.v1';
const PRESET_KEY = 'ohome.themePresets.v1';

const normalize = (s: Partial<ThemeStore> | null | undefined): ThemeStore => ({
  ...DEFAULT_THEME_STORE,
  ...(s ?? {}),
  perMode: {
    light: { ...DEFAULT_THEME_STORE.perMode.light, ...(s?.perMode?.light ?? {}) },
    dark: { ...DEFAULT_THEME_STORE.perMode.dark, ...(s?.perMode?.dark ?? {}) },
    point: { ...DEFAULT_THEME_STORE.perMode.point, ...(s?.perMode?.point ?? {}) },
    custom: { ...DEFAULT_THEME_STORE.perMode.custom, ...(s?.perMode?.custom ?? {}) },
  },
});

function applyToDom(vars: ThemeVars) {
  const css = themeToCssVars(vars);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(css)) root.style.setProperty(k, v);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [saved, setSaved] = useState<ThemeStore>(DEFAULT_THEME_STORE);
  const [draft, setDraft] = useState<ThemeStore>(DEFAULT_THEME_STORE);
  const [presets, setPresets] = useState<ThemePreset[]>([]);
  const [pageColor, setPageColor] = useState<{ color: string; tone?: PointTone } | null>(null);
  const [pageBg, setPageBgState] = useState<PageBg | null>(null);   // 자관별 배경 (v2.0)
  const [loaded, setLoaded] = useState(false);   // 저장본 로드 전 기본 다크를 DOM에 쓰지 않기 (FOUC 방지)

  // 최초 로드 — v2 우선, 없으면 v1 마이그레이션 (기존 vars를 해당 모드의 수정본으로 승계)
  useEffect(() => {
    try {
      const raw = getRawSetting(STORAGE_KEY);
      if (raw) {
        const st = normalize(JSON.parse(raw));
        setSaved(st); setDraft(st);
        try { setSetting(CSS_KEY, themeToCssVars(st.perMode[st.mode])); } catch { /* 무시 */ }
      } else {
        const legacy = getRawSetting(LEGACY_KEY);
        if (legacy) {
          const old = JSON.parse(legacy) as { mode?: ThemeMode; pointTone?: PointTone; vars?: ThemeVars };
          const mode = old.mode ?? 'dark';
          const vars = { ...DARK_THEME, ...(old.vars ?? {}) };
          const st = normalize({
            mode, pointTone: old.pointTone ?? 'dark', pointAccent: vars.accent,
            perMode: { ...DEFAULT_THEME_STORE.perMode, [mode]: vars },
          });
          setSaved(st); setDraft(st);
          try {
            setSetting(STORAGE_KEY, st);
            setSetting(CSS_KEY, themeToCssVars(st.perMode[st.mode]));
          } catch { /* 무시 */ }
        }
      }
      const pr = getRawSetting(PRESET_KEY);
      if (pr) setPresets(JSON.parse(pr));
    } catch { /* 무시하고 기본 테마 */ }
    setLoaded(true);
  }, []);

  // 드래프트 변경 시 DOM 즉시 반영 (미리보기) — 저장은 save()에서만.
  // 로드 전에는 건드리지 않음 — 첫 페인트의 인라인 FOUC 맵을 기본 다크로 덮어써 깜빡이는 것 방지 (v1.9)
  useEffect(() => {
    if (!loaded) return;
    applyToDom(pageColor
      ? derivePointTheme(pageColor.color, pageColor.tone ?? draft.pointTone)
      : draft.perMode[draft.mode]);
    // 페이지 배경 지정 (v2.0) — 팔레트를 적용한 뒤에 배경 세 값만 덮어쓴다.
    // 이 effect가 팔레트를 다시 칠하므로 순서상 여기서 덮어야 남는다.
    const root = document.documentElement;
    if (pageBg) {
      root.style.setProperty('--bg-g1', pageBg.g1);
      root.style.setProperty('--bg-g2', pageBg.g2);
      root.style.setProperty('--bg-angle', `${pageBg.angle}deg`);
      root.style.setProperty('--bg-image', 'none');   // 사이트 배경 이미지가 덮지 않게
    }
  }, [draft, pageColor, pageBg, loaded]);

  // 배경 이미지 (v1.9) — IndexedDB 파일을 blob URL로 풀어 --bg-image 적용 (그라데이션 모드면 해제)
  useEffect(() => {
    if (!loaded) return;
    const vars = draft.perMode[draft.mode];
    const root = document.documentElement;
    if (vars.bgType === 'image' && vars.bgImageId && !pageColor && !pageBg) {
      const ref = vars.bgImageId;
      /* **주소면 그대로 쓴다** (v2.0 사용자 발견 — 「배경에 사진을 올렸는데 안 바뀐다」).
         서버 모드에서는 올린 이미지가 저장소의 공개 주소로 저장되는데, 여기서만 그것을
         `getBlob`으로 **다시 내려받아** blob 주소로 바꾸고 있었다. 그 fetch는 저장소의
         CORS 설정에 걸리면 조용히 실패한다 — 화면 어디에도 오류가 안 뜨고 배경만 안 바뀐다.
         다른 이미지들은 전부 주소를 그대로 쓰므로(useBlobUrl) 잘 나왔다. 여기만 예외였다. */
      if (/^(https?:|data:|blob:)/.test(ref)) {
        root.style.setProperty('--bg-image', `url("${ref}")`);
        return () => { root.style.removeProperty('--bg-image'); };
      }
      // 브라우저 저장(IndexedDB) 파일 id — 그때만 풀어서 blob 주소를 만든다
      let cancelled = false;
      let url: string | null = null;
      getBlob(ref).then(b => {
        if (cancelled || !b) return;
        url = URL.createObjectURL(b);
        root.style.setProperty('--bg-image', `url("${url}")`);
      });
      return () => {
        cancelled = true;
        root.style.removeProperty('--bg-image');
        if (url) URL.revokeObjectURL(url);
      };
    }
    root.style.removeProperty('--bg-image');
  }, [draft, pageColor, pageBg, loaded]);

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft]);

  const setMode = useCallback((mode: ThemeMode) =>
    setDraft(d => ({ ...d, mode })), []);

  const setPointAccent = useCallback((hex: string) =>
    setDraft(d => ({
      ...d, mode: 'point', pointAccent: hex,
      perMode: { ...d.perMode, point: derivePointTheme(hex, d.pointTone) },
    })), []);

  const setPointTone = useCallback((tone: PointTone) =>
    setDraft(d => ({
      ...d, mode: 'point', pointTone: tone,
      perMode: { ...d.perMode, point: derivePointTheme(d.pointAccent, tone) },
    })), []);

  // 세부 수정 (v1.9 확정) — 프리셋 모드(라이트/다크/포인트)에서 뭐 하나라도 바꾸면
  // 현재 보이는 값 전체를 커스텀으로 복사하며 커스텀 모드로 전환. 커스텀에서는 그대로 반영.
  // 저장은 SAVE에서 — 커스텀 값과 mode='custom'이 함께 저장됨.
  const setVar = useCallback(<K extends keyof ThemeVars>(key: K, value: ThemeVars[K]) =>
    setDraft(d => (d.mode === 'custom'
      ? { ...d, perMode: { ...d.perMode, custom: { ...d.perMode.custom, [key]: value } } }
      : {
        ...d, mode: 'custom',
        perMode: { ...d.perMode, custom: { ...d.perMode[d.mode], [key]: value } },
      })), []);

  // 선택 리셋 — 지정한 모드만 초기값으로 (드래프트, 저장은 SAVE에서)
  const resetMode = useCallback((m: ThemeMode) =>
    setDraft(d => ({
      ...d,
      perMode: { ...d.perMode, [m]: defaultVarsFor(m, d.pointAccent, d.pointTone) },
    })), []);

  const save = useCallback(() => {
    setDraft(d => {
      setSaved(d);
      try {
        setSetting(STORAGE_KEY, d);
        setSetting(CSS_KEY, themeToCssVars(d.perMode[d.mode])); // FOUC 맵 동기화
      } catch { /* quota 등 무시 */ }
      return d;
    });
  }, []);

  const discard = useCallback(() => setDraft(saved), [saved]);

  // 프리셋 — 즉시 저장 (드래프트와 무관한 별도 보관함)
  const persistPresets = (list: ThemePreset[]) => {
    setPresets(list);
    try { setSetting(PRESET_KEY, list); } catch { /* 무시 */ }
  };
  const savePreset = useCallback((name: string) => {
    setDraft(d => {
      persistPresets([...presets, { id: newId(), name, vars: d.perMode[d.mode] }]);
      return d;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presets]);
  const applyPreset = useCallback((id: string) => {
    const p = presets.find(x => x.id === id);
    if (!p) return;
    setDraft(d => ({ ...d, mode: 'custom', perMode: { ...d.perMode, custom: { ...p.vars } } }));
  }, [presets]);
  const removePreset = useCallback((id: string) =>
    persistPresets(presets.filter(p => p.id !== id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [presets]);

  const setPageTheme = useCallback((color: string | null, tone?: PointTone) =>
    setPageColor(color ? { color, tone } : null), []);
  const setPageBg = useCallback((bg: PageBg | null) => setPageBgState(bg), []);

  // 기존 소비자 호환 — state.vars = 현재 모드의 드래프트 값
  const state: ThemeState = useMemo(() => ({
    mode: draft.mode, pointTone: draft.pointTone, vars: draft.perMode[draft.mode],
  }), [draft]);

  return (
    <Ctx.Provider value={{
      state, dirty, setMode, setPointAccent, setPointTone, setVar,
      resetMode, save, discard, presets, savePreset, applyPreset, removePreset, setPageTheme, setPageBg,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
