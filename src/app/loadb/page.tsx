'use client';
// 그림게시판 로드뷰 (4.10) — 목록 없이 최신순 즉시 표시 · 좌 그림/우 댓글 · 즉시 업로드 · 접기
import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useSectionParam, filterSection, sectionSetter } from '@/lib/sectionStore';
import {
  useLocalList, newId, fmtDate, Comment,
  CommentRow, COMMENT_KEY, COMMENT_SEED, commentsFor,
} from '@/lib/postStore';
import { RoadItem, ROAD_SEED } from '@/lib/galleryStore';
import { SearchBar, KInput } from '@/components/ui/Kit';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { Modal, ConfirmModal, useConfirmDelete } from '@/components/ui/Modal';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { KCheck } from '@/components/ui/Kit';
import { useToast } from '@/components/ui/Toast';
import { pushNotif } from '@/lib/notifStore';
import { useMenuSettings, MenuPerm } from '@/lib/menuStore';
import { GuestIdBar } from '@/components/ui/GuestId';
import { fileDrop } from '@/lib/dnd';

const PAGE_SIZE = 4;
const FOLD_LABEL = { spoiler: '스포일러', adult: '수위 주의' };

function RoadBlock({ item, comments, onComment, onEditComment, onDeleteComment, canComment, guestMode, editLevel, delLevel, canEditItem, canDeleteItem, onEdit, onDelete }: {
  item: RoadItem;
  comments: Comment[];                                  // 이 그림의 댓글 — 분리 저장분 + 옛 항목 안의 것 (v2.0)
  onComment: (id: string, text: string, guest?: { name: string }, parentId?: string) => void;
  onEditComment: (id: string, cid: string, text: string) => void;
  onDeleteComment: (id: string, cid: string) => void;
  canComment: boolean;
  guestMode: boolean;                                   // 비로그인 방문자 작성 (닉네임+비밀번호 — 방명록 4.7과 동일)
  editLevel: (c: Comment) => 'free' | 'pw' | null;      // 수정 — 본인만 (게스트는 비밀번호)
  delLevel: (c: Comment) => 'free' | 'pw' | null;       // 삭제 — 본인·관리자 (게스트는 비밀번호)
  canEditItem: boolean;                                 // 그림 수정 — 작성자 본인만 (v1.9)
  canDeleteItem: boolean;                               // 그림 삭제 — 작성자·관리자
  onEdit: () => void;
  onDelete: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);   // 대댓글 (v2.0 사용자 요청)
  const [gName, setGName] = useState('');               // 게스트 닉네임
  // 댓글 인라인 수정 (v1.9)
  const [editCid, setEditCid] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  // 게스트 댓글 관리 — 비밀번호 확인 모달
  const del = useConfirmDelete();
  const folded = item.fold && !open;
  const imgSrc = useBlobUrl(item.imgId ?? item.imgUrl);
  const saveEdit = () => {
    if (editCid && editText.trim()) onEditComment(item.id, editCid, editText.trim());
    setEditCid(null);
  };
  const post = () => {
    if (!text.trim()) return;
    if (guestMode && !gName.trim()) { toast('닉네임을 입력해 주세요'); return; }
    onComment(item.id, text.trim(), guestMode ? { name: gName.trim() } : undefined, replyTo ?? undefined);
    setText(''); setReplyTo(null);
  };
  // 대댓글 (v2.0 사용자 요청) — 게시판과 같은 한 단계 답글
  const roots = comments.filter(c => !c.parentId);
  const childrenOf = (pid: string) => comments.filter(c => c.parentId === pid);
  const askManage = (c: Comment, mode: 'edit' | 'del') => {
    const level = mode === 'edit' ? editLevel(c) : delLevel(c);
    if (level !== 'free') return;
    if (mode === 'edit') { setEditCid(c.id); setEditText(c.text); }
    else del.ask('이 댓글을 삭제하시겠습니까?', () => onDeleteComment(item.id, c.id));
  };
  return (
    <div className="panel roadview-item">
      {/* 그림별 상단 번호 영역 (v1.9 사용자 확정) — 숫자만 표시 (제목·작성자 없이) */}
      <div className="rv-head">
        <b>No.{String(item.no ?? 0).padStart(3, '0')}</b>
      </div>
      {/* 투명 PNG도 카드색 위에 자연스럽게 — 어두운 하드코딩 제거 (v1.9 사용자 피드백) */}
      <div className={`art ${folded ? 'veil' : ''}`} style={{ background: 'var(--panel-solid)' }}>
        {imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgSrc} alt={item.title}
            className={`artimg ${item.narrow ? 'narrow' : ''}`} style={{ filter: folded ? 'blur(18px)' : undefined }} />
        ) : (
          <div className={`artimg ${item.narrow ? 'narrow' : ''} ph ${item.ph}`}
            style={{ aspectRatio: item.ratio, filter: folded ? 'blur(18px)' : undefined }}>
            <span>{item.title}</span>
          </div>
        )}
        {folded && (
          <div className="cover" onClick={() => setOpen(true)}>
            <div>
              <b>{item.fold!.type === 'custom' ? (item.fold!.label || '접힘') : FOLD_LABEL[item.fold!.type]}</b><br />
              <span>클릭하여 표시</span>
            </div>
          </div>
        )}
        {(canEditItem || canDeleteItem) && (
          /* 이미지에 마우스를 올렸을 때만 표시 (.rv-actions — globals.css) · 수정은 작성자만, 삭제는 관리자도 */
          <div className="rv-actions" style={{ position: 'absolute', top: 12, right: 12, zIndex: 6, display: 'flex', gap: 6 }}>
            {canEditItem && (
              <button style={{ fontSize: 10.5, padding: '5px 11px', borderRadius: 999, background: 'rgba(15,17,20,.55)', color: '#dfe2e7' }}
                onClick={e => { e.stopPropagation(); onEdit(); }}>EDIT</button>
            )}
            {canDeleteItem && (
              <button style={{ fontSize: 10.5, padding: '5px 11px', borderRadius: 999, background: 'rgba(166,58,69,.75)', color: '#fff' }}
                onClick={e => { e.stopPropagation(); onDelete(); }}>DELETE</button>
            )}
          </div>
        )}
      </div>
      <div className="cmt-side">
        <div className="list">
          {/* 대댓글 (v2.0 사용자 요청) — 뿌리 댓글 아래에 답글을 한 단계 들여 보여 준다 */}
          {roots.flatMap(r => [r, ...childrenOf(r.id)]).map(c => (
            <div className={`cmt ${c.parentId ? 'reply-depth' : ''}`} key={c.id}>
              <b>{c.author}</b><small>{fmtDate(c.date)}</small>
              {editCid !== c.id && (
                <>
                  {canComment && !c.parentId && (
                    <small style={{ cursor: 'var(--cur-pointer,pointer)', color: 'var(--accent)', marginLeft: 8 }}
                      onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}>
                      {replyTo === c.id ? '답글 취소' : '답글'}
                    </small>
                  )}
                  {editLevel(c) !== null && (
                    <small style={{ cursor: 'var(--cur-pointer,pointer)', color: 'var(--accent)', marginLeft: 8 }}
                      onClick={() => askManage(c, 'edit')}>수정</small>
                  )}
                  {delLevel(c) !== null && (
                    <small style={{ cursor: 'var(--cur-pointer,pointer)', marginLeft: 6 }}
                      onClick={() => askManage(c, 'del')}>삭제</small>
                  )}
                </>
              )}
              {editCid === c.id ? (
                <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                  <KInput value={editText} autoFocus onChange={e => setEditText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditCid(null); }}
                    style={{ flex: 1 }} />
                  <button className="btn btn-dark" style={{ padding: '4px 11px', fontSize: 10.5 }} onClick={saveEdit}>SAVE</button>
                  <button className="btn btn-ghost" style={{ padding: '4px 9px', fontSize: 10.5 }} onClick={() => setEditCid(null)}>✕</button>
                </div>
              ) : (
                <p>{c.text}</p>
              )}
            </div>
          ))}
          {comments.length === 0 && <p className="hint">첫 댓글을 남겨보세요</p>}
        </div>
        {/* 게스트 작성(방문자 허용) — 구분선 아래 GUEST 바 + 입력줄 세로 배치 */}
        <div className={`cmt-input ${guestMode && canComment ? 'guest' : ''}`}>
          {guestMode && canComment && (
            <GuestIdBar name={gName} onName={setGName} />
          )}
          <div className="ci-row" style={guestMode && canComment ? undefined : { display: 'contents' }}>
            <KInput placeholder={canComment ? (replyTo ? '답글 작성...' : '댓글 남기기...') : '댓글은 로그인 후'} value={text}
              disabled={!canComment}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') post(); }} />
            <button className="btn btn-dark" disabled={!canComment} onClick={post}>POST</button>
          </div>
        </div>
      </div>
      {del.element}
    </div>
  );
}

function RoadviewPageInner() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  // 업로드·댓글 권한 3단계 (4.10 v1.7 — 환경설정 > 메뉴 관리의 로드뷰 항목).
  // 방문자(비로그인) 실사용은 Supabase 익명 처리 시 — mock 단계에선 로그인 전제
  const [menuSet] = useMenuSettings();
  const allow = (p: MenuPerm) => (p === 'admin' ? isAdmin : p === 'member' ? !!user : true);
  const [itemsAll, setItemsAll, roadLoaded] = useLocalList<RoadItem>('ohome.road.v1', ROAD_SEED);
  // 여러 개로 만든 섹션 (v2.0) — 주소의 ?s= 가 가리키는 것만 보여 준다
  const sec = useSectionParam('roadview');
  const items = filterSection(itemsAll, sec.id);
  // 저장은 이 섹션 자리만 교체 — 걸러진 목록을 그대로 넘겨도 다른 섹션이 지워지지 않는다
  const setItems = sectionSetter(itemsAll, sec.id, setItemsAll);
  // 댓글은 항목과 따로 저장한다 (v2.0) — 항목 안에 두면 댓글을 달 때 항목을 UPDATE 해야 해서
  // 일반 회원이 남의 그림에 댓글을 달 수 없었다 (게시판과 같은 원인)
  const [cmtRows, setCmtRows] = useLocalList<CommentRow>(COMMENT_KEY, COMMENT_SEED);
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);

  // 그림 번호 (v1.9) — 번호 없는 기존 그림은 오래된 순으로 자동 부여
  useEffect(() => {
    if (!roadLoaded) return;
    if (items.some(it => it.no === undefined)) {
      let n = Math.max(0, ...items.map(it => it.no ?? 0));
      const next = [...items].sort((a, b) => a.date.localeCompare(b.date))
        .map(it => (it.no === undefined ? { ...it, no: ++n } : it));
      setItems(items.map(it => next.find(x => x.id === it.id) ?? it));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roadLoaded]);
  // 다음 번호 — 항상 최대+1 자동 증가. 건너뛰기·재배치는 각 그림 편집 모달의 번호 수정으로 (v1.9)
  const nextNo = Math.max(0, ...items.map(it => it.no ?? 0)) + 1;
  const padNo = (n?: number) => `No.${String(n ?? 0).padStart(3, '0')}`;
  const fileRef = useRef<HTMLInputElement>(null);
  const [editFor, setEditFor] = useState<RoadItem | null>(null);
  const [eNo, setENo] = useState('');      // 번호 수정 (v1.9 — 제목 없이 번호만 쓰는 체계)
  const [eAdult, setEAdult] = useState(false);
  const [delFor, setDelFor] = useState<RoadItem | null>(null);

  // 즉시 업로드 (v1.7) — IndexedDB 실저장 (R2 연동 시 서버로 이전)
  const upload = async (f: File | undefined) => {
    if (!f) return;
    const imgId = await putBlob(f); // IndexedDB 실저장 — 새로고침에도 유지
    const it: RoadItem = {
      id: newId(), title: '', author: user!.nickname, authorId: user!.id,
      date: new Date().toISOString(), imgId, ph: '', ratio: 'auto',
      fold: null, comments: [],
      no: nextNo,   // 번호 자동 부여 (v1.9)
    };
    setItems([it, ...items]);
    toast(`${padNo(it.no)} 업로드되었습니다`);
  };

  const addComment = (id: string, text: string, guest?: { name: string }, parentId?: string) => {
    // 게스트 댓글 (방문자 권한, v1.9) — 닉네임만, authorId는 빈 값. parentId가 있으면 대댓글 (v2.0)
    const base = { id: newId(), text, date: new Date().toISOString(), target: 'road' as const, targetId: id, parentId };
    const c: CommentRow = guest
      ? { ...base, author: guest.name, authorId: '' }
      : { ...base, author: user!.nickname, authorId: user!.id };
    setCmtRows([...cmtRows, c]);
    // 답글이면 뿌리 주인만이 아니라 **그 대화에 답글을 단 전원**에게 (v2.0 포크 제보 — 게시판과 동일).
    // 그림 작성자는 아래에서 이미 받으므로 뺀다
    if (parentId) {
      const target0 = items.find(it => it.id === id);
      const thread = commentsFor(cmtRows, 'road', id, target0?.comments ?? [])
        .filter(x => x.id === parentId || x.parentId === parentId);
      const rootAuthor = thread.find(x => x.id === parentId)?.authorId;
      const seen = new Set<string>();
      for (const t of thread) {
        const to = t.authorId;
        if (!to || to === (user?.id ?? '') || to === target0?.authorId || seen.has(to)) continue;
        seen.add(to);
        pushNotif({
          type: 'comment', toUserId: to, href: '/loadb',
          title: to === rootAuthor ? '내 댓글에 답글이 달렸습니다' : '참여한 댓글에 새 답글이 달렸습니다',
          body: c.author + ' — ' + text.slice(0, 50),
        });
      }
    }
    // 알림 (4.13) — 그림 작성자에게 (본인 댓글 제외)
    const target = items.find(it => it.id === id);
    if (target && target.authorId && target.authorId !== (user?.id ?? '')) {
      pushNotif({
        type: 'comment', toUserId: target.authorId, href: '/roadview',
        title: `${padNo(target.no)}에 새 댓글`,   // 알림도 번호 기준 (v1.9)
        body: `${c.author} — ${text.slice(0, 50)}`,
      });
    }
  };

  // 댓글 수정·삭제 (v1.9) — 관리자·본인은 바로, 게스트 댓글은 비밀번호 확인(RoadBlock)
  // 분리 저장분과 옛 항목 안의 댓글을 모두 다룬다 (v2.0)
  const editComment = (id: string, cid: string, text: string) => {
    if (cmtRows.some(c => c.id === cid)) setCmtRows(cmtRows.map(c => (c.id === cid ? { ...c, text } : c)));
    else setItems(items.map(it => it.id === id ? { ...it, comments: it.comments.map(c => c.id === cid ? { ...c, text } : c) } : it));
  };
  const deleteComment = (id: string, cid: string) => {
    // 뿌리 댓글을 지우면 딸린 답글도 함께 (v2.0) — 남겨 두면 주인 없는 줄이 된다
    const gone = (c: { id: string; parentId?: string }) => c.id === cid || c.parentId === cid;
    if (cmtRows.some(gone)) setCmtRows(cmtRows.filter(c => !gone(c)));
    if (items.some(it => it.id === id && it.comments.some(gone)))
      setItems(items.map(it => it.id === id ? { ...it, comments: it.comments.filter(c => !gone(c)) } : it));
  };
  /* 수정은 작성자 본인만 — 관리자도 타인 댓글은 삭제만 (v1.9 사용자 확정).
     **손님 댓글은 손댈 수 없다** (v2.0 사용자 확정) — 비밀번호로 본인을 확인하던 길을
     없앴다. 서버가 로그인한 사람에게만 수정·삭제를 허용하므로 실제로 되지 않던 기능이다. */
  const editLevel = (c: Comment): 'free' | null => (user && c.authorId === user.id ? 'free' : null);
  const delLevel = (c: Comment): 'free' | null => (isAdmin || (user && c.authorId === user.id) ? 'free' : null);

  const visible = items.filter(it => !q || it.author.includes(q)
    || padNo(it.no).includes(q) || String(it.no ?? '').includes(q));

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'LOAD-B' : sec.name}</PageTitle>
        <EditableDesc k="roadview-desc" def="그림이 좋아서 모았습니다" />
        <div className="head-actions">
          {allow(menuSet.roadUpload) && !!user && (
            <>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }} />
              <button className="btn btn-dark" onClick={() => fileRef.current?.click()}
                {...fileDrop(fl => upload(fl[0]))}>↑ UPLOAD</button>
            </>
          )}
          <SearchBar onSearch={setQ} />
        </div>
      </div>

      {visible.slice(0, shown).map(it => (
        <RoadBlock key={it.id} item={it} comments={commentsFor(cmtRows, 'road', it.id, it.comments)} onComment={addComment}
          onEditComment={editComment} onDeleteComment={deleteComment}
          canComment={allow(menuSet.roadComment) && (!!user || menuSet.roadComment === 'guest')}
          guestMode={!user && menuSet.roadComment === 'guest'}
          editLevel={editLevel} delLevel={delLevel}
          /* authorId 없는 항목 + 비로그인이면 둘 다 undefined라 통과하던 것 (v2.0 발견) —
             손님이 올린 것은 이제 관리자만 손댈 수 있다(손님 확인 수단이 없다) */
          canEditItem={!!it.authorId && it.authorId === user?.id}
          canDeleteItem={isAdmin || (!!it.authorId && it.authorId === user?.id)}
          onEdit={() => { setEditFor(it); setENo(String(it.no ?? '')); setEAdult(it.fold?.type === 'adult'); }}
          onDelete={() => setDelFor(it)} />
      ))}
      {visible.length === 0 && (
        <div className="panel" style={{ textAlign: 'center', padding: 44, fontSize: 13, color: 'var(--faint)' }}>
          그림이 없습니다
        </div>
      )}
      {shown < visible.length && (
        <div style={{ textAlign: 'center', marginTop: 6 }}>
          <button className="btn btn-ghost" style={{ background: 'rgba(255,255,255,.9)' }}
            onClick={() => setShown(s => s + PAGE_SIZE)}>MORE ↓</button>
        </div>
      )}
      {/* 편집 모달 (제목 · 수위 접기) */}
      <Modal open={editFor !== null} onClose={() => setEditFor(null)} small title="그림 편집"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setEditFor(null)}>CANCEL</button>
          <button className="btn btn-dark" onClick={() => {
            const nv = parseInt(eNo, 10);
            setItems(items.map(x => x.id === editFor!.id
              ? { ...x, no: Number.isFinite(nv) && nv > 0 ? nv : x.no, fold: eAdult ? { type: 'adult' } : null } : x));
            setEditFor(null);
          }}>SAVE</button>
        </>}>
        <div style={{ display: 'grid', gap: 9 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="cp-lb">번호</span>
            <KInput value={eNo} onChange={e => setENo(e.target.value.replace(/[^\d]/g, ''))}
              style={{ width: 90, textAlign: 'center' }} />
          </div>
          <KCheck label="수위 주의 접기 (블러 + 클릭 표시)" checked={eAdult} onChange={setEAdult} />
        </div>
      </Modal>

      {/* 삭제 경고 모달 */}
      <ConfirmModal open={delFor !== null} title="그림을 삭제하시겠습니까?"
        body={`${padNo(delFor?.no)} — 삭제한 그림과 댓글은 복구할 수 없습니다.`}
        onClose={() => setDelFor(null)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => {
            const gone = delFor!.id;
            setItems(items.filter(x => x.id !== gone));
            // 그림에 딸린 댓글도 함께 (v2.0 — 따로 저장이라 남겨 두면 주인 없는 줄이 된다)
            setCmtRows(cmtRows.filter(c => !(c.target === 'road' && c.targetId === gone)));
            setDelFor(null);
          } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelFor(null) },
        ]} />
    </section>
  );
}

/** ?s= 를 읽으므로 Suspense 경계가 필요하다 (Next App Router) */
export default function RoadviewPage() {
  return <Suspense fallback={<section className="page" />}><RoadviewPageInner /></Suspense>;
}
