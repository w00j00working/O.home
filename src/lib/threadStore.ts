'use client';
// 감상타래 (4.17) — 작품 단위 타래 데이터 + 분류·기본 보기 설정 (localStorage → Supabase 이전 예정)
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { CropValue } from '@/components/ui/CropEditor';
import type { Visibility } from './charStore';
import { getRawSetting, setSetting } from './settingStore';
import { MAIN_SEC } from './sectionStore';

/* ---------- 타래 데이터 ---------- */
export interface ThreadPost {
  id: string;
  text: string;
  images: string[];          // IndexedDB 파일 id — 최대 4장 (1장=와이드, 2~4장=격자)
  phList?: string[];         // 데모 플레이스홀더 (시드 전용)
  date: string;              // ISO 작성 시각
  /** 접기 (v2.0 사용자 요청 — 스포일러 1차 쿠션). 게시판 글 접기(6.2)와 같은 모양:
   *  spoiler/adult는 정해진 문구, custom은 label을 그대로 보여 준다. 없으면 바로 보인다. */
  fold?: { type: 'spoiler' | 'adult' | 'custom'; label?: string } | null;
}

export interface ThreadWork {
  /** 소속 섹션 (v2.0) — 여러 개로 만들었을 때. 없으면 기본 섹션 */
  secId?: string;
  id: string;
  title: string;             // 작품명 (필수)
  titleFontId?: string;      // 작품명 폰트 개별 지정 (5.1 폰트 라이브러리)
  author: string;            // 작가/감독 이름
  authorRole?: string;       // 표기 (감독·작가 등, 선택)
  catId: string;             // 분류 (환경설정 관리 리스트)
  posterId?: string;         // 대표 이미지 (3:4 포스터형, IndexedDB)
  posterCrop?: CropValue;
  ph: string;                // 이미지 없을 때 플레이스홀더
  visibility: Visibility;
  created: string;           // 타래 시작 ISO
  posts: ThreadPost[];
}

/* ---------- 분류 + 기본 보기 설정 (4.17 — 환경설정에서 관리) ---------- */
/* 분류는 섹션(여러 개로 만든 타래)마다 따로 가질 수 있다 (v2.0 사용자 요청) */
export interface ThreadCat {
  id: string; label: string;
  // 뱃지 색 (v1.9 — 환경설정에서 지정, 미지정 시 기본 잉크 뱃지)
  bg?: string; border?: string; fg?: string;
}
export interface ThreadSettings {
  /** 기본 섹션의 분류 — 예전 저장분이 그대로 여기 있다 */
  cats: ThreadCat[];
  /** 섹션별 분류 (v2.0 사용자 요청) — 여러 개로 만든 타래는 다루는 게 달라 분류도 달라진다.
   *  **정한 적이 없으면 기본 섹션 것을 그대로 쓴다** — 섹션을 만들자마자 분류가 빈칸이 되면
   *  글부터 못 쓴다. 손대는 순간 그 섹션만의 목록이 생긴다. */
  secCats?: Record<string, ThreadCat[]>;
  defaultView: 'thread' | 'list'; // 메뉴 진입 시 먼저 보일 보기 (v1.8 확정)
}

/** 그 섹션에서 쓸 분류 (v2.0) — 따로 정한 적이 없으면 기본 섹션 것 */
export const threadCats = (s: ThreadSettings, secId: string): ThreadCat[] =>
  (secId === MAIN_SEC ? s.cats : s.secCats?.[secId] ?? s.cats);

/** 그 섹션의 분류를 담은 patch (v2.0) — 기본 섹션이면 예전 자리에 그대로 저장한다 */
export const threadCatsPatch = (
  s: ThreadSettings, secId: string, cats: ThreadCat[],
): Partial<ThreadSettings> =>
  (secId === MAIN_SEC ? { cats } : { secCats: { ...s.secCats, [secId]: cats } });

export const DEFAULT_THREAD_SETTINGS: ThreadSettings = {
  cats: [
    { id: 'book', label: '도서' },
    { id: 'movie', label: '영화' },
    { id: 'drama', label: '드라마' },
    { id: 'ani', label: '애니' },
    { id: 'manga', label: '만화' },
    { id: 'webtoon', label: '웹툰' },
    { id: 'webnovel', label: '웹소' },
  ],
  defaultView: 'thread',
};

const SET_KEY = 'ohome.threadset.v1';

export function useThreadSettings(): [ThreadSettings, (patch: Partial<ThreadSettings>) => void, boolean] {
  const [st, setSt] = useState<ThreadSettings>(DEFAULT_THREAD_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = getRawSetting(SET_KEY);
      if (raw) setSt({ ...DEFAULT_THREAD_SETTINGS, ...JSON.parse(raw) });
    } catch { /* 기본값 */ }
    setLoaded(true);
  }, []);
  const patch = useCallback((p: Partial<ThreadSettings>) => {
    setSt(s => {
      const n = { ...s, ...p };
      try { setSetting(SET_KEY, n); } catch { /* 무시 */ }
      return n;
    });
  }, []);
  return [st, patch, loaded];
}

/** 분류 라벨 — 삭제된 분류는 중립 표기 */
export const catLabel = (cats: ThreadCat[], id: string) => cats.find(c => c.id === id)?.label ?? '기타';

/** 분류 뱃지 색 스타일 — 미지정 항목은 기본 잉크 뱃지 (배경/테두리/글씨) */
export function threadBadgeStyle(cat?: ThreadCat): CSSProperties {
  return {
    background: cat?.bg ?? '#1d2025',
    border: `1px solid ${cat?.border ?? cat?.bg ?? '#1d2025'}`,
    color: cat?.fg ?? '#ffffff',
  };
}

/** 최근 글 날짜 (없으면 타래 시작일) — 리스트 정렬·표시용 */
export const lastDate = (w: ThreadWork) =>
  w.posts.length ? w.posts[w.posts.length - 1].date : w.created;

export const fmtMD = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};
export const fmtMDHM = (iso: string) => {
  const d = new Date(iso);
  return `${fmtMD(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/* ---------- 시드 (프로토타입 데모 계승) ---------- */
export const THREAD_SEED: ThreadWork[] = [];
