'use client';
// 이미지/파일 저장 (v2.0)
//  · 서버 모드: Supabase Storage 버킷(ohome)에 올리고, 저장하는 값은 공개 URL
//  · 로컬 모드: IndexedDB (파일 id만 데이터에 저장)
// 화면 코드는 항상 "참조 문자열"만 다루므로 두 모드가 같은 코드로 동작한다.
import React, { useEffect, useState } from 'react';
import { newId } from './postStore';
import { backend, isServerMode } from './backend';

const DB_NAME = 'ohome-blobs';
const STORE = 'files';

/** 확장자 추론 — Storage에 올릴 때 파일 이름에 쓴다 */
function extOf(blob: Blob): string {
  const t = blob.type || '';
  if (t.includes('png')) return 'png';
  if (t.includes('gif')) return 'gif';
  if (t.includes('webp')) return 'webp';
  if (t.includes('svg')) return 'svg';
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
  if (t.includes('font') || t.includes('woff')) return 'woff2';
  if (t.startsWith('text/')) return 'txt';
  return 'bin';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ---------- 업로드 진행 상태 (v2.0) ----------
   서버가 느릴 때 아무 반응이 없어 보여서 사용자가 업로드를 다시 누르게 된다.
   지금 몇 건이 올라가는 중인지 알려 화면에 표시할 수 있게 한다. */
export const UPLOAD_EVT = 'ohome-upload';
let uploading = 0;
const bump = (n: number) => {
  uploading = Math.max(0, uploading + n);
  window.dispatchEvent(new Event(UPLOAD_EVT));
};

/** 지금 올라가는 중인 파일 수 */
export function useUploading(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const h = () => setN(uploading);
    h();
    window.addEventListener(UPLOAD_EVT, h);
    return () => window.removeEventListener(UPLOAD_EVT, h);
  }, []);
  return n;
}

/* 같은 파일을 두 번 올리지 않게 (v2.0 사용자 발견) — 업로드가 느려서 다시 누르면
   같은 이미지가 여러 장 생기던 문제. 내용이 같으면 앞선 업로드의 결과를 그대로 돌려준다.
   (올라가는 중이면 그 약속을 함께 기다린다 — 두 번 올라가지 않는다) */
const sent = new Map<string, Promise<string>>();

async function hashOf(blob: Blob): Promise<string | null> {
  try {
    const buf = await blob.arrayBuffer();
    const d = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;   // 보안 컨텍스트가 아니면 해시를 못 구한다 — 그땐 그냥 올린다
  }
}

/** Blob 저장 → 참조 문자열 반환 (서버 모드: 공개 URL · 로컬 모드: 파일 id) */
export async function putBlob(blob: Blob): Promise<string> {
  const key = await hashOf(blob);
  const hit = key ? sent.get(key) : undefined;
  if (hit) return hit;
  const job = putBlobNew(blob);
  if (key) {
    sent.set(key, job);
    // 실패한 업로드는 캐시에 남기지 않는다 — 다시 시도할 수 있어야 한다
    job.catch(() => sent.delete(key));
  }
  return job;
}

async function putBlobNew(blob: Blob): Promise<string> {
  bump(1);
  try {
    return await putBlobRaw(blob);
  } finally {
    bump(-1);
  }
}

async function putBlobRaw(blob: Blob): Promise<string> {
  const be = isServerMode() ? backend() : null;
  if (be) return be.uploadFile(blob, extOf(blob));   // 서버 모드 — 공개 URL 반환
  const id = newId();
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return id;
}

/** promoteToStorage의 결과 — 안 됐으면 **왜** 안 됐는지까지 알려 준다.
 *  조용히 실패하면 사용자는 「올렸는데 왜 안 보이지」에서 막힌다 (v2.0 사용자 지적). */
export type PromoteResult =
  | { kind: 'already' }                 // 이미 저장소 주소 — 할 일 없음
  | { kind: 'local-mode' }              // 서버 연결이 없다 — 올릴 곳 자체가 없음
  | { kind: 'no-origin' }               // 이 브라우저에 원본이 없다 (다른 브라우저에서 올린 것)
  | { kind: 'uploaded'; url: string }
  | { kind: 'failed'; error: string };

/**
 * 브라우저에만 있는 파일을 서버 저장소로 올려 준다 (v2.0 사용자 발견).
 *
 * 백엔드를 붙이기 전에 저장한 이미지는 참조가 IndexedDB 파일 id라, 올린 그 브라우저에서만
 * 보이고 다른 데서 로그인하면 안 보인다. 원본이 이 브라우저에 아직 있으면 저장소로 올린다.
 *
 * putBlob이 내용 해시로 걸러 주므로 여러 번 불려도 같은 파일이 두 번 올라가지 않는다.
 */
export async function promoteToStorage(ref?: string): Promise<PromoteResult> {
  if (!ref || /^(https?:|data:)/i.test(ref)) return { kind: 'already' };
  if (!isServerMode()) return { kind: 'local-mode' };
  // blob: 은 새로고침하면 죽는 참조 — 원본을 되찾을 방법이 없다
  if (ref.startsWith('blob:')) return { kind: 'no-origin' };
  let blob: Blob | null = null;
  try {
    blob = await getBlob(ref);
  } catch (e) {
    return { kind: 'failed', error: e instanceof Error ? e.message : String(e) };
  }
  if (!blob) return { kind: 'no-origin' };
  try {
    const url = await putBlob(blob);
    return url === ref ? { kind: 'already' } : { kind: 'uploaded', url };
  } catch (e) {
    return { kind: 'failed', error: e instanceof Error ? e.message : String(e) };
  }
}

/** 전체 파일 목록 (id → Blob) — 데이터 백업 내보내기용 (5.2) */
export async function allBlobs(): Promise<Map<string, Blob>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const out = new Map<string, Blob>();
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) { resolve(out); return; }
      out.set(String(cur.key), cur.value as Blob);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

/** 지정 id로 Blob 저장 — 백업 복원용 (기존 id 유지) */
export async function putBlobAs(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getBlob(id: string): Promise<Blob | null> {
  // 서버 모드에서 저장된 값은 공개 URL — 그대로 받아 온다 (백업 zip 내보내기 등에서 사용)
  if (/^https?:/i.test(id)) {
    try {
      const res = await fetch(id);
      return res.ok ? await res.blob() : null;
    } catch { return null; }
  }
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/* 세션 내 objectURL 캐시 (id → url) */
const urlCache = new Map<string, string>();

const isDirectUrl = (ref: string) =>
  /^(https?:|data:|\/)/i.test(ref) || (!ref.includes(':') && /[/.]/.test(ref));

/**
 * 파일 참조 → 표시 가능한 URL.
 * - http(s)/data: 및 상대 이미지 경로는 그대로
 * - blob: 은 새로고침 후 죽은 참조 → undefined (플레이스홀더 폴백)
 * - 그 외는 IndexedDB 파일 id로 간주해 로드
 */
export function useBlobUrl(ref?: string): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => {
    if (!ref) return undefined;
    if (isDirectUrl(ref)) return ref;
    if (ref.startsWith('blob:')) return undefined;
    return urlCache.get(ref);
  });

  useEffect(() => {
    if (!ref) { setUrl(undefined); return; }
    if (isDirectUrl(ref)) { setUrl(ref); return; }
    if (ref.startsWith('blob:')) { setUrl(undefined); return; }
    if (urlCache.has(ref)) { setUrl(urlCache.get(ref)); return; }
    let alive = true;
    getBlob(ref).then(b => {
      if (b && alive) {
        const u = URL.createObjectURL(b);
        urlCache.set(ref, u);
        setUrl(u);
      }
    }).catch(() => { /* 없으면 플레이스홀더 */ });
    return () => { alive = false; };
  }, [ref]);

  return url;
}

/** 파일 참조 이미지 — 없으면 플레이스홀더(ph) 폴백 */
export function BlobImg({ fileRef, ph, alt, style, imgStyle, label }: {
  fileRef?: string; ph?: string; alt?: string;
  style?: React.CSSProperties; imgStyle?: React.CSSProperties; label?: string;
}) {
  const url = useBlobUrl(fileRef);
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt ?? ''} referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', ...imgStyle }} />;
  }
  return <div className={`ph ${ph ?? ''}`} style={{ width: '100%', height: '100%', ...style }}>{label && <span>{label}</span>}</div>;
}
