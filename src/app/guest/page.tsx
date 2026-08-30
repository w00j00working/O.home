'use client';
// 방명록 (4.7) — 게스트 작성(닉네임) · 비밀글 · 답글(모두, v2.0)
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  useLocalList, GUEST_SEED, GuestEntry, newId, fmtDate, Comment,
  CommentRow, COMMENT_KEY, COMMENT_SEED, commentsFor,
} from '@/lib/postStore';
import { KInput, KTextarea, KCheck, SearchBar, Pager } from '@/components/ui/Kit';
import { GuestIdBar } from '@/components/ui/GuestId';
import { Modal, useConfirmDelete } from '@/components/ui/Modal';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { useToast } from '@/components/ui/Toast';
import { pushNotif, notifyAdmins } from '@/lib/notifStore';

export default function GuestbookPage() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [entries, setEntries] = useLocalList<GuestEntry>('ohome.guest.v1', GUEST_SEED);
  /* 답글은 글과 따로 저장 (v2.0 포크 제보 — 「관리자 외에는 답글이 안 달려요」).
     예전에는 답글이 방명록 글 **안에** 들어 있어 남의 글을 UPDATE 해야 했고, 서버는 그걸
     글쓴이·관리자에게만 허용한다 — 그래서 관리자 답글 전용이 됐다. 댓글과 같은 자기 문서로
     저장하면 로그인 회원도, 비로그인 손님도 자기 권한으로 답글을 남길 수 있다. */
  const [cmtRows, setCmtRows] = useLocalList<CommentRow>(COMMENT_KEY, COMMENT_SEED);
  const [body, setBody] = useState('');
  const [secret, setSecret] = useState(false);
  const [gName, setGName] = useState('');
  const [q, setQ] = useState('');
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyName, setReplyName] = useState('');   // 손님 답글 닉네임
  const [delFor, setDelFor] = useState<string | null>(null);
  const del = useConfirmDelete();                   // 답글 삭제 확인

  const leave = () => {
    if (!body.trim()) { toast('내용을 입력해 주세요'); return; }
    if (!user && !gName.trim()) { toast('닉네임을 입력해 주세요'); return; }
    const e: GuestEntry = {
      id: newId(),
      author: user ? user.nickname : gName.trim(),
      authorId: user?.id,
      body: body.trim(), secret, date: new Date().toISOString(), reply: null,
    };
    /* **뒤에 붙인다** (v2.0 사용자 발견 — 「방명록을 저장하지 못했습니다 · 권한 없음」).
       앞에 넣으면 기존 글의 순서 번호가 전부 한 칸씩 밀려서, 저장 단계가 그것들을 모두
       「수정」으로 본다. 수정은 로그인한 사람만 할 수 있으므로 **비로그인 방문자는
       방명록이 비어 있을 때만 글을 남길 수 있었다.** 댓글은 원래 뒤에 붙여서 멀쩡했다.
       화면에서는 아래 visible이 날짜 내림차순으로 정렬하므로 새 글이 여전히 맨 위에 온다. */
    setEntries([...entries, e]);
    setBody(''); setSecret(false); setGName('');
    toast('방명록이 등록되었습니다');
    // 알림 (4.13) — 관리자에게 (본인 제외는 notifyAdmins가 건다).
    // 예전에는 받는 사람을 'admin'(목업 id)으로 적어 **서버 모드의 실제 관리자에게는 안 갔다** (v2.0)
    notifyAdmins({
      type: 'guest', href: '/guest',
      title: '방명록에 새 글이 달렸습니다',
      body: `${e.author} — ${e.secret ? '비밀글' : e.body.slice(0, 50)}`,
    });
  };

  const canRead = (e: GuestEntry) => !e.secret || isAdmin || (e.authorId && e.authorId === user?.id);

  const doDelete = () => {
    const e = entries.find(x => x.id === delFor);
    if (!e) return;
    // 손님 글은 관리자만 지운다 (v2.0 사용자 확정) — 서버가 그렇게밖에 못 받는다
    const allowed = isAdmin || (!!e.authorId && e.authorId === user?.id);
    if (!allowed) { toast('삭제 권한이 없습니다'); return; }
    setEntries(entries.filter(x => x.id !== delFor));
    // 딸린 답글도 함께 지운다 — 따로 저장되므로 남겨 두면 주인 없는 줄이 된다 (v2.0)
    setCmtRows(cmtRows.filter(c => !(c.target === 'guest' && c.targetId === e.id)));
    setDelFor(null);
    toast('삭제되었습니다');
  };

  /* 답글 등록 — 모두 가능 (v2.0 포크 제보). 자기 문서로 저장하므로 남의 글을 건드리지 않는다 */
  const saveReply = () => {
    const target = entries.find(x => x.id === replyFor);
    if (!target || !replyText.trim()) return;
    if (!user && !replyName.trim()) { toast('닉네임을 입력해 주세요'); return; }
    const c: CommentRow = {
      id: newId(), target: 'guest', targetId: target.id,
      text: replyText.trim(), date: new Date().toISOString(),
      author: user ? user.nickname : replyName.trim(), authorId: user?.id ?? '',
    };
    setCmtRows([...cmtRows, c]);
    setReplyFor(null); setReplyText('');
    // 알림 (4.13) — 회원이 쓴 방명록이면 그 회원에게 (본인 답글 제외)
    const me = user?.id ?? '';
    if (target.authorId && target.authorId !== me) {
      pushNotif({
        type: 'comment', toUserId: target.authorId, href: '/guest',
        title: '방명록 글에 답글이 달렸습니다',
        body: `${c.author} — ${c.text.slice(0, 50)}`,
      });
    }
    // 이 글에 먼저 답글을 단 회원들에게도 (v2.0 포크 제보 — 대화 참여자가 못 받던 것)
    const seen = new Set<string>();
    for (const t of repliesOf(target.id)) {
      const to = t.authorId;
      if (!to || to === me || to === target.authorId || seen.has(to)) continue;
      seen.add(to);
      pushNotif({
        type: 'comment', toUserId: to, href: '/guest',
        title: '참여한 방명록 대화에 새 답글이 달렸습니다',
        body: `${c.author} — ${c.text.slice(0, 50)}`,
      });
    }
  };
  const repliesOf = (id: string) => commentsFor(cmtRows, 'guest', id);
  // 답글 삭제 — 관리자 또는 본인(회원). 손님 답글은 관리자만 (서버가 그렇게밖에 못 받는다)
  const removeReply = (c: Comment) =>
    del.ask('이 답글을 삭제하시겠습니까?', () => setCmtRows(cmtRows.filter(x => x.id !== c.id)));

  // 최신 글이 위로 — 저장은 뒤에 붙이므로(위 참조) 보여 줄 때 날짜 내림차순으로 세운다
  const visible = (q
    ? entries.filter(e => canRead(e) && (e.body.includes(q) || e.author.includes(q)))
    : entries
  ).slice().sort((a, b) => b.date.localeCompare(a.date));

  // 방명록이 쌓이면 페이지로 (v2.0 사용자 요청) — 한 페이지 15개.
  // 답글이 달리면 한 칸이 길어지므로 도토리(12개)보다 조금만 늘렸다.
  const PER_GB = 15;
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(visible.length / PER_GB));
  const cur = Math.min(page, pages);      // 검색·삭제로 줄어 페이지가 사라지면 마지막으로 당긴다
  const start = (cur - 1) * PER_GB;
  useEffect(() => { setPage(1); }, [q]);  // 검색어가 바뀌면 첫 장부터

  return (
    <section className="page">
      <div className="page-head"><PageTitle>GUESTBOOK</PageTitle><EditableDesc k="guest-desc" def="게스트 작성 허용 옵션 · 비밀글 · 관리자 답글" /></div>

      {/* 작성 */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <KTextarea placeholder="방명록을 남겨주세요" value={body} onChange={e => setBody(e.target.value)} />
        {!user && (
          /* 게스트 신원 — 오른쪽 정렬 (v1.9 사용자 요청), 컴팩트 GUEST 바 공용 UI */
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <GuestIdBar name={gName} onName={setGName}
              style={{ width: '100%', maxWidth: 380 }} />
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <KCheck label={<span style={{ fontSize: 12 }}>비밀글 (관리자만 열람)</span>} checked={secret} onChange={setSecret} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <SearchBar light onSearch={setQ} />
            <button className="btn btn-dark" onClick={leave}>LEAVE</button>
          </div>
        </div>
      </div>

      {/* 목록 */}
      <div className="panel flush">
        {visible.slice(start, start + PER_GB).map(e => (
          <div className="gb-item" key={e.id}>
            <div className="hd">
              {canRead(e)
                ? <b>{e.secret && '🔒 '}{e.author}</b>
                : <b style={{ color: 'var(--faint)' }}>🔒 비밀글</b>}
              <small>
                {fmtDate(e.date)}
                {/* 답글은 모두 가능 (v2.0 포크 제보) — 비밀글은 읽을 수 있는 사람만 */}
                {canRead(e) && (
                  <span style={{ cursor: 'var(--cur-pointer,pointer)', marginLeft: 10, color: 'var(--accent)' }}
                    onClick={() => { setReplyFor(e.id); setReplyText(''); }}>
                    답글
                  </span>
                )}
                {(isAdmin || (!!e.authorId && e.authorId === user?.id)) && (
                  <span style={{ cursor: 'var(--cur-pointer,pointer)', marginLeft: 8 }} onClick={() => setDelFor(e.id)}>삭제</span>
                )}
              </small>
            </div>
            <p style={!canRead(e) ? { color: 'var(--faint)' } : undefined}>
              {canRead(e) ? e.body : '관리자만 볼 수 있는 글입니다.'}
            </p>
            {/* 예전 방식(글 안에 든 관리자 답글)도 그대로 보여 준다 — 이미 쌓인 데이터 (v2.0) */}
            {e.reply && canRead(e) && (
              <div className="reply"><b>↳ {e.reply.author}</b>{e.reply.text}</div>
            )}
            {canRead(e) && repliesOf(e.id).map(c => (
              <div className="reply" key={c.id}>
                <b>↳ {c.author}</b>{c.text}
                {(isAdmin || (!!c.authorId && c.authorId === user?.id)) && (
                  <span style={{ cursor: 'var(--cur-pointer,pointer)', marginLeft: 8, fontSize: 10.5, color: 'var(--faint)' }}
                    onClick={() => removeReply(c)}>삭제</span>
                )}
              </div>
            ))}
          </div>
        ))}
        {visible.length === 0 && (
          <div style={{ padding: 36, textAlign: 'center', fontSize: 12.5, color: 'var(--faint)' }}>아직 방명록이 없습니다</div>
        )}
      </div>
      {visible.length > PER_GB && <Pager page={cur} total={pages} onChange={setPage} />}

      {/* 답글 모달 — 모두 가능 (v2.0 포크 제보), 손님은 닉네임으로 */}
      <Modal open={replyFor !== null} onClose={() => setReplyFor(null)} small title="답글"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setReplyFor(null)}>CANCEL</button>
          <button className="btn btn-dark" onClick={saveReply}>SAVE</button>
        </>}>
        <div style={{ display: 'grid', gap: 9 }}>
          {!user && <KInput placeholder="닉네임" value={replyName} onChange={e => setReplyName(e.target.value)} />}
          <KTextarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="답글 내용" />
        </div>
      </Modal>
      {del.element}

      {/* 삭제 확인 — 손님 글은 관리자만 지울 수 있어 비밀번호를 묻지 않는다 (v2.0) */}
      <Modal open={delFor !== null} onClose={() => setDelFor(null)} small title="방명록 삭제"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setDelFor(null)}>CANCEL</button>
          <button className="btn btn-accent" onClick={doDelete}>DELETE</button>
        </>}>
        <p style={{ fontSize: 13, color: 'var(--sub)' }}>이 방명록을 삭제할까요?</p>
      </Modal>
    </section>
  );
}
