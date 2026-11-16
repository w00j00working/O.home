'use client';
// 서버 연결 설정 — 빌드 시점 env가 아니라 **런타임**에 읽는다. (v2.0)
//
// 배포본(zip)을 받은 사람이 재빌드 없이 자기 프로젝트를 붙일 수 있어야 하므로,
// 설치 화면에서 입력한 값을 그대로 쓴다. Supabase의 anon key도, Firebase의 apiKey도
// 원래 브라우저에 공개되는 값이고(어차피 번들에 들어간다) 실제 보안은 서버 규칙이 담당한다.
//
// 읽는 순서:
//   1) /ohome.config.json  — 배포에 올려 둔 공개 설정. **방문자 모두**가 이 값을 받는다.
//   2) localStorage        — 설치 화면에서 방금 입력한 값(관리자 브라우저에서 즉시 사용)
//   3) NEXT_PUBLIC_* env   — 직접 빌드해 쓰는 경우
// 1이 있으면 항상 우선 — 관리자가 로컬에 남긴 값 때문에 방문자와 다른 DB를 보는 사고를 막는다.
import type { BackendConfig, BackendKind } from './backend/types';

export type { BackendConfig, BackendKind };

const LS_KEY = 'ohome.server.v1';
const FILE_PATH = '/ohome.config.json';

let cache: BackendConfig | null = null;
let loaded = false;
/** 설정이 어디서 왔는지 (v2.0) — 'local'이면 이 브라우저에만 있는 것: 방문자는 설치 화면을 본다 */
export type ConfigSource = 'file' | 'local' | 'env';
let source: ConfigSource | null = null;

function normalize(v: unknown): BackendConfig | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, string>;
  if (o.kind === 'firebase' || (o.apiKey && o.projectId)) {
    if (!o.apiKey || !o.projectId || !o.appId) return null;
    return {
      kind: 'firebase',
      apiKey: o.apiKey,
      authDomain: o.authDomain || `${o.projectId}.firebaseapp.com`,
      projectId: o.projectId,
      storageBucket: o.storageBucket || `${o.projectId}.appspot.com`,
      appId: o.appId,
      messagingSenderId: o.messagingSenderId,
      databaseId: o.databaseId || undefined,
    };
  }
  if (o.url && o.anonKey) return { kind: 'supabase', url: o.url, anonKey: o.anonKey };
  return null;
}

export function localConfig(): BackendConfig | null {
  try { return normalize(JSON.parse(localStorage.getItem(LS_KEY) ?? 'null')); } catch { return null; }
}

export function saveLocalConfig(v: BackendConfig | null) {
  try {
    if (v) localStorage.setItem(LS_KEY, JSON.stringify(v));
    else localStorage.removeItem(LS_KEY);
  } catch { /* 무시 */ }
  cache = v;
  source = v ? 'local' : null;
  loaded = true;
}

function envConfig(): BackendConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) return { kind: 'supabase', url, anonKey };
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (apiKey && projectId && appId) {
    return normalize({
      kind: 'firebase', apiKey, projectId, appId,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
      databaseId: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID ?? '',
    });
  }
  return null;
}

async function fileConfig(): Promise<BackendConfig | null> {
  try {
    const res = await fetch(FILE_PATH, { cache: 'no-store' });
    if (!res.ok) return null;
    return normalize(await res.json());
  } catch { return null; }
}

/** 최종 설정 — 앱 시작 시 한 번 확정하고 이후에는 캐시 */
export async function loadServerConfig(): Promise<BackendConfig | null> {
  if (loaded) return cache;
  const file = await fileConfig();
  const local = file ? null : localConfig();
  const env = file || local ? null : envConfig();
  cache = file ?? local ?? env;
  source = file ? 'file' : local ? 'local' : env ? 'env' : null;
  loaded = true;
  return cache;
}

export function serverConfig(): BackendConfig | null { return cache; }
export function serverConfigLoaded(): boolean { return loaded; }
/** 지금 쓰는 설정의 출처 — 'local'이면 방문자에게 퍼지지 않은 상태라 경고에 쓴다 (v2.0) */
export function serverConfigSource(): ConfigSource | null { return source; }

/** 설치 화면에서 내려받는 파일 — 저장소의 public/ 에 올리면 방문자에게도 적용됨 */
export function configFileText(v: BackendConfig): string {
  return `${JSON.stringify(v, null, 2)}\n`;
}

/** 입력값 형식 검사 — 흔한 실수(대시보드 주소, service_role 키, 잘못 붙여넣은 설정)를 잡아 준다 */
export function validateConfig(v: BackendConfig): string | null {
  if (v.kind === 'supabase') {
    if (!v.url.trim() || !v.anonKey.trim()) return 'Project URL과 anon key를 모두 입력해 주세요.';
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(v.url.trim())) {
      return 'Project URL 형식이 아닙니다 — https://xxxx.supabase.co 모양이어야 합니다.';
    }
    if (v.anonKey.trim().length < 40) return 'anon key가 너무 짧습니다 — 값을 끝까지 붙여넣었는지 확인해 주세요.';
    if (/service_role/i.test(v.anonKey)) return 'service_role 키는 절대 넣으면 안 됩니다 — anon(공개) 키를 넣어 주세요.';
    return null;
  }
  if (!v.apiKey.trim() || !v.projectId.trim() || !v.appId.trim()) {
    return 'apiKey · projectId · appId는 반드시 필요합니다 — Firebase 콘솔의 웹 앱 설정을 그대로 붙여넣어 주세요.';
  }
  if (!/^AIza/.test(v.apiKey.trim())) return 'apiKey 형식이 아닙니다 — AIza… 로 시작하는 값이어야 합니다.';
  if (/^[A-Za-z0-9_-]+:.+:web:/.test(v.appId.trim()) === false) {
    return 'appId 형식이 아닙니다 — 1:1234567890:web:abcdef 모양이어야 합니다.';
  }
  return null;
}

/** Firebase 콘솔에서 복사한 설정 코드 뭉치를 붙여넣으면 값만 뽑아 준다 */
export function parseFirebaseSnippet(text: string): Partial<Record<string, string>> | null {
  const pick = (k: string) => {
    const m = text.match(new RegExp(`${k}\\s*[:=]\\s*["'\`]([^"'\`]+)["'\`]`));
    return m?.[1];
  };
  const apiKey = pick('apiKey');
  const projectId = pick('projectId');
  if (!apiKey && !projectId) return null;
  return {
    apiKey, projectId,
    authDomain: pick('authDomain'),
    storageBucket: pick('storageBucket'),
    appId: pick('appId'),
    messagingSenderId: pick('messagingSenderId'),
  };
}
