// 링크 공유용 제목 (v2.0) — 서버에서 만드는 메타데이터.
//
// 브라우저 탭 제목은 화면이 뜬 뒤에 바꾸므로, 링크를 미리 읽어 가는 쪽(카톡·디스코드·검색)에는
// 보이지 않는다. 그쪽은 서버가 돌려준 HTML만 보기 때문에 늘 기본 제목이 나갔다.
// 그래서 서버에서도 같은 설정을 한 번 읽어 제목을 만든다.
//
// 연결 정보는 배포에 올려 둔 public/ohome.config.json에서 읽고(방문자에게도 공개되는 값),
// 설정은 각 서비스의 공개 읽기 API로 가져온다 — 어차피 사이트 설정은 누구나 읽을 수 있어야
// 방문자에게 같은 모습이 보인다(보안 규칙도 그렇게 열려 있다).
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface SiteMeta { title: string; subtitle?: string; crawlDesc?: string; favicon?: string }

/** 탭 아이콘은 **저장소 주소일 때만** 서버가 쓸 수 있다 —
 *  로컬 모드의 파일 id는 그 브라우저 안에서만 뜻이 있어 서버가 알 수 없다 (DocIcon이 화면에서 붙인다) */
const httpOnly = (v?: string) => (v && /^https?:\/\//.test(v) ? v : undefined);

const SETTING_KEY = 'ohome.site.v1';
const FALLBACK: SiteMeta = { title: 'O.HOME' };

type Cfg =
  | { kind: 'firebase'; projectId: string; apiKey: string; databaseId?: string }
  | { kind: 'supabase'; url: string; anonKey: string };

/** 배포에 올라간 연결 설정 읽기 — 없으면 env, 그것도 없으면 null (api/push 라우트도 쓴다 — 호출한 사람 확인용) */
export async function serverSideConfig(): Promise<Cfg | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), 'public', 'ohome.config.json'), 'utf8');
    const o = JSON.parse(raw) as Record<string, string>;
    if (o.apiKey && o.projectId) {
      return { kind: 'firebase', projectId: o.projectId, apiKey: o.apiKey, databaseId: o.databaseId };
    }
    if (o.url && o.anonKey) return { kind: 'supabase', url: o.url, anonKey: o.anonKey };
  } catch { /* 파일이 없으면 env로 */ }
  const pid = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (pid && key) {
    return { kind: 'firebase', projectId: pid, apiKey: key, databaseId: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anon) return { kind: 'supabase', url, anonKey: anon };
  return null;
}

/** Firestore REST 응답에서 문자열 값 꺼내기 (문서는 타입 래핑이 붙어 온다) */
function fromFirestore(doc: unknown): SiteMeta | null {
  const fields = (doc as { fields?: Record<string, unknown> })?.fields;
  const v = (fields?.value as { stringValue?: string; mapValue?: { fields?: Record<string, { stringValue?: string }> } });
  // 설정은 JSON 문자열이 아니라 맵으로 저장된다
  const m = v?.mapValue?.fields;
  const title = m?.title?.stringValue;
  const docTitle = m?.docTitle?.stringValue;
  const subtitle = m?.subtitle?.stringValue;
  const crawlDesc = m?.crawlDesc?.stringValue;
  const favicon = httpOnly(m?.favicon?.stringValue);
  // 제목을 안 정했어도 설명·아이콘은 살린다 — 예전엔 제목이 비면 통째로 버려서,
  // 크롤링 문구만 적어 둔 경우 그 문구가 조용히 무시됐다 (v2.0)
  const t = (docTitle || '').trim() || (title ? `${title} — 개인홈` : '');
  if (!t && !crawlDesc && !subtitle && !favicon) return null;
  return { title: t || FALLBACK.title, subtitle, crawlDesc, favicon };
}

/**
 * 서버에서 사이트 제목 읽기 — 실패하면 기본값으로 조용히 넘어간다.
 * 5분 캐시: 제목은 자주 바뀌지 않고, 매 요청마다 외부 호출을 하면 첫 응답이 느려진다.
 */
export async function siteMeta(): Promise<SiteMeta> {
  try {
    const cfg = await serverSideConfig();
    if (!cfg) return FALLBACK;
    if (cfg.kind === 'firebase') {
      const db = cfg.databaseId && cfg.databaseId !== '(default)' ? cfg.databaseId : '(default)';
      const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${encodeURIComponent(db)}`
        + `/documents/settings/${encodeURIComponent(SETTING_KEY)}?key=${cfg.apiKey}`;
      const res = await fetch(url, { next: { revalidate: 300 } });
      if (!res.ok) return FALLBACK;
      return fromFirestore(await res.json()) ?? FALLBACK;
    }
    const url = `${cfg.url.replace(/\/$/, '')}/rest/v1/site_settings?key=eq.${encodeURIComponent(SETTING_KEY)}&select=value`;
    const res = await fetch(url, {
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` },
      next: { revalidate: 300 },
    });
    if (!res.ok) return FALLBACK;
    const rows = await res.json() as
      { value?: { title?: string; docTitle?: string; subtitle?: string; crawlDesc?: string; favicon?: string } }[];
    const v = rows?.[0]?.value;
    // 제목을 안 정했어도 설명·아이콘은 살린다 (위 Firestore 쪽과 같은 이유)
    const t = (v?.docTitle || '').trim() || (v?.title ? `${v.title} — 개인홈` : '');
    const favicon = httpOnly(v?.favicon);
    return { title: t || FALLBACK.title, subtitle: v?.subtitle, crawlDesc: v?.crawlDesc, favicon };
  } catch {
    return FALLBACK;   // 네트워크·권한 문제면 기본 제목으로
  }
}
