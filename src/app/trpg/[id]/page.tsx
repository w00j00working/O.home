'use client';
// TRPG 로그 상세 (4.3) — HTML이면 원본 스타일 그대로 격리 렌더(iframe 샌드박스, 스크립트 실행 안 됨),
// 일반 텍스트면 로그용 기본 서식으로 표시
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useHrefBlock } from '@/components/shell/MenuGuard';
import { sectionHref, MAIN_SEC, secStamp, useSectionTitle } from '@/lib/sectionStore';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { TrpgLog, TRPG_SEED, TrpgLogBody, TRPG_BODY_SEED, bodyVisibility, showAsHtml, decodeLogText, logNo, saveLogBody } from '@/lib/galleryStore';
import { Relation, REL_SEED, Character, CHAR_SEED, charGrant } from '@/lib/charStore';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { getBlob, putBlob, useBlobUrl } from '@/lib/blobStore';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';
import { KInput, KSelect, KDate, KTextarea } from '@/components/ui/Kit';
import { ColorField } from '@/components/ui/ColorField';
import { CropEditor, CropImg, CropValue } from '@/components/ui/CropEditor';
import { useToast } from '@/components/ui/Toast';

/** 로그 렌더 프레임 — 대형 문서도 안정적으로 로드되도록 srcdoc 대신 Blob URL 사용 */
function LogFrame({ frameRef, html, title, onFrameLoad }: {
  frameRef: React.RefObject<HTMLIFrameElement | null>; html: string; title: string;
  onFrameLoad: () => void;
}) {
  // charset을 MIME에 명시 (v2.0) — 로그 파일의 <meta charset>은 주입 스크립트에 밀려 브라우저가
  // 인코딩을 찾아보는 앞부분 1024바이트 밖으로 나갈 수 있다. 그러면 브라우저에 따라 본문이 깨진다
  const url = useMemo(() => URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })), [html]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <iframe
      ref={frameRef}
      className="log-frame"
      sandbox="allow-scripts"
      src={url}
      title={title}
      onLoad={onFrameLoad}
    />
  );
}

export default function TrpgDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [logs, setLogs, loaded] = useLocalList<TrpgLog>('ohome.trpg.v1', TRPG_SEED);
  // 본문은 목록과 분리 저장 (v2.0 — 나만보기 로그도 목록엔 뜨게 하려고 목록 문서의 질의 조건이
  // listHidden으로 느슨해졌는데, 본문까지 같이 있으면 그 질의로 본문도 함께 새어 나간다).
  // 이 목록에 없는 id는 "권한이 없어 애초에 안 받아졌다"는 뜻 — 서버가 알아서 걸러 준다
  const [bodies, setBodies] = useLocalList<TrpgLogBody>('ohome.trpgbody.v1', TRPG_BODY_SEED);
  const [rels] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const [allChars] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const [delAsk, setDelAsk] = useState(false);
  const [bodyText, setBodyText] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const gotHeightRef = useRef(false);   // 안쪽에서 높이 보고가 왔는지 (안 오면 기본 높이로 되돌린다)

  const l = logs.find(x => x.id === id);
  /* 이 글이 속한 곳이 비공개면 주소로 들어와도 열리지 않게 (v2.0 사용자 요청).
     글 주소에는 섹션이 없어 MenuGuard가 못 막는다 — 글을 읽어 소속을 알아낸 여기서 판정한다.
     **다른 early return보다 먼저 불러야 한다**(훅이므로 렌더마다 개수가 같아야 한다) */
  const blocked = useHrefBlock(l && sectionHref('trpg', l.secId ?? MAIN_SEC));
  // 큰 글씨 — 추가 섹션이면 그 이름, 눌렀을 때도 그 목록으로 (v2.0 사용자 제보)
  const tt = useSectionTitle('trpg', l?.secId, 'TRPG LOG');
  const bd = bodies.find(x => x.id === id);   // 분리 저장된 본문 — 권한이 없으면 애초에 안 온다 (undefined)

  // 접근권한 (4.3) — 관리자 / 공개범위 충족 / 비밀번호 입력자 /
  // 연동 자관의 상대방(멤버 캐릭터에 권한이 부여된 회원)은 무조건 열람 (3차 회원-캐릭터 연결, v1.9)
  const logRel = rels.find(r => r.id === l?.relId);
  const isRelPartner = !!user && !!logRel && logRel.members.some(m => {
    const ch = allChars.find(c => c.id === m.charId);
    return ch ? !!charGrant(ch, user.id) : false;
  });
  const baseAllowed = !!l && (isAdmin || isRelPartner
    || l.visibility === 'public' || (l.visibility === 'member' && !!user));

  // 비밀번호 열람 (4.3) — 세션 동안 유지
  const [unlocked, setUnlocked] = useState(false);
  const [pwTry, setPwTry] = useState('');
  useEffect(() => {
    try { if (sessionStorage.getItem(`trpg-unlock:${id}`) === '1') setUnlocked(true); } catch { /* 무시 */ }
  }, [id]);

  // 이 로그를 볼 수 없으면(없거나, 권한도 비밀번호도 없으면) 홈으로 — 예전엔 이 자리에 "열람 권한이
  // 없습니다" 문구만 남아 있었는데, 로그아웃 등으로 권한을 잃은 직후엔 계속 그 화면에 머무를 이유가
  // 없다는 사용자 요청으로 홈으로 보낸다 (v2.0)
  useEffect(() => {
    if (!loaded) return;
    if (!l) { router.replace('/'); return; }
    if (!baseAllowed && !unlocked && !l.password) router.replace('/');
  }, [loaded, l, baseAllowed, unlocked, router]);
  const tryUnlock = () => {
    if (l?.password && pwTry === l.password) {
      setUnlocked(true);
      try { sessionStorage.setItem(`trpg-unlock:${id}`, '1'); } catch { /* 무시 */ }
    } else {
      toast('비밀번호가 올바르지 않습니다');
    }
  };

  // 로그 정보 수정 — 메타 + 본문 교체(파일/직접 입력) + 썸네일 교체(이미지 크롭/단색·그라데이션)
  const [eOpen, setEOpen] = useState(false);
  const [e, setE] = useState({
    noText: '', title: '', catchphrase: '', writer: '', withText: '',
    relId: 'none', date: '', visibility: 'public' as TrpgLog['visibility'], password: '',
    listHidden: false,   // 목록 표시 여부 (v2.0 — 접근권한과 별개)
  });
  // 본문 교체
  const [bodyMode, setBodyMode] = useState<'keep' | 'file' | 'text'>('keep');
  // 본문 표시 방식 (v2.0) — 자동 판별이 직접 쓴 글을 HTML로 오판하는 경우가 있어 직접 고를 수 있게
  const [bodyDisp, setBodyDisp] = useState<'auto' | 'text' | 'html'>('auto');
  const [eFile, setEFile] = useState<File | null>(null);
  const [eText, setEText] = useState('');
  const eFileRef = useRef<HTMLInputElement>(null);
  const eThumbRef = useRef<HTMLInputElement>(null);
  // 썸네일 교체
  const [thumbMode, setThumbMode] = useState<'keep' | 'image' | 'color'>('keep');
  const [eThumb, setEThumb] = useState<File | null>(null);
  const [eThumbUrl, setEThumbUrl] = useState('');
  const [eThumbCrop, setEThumbCrop] = useState<CropValue | undefined>(undefined);
  const curThumbUrl = useBlobUrl(l?.thumbId);   // 「현재 유지」로 위치만 조정할 때의 원본
  const [eCropOpen, setECropOpen] = useState(false);
  const [eColorMode, setEColorMode] = useState<'grad' | 'solid'>('grad');
  const [eC1, setEC1] = useState('#4c5a6e');
  const [eC2, setEC2] = useState('#242b36');

  const saveEdit = async () => {
    if (!e.title.trim()) { toast('시나리오 타이틀을 입력해 주세요'); return; }
    // 본문 교체 준비 — 본문은 목록과 분리 저장이라(v2.0) 이제 TrpgLogBody 조각으로 만든다
    let bodyPatch: Partial<TrpgLogBody> = {};
    if (bodyMode === 'file' && eFile) {
      const text = await decodeLogText(eFile);
      bodyPatch = {
        ...(await saveLogBody(text)),
        originalFileId: await putBlob(eFile), originalName: eFile.name,
      };
    } else if (bodyMode === 'text' && eText.trim()) {
      bodyPatch = await saveLogBody(eText);
    }
    // 썸네일 교체 준비
    let thumbPatch: Partial<TrpgLog> = {};
    if (thumbMode === 'image' && eThumb) {
      thumbPatch = { thumbId: await putBlob(eThumb), thumbCrop: eThumbCrop, thumbColor: undefined };
    } else if (thumbMode === 'keep' && l?.thumbId) {
      // 이미지는 그대로 두고 위치·확대만 바꾼 경우 (사용자 요청)
      thumbPatch = { thumbCrop: eThumbCrop };
    } else if (thumbMode === 'color') {
      thumbPatch = { thumbId: undefined, thumbCrop: undefined, thumbColor: { c1: eC1, c2: eColorMode === 'grad' ? eC2 : undefined } };
    }
    const nextLog: TrpgLog = {
      ...(l as TrpgLog),
      noText: e.noText.trim() || undefined,
      title: e.title.trim(), catchphrase: e.catchphrase.trim() || undefined,
      writer: e.writer.trim(), withText: e.withText.trim(),
      relId: e.relId === 'none' ? undefined : e.relId,
      date: e.date || undefined,
      visibility: e.visibility, password: e.password.trim() || undefined,
      listHidden: e.listHidden,
      ...thumbPatch,
      // 예전엔 본문이 이 문서에 있었다 — 저장할 때마다 확실히 비워서(구버전 잔재 정리),
      // 나만보기 로그가 목록엔 뜨면서 본문까지 같이 새어 나가는 일이 없게 한다 (v2.0)
      body: undefined, bodyId: undefined, bodyHtml: undefined,
      originalFileId: undefined, originalName: undefined,
    };
    setLogs(logs.map(x => x.id === id ? nextLog : x));
    // 본문은 별도 문서에 upsert — 「현재 유지」면 기존 값(분리된 게 있으면 그것, 없으면 구버전 로그의
    // 내장 값)을 그대로 옮겨 담아, 한 번이라도 수정하면 자동으로 분리 저장 쪽으로 옮겨지게 한다
    const nextBody: TrpgLogBody = {
      id,
      body: bd?.body ?? l?.body ?? '',
      bodyId: bd?.bodyId ?? l?.bodyId,
      originalFileId: bd?.originalFileId ?? l?.originalFileId,
      originalName: bd?.originalName ?? l?.originalName,
      bodyHtml: bodyDisp === 'auto' ? undefined : bodyDisp === 'html',
      ...bodyPatch,
      visibility: bodyVisibility(nextLog),
      ...secStamp(nextLog.secId ?? MAIN_SEC),   // 소속 (v2.0) — 본문 문서도 비공개 판정을 받게
    };
    // 새 본문 문서는 뒤에 붙인다 (v2.0 포크 제보) — 앞에 끼우면 기존 본문 전체의 자리가 밀려
    // 재저장 대상이 되고, 큰 본문이 쌓인 홈에서는 그 합이 쓰기 한도를 넘어 저장이 실패했다
    setBodies(bd ? bodies.map(x => x.id === id ? nextBody : x) : [...bodies, nextBody]);
    if (bodyMode !== 'keep') setBodyText(null); // 본문 다시 로드
    setEOpen(false);
    setBodyMode('keep'); setEFile(null); setEText('');
    setThumbMode('keep'); setEThumb(null); setEThumbUrl(''); setEThumbCrop(undefined);
    toast('저장되었습니다');
  };

  // 본문 로드 — 분리 저장된 본문(bd) 우선, 없으면 구버전 로그의 내장 본문(l.body/bodyId)로 fallback (v2.0)
  const [bodyFailed, setBodyFailed] = useState(false);   // 본문 파일을 읽지 못함 (아래 원본 파일 fallback)
  useEffect(() => {
    if (!l) return;
    const src = bd ?? l;   // bd가 없으면(아직 분리 전인 구버전 로그) l 자신에서 읽는다
    setBodyFailed(false);
    if (src.body) { setBodyText(src.body); return; }
    if (src.bodyId) {
      getBlob(src.bodyId)
        .then(async b => { if (b) setBodyText(await b.text()); else { setBodyText(''); setBodyFailed(true); } })
        .catch(() => { setBodyText(''); setBodyFailed(true); });
    } else setBodyText('');
  }, [l, bd]);

  // 샌드박스 안 높이 리포터 수신 → iframe 높이 자동 맞춤 (널 오리진이라 직접 측정 불가)
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const h = (e.data as { __logH?: unknown })?.__logH;
      if (typeof h === 'number' && isFinite(h) && frameRef.current) {
        // scrollHeight는 최소한 뷰포트(=현재 iframe 높이)만큼 보고되므로 여기에 여백을
        // 더하면 "설정 → 커진 값 보고 → 재설정" 무한 성장 루프가 됨 — 보고값 그대로,
        // 그리고 현재 높이와 사실상 같으면(±2px) 재설정하지 않음
        const next = Math.min(200000, Math.max(200, Math.round(h)));
        gotHeightRef.current = true;
        const cur = frameRef.current.getBoundingClientRect().height;
        if (Math.abs(next - cur) > 2) frameRef.current.style.height = `${next}px`;
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  /** 문서가 뜨는 순간 일단 낮게 줄인다 — 안쪽 높이 계산이 뷰포트(현재 iframe 높이)에 끌려
   *  커지는 것을 막기 위해서다. 곧 오는 보고값으로 내용 높이에 맞춘다.
   *  보고가 오지 않는 문서(스크립트가 없거나 막힌 경우)는 기본 높이로 되돌려 내부 스크롤로 읽게 한다. */
  const onFrameLoad = () => {
    if (!frameRef.current) return;
    gotHeightRef.current = false;
    frameRef.current.style.height = '240px';
    // 보고가 하나도 안 오는 문서(스크립트가 막힌 경우)만 기본 높이로 되돌린다.
    // 3초로 늘렸다 — 리포터가 2초마다 같은 값이라도 다시 알려 오므로, 그 사이에 제자리를 찾는다
    setTimeout(() => {
      if (!gotHeightRef.current && frameRef.current) frameRef.current.style.height = '';
    }, 3000);
  };

  // 없거나 볼 수 없으면 위 useEffect가 홈으로 보낸다 — 그 사이엔 빈 화면만 (v2.0)
  // 막힌 곳이면 여기서 되돌아간다 — 훅을 모두 부른 뒤여야 렌더마다 개수가 같다
  if (blocked) return blocked;
  if (!loaded || !l) return <section className="page" />;
  if (!baseAllowed && !unlocked) {
    if (!l.password) return <section className="page" />;
    // 비밀번호 게이트 — 맞으면 이 세션 동안 열람 유지
    return (
      <section className="page">
        {/* 안내 문구는 환경설정 > TRPG에서 수정 — 관리자는 이 화면을 볼 수 없다 */}
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle>
          <EditableDesc k="trpg-lock-desc" def="비밀번호를 입력하면 열람할 수 있습니다" always /></div>
        <div className="panel" style={{ maxWidth: 420, margin: '0 auto', padding: 26, display: 'grid', gap: 10 }}>
          <KInput type="password" placeholder="비밀번호" value={pwTry} onChange={e => setPwTry(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') tryUnlock(); }} />
          <button className="btn btn-dark" style={{ justifyContent: 'center', padding: 9 }} onClick={tryUnlock}>확인</button>
        </div>
      </section>
    );
  }

  const rel = rels.find(r => r.id === l.relId);
  const body = bodyText ?? '';
  // 지정값이 있으면 그대로 — 직접 쓴 글이 태그처럼 보이는 문자 때문에 HTML로 오판되던 것 방지
  const html = showAsHtml({ bodyHtml: bd?.bodyHtml ?? l.bodyHtml }, body);
  // 원본 파일도 분리 저장된 쪽 우선, 없으면 구버전 로그의 내장 값 (v2.0)
  const origFileId = bd?.originalFileId ?? l.originalFileId;
  const origName = bd?.originalName ?? l.originalName;
  // 본문이 없을 때 대신 띄울 수 있는 서버 파일 주소 (v2.0 포크 제보 — 본문 저장 실패 대비)
  const fallbackUrl = [bd?.bodyId, l.bodyId, origFileId]
    .find(x => typeof x === 'string' && /^https?:/.test(x));
  // iframe 기본 body 마진 제거(흰 테두리 방지) + 높이 리포터 주입
  // 크리스탈리아/크릿 계열 로그는 본문을 JS로 그리므로 스크립트 실행이 필요 —
  // 널 오리진 샌드박스(allow-scripts만)라 사이트 쿠키·DOM 접근은 불가 (6.3의 격리 목적 유지)
  // 심(shim)+높이 리포터는 문서 앞쪽에 둔다 — 로그 문서가 파싱 도중 어떤 상태가 되어도
  // 인터벌 리포터는 계속 동작 (뒤에 붙이면 일부 대형 로그에서 실행되지 않는 사례 있음).
  // **다만 <!DOCTYPE>보다 앞에 두면 안 된다** (v2.0 사용자 발견 — 긴 로그 아래 빈 공간):
  // doctype 앞에 무엇이든 있으면 문서가 **쿼크 모드**로 파싱되고, 쿼크 모드에서는 body가
  // 스크롤 요소라 `body.scrollHeight`가 **최소한 뷰포트(=지금 iframe 높이)**를 돌려준다.
  // 그러면 리포터가 자기 프레임 높이를 그대로 되읽어 「어긋난 높이가 스스로를 정당화」한다 —
  // 한 번 크게 잡히면 영영 줄지 않는다. 아래 injectAfterDoctype가 doctype 바로 뒤에 끼워 넣는다.
  // <meta charset>도 함께 주입 — decodeLogText가 이미 문자열로 만들었으므로 Blob은 언제나 UTF-8이다.
  // 원본 문서의 charset 선언(euc-kr 등)이 뒤에 남아 있어도 먼저 온 선언이 이긴다
  const inject = `<meta charset="utf-8"><script>
// 널 오리진에서 localStorage 접근이 예외를 던져 로그 스크립트가 죽는 것 방지 (무동작 심)
try{void window.localStorage}catch(e){var __m={getItem:function(){return null},setItem:function(){},removeItem:function(){},clear:function(){},key:function(){return null},length:0};
try{Object.defineProperty(window,'localStorage',{value:__m});Object.defineProperty(window,'sessionStorage',{value:__m});}catch(e2){}}
// 높이 리포터 — 타이머 대신 MutationObserver+load 이벤트 (백그라운드 탭 스로틀링 회피).
// documentElement.scrollHeight는 뷰포트(=iframe 현재 높이)보다 작아지지 않아, 한 번 커지면
// 내용이 짧아도 줄어들지 못한다(짧은 로그 아래에 빈 공간이 남던 원인) → body 기준으로 잰다.
(function(){var p=0,n=0;function r(force){try{
var b=document.body;if(!b)return;
// html(documentElement)은 내용이 짧아도 뷰포트(=iframe 현재 높이)만큼 늘어나므로 기준으로 쓰지 않는다.
// scrollHeight든 offsetHeight든 마찬가지라, 늘어나지 않는 body만 본다.
var h=Math.max(b.scrollHeight||0,b.offsetHeight||0,Math.ceil(b.getBoundingClientRect().height)||0);
// **0이면 아무것도 알리지 않는다** (v2.0 사용자 발견 — 긴 로그 아래 빈 공간).
// 예전에는 여기서 documentElement.scrollHeight로 넘어갔는데, 그 값은 최소한 뷰포트(=지금 iframe
// 높이)만큼이라 **자기 높이를 그대로 되읽는다.** 아직 레이아웃이 안 된 순간(탭이 뒤에 있거나
// 첫 그림 전)에 그 값이 나가면 바깥은 그것을 「내용 높이」로 믿고 그대로 고정해 버리고,
// 그 뒤로는 같은 값이 계속 보고되어 **어긋난 높이가 스스로를 정당화한다** — 되돌릴 방법이 없었다
if(!h)return;
// 값이 그대로여도 가끔은 다시 알린다 (v2.0) — 바깥이 다른 이유로 높이를 되돌려 놓았을 수 있다.
// 예전에는 「같으면 안 보냄」이라, 한 번 어긋나면 되돌릴 방법이 아예 없었다
if(h!==p||force){p=h;parent.postMessage({__logH:h},'*');}}catch(e3){}}
document.addEventListener('DOMContentLoaded',function(){r(1)});addEventListener('resize',function(){r(1)});
// **이미지·폰트는 첫 그림 뒤에 붙으면서 높이를 바꾼다** (v2.0 사용자 발견 — 긴 로그 아래 빈 공간).
// 개별 이미지의 load/error까지 잡으려면 캡처 단계로 들어야 한다(이 이벤트들은 위로 올라오지 않는다).
addEventListener('load',function(){r(1)},true);
addEventListener('error',function(){r(1)},true);
try{if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){r(1)});}catch(e5){}
try{new MutationObserver(function(){r(0)}).observe(document.documentElement,{childList:true,subtree:true,attributes:true});}catch(e4){}
// 0.4초마다 확인하고, 2초마다는 값이 같아도 다시 알린다 (숨김 상태에선 레이아웃이 0이라 스킵됨)
setInterval(function(){n++;r(n%5===0);},400);
r(1);})();
</scr${''}ipt><style>
/* height:auto — 로그 문서가 html/body에 100%를 걸어 두면 내용과 무관하게 뷰포트만큼 커진다 */
html,body{margin:0!important;padding:0!important;height:auto!important;min-height:0!important}
</style>`;
  /** 주입 위치 — <!DOCTYPE ...> 가 있으면 그 **바로 뒤**에, 없으면 doctype을 만들어 앞에.
   *  표준 모드를 지켜야 body 높이가 진짜 내용 높이가 된다 (위 주석 참조) */
  const dt = /^\s*<!doctype[^>]*>/i.exec(body);
  const srcDoc = dt
    ? body.slice(0, dt[0].length) + inject + body.slice(dt[0].length)
    : `<!DOCTYPE html>${inject}${body}`;

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href={tt.href}>{tt.title}</PageTitle>
        <p>{logNo(l)}{[l.writer, l.withText].filter(Boolean).map(x => ` · ${x}`).join('')}{l.date ? ` · ${l.date.replace(/-/g, '.')}` : ''}</p>
        <div className="head-actions">
          {rel && <button className="btn btn-dark" onClick={() => router.push(`/rels/${rel.id}`)}>{rel.name} ›</button>}
          {isAdmin && <button className="btn btn-dark" onClick={() => {
            setE({
              noText: l.noText ?? '', title: l.title, catchphrase: l.catchphrase ?? '', writer: l.writer,
              withText: l.withText, relId: l.relId ?? 'none', date: l.date ?? '',
              visibility: l.visibility, password: l.password ?? '', listHidden: !!l.listHidden,
            });
            // 본문·썸네일 교체 상태 초기화 (기본: 현재 것 유지)
            setBodyMode('keep'); setEFile(null); setEText(bodyText ?? '');
            const bh = bd?.bodyHtml ?? l.bodyHtml;
            setBodyDisp(bh === undefined ? 'auto' : bh ? 'html' : 'text');
            // 「현재 유지」에서도 위치·확대를 조정할 수 있게 지금 크롭값에서 시작한다
            setThumbMode('keep'); setEThumb(null); setEThumbUrl(''); setEThumbCrop(l.thumbCrop);
            setEColorMode(l.thumbColor ? (l.thumbColor.c2 ? 'grad' : 'solid') : 'grad');
            if (l.thumbColor) { setEC1(l.thumbColor.c1); if (l.thumbColor.c2) setEC2(l.thumbColor.c2); }
            setEOpen(true);
          }}>EDIT</button>}
          {isAdmin && <button className="btn btn-dark" onClick={() => setDelAsk(true)}>DELETE</button>}
        </div>
      </div>

      {/* 본문만 폭 제한 — 헤더는 풀폭 위치 유지 */}
      <div className="panel" style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
        <h2 style={{
          fontFamily: l.serifTitle ? 'var(--serif)' : "'Noto Serif KR',serif",
          fontSize: 24, fontWeight: 700,
          marginBottom: l.catchphrase ? 2 : 18, // 캐치프레이즈가 없으면 본문과 붙지 않게 여백
          letterSpacing: l.serifTitle ? '.12em' : '.04em',
        }}>{l.title}</h2>
        {l.catchphrase && (
          <p style={{ fontSize: 11.5, color: 'var(--faint)', letterSpacing: '.14em', marginBottom: 16 }}>{l.catchphrase}</p>
        )}
        {html ? (
          /* 원본 스타일·스크립트 유지 — 널 오리진 샌드박스라 사이트 데이터에는 접근 불가 (6.3 격리) */
          <LogFrame frameRef={frameRef} html={srcDoc} title={l.title} onFrameLoad={onFrameLoad} />
        ) : (
          body
            ? <div className="log-plain">{body}</div>
            : fallbackUrl
              /* 본문 문서가 없거나 못 읽어도, 보관된 원본 파일이 서버에 있으면 그걸 그대로 보여 준다
                 (v2.0 포크 제보 — 본문 저장이 실패한 로그도 원본만 있으면 읽을 수 있게).
                 주입이 없어 높이 자동 맞춤은 안 되지만 기본 높이(65vh) 안에서 스크롤로 읽힌다 */
              ? (
                <>
                  <iframe className="log-frame" sandbox="allow-scripts" src={fallbackUrl} title={l.title} />
                  <p className="hint" style={{ marginTop: 6 }}>본문 문서를 불러오지 못해 보관된 원본 파일로 표시하고 있습니다 — 수정 화면에서 본문을 다시 저장하면 원래대로 돌아갑니다</p>
                </>
              )
              : (
                <p className="hint">
                  {bodyFailed
                    ? '본문 파일을 불러오지 못했습니다 — 새로고침해도 계속되면 수정 화면에서 본문을 다시 등록해 주세요'
                    : '본문이 비어 있습니다 — 이전 버전에서 등록된 항목이면 삭제 후 다시 등록해 주세요'}
                </p>
              )
        )}
        {/* 설명문 없이 원본 파일 다운로드 링크만 (4.3 백업) */}
        <p className="hint" style={{ marginTop: 10 }}>
          {origFileId && (
            /^https?:/.test(origFileId)
              // 서버에 올라간 파일은 링크로 연다 — fetch로 받으면 버킷 CORS 설정이 필요해진다
              ? (
                <a href={origFileId} target="_blank" rel="noreferrer" download={origName}
                  style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
                  ⤓ 원본 파일 ({origName})
                </a>
              ) : (
                <span style={{ color: 'var(--accent)', cursor: 'var(--cur-pointer,pointer)', fontWeight: 600 }}
                  onClick={async () => {
                    // 이 브라우저에 보관된 원본 파일 (4.3 — 백업 목적)
                    const b = await getBlob(origFileId);
                    if (!b) return;
                    const u = URL.createObjectURL(b);
                    const a = document.createElement('a');
                    a.href = u; a.download = origName ?? 'log.txt';
                    a.click();
                    URL.revokeObjectURL(u);
                  }}>
                  ⤓ 원본 파일 ({origName})
                </span>
              )
          )}
        </p>
      </div>

      {/* 로그 정보 수정 모달 — 메타 + 본문 교체(파일/직접 수정) + 썸네일 교체(이미지/색) */}
      <Modal open={eOpen} onClose={() => setEOpen(false)} title="로그 정보 수정"
        dirty
        actions={<>
          <button className="btn btn-ghost" onClick={() => setEOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={saveEdit}>SAVE</button>
        </>}>
        <div style={{ display: 'grid', gap: 9 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <KInput placeholder="시나리오 타이틀 (필수)" value={e.title} onChange={ev => setE(s => ({ ...s, title: ev.target.value }))} />
            {/* № 자리 표시 텍스트 전체를 직접 입력 — 비우면 자동 № 0XX */}
            <KInput placeholder="№ 표기 (선택 — 비우면 자동)" value={e.noText} onChange={ev => setE(s => ({ ...s, noText: ev.target.value }))}
              style={{ maxWidth: 200 }} />
          </div>
          <KInput placeholder="캐치프레이즈 (선택)" value={e.catchphrase} onChange={ev => setE(s => ({ ...s, catchphrase: ev.target.value }))} />
          <div style={{ display: 'flex', gap: 8 }}>
            <KInput placeholder="라이터 (선택)" value={e.writer} onChange={ev => setE(s => ({ ...s, writer: ev.target.value }))} />
            <KInput placeholder="같이 간 사람 (선택)" value={e.withText} onChange={ev => setE(s => ({ ...s, withText: ev.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <KSelect minWidth={140} value={e.relId} onChange={v => setE(s => ({ ...s, relId: v }))}
              options={[{ value: 'none', label: '자관 연동 없음' }, ...rels.map(r => ({ value: r.id, label: r.name }))]} />
            <KDate value={e.date} onChange={v => setE(s => ({ ...s, date: v }))} style={{ flex: 1 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <KSelect minWidth={140} value={e.visibility} onChange={v => setE(s => ({ ...s, visibility: v as TrpgLog['visibility'] }))}
              options={[
                { value: 'public', label: '전체공개' },
                { value: 'member', label: '멤버공개' },
                { value: 'private', label: '나만보기' },
              ]} />
            <KInput placeholder="열람 비밀번호 (선택)" value={e.password} onChange={ev => setE(s => ({ ...s, password: ev.target.value }))} style={{ flex: 1 }} />
          </div>
          {/* 목록 표시 — 접근권한과 별개 (v2.0 사용자 요청) */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
            <span className="cp-lb">목록</span>
            <KSelect minWidth={140} value={e.listHidden ? 'hidden' : 'show'}
              onChange={v => setE(s => ({ ...s, listHidden: v === 'hidden' }))}
              options={[
                { value: 'show', label: '목록에 표시' },
                { value: 'hidden', label: '목록에서 숨기기' },
              ]} />
          </div>

          {/* 썸네일 교체 — 기본은 현재 썸네일 유지 */}
          <label className="k-label" style={{ margin: '4px 0 0' }}>썸네일</label>
          <div className="mini-seg" style={{ justifySelf: 'start' }}>
            <button className={thumbMode === 'keep' ? 'on' : ''} onClick={() => setThumbMode('keep')}>현재 유지</button>
            <button className={thumbMode === 'image' ? 'on' : ''} onClick={() => { setThumbMode('image'); if (!eThumb) eThumbRef.current?.click(); }}>이미지 교체</button>
            <button className={thumbMode === 'color' ? 'on' : ''} onClick={() => setThumbMode('color')}>색으로 교체</button>
          </div>
          <input ref={eThumbRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={ev => {
              const f = ev.target.files?.[0];
              if (f) { setEThumb(f); setEThumbUrl(URL.createObjectURL(f)); setEThumbCrop(undefined); setECropOpen(true); }
              ev.target.value = '';
            }} />
          {thumbMode === 'image' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div
                style={{
                  width: 128, aspectRatio: '16/9', borderRadius: 8, overflow: 'hidden', cursor: 'var(--cur-pointer,pointer)',
                  border: '1.5px dashed var(--line)', flexShrink: 0, position: 'relative',
                }}
                onClick={() => eThumbRef.current?.click()}>
                {eThumbUrl && <CropImg src={eThumbUrl} crop={eThumbCrop} />}
              </div>
              {eThumb && (
                <button className="btn btn-ghost" style={{ padding: '5px 11px', fontSize: 11 }}
                  onClick={() => setECropOpen(true)}>✂ 위치·확대 조정</button>
              )}
            </div>
          )}
          {/* 현재 유지 — 이미지는 그대로 두고 위치·확대만 조정 (사용자 요청) */}
          {thumbMode === 'keep' && l.thumbId && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{
                width: 128, aspectRatio: '16/9', borderRadius: 8, overflow: 'hidden',
                border: '1.5px solid var(--line)', flexShrink: 0, position: 'relative',
              }}>
                {curThumbUrl && <CropImg src={curThumbUrl} crop={eThumbCrop} />}
              </div>
              <button className="btn btn-ghost" style={{ padding: '5px 11px', fontSize: 11 }}
                disabled={!curThumbUrl} onClick={() => setECropOpen(true)}>✂ 위치·확대 조정</button>
            </div>
          )}
          {thumbMode === 'color' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{
                width: 128, aspectRatio: '16/9', borderRadius: 8, flexShrink: 0,
                border: '1.5px solid var(--line)',
                background: eColorMode === 'grad' ? `linear-gradient(135deg, ${eC1} 0%, ${eC2} 100%)` : eC1,
              }} />
              <div className="mini-seg">
                <button className={eColorMode === 'grad' ? 'on' : ''} onClick={() => setEColorMode('grad')}>그라데이션</button>
                <button className={eColorMode === 'solid' ? 'on' : ''} onClick={() => setEColorMode('solid')}>단색</button>
              </div>
              <ColorField value={eC1} onChange={setEC1} />
              {eColorMode === 'grad' && (
                <>
                  <span style={{ color: 'var(--faint)', fontSize: 11 }}>→</span>
                  <ColorField value={eC2} onChange={setEC2} />
                </>
              )}
            </div>
          )}

          {/* 본문 교체 — 기본은 현재 본문 유지 */}
          <label className="k-label" style={{ margin: '4px 0 0' }}>본문</label>
          <div className="mini-seg" style={{ justifySelf: 'start' }}>
            <button className={bodyMode === 'keep' ? 'on' : ''} onClick={() => setBodyMode('keep')}>현재 유지</button>
            {/* 아래 표시 방식 세그는 본문 교체와 별개 — 저장하면 항상 반영된다 */}
            <button className={bodyMode === 'text' ? 'on' : ''} onClick={() => { setBodyMode('text'); if (!eText) setEText(bodyText ?? ''); }}>직접 수정</button>
            <button className={bodyMode === 'file' ? 'on' : ''} onClick={() => setBodyMode('file')}>파일 업로드</button>
          </div>
          {bodyMode === 'file' && (
            <>
              <input ref={eFileRef} type="file" accept=".txt,.html,.htm,text/*" style={{ display: 'none' }}
                onChange={ev => { const f = ev.target.files?.[0]; if (f) setEFile(f); ev.target.value = ''; }} />
              <div className="upzone" style={{ marginBottom: 0 }} onClick={() => eFileRef.current?.click()}
                onDragOver={ev => ev.preventDefault()}
                onDrop={ev => { ev.preventDefault(); const f = ev.dataTransfer.files?.[0]; if (f) setEFile(f); }}>
                {eFile
                  ? <b>{eFile.name} — 저장 시 이 파일로 본문이 교체됩니다</b>
                  : <b>.txt / .html 파일을 끌어다 놓거나 클릭</b>}
              </div>
            </>
          )}
          {bodyMode === 'text' && (
            <KTextarea style={{ minHeight: 160, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 }}
              placeholder="HTML 코드 통째 붙여넣기 또는 텍스트 직접 작성" value={eText} onChange={ev => setEText(ev.target.value)} />
          )}

          {/* 본문 표시 방식 (v2.0) — 자동 판별이 직접 쓴 글을 HTML로 오판하는 경우가 있어 직접 고를 수 있게 */}
          <label className="k-label" style={{ margin: '4px 0 0' }}>본문 표시</label>
          <div className="mini-seg" style={{ justifySelf: 'start' }}>
            <button className={bodyDisp === 'auto' ? 'on' : ''} onClick={() => setBodyDisp('auto')}>자동</button>
            <button className={bodyDisp === 'text' ? 'on' : ''} onClick={() => setBodyDisp('text')}>글자 그대로</button>
            <button className={bodyDisp === 'html' ? 'on' : ''} onClick={() => setBodyDisp('html')}>HTML로</button>
          </div>
          <p className="hint" style={{ margin: 0 }}>
            자동은 내용을 보고 판단합니다 — 직접 쓴 글에 &lt;태그&gt;처럼 보이는 문자가 있으면 HTML로 잘못 볼 수 있으니, 그럴 때 「글자 그대로」를 고르세요.
          </p>
        </div>
      </Modal>

      {/* 썸네일 크롭 편집기 (6.1 — 16:9 티켓 규격) */}
      {/* 새로 고른 이미지가 있으면 그것을, 「현재 유지」면 지금 썸네일을 대상으로 */}
      {(eThumbUrl || (thumbMode === 'keep' && curThumbUrl)) && (
        <CropEditor open={eCropOpen} src={eThumbUrl || curThumbUrl!} aspect="16:9" initial={eThumbCrop}
          onClose={() => setECropOpen(false)}
          onApply={c => { setEThumbCrop(c); setECropOpen(false); }} />
      )}

      <ConfirmModal open={delAsk} title="로그를 삭제하시겠습니까?" body="삭제한 로그는 복구할 수 없습니다."
        onClose={() => setDelAsk(false)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => {
            setLogs(logs.filter(x => x.id !== l.id));
            setBodies(bodies.filter(x => x.id !== l.id));   // 분리 저장된 본문도 함께 삭제 (v2.0)
            router.push(tt.href);
          } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelAsk(false) },
        ]} />
    </section>
  );
}
