// 웹푸시 보내기 (커플홈 사용자 요청) — 이 홈에서 유일한 서버 코드.
//
// 푸시는 구독 때 쓴 공개키의 짝인 **개인키**로 서명해야 푸시 서비스가 받아 준다. 개인키는 브라우저에 둘 수 없으므로
// Vercel 환경변수 PUSH_VAPID_PRIVATE_KEY 에 두고, 이 라우트가 서명해 보낸다. 공개키는 개인키에서 만든다 —
// 설치하는 사람은 환경변수 하나만 등록하면 된다 (환경설정 → 회원/보안 → 웹푸시에서 키를 만들어 복사).
//
//  GET  /api/push → { enabled, publicKey }        브라우저가 구독할 때 쓰는 공개키
//  POST /api/push { subs, payload }                받는 사람 구독들로 보내기 — 호출한 사람이 이 홈의 로그인 계정인지
//                                                  각 서비스의 공개 API로 확인한다 (관리자 키 없이). 구독 자체는 회원끼리
//                                                  읽히지만(push_subs, member) 개인키 없이는 아무도 보낼 수 없다.
import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { createECDH } from 'node:crypto';
import { serverSideConfig } from '@/lib/siteMeta';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const b64u = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64u = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/** 환경변수의 개인키(base64url 32바이트, P-256)에서 공개키(65바이트 비압축 점)를 만든다 */
function vapidKeys(): { publicKey: string; privateKey: string } | null {
  const priv = (process.env.PUSH_VAPID_PRIVATE_KEY ?? '').trim();
  if (!priv) return null;
  try {
    const raw = fromB64u(priv);
    if (raw.length !== 32) return null;
    const ecdh = createECDH('prime256v1');
    ecdh.setPrivateKey(raw);
    return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(raw) };
  } catch { return null; }
}

const NO_STORE = { 'Cache-Control': 'no-store' };

export async function GET() {
  const k = vapidKeys();
  return NextResponse.json(k ? { enabled: true, publicKey: k.publicKey } : { enabled: false }, { headers: NO_STORE });
}

/** 호출한 사람이 이 홈의 로그인 계정인지 — 토큰을 각 서비스의 공개 API로 확인한다.
 *  연결 설정이 없으면(브라우저 저장 모드) 회원 자체가 없으니 확인할 것도 없다 */
async function verifyCaller(token: string): Promise<boolean> {
  const cfg = await serverSideConfig();
  if (!cfg) return true;              // 브라우저 저장 모드 — 회원 자체가 없다
  if (!token) return false;
  try {
    if (cfg.kind === 'supabase') {
      // Supabase — 액세스 토큰을 Auth 공개 API로 확인한다
      const r = await fetch(`${cfg.url}/auth/v1/user`, {
        headers: { Authorization: `Bearer ${token}`, apikey: cfg.anonKey }, cache: 'no-store',
      });
      if (!r.ok) return false;
      const j = await r.json() as { id?: string };
      return !!j.id;
    }
    // Firebase — ID 토큰을 Identity Toolkit 공개 API로 확인한다
    const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(cfg.apiKey)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken: token }), cache: 'no-store',
    });
    if (!r.ok) return false;
    const j = await r.json() as { users?: { localId?: string }[] };
    return !!j.users?.[0]?.localId;
  } catch { return false; }
}

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };
const isSub = (s: unknown): s is Sub => {
  const o = s as Sub;
  return !!o && typeof o.endpoint === 'string' && /^https:\/\//.test(o.endpoint)
    && !!o.keys && typeof o.keys.p256dh === 'string' && typeof o.keys.auth === 'string';
};

export async function POST(req: NextRequest) {
  const k = vapidKeys();
  if (!k) return NextResponse.json({ error: 'no-key' }, { status: 503, headers: NO_STORE });
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!(await verifyCaller(token))) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: NO_STORE });

  let body: { subs?: unknown[]; payload?: Record<string, unknown> } = {};
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad-json' }, { status: 400, headers: NO_STORE }); }
  const subs = (Array.isArray(body.subs) ? body.subs : []).filter(isSub).slice(0, 30);
  const p = body.payload ?? {};
  const payload = JSON.stringify({
    title: String(p.title ?? '').slice(0, 120),
    body: String(p.body ?? '').slice(0, 400),
    url: String(p.url ?? '/').slice(0, 500),
    ...(p.tag ? { tag: String(p.tag).slice(0, 80) } : {}),
    // 알림 아이콘 — 홈의 탭 아이콘(저장소의 https 주소만)
    ...(typeof p.icon === 'string' && p.icon.startsWith('https://') && p.icon.length <= 500 ? { icon: p.icon } : {}),
  });

  // VAPID 연락처(subject) — 이 홈의 주소. 푸시 서비스가 문제가 있을 때 연락할 곳으로 요구하는 값
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'localhost';
  webpush.setVapidDetails(`https://${host.split(',')[0].trim()}`, k.publicKey, k.privateKey);

  const results = await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification(s, payload, { TTL: 60 * 60 * 24 });
      return { endpoint: s.endpoint, ok: true, code: 0 };
    } catch (e) {
      return { endpoint: s.endpoint, ok: false, code: (e as { statusCode?: number }).statusCode ?? 0 };
    }
  }));
  return NextResponse.json({
    sent: results.filter(r => r.ok).length,
    failed: results.filter(r => !r.ok).length,
    // 404·410 = 브라우저가 구독을 지웠다 — 보낸 쪽이 자기 것이면 목록에서 치운다
    dead: results.filter(r => r.code === 404 || r.code === 410).map(r => r.endpoint),
  }, { headers: NO_STORE });
}
