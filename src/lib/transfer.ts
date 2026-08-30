'use client';
// 데이터 덤프/적재 공용 엔진 (v2.0)
//
// 백업(zip)·복원·다른 DB로 이전이 모두 같은 일을 한다:
//   ① 지금 저장소에서 콘텐츠·설정·이미지를 전부 읽어 스냅샷으로 만들고
//   ② 대상 저장소에 그대로 밀어 넣는다.
// 저장소가 바뀌면 이미지 주소도 바뀌므로, 옮긴 파일의 새 주소로 데이터 안의 참조를 치환한다.
// (문자열이 정확히 같을 때만 바꾸므로 엉뚱한 값이 변형될 일이 없다)
import { backend, COLLECTION_OF, CONTENT_COLLECTIONS } from './backend';
import type { Backend, ListItem } from './backend';
import { allBlobs, getBlob, putBlobAs, putBlob } from './blobStore';
import { getSetting, setSetting, SETTING_KEYS, isLocalOnlySetting } from './settingStore';

export interface Snapshot {
  version: 2;
  createdAt: string;
  collections: Record<string, ListItem[]>;   // 컬렉션 → 항목들
  settings: Record<string, unknown>;         // 사이트 설정
  members?: { id: string; nickname: string; role: string; avatarUrl?: string }[];   // 기록용 (계정 자체는 옮길 수 없음)
  /** 읽지 못한 컬렉션·설정 (v2.0) — 「안 읽힘」과 「비어 있음」을 구별해야 한다.
   *  이미지 정리는 이게 비어 있을 때만 돌아간다(못 읽은 글의 이미지를 지워 버리므로) */
  failed?: string[];
}

export type Progress = (msg: string, done?: number, total?: number) => void;

/* 사이트 설정 키 목록(SETTING_KEYS)은 settingStore가 갖는다 — 백업·이전도 같은 목록을 쓴다 */

/* ---------- 이미지 참조 ---------- */

/** 저장소가 만든 이미지 주소인지 (Supabase Storage / Firebase Storage) */
export function isFileUrl(s: string): boolean {
  return /\/storage\/v1\/object\/public\//.test(s) || /firebasestorage\.googleapis\.com/.test(s);
}

/**
 * 문자열 **안에 박힌** 파일 주소를 모두 꺼낸다 (v2.0 사용자 발견 — 신청자 본문 이미지 유실).
 *
 * 에디터로 올린 이미지는 본문 HTML 안에 <img src="…"> 형태로 들어간다. 예전에는 「이 문자열이
 * 주소인가」만 따져서 본문 전체가 참조로 잡히고 **정작 주소는 안 잡혔다**. 그래서
 *   · 이미지 정리가 멀쩡히 쓰이는 이미지를 「아무도 안 쓰는 파일」로 보고 지웠고
 *   · 백업 zip에도, 다른 DB로 옮길 때도 그 이미지들이 빠졌다.
 * HTML 속성에서는 &가 &amp;로 적히므로 되돌려 준다 (파이어베이스 주소의 token= 앞).
 */
export function extractFileUrls(s: string): string[] {
  const out: string[] = [];
  for (const m of s.match(/https?:\/\/[^\s"'<>\\)]+/g) ?? []) {
    const url = m.replace(/&amp;/g, '&').replace(/[.,;:!?]+$/, '');
    if (isFileUrl(url)) out.push(url);
  }
  return out;
}

/** 데이터 전체를 훑어 파일 참조 문자열을 모은다 (로컬 파일 id는 known으로 알려 준다) */
export function collectRefs(value: unknown, known: Set<string>, out = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    if (known.has(value)) out.add(value);
    // 값이 그대로 주소이든 본문 HTML 안에 박혀 있든 모두 꺼낸다 (v2.0)
    extractFileUrls(value).forEach(u => out.add(u));
    return out;
  }
  if (Array.isArray(value)) { value.forEach(v => collectRefs(v, known, out)); return out; }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(v => collectRefs(v, known, out));
  }
  return out;
}

/** 참조 치환 — 값이 그대로 주소이면 통째로, 본문 HTML 안에 박혀 있으면 그 부분만 바꾼다 (v2.0) */
export function replaceRefs<T>(value: T, map: Map<string, string>): T {
  if (typeof value === 'string') {
    const exact = map.get(value);
    if (exact) return exact as unknown as T;
    // 본문 속 주소도 바꿔야 한다 — 안 바꾸면 옮긴 뒤에도 옛 저장소를 가리켜 그대로 깨진다
    if (!isFileUrl(value)) return value;
    let s: string = value;
    for (const [from, to] of map) {
      if (s.includes(from)) s = s.split(from).join(to);
      const enc = from.replace(/&/g, '&amp;');
      if (enc !== from && s.includes(enc)) s = s.split(enc).join(to.replace(/&/g, '&amp;'));
    }
    return s as unknown as T;
  }
  if (Array.isArray(value)) return value.map(v => replaceRefs(v, map)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => { out[k] = replaceRefs(v, map); });
    return out as unknown as T;
  }
  return value;
}

/**
 * 어디에서도 참조하지 않는 저장소 파일 찾기 (환경설정 > 데이터 백업의 이미지 정리).
 *
 * 글을 지워도 이미지는 저장소에 남는다 — 같은 이미지를 다른 글이 쓰고 있을 수 있어
 * 삭제와 동시에 지우는 것은 위험하기 때문. 대신 전체를 훑어 아무도 안 쓰는 것만 골라
 * 관리자가 확인하고 지운다.
 *
 * **한 곳이라도 못 읽으면 아예 하지 않는다** (v2.0) — 못 읽은 컬렉션은 「글이 없다」와
 * 구별되지 않아, 거기 쓰이던 이미지가 통째로 「안 쓰는 파일」이 되어 지워진다.
 */
export async function findOrphanFiles(be: Backend): Promise<{ ref: string; size: number }[]> {
  const snap = await dumpAll(be);
  if (snap.failed?.length) {
    throw new Error(`${snap.failed.join(', ')}을(를) 읽지 못해 정리를 멈췄습니다 — `
      + '읽지 못한 곳의 이미지까지 지울 수 있습니다. 잠시 뒤 다시 시도해 주세요');
  }
  const used = new Set<string>();
  collectRefs(snap.collections, new Set(), used);
  collectRefs(snap.settings, new Set(), used);
  // 회원 프로필 사진도 쓰이는 파일이다 (v2.0 사용자 제보) — 콘텐츠·설정만 훑던 시절
  // 어디에도 참조가 안 잡혀 「아무도 안 쓰는 파일」로 지워졌다
  collectRefs(snap.members ?? [], new Set(), used);
  const all = await be.listFiles();
  return all.filter(f => !used.has(f.ref));
}

/* ---------- 덤프 ---------- */

/** 지금 저장소(서버 또는 브라우저)에서 전부 읽어 스냅샷 만들기 */
export async function dumpAll(be: Backend | null, onProgress?: Progress): Promise<Snapshot> {
  const snap: Snapshot = {
    version: 2, createdAt: new Date().toISOString(), collections: {}, settings: {},
  };

  if (be) {
    let i = 0;
    for (const coll of CONTENT_COLLECTIONS) {
      onProgress?.(`${coll} 읽는 중`, i, CONTENT_COLLECTIONS.length);
      try { snap.collections[coll] = await be.fetchList(coll); }
      catch { snap.collections[coll] = []; (snap.failed ??= []).push(coll); }
      i += 1;
    }
    onProgress?.('설정 읽는 중');
    try { snap.settings = await be.fetchAllSettings(); }
    catch { snap.settings = {}; (snap.failed ??= []).push('설정'); }
    // 회원 목록도 못 읽으면 failed에 적는다 (v2.0 사용자 제보 — 프로필 사진이 정리에 지워짐).
    // 프로필 사진 참조는 여기서만 나오므로, 이걸 못 읽은 채 정리를 돌리면 안 된다
    try { snap.members = await be.listMembers(); } catch { (snap.failed ??= []).push('회원 프로필'); }
    return snap;
  }

  // 브라우저 저장 모드
  Object.entries(COLLECTION_OF).forEach(([key, coll]) => {
    try {
      const raw = localStorage.getItem(key);
      snap.collections[coll] = raw ? JSON.parse(raw) : [];
    } catch { snap.collections[coll] = []; }
  });
  SETTING_KEYS.forEach(k => {
    const v = getSetting<unknown>(k, undefined);
    if (v !== undefined) snap.settings[k] = v;
  });
  return snap;
}

/* ---------- 적재 ---------- */

/**
 * 스냅샷을 대상 저장소에 넣는다.
 * files: 참조 → 원본 바이트를 얻는 함수 (백업 zip 복원이면 zip에서, DB 이전이면 원본 저장소에서)
 */
export async function loadAll(
  target: Backend | null,
  snap: Snapshot,
  getFile: (ref: string) => Promise<Blob | null>,
  onProgress?: Progress,
): Promise<{ files: number; items: number }> {
  // ① 이미지부터 옮기고 새 주소 표를 만든다
  const knownLocal = new Set<string>();
  try { (await allBlobs()).forEach((_v, k) => knownLocal.add(k)); } catch { /* 무시 */ }
  const refs = collectRefs({ c: snap.collections, s: snap.settings }, knownLocal);
  const map = new Map<string, string>();
  let fileCount = 0;
  let idx = 0;
  for (const ref of refs) {
    idx += 1;
    onProgress?.('이미지 옮기는 중', idx, refs.size);
    try {
      const blob = await getFile(ref);
      if (!blob) continue;
      const next = target
        ? await target.uploadFile(blob, extOfRef(ref, blob))
        : await putSameOrNew(ref, blob);
      if (next !== ref) map.set(ref, next);
      fileCount += 1;
    } catch { /* 개별 파일 실패는 건너뜀 */ }
  }

  // ② 참조를 새 주소로 바꾼 데이터 적재
  const collections = replaceRefs(snap.collections, map);
  const settings = replaceRefs(snap.settings, map);

  let items = 0;
  if (target) {
    let i = 0;
    for (const [coll, list] of Object.entries(collections)) {
      i += 1;
      onProgress?.(`${coll} 저장 중`, i, Object.keys(collections).length);
      const rows = (list ?? []) as ListItem[];
      if (!rows.length) continue;
      await target.syncList(coll, [], rows, null);
      items += rows.length;
    }
    for (const [k, v] of Object.entries(settings)) {
      if (v === undefined || v === null) continue;
      // 기기 보관 전용 키(알림 on/off 등)는 서버로 올리지 않는다 (v2.0 포크 제보) —
      // 한 번 올라가면 매 접속마다 그 값이 로컬을 덮어써 설정이 되돌아간다
      if (isLocalOnlySetting(k)) continue;
      await target.saveSetting(k, v);
    }
    return { files: fileCount, items };
  }

  // 브라우저 저장 모드
  const keyOf = Object.fromEntries(Object.entries(COLLECTION_OF).map(([k, c]) => [c, k]));
  Object.entries(collections).forEach(([coll, list]) => {
    const key = keyOf[coll];
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify(list ?? [])); } catch { /* 무시 */ }
    items += (list as ListItem[])?.length ?? 0;
  });
  Object.entries(settings).forEach(([k, v]) => { if (v !== undefined && v !== null) setSetting(k, v); });
  return { files: fileCount, items };
}

/** 로컬 저장 시 — 원래 id를 그대로 쓰면 참조 치환이 필요 없다 */
async function putSameOrNew(ref: string, blob: Blob): Promise<string> {
  if (isFileUrl(ref)) return putBlob(blob);   // URL → 새 로컬 id
  await putBlobAs(ref, blob);
  return ref;
}

function extOfRef(ref: string, blob: Blob): string {
  const m = ref.match(/\.([a-z0-9]{2,5})(?:\?|$)/i);
  if (m) return m[1].toLowerCase();
  const t = blob.type || '';
  if (t.includes('png')) return 'png';
  if (t.includes('gif')) return 'gif';
  if (t.includes('webp')) return 'webp';
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
  return 'bin';
}

/** 참조로 원본 바이트 얻기 — 현재 저장소 기준 (DB 이전·백업 만들 때) */
export async function readFileByRef(ref: string): Promise<Blob | null> {
  if (isFileUrl(ref)) {
    try {
      const res = await fetch(ref);
      return res.ok ? await res.blob() : null;
    } catch { return null; }
  }
  return getBlob(ref);
}

/** 다른 DB로 통째 이전 — 현재 저장소에서 읽어 새 백엔드에 넣는다 */
export async function migrateTo(target: Backend, onProgress?: Progress): Promise<{ files: number; items: number }> {
  onProgress?.('현재 데이터 읽는 중');
  const snap = await dumpAll(backend(), onProgress);
  return loadAll(target, snap, readFileByRef, onProgress);
}
