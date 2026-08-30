// 그림 로드뷰(4.10)·그림백업(4.11)·TRPG 백업(4.3) 데이터 — localStorage (→ Supabase/R2 이전 예정)
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { Comment, FoldType } from './postStore';
import type { CropValue } from '@/components/ui/CropEditor';
import type { Visibility } from './charStore';
import { getRawSetting, setSetting } from './settingStore';

/* ---------- 로드뷰 (4.10) ---------- */
export interface RoadItem {
  /** 소속 섹션 (v2.0) — 여러 개로 만들었을 때. 없으면 기본 섹션 */
  secId?: string;
  id: string;
  title: string;
  author: string;
  authorId: string;
  date: string;              // ISO
  imgUrl?: string;           // (구) URL — 새 업로드는 imgId 사용
  imgId?: string;            // IndexedDB 파일 id (blobStore — 새로고침에도 유지)
  ph: string;                // 데모 플레이스홀더 클래스
  narrow?: boolean;          // 원본 가로가 좁은 이미지 (가운데 정렬)
  ratio: string;             // aspect-ratio 값
  fold: { type: FoldType; label?: string } | null;
  comments: Comment[];
  no?: number;               // 그림 번호 (v1.9 — 제목 대신 번호로 식별, 알림도 번호 기준)
}

export const ROAD_SEED: RoadItem[] = [];

/* ---------- 그림백업 (4.11) ---------- */
export interface BackupPost {
  /** 소속 섹션 (v2.0) — 여러 개로 만들었을 때. 없으면 기본 섹션 */
  secId?: string;
  id: string;
  title: string;
  type: 'log' | 'single' | 'vlist';    // 로그형(틈 없이 세로) / 단일형(좌우 넘김) / 단일 세로정렬(갭 있는 세로, v1.9)
  images: string[];          // 파일 id 또는 URL (비어 있으면 데모 ph — blobStore 참조)
  thumbCrop?: CropValue;     // 대표(첫) 이미지의 썸네일 크롭 (6.1)
  phList: string[];          // 데모 플레이스홀더
  desc: string;
  category: string;          // 말머리
  madeDate?: string;         // 제작일 (선택)
  date: string;
  author: string;
  authorId: string;
  visibility: Visibility;
  fold: { type: FoldType; label?: string } | null;
  /** 태그 (v2.0 사용자 요청) — 목록·카드에 나열되고 검색에 걸린다 */
  tags?: string[];
}

export const BACKUP_SEED: BackupPost[] = [];

export const BACKUP_CATEGORIES = ['합작', '낙서', '커미션', '설정화'];

/* ---------- TRPG 백업 (4.3) ---------- */
export interface TrpgLog {
  /** 소속 섹션 (v2.0) — 여러 개로 만들었을 때. 없으면 기본 섹션 */
  secId?: string;
  id: string;
  no: number;                // 내부 순번 (정렬용 — 자동 부여)
  noText?: string;           // № 자리 표시 텍스트 (선택 — 비우면 자동 № 0XX)
  title: string;             // 시나리오 타이틀 (필수)
  catchphrase?: string;      // 캐치프레이즈 한 줄 (선택)
  writer: string;            // 라이터 (필수)
  withText: string;          // 같이 간 사람 표기 (필수)
  relId?: string;            // 자관 연동 (필터)
  date?: string;             // 선택
  ph: string;
  thumbUrl?: string;
  thumbId?: string;          // 업로드 썸네일 (IndexedDB)
  thumbCrop?: CropValue;     // 썸네일 크롭 좌표 (6.1)
  thumbColor?: { c1: string; c2?: string }; // 이미지 없을 때 단색/그라데이션
  serifTitle?: boolean;      // 타이틀 폰트 개별 지정 예시 (폰트 라이브러리는 후속)
  visibility: Visibility;
  password?: string;         // 열람 비밀번호 (선택) — 권한이 없어도 비밀번호로 열람 가능
  // 목록 표시 여부 (v2.0 사용자 요청) — 접근권한(누가 열 수 있는지)과는 별개로, 목록에 줄이 뜰지만 정하는
  // 스위치. 나만보기(private)여도 이걸 켜지 않으면 관리자 목록에서 사라지지 않는다 — 반대로 이걸 켜면
  // 전체공개여도 목록에서만 빠지고 직접 링크로는 그대로 열린다. 관리자는 편집모드에서 숨김 표시로 계속 본다
  listHidden?: boolean;
  // (구버전 호환, v2.0) — 예전엔 본문이 이 문서에 그대로 있었다. 서버 모드에서 목록 문서는
  // listHidden으로 질의 단계부터 공개될 수 있어(metaOf), 본문처럼 민감한 내용을 같이 두면 새어 나간다
  // (list 권한이 있으면 같은 문서의 get도 함께 열리는 Firestore/RLS 특성 — 나만보기+목록표시가 이래서
  // 처음엔 안전하게 동작하지 않았다). 그래서 새 로그부터는 본문을 TrpgLogBody로 분리 저장하고,
  // 이 필드들은 아직 옮겨지지 않은 옛 로그를 읽을 때만 fallback으로 남겨 둔다 — 그런 로그를 한 번이라도
  // 수정해 저장하면 자동으로 분리되고 이 필드들은 비워진다.
  body?: string;
  bodyId?: string;
  bodyHtml?: boolean;
  originalFileId?: string;
  originalName?: string;
}

/** TRPG 로그 본문 — 목록 문서(TrpgLog)와 분리 저장 (v2.0, 위 주석 참조).
 *  id는 로그와 같은 값을 쓴다. visibility는 로그의 실제 열람 권한을 그대로 복사해 이 문서 자체의
 *  질의 조건으로 삼는다 — 목록 노출(listHidden)과 완전히 무관하게, 이 문서만 따로 보호된다. */
export interface TrpgLogBody {
  id: string;
  body: string;
  bodyId?: string;
  bodyHtml?: boolean;
  originalFileId?: string;
  originalName?: string;
  visibility: Visibility;
  /** 어느 로그 백업 소속인지 (v2.0) — 목록 문서와 따로 저장되므로 소속도 따로 들고 있어야
   *  「메뉴가 비공개면 글도 비공개로」 판정이 본문 문서에도 걸린다. 없으면 기본 섹션. */
  secId?: string;
}

/** 본문 문서에 적을 열람 권한 — 비밀번호가 걸려 있으면 목록 필터가 예전부터 그래 왔듯 공개로 둔다
 *  (비밀번호는애초에 Firestore 규칙 단계에서 검증할 수 없어 클라이언트 확인용일 뿐이었다) */
export const bodyVisibility = (l: { visibility: Visibility; password?: string }): Visibility =>
  l.password ? 'public' : l.visibility;

export const TRPG_BODY_SEED: TrpgLogBody[] = [];

/** № 자리 표시 — 직접 입력한 텍스트가 있으면 그대로, 없으면 자동 № 0XX */
export const logNo = (l: TrpgLog) => l.noText || `№ ${String(l.no).padStart(3, '0')}`;

/** 본문이 HTML 문서인지 자동 판별 (4.3 — 확장자와 무관하게 내용 기준).
 *  직접 쓴 글에 태그처럼 보이는 문자가 섞이면 오판할 수 있으므로, 로그에 `bodyHtml`이
 *  지정돼 있으면 그 값이 우선한다(수정 화면의 「본문 표시」에서 지정). */
export const isHtmlBody = (s: string) => /<\s*(html|body|div|p|span|table|br|style|font)[^>]*>/i.test(s);

/** 이 로그를 HTML로 그릴지 — 지정값이 있으면 그대로, 없으면 내용으로 판별 */
export const showAsHtml = (l: { bodyHtml?: boolean }, body: string) => l.bodyHtml ?? isHtmlBody(body);

/** 로그 파일 인코딩 자동 판별 — UTF-8 우선, 깨짐 문자가 많으면 EUC-KR 재시도 (구형 로그 툴 대응) */
export async function decodeLogText(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf);
  const bad = (utf8.match(/�/g) || []).length;
  if (bad > 2) {
    try { return new TextDecoder('euc-kr').decode(buf); } catch { return utf8; }
  }
  return utf8;
}

/**
 * 로그 본문 저장 위치 결정.
 *
 * 서버 모드에서 본문을 Storage에 파일로 올리면, 다시 읽을 때 fetch가 필요해
 * **버킷 CORS 설정을 해야만** 본문이 보인다(설정 전에는 빈 본문처럼 보인다).
 * 본문은 텍스트라 문서에 그대로 담는 편이 안전하다 — 다만 Firestore 문서 상한이 1MB라
 * 아주 큰 로그만 파일로 보관한다(그 경우에는 CORS 설정이 필요하다).
 */
export async function saveLogBody(text: string): Promise<{ body: string; bodyId?: string }> {
  if (!text) return { body: '' };
  const { isServerMode } = await import('./backend');
  const { putBlob } = await import('./blobStore');
  const bytes = new TextEncoder().encode(text).length;
  if (isServerMode() && bytes < 700_000) return { body: text };
  return { body: '', bodyId: await putBlob(new Blob([text], { type: 'text/plain' })) };
}

/* ---------- TRPG 도토리 (4.15) — 시나리오 위시리스트 ---------- */
export type DotoriStatus = 'pledge' | 'undecided' | 'confirmed' | 'done';
export const DOTORI_STATUS_LABEL: Record<DotoriStatus, string> = {
  pledge: '공수표', undecided: '일정 미정', confirmed: '일정 확정', done: '완',
};

/* ---------- TRPG 설정 (환경설정 > TRPG 탭, v1.9) — 상태 카테고리 라벨 + 뱃지 색 ---------- */
export interface DotoriStatusStyle { label: string; bg: string; border: string; fg: string }
export interface TrpgSettings {
  statuses: Record<DotoriStatus, DotoriStatusStyle>;
}
export const DEFAULT_TRPG_SETTINGS: TrpgSettings = {
  statuses: {
    // 기존 하드코딩 뱃지 색 계승 (pledge: 반투명 잉크 → hex 근사 / confirmed: 포인트 레드)
    pledge: { label: '공수표', bg: '#23262b', border: '#b9bdc4', fg: '#ffffff' },
    undecided: { label: '일정 미정', bg: '#7a8089', border: '#7a8089', fg: '#ffffff' },
    confirmed: { label: '일정 확정', bg: '#a63a45', border: '#a63a45', fg: '#ffffff' },
    done: { label: '완', bg: '#3c434d', border: '#3c434d', fg: '#ffffff' },
  },
};

// 일정미정이 공수표보다 먼저 오게 (v2.0 사용자 요청)
export const DOTORI_STATUS_KEYS: DotoriStatus[] = ['undecided', 'pledge', 'confirmed', 'done'];

/** 도토리 상태 뱃지 스타일 (카드 우상단 — 공수표/일정 확정만 표시) */
export function dotoriBadgeStyle(st: DotoriStatusStyle): CSSProperties {
  return { background: st.bg, border: `1px solid ${st.border}`, color: st.fg };
}

const TRPG_SET_KEY = 'ohome.trpgset.v1';

export function useTrpgSettings(): [TrpgSettings, (patch: Partial<TrpgSettings>) => void, boolean] {
  const [st, setSt] = useState<TrpgSettings>(DEFAULT_TRPG_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = getRawSetting(TRPG_SET_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<TrpgSettings>;
        setSt({ statuses: { ...DEFAULT_TRPG_SETTINGS.statuses, ...(p.statuses ?? {}) } });
      }
    } catch { /* 기본값 */ }
    setLoaded(true);
  }, []);
  const patch = useCallback((p: Partial<TrpgSettings>) => {
    setSt(s => {
      const n = { ...s, ...p };
      try { setSetting(TRPG_SET_KEY, n); } catch { /* 무시 */ }
      return n;
    });
  }, []);
  return [st, patch, loaded];
}

export interface DotoriItem {
  /** 소속 섹션 (v2.0) — 여러 개로 만들었을 때. 없으면 기본 섹션 */
  secId?: string;
  id: string;
  name: string;              // 시나리오 이름 (필수)
  writer: string;            // 라이터
  rule: string;              // 룰(시스템)
  people: string;            // 인원 표기
  tags: string[];            // 태그 (복수)
  link?: string;             // 판매처/소개 페이지
  status: DotoriStatus;      // 카드에서 바로 전환
  imgId?: string;            // 16:9 이미지 (IndexedDB)
  thumbCrop?: CropValue;
  ph: string;                // 이미지 없을 때 플레이스홀더
  date: string;              // 등록일 ISO (정렬용)
}

export const DOTORI_SEED: DotoriItem[] = [];

/* ---------- TRPG 플레이기록 (4.16) — 표 형식 ---------- */
export interface PlayRecord {
  /** 소속 섹션 (v2.0) — 여러 개로 만들었을 때. 없으면 기본 섹션 */
  secId?: string;
  id: string;
  date?: string;             // Date (optional — 비우면 표 맨 아래)
  scenario: string;          // Scenario (필수)
  scenarioLink?: string;     // 시나리오 링크 — 표에서 이름 클릭 시 새 탭
  writer: string;
  withText: string;          // With
  role: string;              // PL·GM·HO1 등 짧은 표기
  playtime: string;          // 4h 30m 등 자유 표기
  url?: string;              // Url (optional) — 클립 아이콘, 새 탭
  logId?: string;            // 내 홈 로그 백업 연결 (모바일: Playtime 밑줄)
}

export const PLAYLOG_SEED: PlayRecord[] = [];

export const TRPG_SEED: TrpgLog[] = [];
