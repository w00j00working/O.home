'use client';
// 사이트 설정 저장 계층 (v2.0)
//
// 테마·메뉴·폰트·로고·메인 위젯 배치 같은 값은 "관리자가 정하고 방문자 모두가 보는" 값이다.
// 지금까지는 브라우저(localStorage)에만 있어서, 공개 홈에서는 방문자가 기본 테마를 보게 된다.
// → 서버 모드에서는 DB(site_settings / settings)에 저장하고, 앱 시작 때 한 번에 받아 캐시한다.
//
// 각 스토어는 렌더 도중 동기적으로 값을 읽으므로, ServerBoot가 화면을 그리기 전에
// primeSettings()로 캐시를 채운다. 이후 읽기는 전부 동기(캐시)라 기존 코드 모양이 유지된다.
// 쓰기는 캐시 → localStorage(첫 페인트용 사본) → DB 순으로 나간다.
import { backend, isServerMode } from './backend';

const cache = new Map<string, unknown>();
let primed = false;
const EVT = 'ohome-settings';
/** 서버 저장 실패 알림 — SettingSync가 받아 화면에 띄운다 */
export const ERR_EVT = 'ohome-setting-error';

/** 브라우저에만 두는 값 — 접힘 상태·세션·연결 설정처럼 사람마다 다른 것 */
const LOCAL_ONLY = new Set<string>([
  'ohome.bgm.fold', 'ohome.mockuser.v1', 'ohome.server.v1', 'ohome.setup.v1',
  'ohome.themeCss.v1',   // 첫 페인트용 파생 캐시 (원본은 ohome.theme.v2)
  'ohome.notif.v1',      // 알림 목록은 사람별
  /* 알림 on/off도 사람별 — 서버 사이트 설정이 아니다 (v2.0 포크 제보 — 「새로고침마다 꺼짐」).
     예전에 서버 설정 키로 잘못 분류돼 백업 복원 때 서버에 한 번 올라가면, 매 접속마다
     그 옛 값이 로컬 토글을 덮어써 아무리 바꿔도 되돌아갔다. 설정 쓰기는 관리자 전용이라
     일반 회원은 서버에 고칠 수도 없다 — 알림 목록과 같은 기기 보관으로 되돌린다. */
  'ohome.notifset.v1',
]);

/** 이 키는 기기 보관 전용인가 — 백업 복원·이전이 서버로 올리지 않게 (v2.0) */
export const isLocalOnlySetting = (key: string) => LOCAL_ONLY.has(key);

/**
 * 서버로 올라가는 사이트 설정 키 — **이 목록에 있는 것만 설정으로 취급한다.**
 * `ohome.*` 전체를 훑으면 글 목록 같은 콘텐츠 키(ohome.board.v1 등)까지 설정으로 오인해
 * 「서버에 올리지 않은 설정」이 헛되이 뜨고, 올리기를 누르면 글 배열이 설정 테이블에 들어간다.
 * 백업(lib/transfer)도 같은 목록을 쓴다.
 */
export const SETTING_KEYS = [
  'ohome.theme.v2', 'ohome.themePresets.v1', 'ohome.fonts.v2', 'ohome.menuset.v1', 'ohome.site.v1',
  'ohome.pagetext.v1', 'ohome.cursor.v1', 'ohome.bgm.v1', 'ohome.boardset.v1', 'ohome.boards.v1',
  'ohome.commset.v1', 'ohome.memoset.v1', 'ohome.threadset.v1', 'ohome.trpgset.v1',
  'ohome.relqsets.v1', 'ohome.main.v1', 'ohome.sched.v1',
  'ohome.membertags.v1', 'ohome.invite.v1', 'ohome.roadnext.v1', 'ohome.repo.v1',
  'ohome.sections.v1', 'ohome.intro.v1', 'ohome.links.v1',
];

/** 앱 시작 시 1회 — 서버에 저장된 설정을 전부 받아 캐시 */
export async function primeSettings(): Promise<void> {
  primed = true;
  const be = backend();
  if (!be) return;
  try {
    const all = await be.fetchAllSettings();
    Object.entries(all).forEach(([k, v]) => {
      // 기기 보관 전용 키는 서버 값이 남아 있어도 받지 않는다 (v2.0 포크 제보) —
      // 옛 백업 복원으로 서버에 올라간 알림 on/off가 매 접속마다 로컬 토글을 덮어썼다
      if (LOCAL_ONLY.has(k)) return;
      // null = 지워진 값(초기화가 그렇게 저장한다). 캐시에 담으면 화면이 기본값 대신
      // null을 받아 깨지므로 아예 없는 것으로 둔다.
      if (v == null) {
        cache.delete(k);
        try { localStorage.removeItem(k); } catch { /* 무시 */ }
        return;
      }
      cache.set(k, v);
      // 첫 페인트를 위해 로컬에도 사본을 둔다 (다음 방문 때 깜빡임 감소)
      try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 무시 */ }
    });
  } catch {
    /* 규칙·네트워크 문제면 로컬 값으로 동작 */
  }
}

export function settingsPrimed(): boolean { return primed; }

/** 동기 읽기 — 서버 캐시 > localStorage > 기본값 */
export function getSetting<T>(key: string, fallback: T): T {
  // null·undefined는 "지워진 값"으로 보고 기본값으로 돌아간다 —
  // 초기화가 설정을 null로 저장하는데 그대로 돌려주면 화면이 기본값 대신 null을 받아 깨진다.
  // (false·0·''은 정상값이므로 != null 로만 거른다)
  const cached = cache.get(key);
  if (cached != null) return cached as T;
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return (parsed == null ? fallback : parsed) as T;   // 예전에 저장된 "null" 문자열도 방어
    } catch {
      // 예전에 문자열을 그대로 저장한 값(가입코드 등) 호환
      return (typeof fallback === 'string' ? raw : fallback) as T;
    }
  } catch { /* 무시 */ }
  return fallback;
}

/** 문자열 그대로 저장된 값(구버전 호환)용 — JSON이 아니어도 읽는다 */
export function getRawSetting(key: string): string | null {
  const v = cache.get(key);
  if (v != null) return typeof v === 'string' ? v : JSON.stringify(v);
  try {
    const raw = localStorage.getItem(key);
    return raw === 'null' ? null : raw;   // 지워진 값이 "null" 문자열로 남아 있던 경우 방어
  } catch { return null; }
}

/** 저장 — 캐시·로컬 사본·DB 순. DB 저장 실패는 조용히 무시(로컬은 남는다) */
export function setSetting(key: string, value: unknown): void {
  cache.set(key, value);
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 무시 */ }
  if (isServerMode() && !LOCAL_ONLY.has(key)) {
    // 실패를 삼키면 이 브라우저에는 남아 저장된 것처럼 보이다가, 다음 접속에 서버 값으로
    // 덮여 "저장했는데 원래대로 돌아가는" 증상이 된다 — 실패는 화면으로 알린다.
    void backend()?.saveSetting(key, value).catch(err => {
      console.error('[ohome] 설정 저장 실패', key, err);
      try {
        window.dispatchEvent(new CustomEvent(ERR_EVT, {
          detail: { key, message: (err as { message?: string })?.message ?? '' },
        }));
      } catch { /* 무시 */ }
    });
  }
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: key })); } catch { /* 무시 */ }
}

export function removeSetting(key: string): void {
  cache.delete(key);
  try { localStorage.removeItem(key); } catch { /* 무시 */ }
  if (isServerMode() && !LOCAL_ONLY.has(key)) {
    void backend()?.saveSetting(key, null).catch(() => { /* 무시 */ });
  }
}

/** 다른 화면에서 같은 설정을 바꿨을 때 알림 */
export function onSettingChange(cb: (key: string) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent).detail as string);
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}

/** 이 브라우저에 꾸며 둔 설정을 서버로 올리기 (연결 직후 1회 — 환경설정에서 호출) */
export async function pushLocalSettings(keys: string[]): Promise<number> {
  const be = backend();
  if (!be) return 0;
  let n = 0;
  for (const k of keys) {
    if (LOCAL_ONLY.has(k)) continue;
    try {
      const raw = localStorage.getItem(k);
      if (raw == null) continue;
      await be.saveSetting(k, JSON.parse(raw));
      cache.set(k, JSON.parse(raw));
      n += 1;
    } catch { /* 개별 실패는 건너뜀 */ }
  }
  return n;
}

/**
 * 이 브라우저에만 있고 서버에는 없는 설정 키.
 *
 * 설치 화면에서 DB를 먼저 연결한 보통의 경우에는 설정이 바뀔 때마다 서버로 나가므로 항상 빈 배열이다.
 * 로컬(브라우저 저장)으로 먼저 꾸민 뒤에 서버를 붙인 경우에만 값이 남고, 그때만 「설정 올리기」가 필요하다.
 * 캐시는 primeSettings가 서버에서 받아 채운 것이라 "서버에 있는가"의 기준이 된다.
 */
export function unsyncedSettingKeys(): string[] {
  if (!isServerMode()) return [];
  const out: string[] = [];
  try {
    for (const k of SETTING_KEYS) {
      if (LOCAL_ONLY.has(k) || cache.has(k)) continue;
      if (localStorage.getItem(k) != null) out.push(k);
    }
  } catch { /* 무시 */ }
  return out;
}
