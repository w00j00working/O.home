'use client';
// 알림 (4.13) — 사이트 내 뱃지(헤더 종 + 메뉴 점). 디스코드 봇 DM은 Supabase/봇 서버 연동 시.
// 같은 탭 안에서 발생 지점(각 페이지)과 표시 지점(TopBar)이 다르므로 커스텀 이벤트로 동기화.
//
// **서버 배달 (v2.0 포크 제보 — 「알림이 안 와요」)**: 여태 알림은 기기(localStorage)에만 쌓여서,
// 알림을 **발생시킨 브라우저**에서 계정을 오갈 때만 보였다(혼자 계정 전환으로 시험할 때는 되고,
// 손님·다른 기기의 회원이 남긴 것은 영영 안 옴). 이제 서버 mode면 notifications 컬렉션에도 적는다 —
// **행 주인(authorId)을 받는 사람으로** 적으므로 서버 규칙상 받는 사람과 관리자만 읽고 지울 수 있다.
// 받는 쪽은 접속·벨 열기·실시간 구독으로 받아 가고(TopBar), 기기 목록은 그대로 캐시로 쓴다.
import { newId } from './postStore';
import { isServerMode, backend } from './backend';
import { fetchList, syncList } from './db';
import { currentUserId } from './currentUser';

export type NotifType = 'rp' | 'comment' | 'guest';
export interface Notif {
  id: string;
  type: NotifType;
  toUserId: string;          // 수신 회원
  title: string;
  body?: string;
  href: string;              // 클릭 시 이동
  date: string;
  read: boolean;
  readAt?: string;           // 읽은 시각 — 하루 지나면 목록에서 정리 (v2.0 사용자 요청)
}

/** 읽고 하루가 지난 알림은 목록에서 치운다 (v2.0 사용자 요청).
 *  안 읽은 알림은 아무리 오래돼도 남는다 — 놓친 것을 임의로 지우면 안 되니까. */
const KEEP_READ_MS = 24 * 60 * 60 * 1000;
export function pruneNotifs(list: Notif[], now = Date.now()): Notif[] {
  return list.filter(n => {
    if (!n.read) return true;
    const t = Date.parse(n.readAt ?? '');
    return !Number.isFinite(t) || now - t < KEEP_READ_MS;
  });
}

const KEY = 'ohome.notif.v1';
const SET_KEY = 'ohome.notifset.v1'; // 회원별 알림 항목 on/off — { [userId]: { rp, comment, guest } }
export const NOTIF_EVENT = 'ohome-notif';

export const NOTIF_TYPE_LABEL: Record<NotifType, string> = {
  rp: '역극 새 메시지', comment: '내 글 댓글', guest: '방명록 (관리자)',
};

export function readNotifs(): Notif[] {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Notif[];
    const kept = pruneNotifs(all);
    // 정리된 게 있으면 저장까지 (다음 번에 또 훑지 않게) — 여기서 이벤트를 쏘면 렌더 중 갱신이 되어 안 쏜다
    if (kept.length !== all.length) {
      try { localStorage.setItem(KEY, JSON.stringify(kept)); } catch { /* 무시 */ }
    }
    return kept;
  } catch { return []; }
}

function write(list: Notif[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 100))); } catch { /* 무시 */ }
  window.dispatchEvent(new Event(NOTIF_EVENT));
}

export interface NotifSettings { rp: boolean; comment: boolean; guest: boolean }
const DEFAULT_SET: NotifSettings = { rp: true, comment: true, guest: true };

export function notifSettings(userId: string): NotifSettings {
  try {
    const all = JSON.parse(localStorage.getItem(SET_KEY) ?? '{}');
    return { ...DEFAULT_SET, ...(all[userId] ?? {}) };
  } catch { return DEFAULT_SET; }
}

export function setNotifSetting(userId: string, key: NotifType, value: boolean) {
  try {
    const all = JSON.parse(localStorage.getItem(SET_KEY) ?? '{}');
    all[userId] = { ...DEFAULT_SET, ...(all[userId] ?? {}), [key]: value };
    localStorage.setItem(SET_KEY, JSON.stringify(all));
  } catch { /* 무시 */ }
  window.dispatchEvent(new Event(NOTIF_EVENT));
}

/** 알림 생성 — 수신자가 해당 항목을 꺼뒀으면 만들지 않음.
 *  dedupeKey: 같은 키의 안 읽은 알림이 있으면 새로 쌓지 않고 갱신 (역극 방 단위 묶음 등) */
export function pushNotif(n: {
  type: NotifType; toUserId: string; title: string; body?: string; href: string; dedupeKey?: string;
}) {
  if (!notifSettings(n.toUserId)[n.type]) return;
  const list = readNotifs();
  if (n.dedupeKey) {
    const i = list.findIndex(x => !x.read && x.toUserId === n.toUserId
      && x.type === n.type && x.href === n.href && x.title === n.title);
    if (i >= 0) {
      const [ex] = list.splice(i, 1);
      write([{ ...ex, body: n.body, date: new Date().toISOString() }, ...list]);
      // 서버에는 새 행으로 남긴다 — 남의 행(받는 사람 소유)은 고칠 수 없다.
      // 겹친 행은 받는 쪽이 받아 가면서 정리한다 (syncNotifs)
      sendToServer({ ...ex, id: newId(), body: n.body, date: new Date().toISOString() });
      return;
    }
  }
  const row: Notif = {
    id: newId(), type: n.type, toUserId: n.toUserId, title: n.title, body: n.body,
    href: n.href, date: new Date().toISOString(), read: false,
  };
  write([row, ...list]);
  sendToServer(row);
}

/**
 * 관리자(들)에게 알림 (v2.0 포크 제보 후 정비).
 *
 * 예전에는 받는 사람을 문자 그대로 'admin'으로 적었다 — 목업 관리자 id라서 **서버 모드에서는
 * 실제 관리자 uid와 절대 일치하지 않아** 방명록 알림이 관리자에게 영영 표시되지 않았다.
 * 회원 목록(공개 읽기)에서 role이 admin인 실제 id를 찾아 그 앞으로 보낸다. 여러 명이면 전원,
 * 지금 로그인한 사람 본인은 뺀다. 브라우저 저장 모드에서는 지금까지처럼 'admin'(목업 id).
 */
let adminIdsCache: string[] | null = null;
async function adminIds(): Promise<string[]> {
  if (!isServerMode()) return ['admin'];
  if (adminIdsCache) return adminIdsCache;
  try {
    const ms = await backend()!.listMembers();
    adminIdsCache = ms.filter(m => m.role === 'admin').map(m => m.id);
  } catch { return []; }   // 캐시하지 않는다 — 다음 알림 때 다시 시도
  return adminIdsCache;
}
export function notifyAdmins(n: { type: NotifType; title: string; body?: string; href: string; dedupeKey?: string }) {
  void adminIds().then(ids => {
    for (const id of ids) {
      if (id === currentUserId()) continue;   // 본인 행동은 본인에게 알리지 않는다
      pushNotif({ ...n, toUserId: id });
    }
  });
}

/* ---------- 서버 배달 (v2.0) ---------- */
/** 서버 행 — 받는 사람을 주인으로, 나만보기로 적는다 (읽기·수정·삭제가 받는 사람·관리자로 잠긴다) */
const asRow = (n: Notif) => ({ ...n, authorId: n.toUserId, visibility: 'private' as const });

/** 알림 한 건을 서버에도 — 실패해도 조용히 (알림 때문에 댓글 자체가 막히면 안 된다) */
function sendToServer(n: Notif) {
  if (!isServerMode()) return;
  void syncList('notifications', [], [asRow(n)], currentUserId())
    .catch(e => console.warn('[ohome] 알림 서버 저장 실패', e));
}

/** 내 알림 행의 변경(읽음·삭제)을 서버에도 — 내 행이므로 서버 규칙이 허용한다 */
function mirrorToServer(prev: Notif[], next: Notif[]) {
  if (!isServerMode() || (!prev.length && !next.length)) return;
  void syncList('notifications', prev.map(asRow), next.map(asRow), currentUserId())
    .catch(() => { /* 규칙 미적용 포크 등 — 기기 목록은 이미 반영됨 */ });
}

/**
 * 알림 전달 자가진단 (v2.0 포크 제보 「여전히 안 와요」 대응) — 어디가 막혔는지 스스로 확인.
 * 내 앞으로 시험 알림을 **서버에** 적고, 서버에서 되읽어 본 뒤 지운다.
 * 결과 문구가 곧 안내다: 저장이 막히면 만들기 규칙, 읽기가 막히면 읽기 규칙 문제.
 */
export async function selfTestNotif(userId: string): Promise<string> {
  if (!isServerMode()) return '브라우저 저장 모드입니다 — 알림은 이 브라우저 안에서만 동작합니다';
  const now = new Date().toISOString();
  const row = asRow({
    id: newId(), type: 'comment', toUserId: userId, title: '알림 전달 확인',
    href: '/', date: now, read: true, readAt: now,
  });
  try {
    await syncList('notifications', [], [row], currentUserId());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `서버 저장 실패 — ${msg.slice(0, 80)} · 설치 SQL 재실행(수파베이스) 또는 Firestore 규칙 재부착(파이어베이스)이 필요합니다`;
  }
  try {
    const rows = await fetchList('notifications') as unknown as Notif[];
    const found = rows.some(r => r.id === row.id);
    try { await syncList('notifications', [row], [], currentUserId()); } catch { /* 시험 행 정리 실패는 무시 */ }
    return found
      ? '정상 — 알림이 서버에 저장되고 읽혔습니다. 남이 남긴 알림은 접속·벨 열기 때 도착합니다'
      : '저장은 됐지만 읽기에 안 보입니다 — 보안 규칙(읽기)을 최신으로 다시 적용해 주세요';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `서버 읽기 실패 — ${msg.slice(0, 80)} · 보안 규칙을 최신으로 다시 적용해 주세요`;
  }
}

let lastSync = 0;
/**
 * 서버에 쌓인 내 알림 받아 가기 (v2.0) — 접속·벨 열기·실시간 신호에서 부른다.
 * 받아 가며 정리도 한다: 같은 묶음(역극 등)으로 겹친 안 읽은 행은 최신만 남기고,
 * 읽고 하루 지난 행은 서버에서도 지운다 — 모두 내 행이라 지울 수 있다.
 */
export async function syncNotifs(userId: string, force = false): Promise<void> {
  if (!isServerMode() || !userId) return;
  const now = Date.now();
  if (!force && now - lastSync < 30_000) return;
  lastSync = now;
  try {
    const rows = await fetchList('notifications') as unknown as Notif[];
    // 받은 사람의 on/off는 받아 갈 때 거른다 — 보내는 쪽 기기는 받는 사람의 설정을 모른다 (기기 보관)
    const mySet = notifSettings(userId);
    const mine = rows.filter(r => r.toUserId === userId && mySet[r.type] !== false);
    const local = readNotifs();
    const byId = new Map(local.map(x => [x.id, x]));
    let changed = false;
    for (const r of mine) {
      const ex = byId.get(r.id);
      const merged: Notif = {
        id: r.id, type: r.type, toUserId: r.toUserId, title: r.title, body: r.body,
        href: r.href, date: r.date,
        // 읽음은 어느 쪽이든 읽었으면 읽음 — 기기 A에서 읽은 것이 B에서 안 읽음으로 되살아나지 않게
        read: (ex?.read ?? false) || r.read,
        readAt: ex?.readAt ?? r.readAt,
      };
      if (!ex || JSON.stringify(ex) !== JSON.stringify(merged)) changed = true;
      byId.set(r.id, merged);
    }
    // 겹친 행 정리 — 같은 (종류·주소·제목)의 안 읽은 알림은 최신 하나만
    const seen = new Map<string, Notif>();
    const drop: Notif[] = [];
    for (const x of [...byId.values()].sort((a, b) => b.date.localeCompare(a.date))) {
      if (x.toUserId !== userId || x.read) continue;
      const k = `${x.type}|${x.href}|${x.title}`;
      if (seen.has(k)) { drop.push(x); byId.delete(x.id); changed = true; }
      else seen.set(k, x);
    }
    // 읽고 하루 지난 내 행은 서버에서도 정리
    const stale = mine.filter(r => {
      const t = Date.parse(r.readAt ?? '');
      return r.read && Number.isFinite(t) && now - t > 24 * 60 * 60 * 1000;
    });
    const del = [...drop, ...stale.filter(s => !drop.some(d => d.id === s.id))];
    if (del.length) mirrorToServer(del, []);
    if (changed) {
      write([...byId.values()].sort((a, b) => b.date.localeCompare(a.date)));
    }
  } catch { /* 테이블·규칙 미적용 포크 등 — 기기 목록만으로 동작 */ }
}

export function markRead(id: string) {
  const at = new Date().toISOString();
  const list = readNotifs();
  const before = list.find(n => n.id === id);
  const next = list.map(n => (n.id === id ? { ...n, read: true, readAt: n.readAt ?? at } : n));
  write(next);
  // 읽음도 서버에 — 다른 기기에서 안 읽음으로 되살아나지 않게 (v2.0)
  if (before && !before.read) mirrorToServer([before], [next.find(n => n.id === id)!]);
}

export function markAllRead(userId: string) {
  const at = new Date().toISOString();
  const list = readNotifs();
  const next = list.map(n => (n.toUserId === userId ? { ...n, read: true, readAt: n.readAt ?? at } : n));
  write(next);
  const before = list.filter(n => n.toUserId === userId && !n.read);
  mirrorToServer(before, before.map(n => next.find(x => x.id === n.id)!));
}

/** 읽은 알림 지금 바로 정리 (v2.0 사용자 요청 — 하루를 기다리지 않고 손으로) */
export function clearReadNotifs(userId: string) {
  const list = readNotifs();
  const gone = list.filter(n => n.toUserId === userId && n.read);
  write(list.filter(n => !(n.toUserId === userId && n.read)));
  mirrorToServer(gone, []);   // 서버에서도 지운다 — 안 지우면 다음 접속에 되살아난다
}

export function removeNotif(id: string) {
  write(readNotifs().filter(n => n.id !== id));
}
