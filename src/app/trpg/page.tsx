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
import { useMenuSettings } from '@/lib/menuStore'; // 🌟 권한 설정 추가

function TrpgPageInner() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [site] = useSiteSettings();
  const [logsAll, setLogsAll] = useLocalList<TrpgLog>('ohome.trpg.v1', TRPG_SEED);
  const sec = useSectionParam('trpg');
  const logs = filterSection(logsAll, sec.id);
  const setLogs = sectionSetter(logsAll, sec.id, setLogsAll);
  const [bodies, setBodies] = useLocalList<TrpgLogBody>('ohome.trpgbody.v1', TRPG_BODY_SEED);
  const [rels] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const { editOn } = useMainStore();
  const [filter, setFilter] = useState<string>('all');
  const [skin, setSkin] = useState<'ticket' | 'basic'>('ticket');
  const [q, setQ] = useState('');

  // 🌟 환경설정 메뉴 관리에서 지정한 trpgWrite 권한 연동
  const [menuSet] = useMenuSettings();
  const permWrite = (menuSet as any).trpgWrite ?? 'member';
  const canWrite = isAdmin || (permWrite === 'guest') || (permWrite === 'member' && !!user);

  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width:620px)');
    const f = () => setIsMobile(mq.matches);
    f();
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);

  const [addOpen, setAddOpen] = useState(false);
  const [nNo, setNNo] = useState('');
  const [nVis, setNVis] = useState<'public' | 'member' | 'private'>('public');
  const [nListHidden, setNListHidden] = useState(false);
  const [nPw, setNPw] = useState('');
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

  const canOpen = (l: TrpgLog) => isAdmin || l.visibility === 'public' || (l.visibility === 'member' && !!user);
  const visible = logs
    .filter(l => !l.listHidden || (isAdmin && editOn))
    .filter(l => filter === 'all' || (filter === 'none' ? !l.relId : l.relId === filter))
    .filter(l => !q || l.title.includes(q) || l.writer.includes(q) || l.withText.includes(q));

  const gridSort = editOn && isAdmin;
  const [gridPreview, setGridPreview] = useState<TrpgLog[] | null>(null);
  const gridFromRef = useRef<number | null>(null);
  const basicShown = gridPreview ?? visible;

  const ticketView = skin === 'ticket' && !isMobile;
  const PER_LOG = ticketView ? 6 : 20;
  const [logPage, setLogPage] = useState(1);
  const logPages = Math.max(1, Math.ceil(visible.length / PER_LOG));
  const logCur = Math.min(logPage, logPages);
  const logStart = (logCur - 1) * PER_LOG;
  useEffect(() => { setLogPage(1); }, [filter, q, ticketView]);
  const pageLogs = visible.slice(logStart, logStart + PER_LOG);

  const reorderPage = (nextPage: TrpgLog[]) => {
    const nextVisible = [...visible];
    nextVisible.splice(logStart, nextPage.length, ...nextPage);
    setLogs(mergeOrder(logs, nextVisible));
  };

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
          if (p) setLogs(mergeOrder(logs, p));
          return null;
        });
      },
      style: { cursor: 'var(--cur-grab,grab)' },
    };
  };

  const decodeText = decodeLogText;

  const readFile = (f: File | undefined) => {
    if (!f) return;
    setNFileName(f.name);
    setNFile(f);
    decodeText(f).then(setNBody);
  };

  const add = async () => {
    if (!nTitle.trim()) { toast('시나리오 타이틀을 입력해 주세요'); return; }
    const id = newId();
    const bodyText = nFile ? await decodeText(nFile) : nBody;
    const log: TrpgLog = {
      id,
      no: Math.max(0, ...logs.map(l => l.no)) + 1,
      noText: nNo.trim() || undefined,
      title: nTitle.trim(), catchphrase: nCatch.trim() || undefined,
      writer: nWriter.trim(), withText: nWith.trim(),
      relId: nRel === 'none' ? undefined : nRel,
      date: nDate || undefined, ph: 'cool',
      visibility: nVis,
      password: nPw.trim() || undefined,
      listHidden: nListHidden,
      thumbId: nThumb ? await putBlob(nThumb) : undefined,
      thumbCrop: nThumb ? nThumbCrop : undefined,
      thumbColor: nThumb ? undefined : { c1: nC1, c2: nColorMode === 'grad' ? nC2 : undefined },
    };
    const body: TrpgLogBody = {
      id,
      ...(await saveLogBody(bodyText)),
      originalFileId: nFile ? await putBlob(nFile) : undefined,
      originalName: nFile?.name,
      visibility: bodyVisibility(log),
      ...secStamp(sec.id),
    };
    setLogs([log, ...logs]);
    setBodies([...bodies, body]);
    setAddOpen(false);
    setNNo(''); setNVis('public'); setNPw(''); setNListHidden(false); setNTitle(''); setNCatch(''); setNWriter(''); setNWith(''); setNBody(''); setNFileName(''); setNDate(''); setNFile(null);
    setNThumb(null); setNThumbUrl(''); setNThumbCrop(undefined);
    toast(nFile ? '로그가 등록되었습니다 — 원본 파일도 보관됩니다' : '로그가 등록되었습니다');
  };

  const thumbStyle = (l: TrpgLog): React.CSSProperties | undefined =>
    l.thumbColor
      ? { background: l.thumbColor.c2 ? `linear-gradient(135deg, ${l.thumbColor.c1} 0%, ${l.thumbColor.c2} 100%)` : l.thumbColor.c1 }
      : undefined;

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
          {editOn && <span className="drag-h" style={{ marginRight: 8 }}>⠿</span>}
          {l.title}
        </div>
        {editOn && l.listHidden && <span className="pill" style={{ marginTop: 4 }}>숨김</span>}
        {l.catchphrase && <div className="sc-catch">{l.catchphrase}</div>}
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
          {/* 🌟 canWrite 조건 적용 */}
          {canWrite && <button className="btn btn-dark" style={{ whiteSpace: 'nowrap' }} onClick={() => setAddOpen(true)}>＋ ADD LOG</button>}
        </div>
      </div>
      <div className="trpg-layout">
        <div>
          {ticketView
            ? (
              <DragList items={pageLogs} keyOf={l => l.id}
                onReorder={reorderPage}
                disabled={!(editOn && isAdmin)}
                render={l => <Ticket l={l} />} />
            )
            : (
              <div className="panel flush trpg-basic">
                {basicShown.slice(logStart, logStart + PER_LOG).map((l, i) => (
                  <div key={l.id} className="list-item" {...gridDragProps(logStart + i)}
                    onContextMenu={e => openOrder(e, l.id)}
                    onClick={() => { if (!editOn) router.push(`/trpg/${l.id}`); }}>
                    {editOn && <span className="drag-h">⠿</span>}
                    <div className={`th ${!l.thumbId && !l.thumbColor ? `ph ${l.ph}` : ''}`} style={{ ...thumbStyle(l), position: 'relative' }}>
                      {l.thumbId && <CroppedBlobImg fileRef={l.thumbId} crop={l.thumbCrop} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b>{l.title}</b>
                      {editOn && l.listHidden && <span className="pill" style={{ marginLeft: 6 }}>숨김</span>}
                      {!canOpen(l) && <span className="pill" style={{ marginLeft: 6 }}>{l.password ? '비밀번호 필요' : '비공개'}</span>}
                      <small>{[l.writer, l.withText].filter(Boolean).join(' · ')}{l.date ? ` · ${l.date.replace(/-/g, '.')}` : ''}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
          {ordFor && ordIdx >= 0 && (
            <OrderMenu at={ordFor} current={orderNoOf(ordIdx)} total={visible.length}
              onApply={applyOrder} onClose={() => setOrdFor(null)} />
          )}
        </div>
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

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="로그 등록"
        desc="본문: 파일 업로드(.txt/.html — 내용 자동 판별) 또는 붙여넣기/직접 작성"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setAddOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={add}>ADD</button>
        </>}>
        <div style={{ display: 'grid', gap: 9 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <KInput placeholder="시나리오 타이틀 (필수)" value={nTitle} onChange={e => setNTitle(e.target.value)} />
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <KSelect minWidth={140} value={nVis} onChange={v => setNVis(v as 'public')}
              options={[
                { value: 'public', label: '전체공개' },
                { value: 'member', label: '멤버공개' },
                { value: 'private', label: '나만보기' },
              ]} />
            <KInput placeholder="열람 비밀번호 (선택)" value={nPw} onChange={e => setNPw(e.target.value)} style={{ flex: 1 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
            <span className="cp-lb">목록</span>
            <KSelect minWidth={140} value={nListHidden ? 'hidden' : 'show'}
              onChange={v => setNListHidden(v === 'hidden')}
              options={[
                { value: 'show', label: '목록에 표시' },
                { value: 'hidden', label: '목록에서 숨기기' },
              ]} />
          </div>

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

      {nThumbUrl && (
        <CropEditor open={cropOpen} src={nThumbUrl} aspect="16:9" initial={nThumbCrop}
          onClose={() => setCropOpen(false)}
          onApply={c => { setNThumbCrop(c); setCropOpen(false); }} />
      )}
    </section>
  );
}

export default function TrpgPage() {
  return <Suspense fallback={<section className="page" />}><TrpgPageInner /></Suspense>;
}
