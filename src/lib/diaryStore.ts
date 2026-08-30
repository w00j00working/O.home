// 다이어리 (4.14) — 무드 일기 + 무드 리스트 (환경설정 관리)
import type { Visibility } from './charStore';

/* ---------- 무드 (5.2 — 환경설정에서 이름/아이콘/색 관리) ---------- */
export interface Mood {
  id: string;
  name: string;
  icon: string;      // 이모지/특수문자 1~2자
  color: string;     // 아이콘 색 (배경은 자동 틴트)
}

/** 무드는 처음부터 비어 있다 (v2.0) — 예시 4종은 프로토타입 잔재라 환경설정에서 직접 만든다 */
export const MOOD_SEED: Mood[] = [];

/* ---------- 일기 ---------- */
export interface DiaryPost {
  /** 소속 섹션 (v2.0) — 여러 개로 만들었을 때. 없으면 기본 섹션 */
  secId?: string;
  id: string;
  title: string;
  date: string;              // YYYY-MM-DD
  moodId: string;
  body: string;              // MD
  imgIds: string[];          // 첨부 이미지 (IndexedDB)
  visibility: Visibility;
}

export const DIARY_SEED: DiaryPost[] = [];

/** hex(#rrggbb) → 옅은 틴트 배경 (아이콘 원 배경용) */
export const moodTint = (hex: string) => /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}26` : 'rgba(127,127,127,.15)';
