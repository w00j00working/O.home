'use client';
// 게시글 상세 (4.2) — 본문 렌더(격리 새니타이즈) · 접기 · 댓글+대댓글
import React, { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useHrefBlock } from '@/components/shell/MenuGuard';
import { extraBoardHref } from '@/lib/menuStore';
import { useAuth } from '@/lib/auth';
import {
  useLocalList, BOARD_SEED, Post, Comment, newId, fmtDate,
  CommentRow, COMMENT_KEY, COMMENT_SEED, commentsFor,
} from '@/lib/postStore';
import { useBoards, boardHref, MAIN_BOARD_ID, BoardPerm } from '@/lib/boardStore';
import { renderBody } from '@/lib/sanitize';
import { KInput } from '@/components/ui/Kit';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { GuestIdBar } from '@/components/ui/GuestId';
import { useToast } from '@/components/ui/Toast';
import { PageTitle } from '@/components/ui/PageText';
import { pushNotif } from '@/lib/notifStore';

const FOLD_LABEL = { spoiler: '스포일러 주의', adult: '수위 주의' };

export default function BoardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [posts, setPosts, loaded] = useLocalList<Post>('ohome.board.v1', BOARD_SEED);
  // 댓글은 글과 따로 저장된다 (v2.0) — 글 안에 두면 댓글을 달 때 글을 UPDATE 해야 해서
  // 일반 회원이 관리자 글에 댓글을 달 수 없었다 (포크 사용자 제보)
  const [cmtRows, setCmtRows] = useLocalList<CommentRow>(COMMENT_KEY, COMMENT_SEED);
  const { boards } = useBoards();                  // 소속 게시판 (5.2 다중 게시판)
  const [open, setOpen] = useState(false);         // 접기 해제
  const [cmt, setCmt] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [delAsk, setDelAsk] = useState(false);
  const [gName, setGName] = useState('');                       // 게스트 닉네임 (방문자 댓글 허용 시)

  const post = posts.find(p => p.id === id);
  /* 이 글이 속한 곳이 비공개면 주소로 들어와도 열리지 않게 (v2.0 사용자 요청).
     글 주소에는 섹션이 없어 MenuGuard가 못 막는다 — 글을 읽어 소속을 알아낸 여기서 판정한다.
     **다른 early return보다 먼저 불러야 한다**(훅이므로 렌더마다 개수가 같아야 한다) */
  const bid = post?.boardId ?? MAIN_BOARD_ID;
  const blocked = useHrefBlock(post && (bid === MAIN_BOARD_ID ? '/board' : extraBoardHref(bid)));
  // loaded 이후에만 본문 렌더 (SSR/하이드레이션 불일치 방지)
  const html = useMemo(() => (post && loaded ? renderBody(post.mode, post.body) : ''), [post, loaded]);

  // 막힌 곳이면 여기서 되돌아간다 — 훅을 모두 부른 뒤여야 렌더마다 개수가 같다
  if (blocked) return blocked;
  if (!loaded) return <section className="page" />;
  if (!post) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>BOARD</PageTitle><p>글을 찾을 수 없습니다</p></div>
      </section>
    );
  }
  /* 글쓴이인지 한 곳에서 정한다 (v2.0 발견) — 예전 글이나 손님이 쓴 글은 authorId가 없고
     비로그인 방문자도 user?.id가 없어, 서로 「같다」고 판정돼 **비밀글이 그대로 열렸다.** */
  const isAuthor = !!post.authorId && post.authorId === user?.id;
  if (post.secret && !isAdmin && !isAuthor) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>BOARD</PageTitle><p>비밀글 — 작성자와 관리자만 열람할 수 있습니다</p></div>
      </section>
    );
  }

  const board = boards.find(b => b.id === (post.boardId ?? MAIN_BOARD_ID)) ?? boards[0];
  const boardTitle = board.id === MAIN_BOARD_ID ? 'BOARD' : board.name;
  // 댓글 권한 (5.2) — 방문자 허용 시 게스트 작성(닉네임+비밀번호, 방명록 4.7 규칙)
  const allow = (p: BoardPerm) => (p === 'admin' ? isAdmin : p === 'member' ? !!user : true);
  const guestMode = !user && board.permComment === 'guest';
  const canComment = allow(board.permComment) && (!!user || guestMode);

  const canManage = isAdmin || isAuthor;
  const update = (patch: Partial<Post>) =>
    setPosts(posts.map(p => (p.id === post.id ? { ...p, ...patch } : p)));

  // 이 글의 댓글 — 분리 저장분 + 옛 글 안에 남아 있던 것 (v2.0)
  const comments = commentsFor(cmtRows, 'post', post.id, post.comments);

  const addComment = () => {
    if (!canComment) { toast('댓글은 로그인 후 작성할 수 있습니다'); return; }
    if (!cmt.trim()) return;
    if (guestMode && !gName.trim()) { toast('닉네임을 입력해 주세요'); return; }
    const base = { id: newId(), text: cmt.trim(), date: new Date().toISOString(), parentId: replyTo ?? undefined };
    const c: CommentRow = user
      ? { ...base, target: 'post', targetId: post.id, author: user.nickname, authorId: user.id }
      : { ...base, target: 'post', targetId: post.id, author: gName.trim(), authorId: '' };
    setCmtRows([...cmtRows, c]);
    /* 알림 (v2.0 포크 제보 — 「댓글을 달아도 알림이 안 와요」): 게시판 댓글은 여태 알림을
       **만들지도 않았다** (로드비·방명록·역극만 있었다). 글쓴이에게, 답글이면 그 댓글 주인에게도. */
    const me = user?.id ?? '';
    if (post.authorId && post.authorId !== me) {
      pushNotif({
        type: 'comment', toUserId: post.authorId, href: `/board/${post.id}`,
        title: `「${post.title}」에 새 댓글`, body: `${c.author} — ${c.text.slice(0, 50)}`,
      });
    }
    if (replyTo) {
      /* 뿌리 댓글 주인만이 아니라 **그 대화에 답글을 단 전원**에게 (v2.0 포크 제보 —
         관리자가 자기 뿌리 댓글에 답하면, 사이에 답글을 단 회원이 아무것도 못 받았다).
         글쓴이는 위에서 이미 받았으므로 뺀다. */
      const rootAuthor = comments.find(x => x.id === replyTo)?.authorId;
      const seen = new Set<string>();
      for (const t of comments.filter(x => x.id === replyTo || x.parentId === replyTo)) {
        const to = t.authorId;
        if (!to || to === me || to === post.authorId || seen.has(to)) continue;
        seen.add(to);
        pushNotif({
          type: 'comment', toUserId: to, href: `/board/${post.id}`,
          title: to === rootAuthor ? '내 댓글에 답글이 달렸습니다' : '참여한 댓글에 새 답글이 달렸습니다',
          body: `${c.author} — ${c.text.slice(0, 50)}`,
        });
      }
    }
    setCmt(''); setReplyTo(null);
  };

  // 댓글 삭제 — 대댓글도 함께. 옛 글 안에 있던 댓글이면 글 쪽에서 지운다 (v2.0)
  const removeComment = (c: Comment) => {
    const gone = (x: { id: string; parentId?: string }) => x.id === c.id || x.parentId === c.id;
    if (cmtRows.some(gone)) setCmtRows(cmtRows.filter(x => !gone(x)));
    if (post.comments.some(gone)) update({ comments: post.comments.filter(x => !gone(x)) });
  };
  const roots = comments.filter(c => !c.parentId);
  const childrenOf = (pid: string) => comments.filter(c => c.parentId === pid);

  const CmtRow = ({ c, depth }: { c: Comment; depth: number }) => (
    <div className={`cmt ${depth > 0 ? 'reply-depth' : ''}`}>
      <b>{c.author}</b><small>{fmtDate(c.date)}</small>
      {canComment && depth === 0 && (
        <small style={{ cursor: 'var(--cur-pointer,pointer)', color: 'var(--accent)', marginLeft: 8 }}
          onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}>
          {replyTo === c.id ? '답글 취소' : '답글'}
        </small>
      )}
      {/* 손님 댓글은 관리자만 지운다 (v2.0 사용자 확정) — 서버가 그렇게밖에 못 받는다 */}
      {(isAdmin || (user && c.authorId === user.id)) && (
        <small style={{ cursor: 'var(--cur-pointer,pointer)', marginLeft: 8 }}
          onClick={() => removeComment(c)}>
          삭제
        </small>
      )}
      <p>{c.text}</p>
    </div>
  );

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href={boardHref(board.id)}>{boardTitle}</PageTitle>
        <p>{post.notice ? '공지 · ' : `${post.category} · `}{post.author} · {fmtDate(post.date)}</p>
        <div className="head-actions">
          {/* 수정은 작성자 본인만 — 관리자도 타인 글은 삭제만 (v1.9) */}
          {isAuthor && (
            <button className="btn btn-dark" onClick={() => router.push(`/board/write?edit=${post.id}`)}>EDIT</button>
          )}
          {canManage && (
            <button className="btn btn-dark" onClick={() => setDelAsk(true)}>DELETE</button>
          )}
        </div>
      </div>

      <div className="panel" style={{ padding: '26px 28px' }}>
        <h2 style={{ fontSize: 19, marginBottom: 4 }}>
          {post.secret && '🔒 '}{post.title}
        </h2>
        <p style={{ fontSize: 11, color: 'var(--faint)', marginBottom: 18 }}>
          {post.author} · {fmtDate(post.date)} · {post.mode.toUpperCase()}
          {/* 태그 (v2.0 사용자 요청) — 목록과 같은 표기 */}
          {(post.tags ?? []).map(t => (
            <span key={t} style={{ marginLeft: 7, color: 'color-mix(in srgb,var(--accent) 65%,var(--faint))' }}>#{t}</span>
          ))}
        </p>

        {/* 접기 (6.2) — 흐림 커버, 클릭 시 표시 */}
        <div className={`veil ${!post.fold || open ? 'open' : ''}`}>
          {post.fold && !open && (
            <div className="cover" onClick={() => setOpen(true)} style={{ position: 'absolute' }}>
              <div>
                <b>{post.fold.type === 'custom' ? (post.fold.label || '접힌 글') : FOLD_LABEL[post.fold.type]}</b>
                <span style={{ display: 'block' }}>클릭하면 내용이 표시됩니다</span>
              </div>
            </div>
          )}
          <div className="post-body" style={post.fold && !open ? { minHeight: 120, filter: 'blur(6px)' } : undefined}
            dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>

      {/* 댓글 + 대댓글 */}
      <div className="panel" style={{ padding: 0, marginTop: 16 }}>
        <div style={{ padding: '16px 18px' }}>
          <h4 style={{ fontSize: 11.5, letterSpacing: '.12em', color: 'var(--faint)', marginBottom: 13 }}>
            COMMENTS {comments.length > 0 && <span style={{ color: 'var(--accent)' }}>{comments.length}</span>}
          </h4>
          {roots.map(c => (
            <React.Fragment key={c.id}>
              <CmtRow c={c} depth={0} />
              {childrenOf(c.id).map(cc => <CmtRow key={cc.id} c={cc} depth={1} />)}
            </React.Fragment>
          ))}
          {comments.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--faint)' }}>첫 댓글을 남겨보세요</p>
          )}
        </div>
        {canComment ? (
          /* 게스트 작성(방문자 허용) — 구분선 아래 GUEST 바 + 입력줄 세로 배치 */
          <div className={`cmt-input ${guestMode ? 'guest' : ''}`}>
            {guestMode && <GuestIdBar name={gName} onName={setGName} />}
            <div className="ci-row" style={guestMode ? undefined : { display: 'contents' }}>
              <KInput
                placeholder={replyTo ? '답글 작성...' : '댓글 남기기...'}
                value={cmt} onChange={e => setCmt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addComment(); }}
              />
              <button className="btn btn-dark" onClick={addComment}>POST</button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line)', fontSize: 11.5, color: 'var(--faint)' }}>
            {user ? '이 게시판은 관리자만 댓글을 쓸 수 있습니다' : '댓글은 로그인 후 작성할 수 있습니다'}
          </div>
        )}
      </div>

      <ConfirmModal open={delAsk} title="글을 삭제하시겠습니까?" body="삭제한 글은 복구할 수 없습니다."
        onClose={() => setDelAsk(false)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => {
            setPosts(posts.filter(p => p.id !== post.id));
            // 글에 딸린 댓글도 함께 지운다 — 따로 저장되므로 남겨 두면 주인 없는 줄이 된다 (v2.0)
            setCmtRows(cmtRows.filter(c => !(c.target === 'post' && c.targetId === post.id)));
            router.push(boardHref(board.id));
          } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelAsk(false) },
        ]} />
    </section>
  );
}
