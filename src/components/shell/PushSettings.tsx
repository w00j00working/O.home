'use client';
// 웹푸시 설정 (커플홈 사용자 요청) — 정보수정의 「WEB PUSH」(PC·모바일 체크, 처음엔 둘 다 해제)와
// 환경설정 회원/보안의 「웹푸시」(관리자 — 서버 키 만들기). 동작 원리는 lib/push.ts 머리말.
import React, { useEffect, useState } from 'react';
import { useLocalList, newId } from '@/lib/postStore';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { KCheck, KInput } from '@/components/ui/Kit';
import {
  PUSH_KEY, PUSH_HIDE_KEY, PushSub, PushKind, pushSupported, isIos, isStandalone, deviceKind, deviceLabel, inAppBrowser,
  serverPushKey, ServerPushKey, currentBrowserSub, subscribeBrowser, unsubscribeBrowser, subJson, webPushTo, dropSubsCache,
} from '@/lib/push';

const KIND_NAME: Record<PushKind, string> = { pc: 'PC', mobile: '모바일' };

/** 정보수정(마이페이지) — 웹푸시 알림 받기 */
export function PushSettings() {
  const { user } = useAuth();
  const toast = useToast();
  const [subs, setSubs, loaded] = useLocalList<PushSub>(PUSH_KEY, []);
  const [server, setServer] = useState<ServerPushKey | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);   // 이 기기의 브라우저 구독
  const [perm, setPerm] = useState<NotificationPermission | 'unsupported' | null>(null);
  const [env, setEnv] = useState<{ kind: PushKind; label: string; ios: boolean; standalone: boolean; inApp: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  // 내용 숨기기 — 등록된 구독에 적혀 있으면 그 값, 아직 기기가 없으면 이 브라우저에 적어 둔 값 (첫 등록 때 그대로 쓴다)
  const [hidePref, setHidePref] = useState(false);

  useEffect(() => {
    try { setHidePref(localStorage.getItem(PUSH_HIDE_KEY) === '1'); } catch { /* 무시 */ }
    setEnv({ kind: deviceKind(), label: deviceLabel(), ios: isIos(), standalone: isStandalone(), inApp: inAppBrowser() });
    if (!pushSupported()) { setPerm('unsupported'); return; }
    setPerm(Notification.permission);
    void serverPushKey().then(setServer);
    void currentBrowserSub().then(s => setEndpoint(s?.endpoint ?? null));
  }, []);

  if (!user || !env) return null;
  const me = user.id;
  const mine = subs.filter(s => s.userId === me);
  const ofKind = (k: PushKind) => mine.filter(s => s.kind === k);
  const isOn = (k: PushKind) => ofKind(k).some(s => s.on);
  const myKind = env.kind;
  const hideOn = mine.length ? mine.some(s => s.hide) : hidePref;
  const setHide = (v: boolean) => {
    setHidePref(v);
    try { localStorage.setItem(PUSH_HIDE_KEY, v ? '1' : '0'); } catch { /* 무시 */ }
    if (mine.length) { setSubs(subs.map(s => (s.userId === me ? { ...s, hide: v } : s))); dropSubsCache(); }
  };
  const supported = perm !== 'unsupported';
  const iosBlocked = env.ios && !env.standalone;
  const serverOff = server !== null && !server.enabled;

  const setKind = async (k: PushKind, on: boolean) => {
    const flip = (list: PushSub[], v: boolean) => list.map(s => (s.userId === me && s.kind === k ? { ...s, on: v } : s));
    // 끄기 — 어디서든: 그 종류의 구독을 전부 「꺼짐」으로 (서버가 건너뛴다). 구독 자체는 남겨 다시 켤 때 권한 창 없이 켜진다
    if (!on) { setSubs(flip(subs, false)); dropSubsCache(); return; }
    // 다른 종류의 기기 — 이미 등록된 구독이 있어야 켤 수 있다 (권한 창은 그 기기에서만 뜬다)
    if (k !== myKind) {
      if (!ofKind(k).length) { toast(`${KIND_NAME[k]} 기기에서 정보수정을 열어 체크해 주세요`); return; }
      setSubs(flip(subs, true)); dropSubsCache(); return;
    }
    // 이 기기 — 구독을 만든다 (권한 창)
    if (!supported) { toast(env.ios ? '아이폰은 「홈 화면에 추가」로 설치한 아이콘으로 열어야 됩니다' : '이 브라우저는 웹푸시를 지원하지 않습니다'); return; }
    if (iosBlocked) { toast('아이폰·아이패드는 「홈 화면에 추가」로 설치한 뒤 그 아이콘으로 열어야 됩니다'); return; }
    if (!server?.enabled || !server.publicKey) { toast('서버에 푸시 키가 아직 없습니다 — 관리자가 환경설정 → 회원/보안 → 웹푸시에서 등록해야 합니다'); return; }
    setBusy(true);
    try {
      const sub = await subscribeBrowser(server.publicKey);
      const j = subJson(sub);
      if (!j) throw new Error('구독 정보가 비어 있습니다');
      setPerm(Notification.permission);
      setEndpoint(j.endpoint);
      const label = deviceLabel();
      const existing = mine.find(s => s.endpoint === j.endpoint);
      const base = flip(subs, true);
      const next = existing
        ? base.map(s => (s.id === existing.id ? { ...s, on: true, keys: j.keys, kind: k, label } : s))
        : [...base, {
            id: newId(), userId: me, kind: k, label, endpoint: j.endpoint, keys: j.keys, on: true, hide: hideOn,
            createdAt: new Date().toISOString(), authorId: me, visibility: 'member' as const,
          }];
      setSubs(next); dropSubsCache();
      toast('이 기기에서 알림을 받습니다');
    } catch (e) {
      const m = (e as Error)?.message ?? '';
      if (m.startsWith('permission')) {
        setPerm(Notification.permission);
        toast('브라우저에서 알림이 차단되어 있습니다 — 주소창의 자물쇠(사이트 설정)에서 알림을 허용해 주세요');
      } else toast(`구독에 실패했습니다 — ${m}`);
    }
    setBusy(false);
  };

  const remove = async (s: PushSub) => {
    if (s.endpoint === endpoint) { await unsubscribeBrowser(); setEndpoint(null); }
    setSubs(subs.filter(x => x.id !== s.id)); dropSubsCache();
  };

  const test = async () => {
    setBusy(true);
    const r = await webPushTo([me], { title: '테스트 알림', body: '웹푸시가 동작합니다', url: '/mypage', tag: 'push-test', kind: 'test' });
    setBusy(false);
    if (!r) toast('보내지 못했습니다 — 켜 둔 기기가 없거나 서버 키가 없습니다');
    else if (r.sent) toast(`보냈습니다 (기기 ${r.sent}개)`);
    else toast('보내지 못했습니다 — 기기 구독이 만료됐을 수 있습니다. 체크를 껐다 다시 켜 보세요');
  };

  const row = (k: PushKind) => {
    const list = ofKind(k);
    const thisDevice = k === myKind;
    const disabled = busy || !loaded || (!thisDevice && !list.length) || (thisDevice && (!supported || iosBlocked));
    return (
      <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <KCheck label={KIND_NAME[k]} checked={isOn(k)} disabled={disabled} onChange={v => void setKind(k, v)} />
        <small className="hint" style={{ margin: 0 }}>
          {list.length
            ? list.map(s => `${s.label}${s.endpoint === endpoint ? ' (이 기기)' : ''}`).join(' · ')
            : thisDevice ? `이 기기 (${env.label})` : `${KIND_NAME[k]} 기기에서 체크하면 등록됩니다`}
        </small>
      </div>
    );
  };

  return (
    <div className="panel" style={{ padding: 24 }}>
      <h4 style={{ fontSize: 11.5, letterSpacing: '.12em', color: 'var(--faint)', marginBottom: 6 }}>WEB PUSH</h4>
      <p className="hint" style={{ margin: '0 0 12px', lineHeight: 1.6 }}>
        웹푸시 알림 받기 — 체크한 기기에만 역극·댓글·메모·다이어리 알림이 브라우저 알림으로 옵니다 (탭을 닫아도).
        켜기는 그 기기에서, 끄기는 어디서든 됩니다.
      </p>
      <div style={{ display: 'grid', gap: 10 }}>
        {row('pc')}
        {row('mobile')}
        {/* 내용 숨기기 (커플홈 사용자 요청) — 잠금 화면 등에 글 내용이 보이지 않게, 종류만 적은 문구로 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
          <KCheck label="알림에 내용 숨기기" checked={hideOn} disabled={busy} onChange={v => setHide(v)} />
          <small className="hint" style={{ margin: 0 }}>글 내용 대신 「역극 새 메시지 · 내용은 홈에서 확인해 주세요」처럼 종류만 표시</small>
        </div>
      </div>
      {/* 아이폰·아이패드의 브라우저 탭에는 푸시 API 자체가 없다(사파리든 크롬이든) — 홈 화면에 추가한 웹앱에서만 생긴다 (iOS 16.4+).
          그래서 「지원하지 않는다」가 아니라 설치 안내를 보여 준다 (커플홈 사용자 제보: "사파리도 그러네 아이폰이야") */}
      {!supported && (
        <p className="hint" style={{ margin: '10px 0 0', lineHeight: 1.6 }}>
          {env.ios
            ? '아이폰·아이패드는 사파리·크롬 탭에서는 웹푸시가 안 됩니다 — 사파리 공유 버튼(□↑) → 「홈 화면에 추가」로 설치한 뒤, 홈 화면의 그 아이콘으로 열어 로그인하고 여기서 체크해 주세요 (iOS 16.4 이상).'
            : env.inApp
              ? '앱 안의 브라우저(카카오톡·디스코드 등 링크 화면)에서는 웹푸시가 안 됩니다 — 오른쪽 위 ⋯ 메뉴 → 「다른 브라우저로 열기」로 크롬에서 열어 체크해 주세요.'
              : '이 브라우저는 웹푸시를 지원하지 않습니다 — 안드로이드는 크롬·삼성 인터넷·웨일, 아이폰은 홈 화면에 추가한 웹앱에서 됩니다.'}
        </p>
      )}
      {supported && iosBlocked && (
        <p className="hint" style={{ margin: '10px 0 0', lineHeight: 1.6 }}>
          아이폰·아이패드는 사파리 공유 버튼 → 「홈 화면에 추가」로 설치한 뒤, 그 아이콘으로 열어서 체크해야 받을 수 있습니다.
        </p>
      )}
      {supported && perm === 'denied' && (
        <p className="hint" style={{ margin: '10px 0 0', lineHeight: 1.6 }}>
          브라우저에서 이 사이트의 알림이 차단되어 있습니다 — 주소창 자물쇠 → 사이트 설정 → 알림을 허용한 뒤 다시 체크해 주세요.
        </p>
      )}
      {supported && serverOff && (
        <p className="hint" style={{ margin: '10px 0 0', lineHeight: 1.6 }}>
          서버에 푸시 키가 아직 없습니다 — 관리자가 환경설정 → 회원/보안 → 웹푸시에서 등록하면 켤 수 있습니다.
        </p>
      )}
      {mine.length > 0 && (
        <div style={{ marginTop: 14, display: 'grid', gap: 6 }}>
          {mine.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'calc(11.5px*var(--fs,1))' }}>
              <span style={{ color: s.on ? 'var(--ink)' : 'var(--faint)' }}>
                {s.label} · {KIND_NAME[s.kind]} · {s.on ? '켜짐' : '꺼짐'}{s.endpoint === endpoint ? ' · 이 기기' : ''}
              </span>
              <button className="btn btn-ghost" style={{ height: 24, padding: '0 8px', fontSize: 10 }} data-tip="이 기기 등록 지우기"
                onClick={() => void remove(s)} disabled={busy}>✕</button>
            </div>
          ))}
          <div>
            <button className="btn btn-ghost" style={{ marginTop: 4 }} onClick={() => void test()}
              disabled={busy || !isOn(myKind) || !endpoint}>이 기기로 테스트</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 환경설정 회원/보안 — 서버 푸시 키 (관리자) */
export function PushAdminRow() {
  const toast = useToast();
  const [server, setServer] = useState<ServerPushKey | null>(null);
  const [gen, setGen] = useState<{ priv: string; pub: string } | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { void serverPushKey().then(setServer); }, []);

  // VAPID 키 한 쌍 — 브라우저 안에서 만들고(WebCrypto) 개인키만 보여 준다. 어디에도 저장하지 않는다
  const generate = async () => {
    try {
      const kp = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      const jwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
      const raw = await crypto.subtle.exportKey('raw', kp.publicKey);
      const b64u = (b: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      if (!jwk.d) throw new Error('키 내보내기 실패');
      setGen({ priv: jwk.d, pub: b64u(raw) });
      setCopied(false);
    } catch (e) { toast(`키를 만들지 못했습니다 — ${(e as Error).message}`); }
  };
  const copy = async () => {
    if (!gen) return;
    try { await navigator.clipboard.writeText(gen.priv); setCopied(true); }
    catch { toast('복사하지 못했습니다 — 직접 선택해 복사해 주세요'); }
  };

  return (
    <>
      <h3 style={{ marginTop: 26 }}>웹푸시</h3>
      <div className="d">회원이 정보수정에서 켜면 알림이 브라우저 푸시로도 갑니다 — 서버에 개인키(VAPID)가 있어야 보낼 수 있습니다</div>
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l">
          <b>서버 푸시 키</b>
          <small>
            {server === null ? '확인 중…'
              : server.enabled ? '등록됨 ✓ — 회원들이 정보수정 → WEB PUSH에서 켤 수 있습니다'
              : '아직 없음 — 키를 만들어 Vercel 환경변수에 넣으면 됩니다'}
          </small>
        </div>
        <button className="btn btn-dark" onClick={() => void generate()}>{server?.enabled ? '새 키 만들기' : '키 만들기'}</button>
      </div>
      {gen && (
        <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
          <div className="d" style={{ marginBottom: 0, lineHeight: 1.7 }}>
            ① 아래 개인키를 복사 → Vercel → 프로젝트 → Settings → Environment Variables → 이름 <code>PUSH_VAPID_PRIVATE_KEY</code>, 값에 붙여넣고 Save<br />
            ② Deployments → 최신 배포의 ⋯ → Redeploy (환경변수는 다시 배포해야 적용됩니다)<br />
            ③ 다시 이 화면을 열면 「등록됨」으로 바뀝니다. 키는 지금만 보입니다 — 잃어버리면 새로 만들어 바꿔 넣으면 되고, 회원들은 다시 체크하면 됩니다
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <KInput readOnly value={gen.priv} style={{ flex: 1, minWidth: 260, fontFamily: 'monospace' }} onFocus={e => e.currentTarget.select()} />
            <button className="btn btn-dark" onClick={() => void copy()}>{copied ? '복사됨 ✓' : '개인키 복사'}</button>
          </div>
        </div>
      )}
    </>
  );
}
