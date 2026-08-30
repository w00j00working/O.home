'use client';
// 커미션 (4.18) — 커미션 목록 · 상태 뱃지 · 슬롯 · 신청자 리스트 · 커미션 설정
// 저장: localStorage (→ Supabase 이전 예정)
import { useCallback, useEffect, useState } from 'react';
import type { CropValue } from '@/components/ui/CropEditor';
import type { Visibility } from './charStore';

/* ---------- 상태 뱃지 ---------- */
export interface CommBadge { id: string; label: string; bg: string; border: string; fg: string }

/** 기본 커미션 뱃지 3종 (4.18 — 모집중 스틸블루 / 마감 차콜 / 준비중 뮤트골드) · 고정 제공 */
export const DEFAULT_COMM_BADGES: CommBadge[] = [
  { id: 'open', label: '모집중', bg: '#4c6a8e', border: '#3d5674', fg: '#ffffff' },
  { id: 'closed', label: '마감', bg: '#3c434d', border: '#30363f', fg: '#c6cad1' },
  { id: 'ready', label: '준비중', bg: '#b39b6b', border: '#9a8459', fg: '#ffffff' },
];

/** 기본 신청자 리스트 뱃지 3종 (커미션 뱃지와 색 변수 별도) */
export const DEFAULT_APPLY_BADGES: CommBadge[] = [
  { id: 'wait', label: '대기', bg: '#8a8f98', border: '#767b84', fg: '#ffffff' },
  { id: 'working', label: '작업중', bg: '#4c6a8e', border: '#3d5674', fg: '#ffffff' },
  { id: 'done', label: '완료', bg: '#3c434d', border: '#30363f', fg: '#c6cad1' },
];

/* ---------- 커미션 ---------- */
/* 커미션 양식 (v1.9) — 신청 시 받을 항목: 텍스트 / 단일 선택 / 다중 선택 / 이미지 첨부 */
export type CommFormFieldType = 'text' | 'single' | 'multi' | 'image';
export interface CommFormField {
  id: string;
  type: CommFormFieldType;
  label: string;         // 질문
  desc?: string;         // 질문 보조 설명 (선택)
  required?: boolean;    // 필수 답변
  options?: string[];    // 단일/다중 선택지
  multiple?: boolean;    // 이미지 첨부 — 여러 장 허용 (기본 한 장)
}

export type SlotMode = 'shared' | 'included' | 'own'; // 통합 / 개별(통합 포함) / 개별(독립)
export type SlotShape = 'circle' | 'square' | 'diamond';
export const SLOT_CHARS: Record<SlotShape, { filled: string; empty: string }> = {
  circle: { filled: '●', empty: '○' },
  square: { filled: '■', empty: '□' },
  diamond: { filled: '◆', empty: '◇' },
};

export interface CommItem {
  /** 소속 섹션 (v2.0) — 여러 개로 만들었을 때. 없으면 기본 섹션 */
  secId?: string;
  id: string;
  name: string;
  sub: string;                 // 서브 타이틀
  badgeId: string;             // 상태 뱃지
  priceMin: number; priceMax: number;
  deadlineNote: string;        // 마감일 기준 문구
  slotMode: SlotMode;
  slotTotal: number; slotUsed: number;   // 개별 슬롯 (shared 모드에선 미사용)
  slotShape: SlotShape;
  slotColor: string;           // 채움 색
  contactUrl?: string;         // 문의 링크 (편지봉투)
  images: string[];            // blob id 목록 (첫 장 = 대표/썸네일)
  thumbCrop?: CropValue;
  /** 상세 썸네일 줄에서 각 이미지가 어느 부분을 보여 줄지 (v2.0 사용자 요청 — 우클릭 「썸네일 위치」).
   *  줄의 칸은 4:3인데 세로로 긴 그림은 가운데가 잘려 얼굴이 안 보이는 일이 많다.
   *  **이미지 참조를 키로** 둔다 — 순서를 바꿔도 각자 잡아 둔 위치가 그대로 따라간다 */
  stripCrops?: Record<string, CropValue>;
  ph: string;
  descHtml: string;            // HTML+MD 겸용 에디터 결과 (격리 새니타이즈 렌더)
  titleFontId: string; bodyFontId: string;   // 커미션별 폰트 (4.18 v1.9)
  themeMode: 'site' | 'custom'; themeColor?: string; // 페이지 테마컬러
  themeTone?: 'dark' | 'light';                      // 테마컬러의 다크/라이트 느낌
  form?: CommFormField[];      // 커미션 양식 (v1.9) — 신청 시 받을 항목
  formEnabled?: boolean;       // 양식 사용함/사용안함 — 사용함일 때만 상세에 작성 폼 표시
  date: string;
}

export const COMM_SEED: CommItem[] = [];

/* ---------- 신청자 리스트 ---------- */
export interface Applicant {
  id: string;
  deadline?: string;           // YYYY-MM-DD — 맨 앞 크게 표시
  badgeId: string;             // 대기/작업중/완료
  name: string;                // 신청자 이름 전체 (관리자에게만 전체 표시)
  nameOpen?: number;           // 마스킹 없이 공개할 앞 글자 수 (기본 1) — 비권한자는 나머지 * 처리
  source?: string;             // 출처 — 커미션을 받은 곳 (옾카 · 크레페 등, 선택)
  appliedDate?: string;        // 신청일
  commId?: string;             // 신청 커미션 종류
  content: string;             // 내용
  contentVis?: 'private' | 'self' | 'public'; // 내용 공개범위 — 관리자만/본인 열람 허용/전체공개 (v1.9)
  selfId?: string;             // 본인 열람 허용일 때 지정된 회원 id (미지정 구버전 데이터는 로그인 회원 허용)
  allowSelf?: boolean;         // (구) 본인 열람 허용 — contentVis 마이그레이션용
  submitFileId?: string;       // 신청자가 제출한 신청서 HTML 파일 (선택, v1.9 — blob 저장·격리 렌더)
  trashedAt?: string;          // 휴지통에 넣은 시각 (ISO) — 목록에서 감춰지고 보관 기간이 지나면 사라진다 (v2.0)
}

/** 휴지통에 들어가 있는가 (v2.0) */
export const inTrash = (a: Applicant) => !!a.trashedAt;

/** 보관 기간이 지난 신청 — 자동으로 지울 대상 (v2.0) */
export function trashExpired(apps: Applicant[], days: number, now = Date.now()): Applicant[] {
  const keep = Math.max(1, days) * 86400000;
  return apps.filter(a => {
    if (!a.trashedAt) return false;
    const t = Date.parse(a.trashedAt);
    return Number.isFinite(t) && now - t > keep;
  });
}

/** 휴지통에 남은 날짜 — 0이면 오늘 사라진다 (v2.0) */
export function trashLeft(a: Applicant, days: number, now = Date.now()): number {
  const t = Date.parse(a.trashedAt ?? '');
  if (!Number.isFinite(t)) return days;
  return Math.max(0, Math.ceil((t + Math.max(1, days) * 86400000 - now) / 86400000));
}

/** 내용 공개범위 — 구 allowSelf 저장분 자동 해석 */
export const applyVis = (a: Applicant): 'private' | 'self' | 'public' =>
  a.contentVis ?? (a.allowSelf ? 'self' : 'private');

export const APPLY_VIS_LABEL: Record<'private' | 'self' | 'public', string> = {
  private: '내용 비공개 — 관리자만', self: '내용 비공개 — 본인 열람 허용', public: '내용 전체공개',
};

/** 리치 에디터 HTML → 툴팁용 일반 텍스트 (태그 제거 + 요약) */
export function plainPreview(html: string, max = 80): string {
  const t = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** 신청자 이름 마스킹 — 앞 open글자 공개 + 나머지 * (비권한자 표시용) */
export function maskName(name: string, open = 1): string {
  const t = name.trim();
  const n = Math.max(0, open);
  if (t.length <= n) return t;
  return t.slice(0, n) + '*'.repeat(t.length - n);
}

export const APPLY_SEED: Applicant[] = [];

/* ---------- 커미션 설정 (환경설정 > 커미션 탭) ---------- */
export interface CommSettings {
  ratio: '3:4' | '4:3';        // 갤러리 썸네일 비율 (갤러리 단위 일괄)
  badgeShape: 'round' | 'pill';
  totalSlot: number;           // 전체(통합) 슬롯 수
  totalUsed: number;           // 통합 슬롯 사용 수 (수동 갱신 — 4.18)
  commBadges: CommBadge[];
  applyBadges: CommBadge[];
  applyVisibility: Visibility; // 신청자 리스트 공개범위
  trashDays: number;           // 신청 휴지통 보관 기간(일) — 지나면 자동으로 사라짐 (v2.0)
  slotDisplay?: 'used' | 'remain'; // 슬롯을 「채워진 수」로 볼지 「남은 수」로 볼지 (v2.0 — 운영 방식마다 다름)
}

export const DEFAULT_COMM_SETTINGS: CommSettings = {
  ratio: '3:4', badgeShape: 'pill', totalSlot: 5, totalUsed: 2,
  commBadges: DEFAULT_COMM_BADGES, applyBadges: DEFAULT_APPLY_BADGES,
  applyVisibility: 'public', trashDays: 30, slotDisplay: 'used',
};

const SET_KEY = 'ohome.commset.v1';

export function useCommSettings(): [CommSettings, (patch: Partial<CommSettings>) => void, boolean] {
  const [st, setSt] = useState<CommSettings>(DEFAULT_COMM_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = getRawSetting(SET_KEY);
      if (raw) setSt({ ...DEFAULT_COMM_SETTINGS, ...JSON.parse(raw) });
    } catch { /* 기본값 */ }
    setLoaded(true);
  }, []);
  const patch = useCallback((p: Partial<CommSettings>) => {
    setSt(s => {
      const n = { ...s, ...p };
      try { setSetting(SET_KEY, n); } catch { /* 무시 */ }
      return n;
    });
  }, []);
  return [st, patch, loaded];
}

/* ---------- 헬퍼 ---------- */
export const fmtPrice = (n: number) => n.toLocaleString('ko-KR');

/** 표시 잔여 슬롯 (4.18 포함형 규칙: min(개별 잔여, 통합 잔여)) → {remain, total} */
export function slotView(c: CommItem, s: CommSettings): { remain: number; total: number; used: number } {
  // 표시는 「채워진/전체」(v1.9 사용자 확정) — remain은 신청 가능 여부·툴팁용
  const sharedRemain = Math.max(0, s.totalSlot - s.totalUsed);
  if (c.slotMode === 'shared') return { remain: sharedRemain, total: s.totalSlot, used: s.totalUsed };
  const ownRemain = Math.max(0, c.slotTotal - c.slotUsed);
  if (c.slotMode === 'included') return { remain: Math.min(ownRemain, sharedRemain), total: c.slotTotal, used: c.slotUsed };
  return { remain: ownRemain, total: c.slotTotal, used: c.slotUsed };
}

/** 슬롯 표시 숫자 (v2.0) — 채워진 기준이면 3/5, 남은 기준이면 2/5 */
export function slotCount(sv: { remain: number; total: number; used: number }, s: CommSettings): number {
  return (s.slotDisplay ?? 'used') === 'remain' ? sv.remain : sv.used;
}

/** 슬롯 툴팁 문구 — 표시 기준과 반대쪽 숫자를 알려 준다 (v2.0) */
export function slotTip(sv: { remain: number; total: number; used: number }, s: CommSettings): string {
  return (s.slotDisplay ?? 'used') === 'remain'
    ? `채워진 슬롯은 ${sv.used}개 입니다`
    : `현재 남은 슬롯은 ${sv.remain}개 입니다`;
}

/** 뱃지 스타일 (모양은 설정, 텍스트는 항상 정중앙 — 4.18) */
export function badgeStyle(b: CommBadge | undefined, shape: 'round' | 'pill'): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    // 한글 잉크 세로 보정 (v1.9 실측 + 사용자 미세조정) — line-height 11px, 아래 패딩 +1
    padding: '4px 12px', borderRadius: shape === 'pill' ? 999 : 7,
    background: b?.bg ?? '#3c434d', border: `1px solid ${b?.border ?? '#30363f'}`, color: b?.fg ?? '#fff',
    fontSize: 'calc(10.5px*var(--fs,1))', fontWeight: 700, letterSpacing: '.06em', lineHeight: 'calc(11px*var(--fs,1))',
    fontFamily: 'var(--sans)', textAlign: 'center', whiteSpace: 'nowrap',
    boxShadow: '0 2px 8px rgba(0,0,0,.18)',
  };
}
import type React from 'react';
import { getRawSetting, setSetting } from './settingStore';
