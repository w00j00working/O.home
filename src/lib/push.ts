'use client';
// 웹푸시 (커플홈 사용자 요청 — "웹푸시 기능을 넣고 싶은데" / "정보수정에서 PC·모바일 체크해야만 알림이 가게")
//
// 구조
//  · 기기별 구독(endpoint+keys)은 콘텐츠 컬렉션 push_subs에 둔다 — 주인(authorId)은 그 회원, 공개범위 member.
//    알림을 만드는 쪽(보내는 회원)이 받는 사람의 구독을 읽어야 하므로 회원끼리는 읽힌다. 구독만으로는 아무도
//    푸시를 보낼 수 없다 — 푸시 서비스는 구독 때 쓴 공개키의 짝(개인키)으로 서명한 요청만 받는다.
//  · 개인키는 서버(Vercel 환경변수 PUSH_VAPID_PRIVATE_KEY)에만 있고 /api/push 라우트가 서명해 보낸다.
//    라우트는 호출한 사람이 이 홈의 로그인 계정인지 각 서비스의 공개 API로 확인한다.
//  · PC/모바일 구분은 기기에서 허용하는 순간 판별해 구독에 적어 둔다 (userAgentData.mobile → UA → 아이패드는 터치 여부).
//  · 켜기는 그 기기에서만(브라우저 권한 창), 끄기는 어디서든 (구독의 on만 내린다 — 서버가 건너뛴다).
//  · 손님(비로그인)이 남긴 댓글·방명록은 푸시가 안 간다 — 손님은 구독을 읽을 수 없고 라우트도 거부한다. 종 알림은 그대로.
import { backend, isServerMode } from './backend';
import { fetchList, syncList } from './db';
import { currentUserId } from './currentUser';
import { getSetting } from './settingStore';

export const PUSH_KEY = 'ohome.pushsubs.v1';
export type PushKind = 'pc' | 'mobile';
export interface PushSub {
  id: string;
  userId: string;
  kind: PushKind;
  label: string;                       // "Android · Chrome" 같은 기기 이름
  endpoint: string;
  keys: { p256dh: string; auth: string };
  on: boolean;                         // 체크 상태 — 꺼져 있으면 서버가 건너뛴다
  /** 알림에 내용을 숨긴다 (잠금 화면 등에 글 내용이 보이지 않게) — 종류만 적은 일반 문구로 보낸다. 받는 사람이 정하고 자기 구독 전부에 적는다 */
  hide?: boolean;
  createdAt: string;
  authorId: string;                    // = userId (서버 규칙: 주인만 고치고 지운다)
  visibility: 'member';                // 회원끼리 읽힌다 (보내는 쪽이 받는 사람 구독을 읽어야 한다)
  [k: string]: unknown;                // O.home의 ListItem 제약 (fetchList/syncList) 충족
}

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);   // 아이패드는 맥인 척한다
}

/** 홈 화면에 추가해 연 상태인지 — 아이폰은 이때만 웹푸시가 된다 */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function deviceKind(): PushKind {
  if (typeof navigator === 'undefined') return 'pc';
  const uad = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uad && typeof uad.mobile === 'boolean') return uad.mobile ? 'mobile' : 'pc';
  if (isIos()) return 'mobile';
  return /Android|Mobile|webOS|BlackBerry|Opera Mini|IEMobile/i.test(navigator.userAgent) ? 'mobile' : 'pc';
}

export function deviceLabel(): string {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent;
  const os = /iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'iPad'
    : /iPhone|iPod/.test(ua) ? 'iPhone'
    : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows'
    : /Mac/.test(ua) ? 'Mac'
    : /Linux/.test(ua) ? 'Linux' : '기기';
  const br = /Whale\//.test(ua) ? 'Whale'
    : /Edg\//.test(ua) ? 'Edge'
    : /SamsungBrowser\//.test(ua) ? 'Samsung'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Safari\//.test(ua) ? 'Safari' : '브라우저';
  return `${os} · ${br}${isStandalone() ? ' · 홈 화면' : ''}`;
}

export type ServerPushKey = { enabled: boolean; publicKey?: string };
/** 서버에 푸시 키가 등록돼 있는지 + 구독에 쓸 공개키 */
export async function serverPushKey(): Promise<ServerPushKey> {
  try {
    const r = await fetch('/api/push', { cache: 'no-store' });
    if (!r.ok) return { enabled: false };
    return await r.json() as ServerPushKey;
  } catch { return { enabled: false }; }
}

const toKey = (b64u: string) => {
  const s = b64u.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64u.length % 4)) % 4);
  const raw = atob(s);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

export async function currentBrowserSub(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    return reg ? await reg.pushManager.getSubscription() : null;
  } catch { return null; }
}

/** 앱 안에 든 브라우저(카카오톡·디스코드·인스타그램·네이버·라인 등의 링크 화면) — 푸시를 지원하지 않는다.
 *  모바일에서 "지원하지 않는다"가 뜨는 가장 흔한 이유 → 진짜 크롬(사파리)으로 열어야 한다 */
export function inAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /KAKAOTALK|Discord|Instagram|FBAN|FBAV|FB_IAB|NAVER\(inapp|Line\/|; wv\)|Twitter|DaumApps/i.test(navigator.userAgent);
}

/** 이 기기 구독 만들기 — 권한 창이 뜬다. 이미 있으면 그대로.
 *  권한은 **먼저** 묻는다 — 서비스 워커 설치를 기다린 뒤에 물으면 모바일 크롬에서 체크(사용자 동작)로부터 시간이 지나
 *  권한 창 대신 조용한 거부가 나올 수 있다 */
export async function subscribeBrowser(publicKey: string): Promise<PushSubscription> {
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('permission-' + perm);
  const reg = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(publicKey) });
}

export async function unsubscribeBrowser(): Promise<void> {
  const s = await currentBrowserSub();
  if (s) await s.unsubscribe().catch(() => undefined);
}

export function subJson(s: PushSubscription): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  const j = s.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return null;
  return { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } };
}

export interface PushPayload {
  title: string; body?: string; url: string; tag?: string;
  /** 알림 아이콘 주소 — 보낼 때 환경설정의 탭 아이콘(파비콘)으로 채운다 (커플홈 사용자 요청: PC 알림 아이콘이 예쁘지 않았다) */
  icon?: string;
  /** 알림 종류 (rp·comment·guest·thread·memo·diary) — 내용을 숨길 때 종류만 적은 문구를 만드는 데 쓴다 */
  kind?: string;
}

/** 이 기기에서 「내용 숨기기」를 정해 둔 값 — 아직 등록한 기기가 없을 때 첫 등록에 그대로 쓴다 */
export const PUSH_HIDE_KEY = 'ohome.pushhide.v1';

const HIDE_TITLE: Record<string, string> = {
  rp: '역극 새 메시지', comment: '새 댓글', guest: '방명록 새 글', thread: '타래 새 글', memo: '새 메모', diary: '새 다이어리',
};
/** 내용을 숨긴 문구 — 종류와 「홈에서 확인」만 (아이콘은 그대로) */
export function hiddenPayload(p: PushPayload): PushPayload {
  return { title: HIDE_TITLE[p.kind ?? ''] ?? '새 알림', body: '내용은 홈에서 확인해 주세요', url: p.url, tag: p.tag, kind: p.kind, icon: p.icon };
}

/** 환경설정의 탭 아이콘(파비콘) — 저장소 주소일 때만 (브라우저 저장 모드의 파일 id는 서비스 워커가 읽을 수 없다) */
function siteIcon(): string | undefined {
  const site = getSetting<{ favicon?: string }>('ohome.site.v1', {});
  const f = (site?.favicon ?? '').trim();
  return f.startsWith('https://') || f.startsWith('http://') ? f : undefined;
}

// 한 사건에 받는 사람이 여럿이면 구독 목록을 여러 번 읽게 된다 — 잠깐 캐시
let subsCache: { at: number; list: PushSub[] } | null = null;
async function allSubs(): Promise<PushSub[]> {
  if (subsCache && Date.now() - subsCache.at < 15000) return subsCache.list;
  const list = await fetchList<PushSub>('push_subs');
  subsCache = { at: Date.now(), list };
  return list;
}
export function dropSubsCache() { subsCache = null; }

/** 받는 사람들의 켜진 구독으로 푸시 — 실패해도 조용히 (푸시 때문에 글 자체가 막히면 안 된다).
 *  돌아온 결과의 죽은 구독(브라우저가 지운 것)이 내 것이면 목록에서 지운다 (남의 것은 못 지운다 — 주인이 정보수정에서) */
export async function webPushTo(userIds: string[], payload: PushPayload): Promise<{ sent: number; dead: string[] } | null> {
  try {
    if (typeof window === 'undefined' || !userIds.length) return null;
    const list = await allSubs();
    const targets = list.filter(s => s.on && userIds.includes(s.userId) && !!s.endpoint && !!s.keys?.p256dh && !!s.keys?.auth);
    if (!targets.length) return null;
    const token = isServerMode() ? await backend()?.authToken() : null;
    const url = new URL(payload.url, location.origin).href;
    const icon = payload.icon ?? siteIcon();
    // 내용을 숨기기로 한 구독과 그대로 받는 구독을 나눠 두 번 보낸다 (라우트는 한 번에 한 문구)
    const groups = [
      { subs: targets.filter(s => !s.hide), payload: { ...payload, url, icon } },
      { subs: targets.filter(s => !!s.hide), payload: { ...hiddenPayload(payload), url, icon } },
    ].filter(g => g.subs.length);
    const out = { sent: 0, dead: [] as string[] };
    for (const g of groups) {
      const res = await fetch('/api/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ subs: g.subs.map(s => ({ endpoint: s.endpoint, keys: s.keys })), payload: g.payload }),
      });
      if (!res.ok) continue;
      const r = await res.json() as { sent?: number; dead?: string[] };
      out.sent += r.sent ?? 0;
      out.dead.push(...(r.dead ?? []));
    }
    const me = currentUserId();
    const deadMine = list.filter(s => s.userId === me && (out.dead ?? []).includes(s.endpoint));
    if (deadMine.length) {
      await syncList('push_subs', list, list.filter(s => !deadMine.includes(s)), me);
      subsCache = null;
    }
    return out;
  } catch { return null; }
}
