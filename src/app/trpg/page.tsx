'use client';
// TRPG 로그 백업 (4.3) — 티켓형/기본형 스킨 · 우측 자관 뱃지 필터 · ＋ ADD LOG
// 본문 입력 3방식: 파일 업로드(.txt/.html 내용 자동 판별) / HTML 붙여넣기 / 직접 작성
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSectionParam, filterSection, sectionSetter, secStamp } from '@/lib/sectionStore';
import { useLocalList, newId } from '@/lib/postStore';
import { TrpgLog, TRPG_SEED, TrpgLogBody, TRPG_BODY_SEED, bodyVisibility, decodeLogText, logNo, saveLogBody } from '@/lib/galleryStore';
import { Relation, REL_SEED } from '@/lib/charStore';
import { SearchBar, KInput, KTextarea, KRadio, KSelect, KDate, Pager } from '@/components/ui/Kit';
import { Modal } from '@/components/ui/Modal';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { putBlob } from '@/lib/blobStore';
import { ColorField } from '@/components/ui/ColorField';
import { CropEditor, CroppedBlobImg, CropValue, CropImg } from '@/components/ui/CropEditor';
import { useToast } from '@/components/ui/Toast';

import { useSiteSettings } from '@/lib/siteStore';
import { useMainStore } from '@/lib/mainStore';
import { mergeOrder } from '@/lib/cardSort';
import { DragList } from '@/components/ui/DragList';
import { OrderMenu, orderNoOf, moveToOrder } from '@/components/ui/OrderMenu';

function TrpgPageInner() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [site] = useSiteSettings(); // 티켓 하단 문구 = 로고 서브타이틀 (5.2 연동)
  const [logsAll, setLogsAll] = useLocalList<TrpgLog>('ohome.trpg.v1', TRPG_SEED);
  // 여러 개로 만든 섹션 (v2.0) — 주소의 ?s= 가 가리키는 것만 보여 준다
  const sec = useSectionParam('trpg');
  const logs = filterSection(logsAll, sec.id);
  // 저장은 이 섹션 자리만 교체 — 걸러진 목록을 그대로 넘겨도 다른 섹션이 지워지지 않는다
  const setLogs = sectionSetter(logsAll, sec.id, setLogsAll);
  // 본문은 목록과 분리 저장 (v2.0) — 나만보기 로그도 목록엔 뜨게 하려고 목록 문서의 질의 조건이
  // listHidden으로 느슨해졌는데, 본문까지 같이 있으면 그 질의로 본문도 함께 새어 나간다
  const [bodies, setBodies] = useLocalList<TrpgLogBody>('ohome.trpgbody.v1', TRPG_BODY_SEED);
  const [rels] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const { editOn } = useMainStore();          // 편집모드 — 상단바 토글 (다른 목록과 공통)
  const [filter, setFilter] = useState<string>('all');
  const [skin, setSkin] = useState<'ticket' | 'basic'>('ticket');
  const [q, setQ] = useState('');
  // 모바일은 티켓 스킨 대신 항상 기본형 리스트 — 좁은 폭에서 티켓이 뭉개지지 않게 (v1.9 사용자 확정)
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width:620px)');
    const f = () => setIsMobile(mq.matches);
    f();
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  // ADD LOG 모달
  const [addOpen, setAddOpen] = useState(false);
  const [nNo, setNNo] = useState('');          // № 자리 표시 텍스트 — 비우면 자동 № 0XX
  const [nVis, setNVis] = useState<'public' | 'member' | 'private'>('public'); // 접근권한
  const [nListHidden, setNListHidden] = useState(false);   // 목록 표시 여부 (v2.0 — 접근권한과 별개)
  const [nPw, setNPw] = useState('');          // 열람 비밀번호 (선택)
  const [nTitle, setNTitle] = useState('');
  const [nCatch, setNCatch] = useState('');
  const [nWriter, setNWriter] = useState('');
  const [nWith, setNWith] = useState('');
  const [nRel, setNRel] = useState('none');
  const [nDate, setNDate] = useState('');
  const [nMode, setNMode] = useState<'file' | 'paste'>('paste');
  const [nBody, setNBody] = useState('');
  const [nFileName, setNFileName] = useState('');
  const [nFile, setNFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // 썸네일 (선택) — 이미지 또는 단색/그라데이션 (v1.9 사용자 요청)
  const [nThumb, setNThumb] = useState<File | null>(null);
  const [nThumbUrl, setNThumbUrl] = useState('');
  const [nColorMode, setNColorMode] = useState<'grad' | 'solid'>('grad');
  const [nThumbCrop, setNThumbCrop] = useState<CropValue | undefined>(undefined);
  const [cropOpen, setCropOpen] = useState(false);
  const [nC1, setNC1] = useState('#4c5a6e');
  const [nC2, setNC2] = useState('#242b36');
  const thumbRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    logs.forEach(l => { const k = l.relId ?? 'none'; m[k] = (m[k] ?? 0) + 1; });
    return m;
  }, [logs]);

  // 목록에 뜰지는 오직 listHidden — 접근권한(visibility)은 "누가 열 수 있는지"만 정하고
  // 목록에 나오는지는 정하지 않는다 (v2.0 사용자 확정: "나만보기여도 목록에는 표시돼야해").
  // 열 수 있는지는 상세 페이지가 다시 독립적으로 확인하므로, 목록에 뜬다고 내용이 새지 않는다
  const canOpen = (l: TrpgLog) => isAdmin || l.visibility === 'public' || (l.visibility === 'member' && !!user);
  const visible = logs
    // 목록 숨김 — 관리자도 편집모드가 아니면 안 보인다(목록을 정리해 두는 용도라, v2.0 사용자 요청).
    // 편집모드에서는 관리자에게만 예외로 보여 되돌릴 수 있게 한다
    .filter(l => !l.listHidden || (isAdmin && editOn))
    .filter(l => filter === 'all' || (filter === 'none' ? !l.relId : l.relId === filter))
    .filter(l => !q || l.title.includes(q) || l.writer.includes(q) || l.withText.includes(q));
  // 정렬 기준은 저장된 순서 — 편집모드에서 드래그로 바꾼 순서가 그대로 목록에 반영된다 (v2.0).
  // 새 로그는 앞에 넣으므로 기본은 지금까지처럼 최신순이고, № 번호는 표시용으로만 남는다.

  // 편집모드 카드 드래그 정렬 (v2.0 — 캐릭터 목록과 같은 방식)
  // 드래그 정렬 — 다른 페이지들과 같은 방식으로 (v2.0 사용자 요청: "다른 페이지들 드래그앤드롭
  // 참고해서 똑같이 구현").
  // · 티켓형(세로 한 줄 목록)은 다른 목록형 페이지와 완전히 같은 DragList — 손잡이를 들어 올려
  //   부드럽게 밀어내고 놓으면 정확한 자리로 안착.
  // · 기본형(2열 그리드)은 DragList가 세로 한 줄 전제라 그대로 못 쓴다 — 자리 미리보기는 그대로 두되,
  //   저장(서버 쓰기)은 손을 뗄 때 한 번만 하도록 이 페이지에서 직접 구현했다. 예전 cardSort는 지나는
  //   자리마다 저장을 불러서(끄는 동안 수십 번) 서버 모드에서 뚝뚝 끊겨 보였다 — 그 원인 제거
  const gridSort = editOn && isAdmin;
  const [gridPreview, setGridPreview] = useState<TrpgLog[] | null>(null);
  const gridFromRef = useRef<number | null>(null);
  const basicShown = gridPreview ?? visible;

  /* ---------- 페이지 나누기 (v2.0 사용자 요청) ----------
     티켓형은 한 장이 커서 6개, 기본형은 한 줄에 둘씩 들어가 20개까지 봐도 답답하지 않다.
     드래그 정렬은 `visible` 전체 기준 위치로 다루므로(아래 reorderPage·gridDragProps)
     2페이지에서 순서를 바꿔도 그 항목들이 맨 앞으로 끌려오지 않는다. */
  const ticketView = skin === 'ticket' && !isMobile;
  const PER_LOG = ticketView ? 6 : 20;
  const [logPage, setLogPage] = useState(1);
  const logPages = Math.max(1, Math.ceil(visible.length / PER_LOG));
  const logCur = Math.min(logPage, logPages);        // 필터로 줄어 페이지가 사라지면 마지막으로 당긴다
  const logStart = (logCur - 1) * PER_LOG;
  // 필터·검색·보기 방식을 바꾸면 1페이지부터
  useEffect(() => { setLogPage(1); }, [filter, q, ticketView]);
  const pageLogs = visible.slice(logStart, logStart + PER_LOG);

  /** 이 페이지 안에서 바뀐 순서를 전체 순서에 되꽂는다 —
   *  보이는 것만 넘기면 mergeOrder가 그 묶음을 맨 앞으로 올려 버린다 */
  const reorderPage = (nextPage: TrpgLog[]) => {
    const nextVisible = [...visible];
    nextVisible.splice(logStart, nextPage.length, ...nextPage);
    setLogs(mergeOrder(logs, nextVisible));
  };

  /* ---------- 번호로 자리 옮기기 (v2.0 사용자 요청) ----------
     페이지가 생기면 1페이지 것을 3페이지로 드래그할 수가 없다 — 우클릭해서 번호를 적어 옮긴다.
     번호는 저장하지 않고 자리에서 만든다(10, 20, 30 …). 드래그로 배치를 바꾸면 번호도 저절로 맞는다. */
  const [ordFor, setOrdFor] = useState<{ id: string; x: number; y: number } | null>(null);
  const ordIdx = ordFor ? visible.findIndex(l => l.id === ordFor.id) : -1;
  const openOrder = (e: React.MouseEvent, id: string) => {
    if (!isAdmin) return;
    e.preventDefault();
    setOrdFor({ id, x: e.clientX, y: e.clientY });
  };
  const applyOrder = (wanted: number) => {
    if (ordIdx >= 0) setLogs(mergeOrder(logs, moveToOrder(visible, ordIdx, wanted)));
    setOrdFor(null);
  };
  const gridDragProps = (i: number): React.HTMLAttributes<HTMLDivElement> => {
    if (!gridSort) return {};
    return {
      draggable: true,
      onDragStart: () => { gridFromRef.current = i; setGridPreview(null); },
      onDragOver: e => {
        e.preventDefault();
        const from = gridFromRef.current;
        if (from == null || from === i) return;
        const cur = gridPreview ?? visible;
        const next = [...cur];
        const [moved] = next.splice(from, 1);
        next.splice(i, 0, moved);
        gridFromRef.current = i;
        setGridPreview(next);
      },
      onDrop: e => e.preventDefault(),
      onDragEnd: () => {
        gridFromRef.current = null;
        setGridPreview(p => {
          if (p) setLogs(mergeOrder(logs, p));   // 놓는 순간 딱 한 번만 저장
          return null;
        });
      },
      style: { cursor: 'var(--cur-grab,grab)' },
    };
  };

  const decodeText = decodeLogText; // 공용 유틸 (galleryStore)

  const readFile = (f: File | undefined) => {
    if (!f) return;
    setNFileName(f.name);
    setNFile(f); // 원본 파일 보관용 (4.3)
    // 미리보기 글자 수 표시용 — 등록 시에는 파일에서 직접 다시 읽으므로 레이스 없음
    decodeText(f).then(setNBody);
  };

  const add = async () => {
    if (!nTitle.trim()) { toast('시나리오 타이틀을 입력해 주세요'); return; }
    const id = newId();
    // 파일이 있으면 등록 시점에 직접 읽음 — 읽기 완료 전에 ADD를 눌러도 본문이 비지 않음
    const bodyText = nFile ? await decodeText(nFile) : nBody;
    const log: TrpgLog = {
      id,
      no: Math.max(0, ...logs.map(l => l.no)) + 1, // 내부 순번 (정렬용)
      noText: nNo.trim() || undefined,             // № 자리 표시 텍스트 — 비우면 자동 № 0XX
      title: nTitle.trim(), catchphrase: nCatch.trim() || undefined,
      writer: nWriter.trim(), withText: nWith.trim(),
      relId: nRel === 'none' ? undefined : nRel,
      date: nDate || undefined, ph: 'cool',
      visibility: nVis,
      password: nPw.trim() || undefined,
      listHidden: nListHidden,
      // 썸네일: 이미지(선택) 또는 단색/그라데이션
      thumbId: nThumb ? await putBlob(nThumb) : undefined,
      thumbCrop: nThumb ? nThumbCrop : undefined,
      thumbColor: nThumb ? undefined : { c1: nC1, c2: nColorMode === 'grad' ? nC2 : undefined },
    };
    // 본문·원본 파일은 별도 문서로 (v2.0) — 목록 문서(log)와 같은 곳에 있으면 나만보기여도
    // 목록에 뜨는 순간 함께 새어 나간다. 이 문서의 열람 권한은 로그의 실제 visibility를 그대로 따른다
    const body: TrpgLogBody = {
      id,
      // 본문 저장 위치는 saveLogBody가 정한다 (서버면 문서에 직접 · 로컬이거나 아주 크면 파일로)
      ...(await saveLogBody(bodyText)),
      // 업로드 원본 파일은 그대로 보관 (4.3 — 백업 목적, IndexedDB → R2 이전 예정)
      originalFileId: nFile ? await putBlob(nFile) : undefined,
      originalName: nFile?.name,
      visibility: bodyVisibility(log),
      ...secStamp(sec.id),   // 소속 (v2.0) — 본문 문서도 비공개 판정을 받게
    };
    setLogs([log, ...logs]);
    // 본문 문서는 **뒤에** 붙인다 (v2.0 포크 제보) — 앞에 끼우면 기존 본문 전체의 자리가 밀려
    // 재저장 대상이 되는데, 큰 본문이 쌓인 홈에서는 그 합이 한 번의 쓰기 한도를 넘어 저장이 실패했다.
    // 본문은 id로만 찾으므로 순서는 아무 의미가 없다.
    setBodies([...bodies, body]);
    setAddOpen(false);
    setNNo(''); setNVis('public'); setNPw(''); setNListHidden(false); setNTitle(''); setNCatch(''); setNWriter(''); setNWith(''); setNBody(''); setNFileName(''); setNDate(''); setNFile(null);
    setNThumb(null); setNThumbUrl(''); setNThumbCrop(undefined);
    toast(nFile ? '로그가 등록되었습니다 — 원본 파일도 보관됩니다' : '로그가 등록되었습니다');
  };

  // 티켓 썸네일 — 업로드 이미지 > 지정 색(단색/그라데이션) > 데모 ph
  const thumbStyle = (l: TrpgLog): React.CSSProperties | undefined =>
    l.thumbColor
      ? { background: l.thumbColor.c2 ? `linear-gradient(135deg, ${l.thumbColor.c1} 0%, ${l.thumbColor.c2} 100%)` : l.thumbColor.c1 }
      : undefined;

  // sp: 편집모드 드래그 정렬 props (다른 목록과 같은 방식, v2.0)
  const Ticket = ({ l }: { l: TrpgLog }) => (
    <div className="ticket"
      onContextMenu={e => openOrder(e, l.id)}
      onClick={() => { if (!editOn) router.push(`/trpg/${l.id}`); }}>
      <div className="stub-line" />
      <div className={`wide ${!l.thumbId && !l.thumbColor ? `ph ${l.ph}` : ''}`} style={thumbStyle(l)}>
        {l.thumbId && <CroppedBlobImg fileRef={l.thumbId} crop={l.thumbCrop} />}
        <span className="no">{l.noText ? `ADMIT ONE · ${l.noText}` : `ADMIT ONE · LOG ${String(l.no).padStart(3, '0')}`}</span>
        {!l.thumbId && !l.thumbColor && <span>WIDE THUMBNAIL</span>}
      </div>
      <div className="stub">
        <div className="sc-title" style={l.serifTitle ? { fontFamily: 'var(--serif)', letterSpacing: '.12em' } : undefined}>
          {/* 다른 목록형 페이지와 같은 드래그 손잡이 — 잡아 들어야 끌리게 (v2.0) */}
          {editOn && <span className="drag-h" style={{ marginRight: 8 }}>⠿</span>}
          {l.title}
        </div>
        {/* 편집모드에서만 — 지금 목록 숨김이라 관리자에게만 예외로 보이는 중임을 표시 (v2.0) */}
        {editOn && l.listHidden && <span className="pill" style={{ marginTop: 4 }}>숨김</span>}
        {l.catchphrase && <div className="sc-catch">{l.catchphrase}</div>}
        {/* 나만보기 등도 이제 목록엔 뜨므로(v2.0), 못 여는 로그는 왜 못 여는지 표시 */}
        {!canOpen(l) && (
          <div className="row"><b>열람</b> {l.password ? '비밀번호 필요' : '권한 없음'}</div>
        )}
        {l.writer && <div className="row"><b>라이터</b> {l.writer}</div>}
        {l.withText && <div className="row"><b>동행</b> {l.withText}</div>}
        {l.date && <div className="row"><b>날짜</b> {l.date.replace(/-/g, '.')}</div>}
        <div className="adm"><span>{site.subtitle}</span><span>{logNo(l)}</span></div>
      </div>
    </div>
  );

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'TRPG LOG' : sec.name}</PageTitle>
        <EditableDesc k="trpg-desc" def="티켓형 스킨 · 시나리오 타이틀 폰트 개별 설정 · 우측 자관 뱃지로 필터" />
        <div className="head-actions">
          <SearchBar onSearch={setQ} />
          {isAdmin && <button className="btn btn-dark" style={{ whiteSpace: 'nowrap' }} onClick={() => setAddOpen(true)}>＋ ADD LOG</button>}
        </div>
      </div>
      <div className="trpg-layout">
        <div>
          {ticketView
            ? (
              // 다른 목록형 페이지와 같은 DragList — 손잡이를 들어 부드럽게 밀어내고 놓으면 안착 (v2.0)
              <DragList items={pageLogs} keyOf={l => l.id}
                onReorder={reorderPage}
                disabled={!(editOn && isAdmin)}
                render={l => <Ticket l={l} />} />
            )
            : (
              // 기본형 — 한 줄에 두 개, 번호 없이 제목만 (v2.0 사용자 확정).
              // DragList는 세로 한 줄 목록 전제라 2열 그리드엔 못 쓴다 — 자리 미리보기는 그대로 두고
              // 저장은 손을 뗄 때 한 번만 하도록 이 페이지에서 직접 구현 (gridDragProps, 위 참조)
              <div className="panel flush trpg-basic">
                {basicShown.slice(logStart, logStart + PER_LOG).map((l, i) => (
                  // 드래그 위치는 전체 기준으로 넘긴다 — 페이지 안 위치로 넘기면 2페이지에서 어긋난다
                  <div key={l.id} className="list-item" {...gridDragProps(logStart + i)}
                    onContextMenu={e => openOrder(e, l.id)}
                    onClick={() => { if (!editOn) router.push(`/trpg/${l.id}`); }}>
                    {editOn && <span className="drag-h">⠿</span>}
                    <div className={`th ${!l.thumbId && !l.thumbColor ? `ph ${l.ph}` : ''}`} style={{ ...thumbStyle(l), position: 'relative' }}>
                      {l.thumbId && <CroppedBlobImg fileRef={l.thumbId} crop={l.thumbCrop} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b>{l.title}</b>
                      {/* 편집모드에서만 — 목록 숨김이라 관리자에게만 예외로 보이는 중 (v2.0) */}
                      {editOn && l.listHidden && <span className="pill" style={{ marginLeft: 6 }}>숨김</span>}
                      {/* 나만보기 등도 목록엔 뜨므로(v2.0) — 못 여는 로그는 왜 못 여는지 표시 */}
                      {!canOpen(l) && <span className="pill" style={{ marginLeft: 6 }}>{l.password ? '비밀번호 필요' : '비공개'}</span>}
                      <small>{[l.writer, l.withText].filter(Boolean).join(' · ')}{l.date ? ` · ${l.date.replace(/-/g, '.')}` : ''}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          {/* 페이저는 가운데, 개수는 오른쪽 끝 (v2.0 — 자관 질문 목록과 같은 방식) */}
          {visible.length > PER_LOG && (
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center' }}>
              <span />
              <Pager page={logCur} total={logPages} onChange={setLogPage} />
              <small style={{ color: 'var(--faint)', fontSize: 10.5, justifySelf: 'end' }}>총 {visible.length}개</small>
            </div>
          )}
          {visible.length === 0 && (
            <div className="panel" style={{ textAlign: 'center', padding: 44, fontSize: 13, color: 'var(--faint)' }}>
              로그가 없습니다
            </div>
          )}
          {/* 우클릭 > 순서 번호 (v2.0 사용자 요청) */}
          {ordFor && ordIdx >= 0 && (
            <OrderMenu at={ordFor} current={orderNoOf(ordIdx)} total={visible.length}
              onApply={applyOrder} onClose={() => setOrdFor(null)} />
          )}
        </div>
        {/* 자관 연동 필터 (v1.2) */}
        <div className="panel tagside">
          <h4>자관 필터</h4>
          <div className={`tag ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
            전체 <small>{logs.length}</small>
          </div>
          {rels.filter(r => counts[r.id]).map(r => (
            <div key={r.id} className={`tag ${filter === r.id ? 'on' : ''}`} onClick={() => setFilter(r.id)}>
              {r.name} <small>{counts[r.id]}</small>
            </div>
          ))}
          {counts['none'] > 0 && (
            <div className={`tag ${filter === 'none' ? 'on' : ''}`} onClick={() => setFilter('none')}>
              단발 <small>{counts['none']}</small>
            </div>
          )}
          {/* 모바일은 항상 기본형 — 스킨 선택 숨김 (v1.9) */}
          {!isMobile && (
            <>
              <h4 style={{ marginTop: 18 }}>보기</h4>
              <KRadio name="tsk" value="ticket" current={skin} onChange={v => setSkin(v as 'ticket')} label="티켓형" />
              <div style={{ height: 7 }} />
              <KRadio name="tsk" value="basic" current={skin} onChange={v => setSkin(v as 'basic')} label="기본형" />
            </>
          )}
        </div>
      </div>

      {/* ＋ ADD LOG (4.3 — 본문 입력 3방식) */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="로그 등록"
        desc="본문: 파일 업로드(.txt/.html — 내용 자동 판별) 또는 붙여넣기/직접 작성"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setAddOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={add}>ADD</button>
        </>}>
        <div style={{ display: 'grid', gap: 9 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <KInput placeholder="시나리오 타이틀 (필수)" value={nTitle} onChange={e => setNTitle(e.target.value)} />
            {/* № 자리 표시 텍스트 전체를 직접 입력 — 비우면 자동 № 0XX */}
            <KInput placeholder="№ 표기 (선택 — 비우면 자동)" value={nNo} onChange={e => setNNo(e.target.value)}
              style={{ maxWidth: 200 }} />
          </div>
          <KInput placeholder="캐치프레이즈 (선택)" value={nCatch} onChange={e => setNCatch(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <KInput placeholder="라이터 (선택)" value={nWriter} onChange={e => setNWriter(e.target.value)} />
            <KInput placeholder="같이 간 사람 (선택)" value={nWith} onChange={e => setNWith(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <KSelect minWidth={140} value={nRel} onChange={setNRel}
              options={[{ value: 'none', label: '자관 연동 없음' }, ...rels.map(r => ({ value: r.id, label: r.name }))]} />
            <KDate value={nDate} onChange={setNDate} style={{ flex: 1 }} />
          </div>
          {/* 접근권한 + 열람 비밀번호 (선택) — 권한이 없어도 비밀번호를 아는 사람은 열람 가능.
              연동 자관의 상대방(회원-캐릭터 연결)은 항상 열람 가능 — 연결 기능은 3차 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <KSelect minWidth={140} value={nVis} onChange={v => setNVis(v as 'public')}
              options={[
                { value: 'public', label: '전체공개' },
                { value: 'member', label: '멤버공개' },
                { value: 'private', label: '나만보기' },
              ]} />
            <KInput placeholder="열람 비밀번호 (선택)" value={nPw} onChange={e => setNPw(e.target.value)} style={{ flex: 1 }} />
          </div>
          {/* 목록 표시 — 접근권한과 별개 (v2.0 사용자 요청). 숨겨도 직접 링크·비밀번호로는 그대로 열림 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
            <span className="cp-lb">목록</span>
            <KSelect minWidth={140} value={nListHidden ? 'hidden' : 'show'}
              onChange={v => setNListHidden(v === 'hidden')}
              options={[
                { value: 'show', label: '목록에 표시' },
                { value: 'hidden', label: '목록에서 숨기기' },
              ]} />
          </div>

          {/* 썸네일 (선택) — 이미지 업로드 또는 단색/그라데이션 */}
          <label className="k-label" style={{ margin: '4px 0 0' }}>썸네일 (선택)</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div
              style={{
                width: 128, aspectRatio: '16/9', borderRadius: 8, overflow: 'hidden', cursor: 'var(--cur-pointer,pointer)',
                border: '1.5px dashed var(--line)', flexShrink: 0, position: 'relative',
                background: nThumbUrl ? undefined
                  : nColorMode === 'grad' ? `linear-gradient(135deg, ${nC1} 0%, ${nC2} 100%)` : nC1,
              }}
              onClick={() => thumbRef.current?.click()}>
              {nThumbUrl && <CropImg src={nThumbUrl} crop={nThumbCrop} />}
            </div>
            <input ref={thumbRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) { setNThumb(f); setNThumbUrl(URL.createObjectURL(f)); setNThumbCrop(undefined); setCropOpen(true); }
                e.target.value = '';
              }} />
            {nThumb ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-ghost" style={{ padding: '5px 11px', fontSize: 11 }}
                  onClick={() => setCropOpen(true)}>✂ 위치·확대 조정</button>
                <button className="btn btn-ghost" style={{ padding: '5px 11px', fontSize: 11 }}
                  onClick={() => { setNThumb(null); setNThumbUrl(''); setNThumbCrop(undefined); }}>이미지 제거 → 색으로</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="mini-seg">
                  <button className={nColorMode === 'grad' ? 'on' : ''} onClick={() => setNColorMode('grad')}>그라데이션</button>
                  <button className={nColorMode === 'solid' ? 'on' : ''} onClick={() => setNColorMode('solid')}>단색</button>
                </div>
                <ColorField value={nC1} onChange={setNC1} />
                {nColorMode === 'grad' && (
                  <>
                    <span style={{ color: 'var(--faint)', fontSize: 11 }}>→</span>
                    <ColorField value={nC2} onChange={setNC2} />
                  </>
                )}
              </div>
            )}
          </div>
          <div className="mini-seg" style={{ justifySelf: 'start' }}>
            <button className={nMode === 'paste' ? 'on' : ''} onClick={() => setNMode('paste')}>붙여넣기/직접 작성</button>
            <button className={nMode === 'file' ? 'on' : ''} onClick={() => setNMode('file')}>파일 업로드</button>
          </div>
          {nMode === 'file' ? (
            <>
              <input ref={fileRef} type="file" accept=".txt,.html,.htm,text/*" style={{ display: 'none' }}
                onChange={e => { readFile(e.target.files?.[0]); e.target.value = ''; }} />
              <div className="upzone" style={{ marginBottom: 0 }} onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); readFile(e.dataTransfer.files?.[0]); }}>
                {nFileName
                  ? <b>{nFileName} — 읽기 완료 ({nBody.length.toLocaleString()}자)</b>
                  : <><b style={{ display: 'block', marginBottom: 3 }}>.txt / .html 파일을 끌어다 놓거나 클릭</b>크리스탈리아 등 로그 툴 내보내기 파일 그대로 — 내용 자동 판별</>}
              </div>
            </>
          ) : (
            <KTextarea style={{ minHeight: 120, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 }}
              placeholder="HTML 코드 통째 붙여넣기 또는 텍스트 직접 작성" value={nBody} onChange={e => setNBody(e.target.value)} />
          )}
        </div>
      </Modal>

      {/* 썸네일 크롭 편집기 (6.1 — 16:9 티켓 규격) */}
      {nThumbUrl && (
        <CropEditor open={cropOpen} src={nThumbUrl} aspect="16:9" initial={nThumbCrop}
          onClose={() => setCropOpen(false)}
          onApply={c => { setNThumbCrop(c); setCropOpen(false); }} />
      )}
    </section>
  );
}

/** ?s= 를 읽으므로 Suspense 경계가 필요하다 (Next App Router) */
export default function TrpgPage() {
  return <Suspense fallback={<section className="page" />}><TrpgPageInner /></Suspense>;
}
