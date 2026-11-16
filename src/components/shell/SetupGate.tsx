'use client';
// 설치 초기 화면 (v2.0) — 배포본은 공개 홈 전용이라 서버 연결이 필수다.
// Supabase / Firebase 중 하나를 고르고, 연결값 입력 → 규칙(스키마) 적용 → 연결 확인 →
// 관리자 계정 만들기 → 설정 파일(ohome.config.json) 내려받기 순서로 진행한다.
// 백업 zip이 있으면 위 과정을 건너뛰고 바로 복원할 수 있다.
import React, { useEffect, useState } from 'react';
import { markSetupDone, isSetupDone } from '@/lib/auth';
import { importBackup } from '@/lib/backup';
import { KInput, KTextarea } from '@/components/ui/Kit';
import { fileDrop } from '@/lib/dnd';
import {
  saveLocalConfig, configFileText, validateConfig, serverConfig, parseFirebaseSnippet,
} from '@/lib/serverConfig';
import type { BackendConfig, BackendKind } from '@/lib/backend/types';
import { createBackend } from '@/lib/backend';
import type { BackendCheck } from '@/lib/backend/types';
import { SCHEMA_SQL } from '@/lib/schemaSql';
import { FIRESTORE_RULES, STORAGE_RULES } from '@/lib/firebaseRules';

export function SetupGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [need, setNeed] = useState(false);
  const [kind, setKind] = useState<BackendKind | null>(null);

  // Supabase 입력
  const [sbUrl, setSbUrl] = useState('');
  const [sbKey, setSbKey] = useState('');
  // Firebase 입력 — 콘솔에서 복사한 설정 뭉치를 붙여넣으면 자동으로 뜯어낸다
  const [fbPaste, setFbPaste] = useState('');
  const [fb, setFb] = useState({ apiKey: '', authDomain: '', projectId: '', storageBucket: '', appId: '', messagingSenderId: '' });
  // 콘솔에서 데이터베이스를 (default) 아닌 이름으로 만든 경우에만 입력 (보통 비워 둔다)
  const [fbDbId, setFbDbId] = useState('');

  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<BackendCheck | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [copied, setCopied] = useState('');

  // 관리자 계정
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [nick, setNick] = useState('');
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);

  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  // 설정 등록 도우미 — 저장소 주소를 넣으면 GitHub 업로드 화면으로 바로 보낸다 (터미널 불필요)
  const [repo, setRepo] = useState('');
  const uploadUrl = (() => {
    const m = repo.trim().match(/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
    return m ? `https://github.com/${m[1]}/${m[2]}/upload/main/public` : '';
  })();

  useEffect(() => {
    if (serverConfig() || isSetupDone()) { setReady(true); return; }
    setNeed(true);
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!need) return <>{children}</>;

  const cfg = (): BackendConfig => (kind === 'firebase'
    ? {
        kind: 'firebase',
        apiKey: fb.apiKey.trim(),
        authDomain: fb.authDomain.trim() || `${fb.projectId.trim()}.firebaseapp.com`,
        projectId: fb.projectId.trim(),
        storageBucket: fb.storageBucket.trim() || `${fb.projectId.trim()}.appspot.com`,
        appId: fb.appId.trim(),
        messagingSenderId: fb.messagingSenderId.trim() || undefined,
        databaseId: fbDbId.trim() || undefined,
      }
    : { kind: 'supabase', url: sbUrl.trim(), anonKey: sbKey.trim() });

  // 저장소 CORS 열기 명령 — 입력한 버킷 이름을 그대로 넣어 준다 (백업에 이미지가 담기려면 필요)
  const corsCmd = [
    `echo '[{"origin":["*"],"method":["GET"],"maxAgeSeconds":3600}]' > cors.json`,
    `gcloud storage buckets update gs://${fb.storageBucket.trim() || `${fb.projectId.trim() || '내프로젝트'}.firebasestorage.app`} --cors-file=cors.json`,
  ].join('\n');

  const restore = async (f: File) => {
    setErr(''); setBusy(true);
    try {
      await importBackup(f);
      markSetupDone();
      window.location.reload();
    } catch {
      setErr('복원에 실패했습니다 — 백업 zip 파일을 확인해 주세요.');
      setBusy(false);
    }
  };

  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setRulesOpen(true);
      setErr('자동 복사가 막혀 있습니다 — 아래 내용을 직접 선택해 복사해 주세요.');
    }
  };

  const applyPaste = (text: string) => {
    setFbPaste(text);
    const v = parseFirebaseSnippet(text);
    if (v) {
      setFb(f => ({
        apiKey: v.apiKey ?? f.apiKey,
        authDomain: v.authDomain ?? f.authDomain,
        projectId: v.projectId ?? f.projectId,
        storageBucket: v.storageBucket ?? f.storageBucket,
        appId: v.appId ?? f.appId,
        messagingSenderId: v.messagingSenderId ?? f.messagingSenderId,
      }));
      setErr('');
    }
  };

  const runCheck = async () => {
    setErr(''); setCheck(null);
    const c = cfg();
    const bad = validateConfig(c);
    if (bad) { setErr(bad); return; }
    setChecking(true);
    try {
      const be = await createBackend(c);
      const r = await be.check();
      setCheck(r);
      if (!r.ok && r.reachable) setRulesOpen(true);
    } catch (e) {
      setErr(`연결에 실패했습니다 — ${(e as { message?: string })?.message ?? '설정값을 확인해 주세요.'}`);
    }
    setChecking(false);
  };

  const signUpAdmin = async () => {
    setErr('');
    if (!email.trim() || !pw) { setErr('이메일과 비밀번호를 입력해 주세요.'); return; }
    if (pw !== pw2) { setErr('비밀번호 확인이 일치하지 않습니다.'); return; }
    if (pw.length < 6) { setErr('비밀번호는 6자 이상이어야 합니다.'); return; }
    setSigning(true);
    try {
      const be = await createBackend(cfg());
      let r = await be.signUp(email.trim(), pw, nick.trim() || email.split('@')[0]);
      // 앞선 시도가 저장 도중 끊겨 로그인 계정만 남은 경우 — 같은 비밀번호로 들어가 이어서 진행한다
      if (!r.ok && /이미 사용 중/.test(r.error ?? '')) {
        const back = await be.signIn(email.trim(), pw);
        r = back.ok ? { ok: true } : {
          ok: false,
          error: '이미 있는 계정입니다 — 비밀번호가 다르다면 Firebase 콘솔의 Authentication → Users에서 그 계정을 지우고 다시 시도해 주세요.',
        };
      }
      if (!r.ok) { setErr(`계정 만들기에 실패했습니다 — ${r.error}`); setSigning(false); return; }
      // Firebase는 첫 계정을 소유자로 등록해야 관리자가 된다 (Supabase는 트리거가 처리)
      const claim = await be.claimOwner();
      if (!claim.ok) { setErr(`관리자 등록에 실패했습니다 — ${claim.error}`); setSigning(false); return; }
      setSigned(true);
    } catch (e) {
      setErr(`계정 만들기에 실패했습니다 — ${(e as { message?: string })?.message ?? ''}`);
    }
    setSigning(false);
  };

  /** Vercel 환경변수로 등록할 때 붙여넣을 내용 */
  const envText = () => {
    const c = cfg();
    return c.kind === 'supabase'
      ? `NEXT_PUBLIC_SUPABASE_URL=${c.url}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${c.anonKey}`
      : [
          `NEXT_PUBLIC_FIREBASE_API_KEY=${c.apiKey}`,
          `NEXT_PUBLIC_FIREBASE_PROJECT_ID=${c.projectId}`,
          `NEXT_PUBLIC_FIREBASE_APP_ID=${c.appId}`,
          `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${c.authDomain}`,
          `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${c.storageBucket}`,
          ...(c.databaseId ? [`NEXT_PUBLIC_FIREBASE_DATABASE_ID=${c.databaseId}`] : []),
        ].join('\n');
  };

  const downloadConfig = () => {
    const blob = new Blob([configFileText(cfg())], { type: 'application/json' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.download = 'ohome.config.json';
    a.click();
    URL.revokeObjectURL(u);
  };

  const start = () => {
    saveLocalConfig(cfg());
    markSetupDone();
    window.location.reload();
  };

  const doneStep = signed || (check?.ok && check.hasAdmin);

  return (
    <div className="setup-wrap">
      <div className="panel setup-box wide">
        <h1>O.HOME</h1>
        <p className="d">홈을 처음 여는 중입니다 — 데이터베이스를 연결하면 시작됩니다</p>
        {/* 남의 완성된 홈에 들어왔는데 이 화면이 뜨는 경우 (v2.0 포크 제보) — 주인의 연결이
            그 브라우저에만 저장돼 배포에 안 올라간 상태다. 방문자가 주인에게 전달할 단서를 남긴다 */}
        <p className="hint" style={{ margin: '2px 0 10px' }}>
          이미 만들어진 홈의 주소로 들어왔는데 이 화면이 보인다면 — 홈 주인이 설치 마지막 단계
          「방문자에게도 보이게 하기」(ohome.config.json 올리기)를 아직 하지 않은 것입니다. 주인에게 알려 주세요.
        </p>

        {/* ── 백엔드 선택 ───────────────────────────────────── */}
        {!kind && (
          <>
            <button type="button" className="setup-pick" onClick={() => setKind('supabase')}>
              <b>Supabase</b>
              <small>Postgres 기반. 무료로 시작(저장 1GB) — 글이 많고 이미지는 적은 홈에 알맞습니다.</small>
            </button>
            <button type="button" className="setup-pick" onClick={() => setKind('firebase')}>
              <b>Firebase</b>
              <small>사용량 과금(고정비 없음). 이미지 저장 무료 한도가 5GB로 넉넉합니다 — 그림이 많은 홈에 알맞습니다.</small>
            </button>
          </>
        )}

        {/* ── 연결 단계 ─────────────────────────────────────── */}
        {kind && (
          <ol className="setup-steps">
            {kind === 'supabase' ? (
              <>
                <li>
                  <b>Supabase 프로젝트 만들기</b>
                  <small>
                    <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">supabase.com</a>에서
                    <b> [New project]</b>를 누릅니다. 아래 두 가지만 신경 쓰면 됩니다.
                  </small>
                  <ul className="setup-picks">
                    <li>
                      <b>Region</b> — <b>Northeast Asia (Seoul)</b>
                      <em className="warn">나중에 바꿀 수 없습니다.</em>
                      <em>무료 요금제에서도 자유롭게 고를 수 있으니 가까운 서울이 가장 빠릅니다.</em>
                    </li>
                    <li>
                      <b>Database Password</b> — 만든 뒤 <b>어딘가에 저장해 두세요</b>
                      <em>다시 볼 수 없습니다. 홈을 쓰는 데는 필요 없지만, 나중에 데이터베이스에 직접 접속할 일이 생기면 이 값이 필요합니다.</em>
                    </li>
                  </ul>
                  <small style={{ marginTop: 8 }}>
                    만들어지는 데 1~2분 걸립니다. 끝나면 <b>Project Settings → API</b>로 갑니다.
                  </small>
                </li>
                <li>
                  <b>주소와 키 붙여넣기</b>
                  <small>Project URL과 <b>anon public</b> 키입니다. service_role 키는 절대 넣지 마세요.</small>
                  <label className="k-label">Project URL</label>
                  <KInput value={sbUrl} onChange={e => setSbUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
                  <label className="k-label">anon public key</label>
                  <KInput value={sbKey} onChange={e => setSbKey(e.target.value)} />
                </li>
                <li>
                  <b>스키마 한 번 실행</b>
                  <small>SQL Editor에 붙여넣고 [Run]. 테이블·권한·이미지 저장소가 만들어집니다.</small>
                  <div className="setup-row">
                    <button className="btn btn-dark" onClick={() => copy(SCHEMA_SQL, 'sql')}>
                      {copied === 'sql' ? '복사됨 ✓' : 'SQL 복사'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setRulesOpen(o => !o)}>
                      {rulesOpen ? '내용 접기' : '내용 보기'}
                    </button>
                  </div>
                  {rulesOpen && <pre className="setup-sql">{SCHEMA_SQL}</pre>}
                </li>
              </>
            ) : (
              <>
                <li>
                  <b>Firebase 프로젝트 만들기</b>
                  <small>
                    <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer">Firebase 콘솔</a>에서
                    프로젝트를 만든 뒤 아래 네 가지를 순서대로 합니다.
                    <b> 위치는 나중에 바꿀 수 없으니</b> 적어 둔 값으로 골라 주세요.
                  </small>
                  <ul className="setup-picks">
                    <li>
                      <b>1. Authentication</b> → 시작하기 → <b>이메일/비밀번호</b> 사용 설정
                      <em>이걸 켜지 않으면 아래에서 관리자 계정을 만들 수 없습니다.</em>
                    </li>
                    <li>
                      <b>2. Firestore Database</b> → 데이터베이스 만들기 <span className="warn">(글·설정이 저장되는 곳)</span>
                      <em>· 에디션 <b>Standard</b> — Enterprise는 대규모 서비스용이라 고를 이유가 없습니다</em>
                      <em>· 위치 <b>asia-northeast3 (서울)</b> — 어느 지역이든 무료 한도가 같으니 가까운 곳이 유리합니다</em>
                      <em>· 보안 규칙 <b>프로덕션 모드에서 시작</b> — 테스트 모드는 30일간 누구나 읽고 쓸 수 있습니다</em>
                      <em>· 데이터베이스 ID는 <b>(default)</b> 그대로 — 바꾸면 홈이 못 찾습니다</em>
                    </li>
                    <li>
                      <b>3. Storage</b> → 시작하기 <span className="warn">(이미지가 저장되는 곳)</span>
                      <em>· 무료 5GB를 유지하려면 <b>us-west1 (오레곤)</b> — 미국 리전에만 무료 한도가 적용됩니다</em>
                      <em>· 속도를 원하면 <b>asia-northeast3 (서울)</b> — 월 1,000원 안팎이 듭니다</em>
                      <em>· 미국을 골라도 글·목록은 서울에서 오므로 페이지는 바로 뜨고 사진만 조금 늦게 채워집니다</em>
                      <em>· 종량제(Blaze) 전환을 요구할 수 있습니다 — 무료 한도 안에서는 청구되지 않습니다</em>
                    </li>
                    <li>
                      <b>4. 웹 앱 등록</b> → ⚙️ <b>프로젝트 설정 → 일반 → 맨 아래 「내 앱」 → 앱 추가 → 웹</b>
                      <em className="warn">왼쪽 메뉴의 「App Hosting(앱 호스팅)」이 아닙니다.</em>
                      <em>그건 홈을 Firebase에서 직접 굴리는 기능인데, 이 홈은 이미 Vercel에 올라가 있어 쓰지 않습니다.</em>
                    </li>
                    <li>
                      <b>5. 저장소 CORS 열기</b> <span className="warn">(백업을 쓰려면 필요 — 지금 해 두면 편합니다)</span>
                      <em>Firebase Storage는 다른 주소에서 파일을 <b>읽어 가는 것</b>을 기본적으로 막습니다. 홈에서 그림 보는 데는 지장이 없지만, <b>백업 zip을 만들 때 이미지가 통째로 빠집니다.</b></em>
                      <em>
                        <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer">Google Cloud Console</a>
                        에서 이 프로젝트를 고르고 오른쪽 위 <b>{'>_'} (Cloud Shell)</b>을 연 뒤, 아래 두 줄을 붙여넣고 Enter — 설치할 프로그램은 없습니다.
                      </em>
                      <div className="setup-row" style={{ marginTop: 6 }}>
                        <button className="btn btn-ghost" onClick={() => copy(corsCmd, 'cors')}>
                          {copied === 'cors' ? '복사됨 ✓' : '명령어 복사'}
                        </button>
                      </div>
                      <pre className="setup-sql" style={{ maxHeight: 92, marginTop: 6 }}>{corsCmd}</pre>
                      <em>여는 것은 <b>읽기(GET)뿐</b>이고, 이미 공개된 이미지라 새로 위험해지는 것은 없습니다. 나중에 해도 되지만 그때까지의 백업에는 이미지가 빠집니다.</em>
                    </li>
                  </ul>
                </li>
                <li>
                  <b>설정값 붙여넣기</b>
                  <small>웹 앱 추가 후 나오는 <b>firebaseConfig</b> 코드를 통째로 붙여넣으면 값이 자동으로 채워집니다.</small>
                  <KTextarea value={fbPaste} onChange={e => applyPaste(e.target.value)}
                    style={{ minHeight: 90, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11.5 }} />
                  <div className="setup-2">
                    <div>
                      <label className="k-label">apiKey</label>
                      <KInput value={fb.apiKey} onChange={e => setFb(f => ({ ...f, apiKey: e.target.value }))} />
                    </div>
                    <div>
                      <label className="k-label">projectId</label>
                      <KInput value={fb.projectId} onChange={e => setFb(f => ({ ...f, projectId: e.target.value }))} />
                    </div>
                  </div>
                  <div className="setup-2">
                    <div>
                      <label className="k-label">appId</label>
                      <KInput value={fb.appId} onChange={e => setFb(f => ({ ...f, appId: e.target.value }))} />
                    </div>
                    <div>
                      <label className="k-label">storageBucket</label>
                      <KInput value={fb.storageBucket} onChange={e => setFb(f => ({ ...f, storageBucket: e.target.value }))} />
                    </div>
                  </div>
                  <label className="k-label">데이터베이스 ID (비워 두세요)</label>
                  <KInput value={fbDbId} onChange={e => setFbDbId(e.target.value)} />
                  <p className="hint" style={{ margin: '4px 0 0' }}>
                    Firestore를 만들 때 이름을 <b>(default)</b>가 아닌 다른 것으로 지정했을 때만 그 이름을 적습니다.
                  </p>
                </li>
                <li>
                  <b>보안 규칙 붙여넣기</b>
                  <small>
                    Firestore → <b>규칙</b>과 Storage → <b>규칙</b>에 각각 붙여넣고 [게시]합니다.
                    이 규칙이 공개범위·작성자 수정 권한을 담당합니다.
                  </small>
                  <div className="setup-row">
                    <button className="btn btn-dark" onClick={() => copy(FIRESTORE_RULES, 'fs')}>
                      {copied === 'fs' ? '복사됨 ✓' : 'Firestore 규칙 복사'}
                    </button>
                    <button className="btn btn-dark" onClick={() => copy(STORAGE_RULES, 'st')}>
                      {copied === 'st' ? '복사됨 ✓' : 'Storage 규칙 복사'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setRulesOpen(o => !o)}>
                      {rulesOpen ? '내용 접기' : '내용 보기'}
                    </button>
                  </div>
                  {rulesOpen && (
                    <>
                      <pre className="setup-sql">{FIRESTORE_RULES}</pre>
                      <pre className="setup-sql">{STORAGE_RULES}</pre>
                    </>
                  )}
                </li>
              </>
            )}

            <li>
              <b>연결 확인</b>
              <small>값이 맞는지, 규칙이 적용됐는지 검사합니다.</small>
              <button className="btn btn-dark" style={{ height: 33, padding: '0 16px', fontSize: 11, marginTop: 6 }}
                disabled={checking} onClick={runCheck}>{checking ? '확인 중…' : '연결 확인'}</button>
              {check && <p className={check.ok ? 'setup-ok' : 'setup-err'} style={{ marginTop: 8 }}>{check.message}</p>}
            </li>

            {check?.ok && !check.hasAdmin && !signed && (
              <li>
                <b>관리자 계정 만들기</b>
                <small>여기서 만드는 첫 계정이 이 홈의 관리자가 됩니다.</small>
                <label className="k-label">이메일</label>
                <KInput value={email} onChange={e => setEmail(e.target.value)} />
                <div className="setup-2">
                  <div>
                    <label className="k-label">비밀번호</label>
                    <KInput type="password" value={pw} onChange={e => setPw(e.target.value)} />
                  </div>
                  <div>
                    <label className="k-label">비밀번호 확인</label>
                    <KInput type="password" value={pw2} onChange={e => setPw2(e.target.value)} />
                  </div>
                </div>
                <label className="k-label">표시 이름 (선택)</label>
                <KInput value={nick} onChange={e => setNick(e.target.value)} />
                <button className="btn btn-dark" style={{ height: 33, padding: '0 16px', fontSize: 11, marginTop: 10 }}
                  disabled={signing} onClick={signUpAdmin}>{signing ? '만드는 중…' : '관리자 계정 만들기'}</button>
              </li>
            )}

            {doneStep && (
              <li>
                <b>방문자에게도 보이게 하기</b>
                <small>
                  지금은 <b>이 브라우저에서만</b> 연결돼 있습니다. 아래 둘 중 편한 방법으로 한 번만 등록하면
                  방문자도 같은 데이터베이스를 봅니다. (둘 다 공개용 값이라 노출돼도 안전합니다)
                </small>

                <div className="setup-way">
                  <b>방법 1 — 파일 올리기 (권장)</b>
                  <p>설정 파일을 내려받아 저장소의 <code>public</code> 폴더에 올립니다. 터미널 없이 웹에서 됩니다.</p>
                  <div className="setup-row">
                    <button className="btn btn-dark" onClick={downloadConfig}>① 설정 파일 내려받기</button>
                  </div>
                  <label className="k-label">② 내 저장소 주소를 넣으면 올릴 페이지를 바로 열어 드립니다</label>
                  <KInput value={repo} onChange={e => setRepo(e.target.value)}
                    placeholder="https://github.com/내계정/저장소" />
                  {uploadUrl ? (
                    <div className="setup-row">
                      <a className="btn btn-dark" href={uploadUrl} target="_blank" rel="noreferrer">
                        GitHub 업로드 페이지 열기 ↗
                      </a>
                      <span className="hint" style={{ alignSelf: 'center' }}>
                        열린 화면에 파일을 끌어다 놓고 [Commit changes] — 1~2분 뒤 자동 반영
                      </span>
                    </div>
                  ) : (
                    repo.trim() && <p className="setup-err">저장소 주소 형식이 아닙니다 — https://github.com/계정/저장소</p>
                  )}
                </div>

                <div className="setup-way">
                  <b>방법 2 — Vercel 환경변수</b>
                  <p>Vercel 프로젝트 → Settings → Environment Variables에 아래를 넣고 재배포합니다.</p>
                  <div className="setup-row">
                    <button className="btn btn-ghost" onClick={() => copy(envText(), 'env')}>
                      {copied === 'env' ? '복사됨 ✓' : '환경변수 복사'}
                    </button>
                  </div>
                  <pre className="setup-sql" style={{ maxHeight: 150 }}>{envText()}</pre>
                </div>
              </li>
            )}

            {doneStep && (
              <li>
                <b>서버 위치를 서울로 (한국에서 쓴다면)</b>
                <small>
                  Vercel은 서버를 <b>미국 동부</b>에 두는 것이 기본값이라, 그냥 두면 페이지를 열 때마다
                  태평양을 왕복합니다. <b>자동으로는 바뀌지 않으니</b> 직접 한 번 눌러 주세요 — 30초면 됩니다.
                </small>
                <ul className="setup-picks">
                  <li>
                    <b>Settings → Functions → Function Region → Seoul (icn1) → 저장</b>
                    <em className="warn">저장만 하면 안 바뀝니다 — Deployments → 맨 위 배포의 ⋯ → Redeploy까지 해야 적용됩니다.</em>
                    <em>확인: 홈에서 F12 → Network → 맨 위 요청 → Response Headers의 x-vercel-id가 icn1로 시작하면 성공입니다.</em>
                  </li>
                </ul>
              </li>
            )}
          </ol>
        )}

        {signed && <p className="setup-ok">관리자 계정이 만들어졌습니다. 메일 인증이 켜져 있으면 확인 후 로그인해 주세요.</p>}
        {err && <p className="setup-err">{err}</p>}

        {doneStep && <button className="btn btn-accent setup-go" onClick={start}>홈 시작하기</button>}
        {kind && (
          <button className="btn btn-ghost setup-back"
            onClick={() => { setKind(null); setErr(''); setCheck(null); setRulesOpen(false); }}>← 다른 서비스 고르기</button>
        )}

        <div className="setup-sep" />
        <label className="k-label">이미 백업이 있다면</label>
        <p className="hint" style={{ margin: '0 0 8px' }}>
          백업 zip을 넣으면 위 과정을 건너뛰고 그 내용 그대로 시작합니다.
        </p>
        <input id="setupZip" type="file" accept=".zip" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0] ?? null; setFile(f); e.target.value = ''; if (f) restore(f); }} />
        <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
          disabled={busy}
          onClick={() => document.getElementById('setupZip')?.click()}
          {...fileDrop(fl => { const f = fl[0]; if (f) { setFile(f); restore(f); } })}>
          {busy ? '복원 중…' : file ? file.name : '백업 zip 선택 · 끌어다 놓기'}
        </button>
      </div>
    </div>
  );
}
