'use client';
// 그림백업 상세 (4.11) — 로그형: 세로 스크롤 뷰어 / 단일형: 큰 이미지 + 썸네일 스트립 + 좌우 넘김
import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useHrefBlock } from '@/components/shell/MenuGuard';
import { sectionHref, MAIN_SEC, useSectionTitle } from '@/lib/sectionStore';
import { useAuth } from '@/lib/auth';
import { useLocalList, fmtDate } from '@/lib/postStore';
import { BackupPost, BACKUP_SEED } from '@/lib/galleryStore';
import { ConfirmModal } from '@/components/ui/Modal';
import { useBlobUrl } from '@/lib/blobStore';
import { sanitizeHtml } from '@/lib/sanitize';
import { PageTitle } from '@/components/ui/PageText';
import { Lightbox } from '@/components/ui/Lightbox';
import { useBoardSettings, boardBadgeStyle } from '@/lib/boardStore';

export default function BackupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [posts, setPosts, loaded] = useLocalList<BackupPost>('ohome.backup.v1', BACKUP_SEED);
  const [cur, setCur] = useState(0);
  const [delAsk, setDelAsk] = useState(false);
  const [lbOpen, setLbOpen] = useState(false); // 단일형 — 클릭 확대 보기
  const { st: boardSet } = useBoardSettings(); // 유형 뱃지 색 (환경설정 > 게시판 관리)

  const p = posts.find(x => x.id === id);
  /* 이 글이 속한 곳이 비공개면 주소로 들어와도 열리지 않게 (v2.0 사용자 요청).
     글 주소에는 섹션이 없어 MenuGuard가 못 막는다 — 글을 읽어 소속을 알아낸 여기서 판정한다.
     **다른 early return보다 먼저 불러야 한다**(훅이므로 렌더마다 개수가 같아야 한다) */
  const blocked = useHrefBlock(p && sectionHref('gallery', p.secId ?? MAIN_SEC));
  // 큰 글씨 — 추가 섹션이면 그 이름, 눌렀을 때도 그 목록으로 (v2.0 사용자 제보)
  const tt = useSectionTitle('gallery', p?.secId, 'GALLERY');
  if (blocked) return blocked;
  if (!loaded) return <section className="page" />;
  if (!p || (p.visibility === 'private' && !isAdmin) || (p.visibility === 'member' && !user)) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>게시물을 찾을 수 없거나 열람 권한이 없습니다</p></div>
      </section>
    );
  }

  const imgs: { url?: string; ph?: string }[] = p.images.length
    ? p.images.map(u => ({ url: u }))
    : p.phList.map(c => ({ ph: c }));
  /* 글쓴이 확인 (v2.0 발견) — **둘 다 없을 때 같다고 보면 안 된다.**
     예전 글이나 손님이 쓴 글은 authorId가 없는데, 비로그인 방문자도 user?.id가 없어
     `undefined === undefined`로 통과했다 — 아무나 남의 글을 고치고 지울 수 있었다 */
  const canManage = isAdmin || (!!p.authorId && p.authorId === user?.id);

  // 파일 id/URL 모두 지원 — blobStore에서 로드 (새로고침에도 유지)
  // natural: 고정 프레임 안에서 확대 없이 원본 크기 그대로 가운데 (단일형 — 프레임보다 크면 축소만)
  const Img = ({ im, ratio, natural }: { im: { url?: string; ph?: string }; ratio?: string; natural?: boolean }) => {
    const u = useBlobUrl(im.url);
    if (u) {
      // eslint-disable-next-line @next/next/no-img-element
      // 원본보다 크게 늘리지 않는다 — 폭이 모자랄 때만 줄이고, 작은 그림은 작은 그대로 (v2.0 사용자 확정)
      return <img src={u} alt="" style={natural
        ? { maxWidth: '100%', maxHeight: '100%', display: 'block' }
        : { maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }} />;
    }
    return <div className={`ph ${im.ph ?? ''}`}
      style={natural ? { width: '100%', height: '100%' } : { aspectRatio: ratio ?? '16/10' }}><span>IMAGE</span></div>;
  };

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href={tt.href}>{tt.title}</PageTitle>
        <p>
          {p.category} · {p.author} · {fmtDate(p.date)}{p.madeDate ? ` · 제작 ${p.madeDate}` : ''}
          {/* 태그 (v2.0 사용자 요청) — 목록과 같은 표기 */}
          {(p.tags ?? []).map(t => <i key={t} className="tag-in">#{t}</i>)}
        </p>
        <div className="head-actions">
          {canManage && <button className="btn btn-dark" onClick={() => router.push(`/gallery/${p.id}/edit`)}>EDIT</button>}
          {canManage && <button className="btn btn-dark" onClick={() => setDelAsk(true)}>DELETE</button>}
        </div>
      </div>

      {/* 본문만 폭 제한 — 헤더는 풀폭 위치 유지 */}
      <div className="panel" style={{ padding: 20, maxWidth: 960, margin: '0 auto' }}>
        {/* 제목·뱃지 세로 중앙 정렬 + 아래 여백 확보 */}
        <h2 style={{ fontSize: 18, marginBottom: p.desc ? 8 : 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          {p.title}
          <span style={boardBadgeStyle(boardSet.gallery.find(b => b.id === p.type))}>
            {boardSet.gallery.find(b => b.id === p.type)?.label}
          </span>
        </h2>
        {p.desc && (
          <div className="post-body" style={{ fontSize: 12.5, margin: '0 0 16px' }}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(p.desc) }} />
        )}

        {p.type === 'log' ? (
          /* 로그형 — 웹툰식 세로 스크롤 · 이미지 사이 틈 없이 이어 붙임 (만화 연결) */
          <div style={{ borderRadius: 10, overflow: 'hidden' }}>
            {imgs.map((im, i) => <Img key={i} im={im} />)}
          </div>
        ) : p.type === 'vlist' ? (
          /* 단일(세로정렬) (v1.9) — 로그와 달리 이미지 사이 갭을 두고 세로로 나열, 클릭 확대 */
          <div style={{ display: 'grid', gap: 14 }}>
            {imgs.map((im, i) => (
              <div key={i} style={{ borderRadius: 10, overflow: 'hidden', cursor: im.url ? 'zoom-in' : undefined }}
                onClick={() => { if (im.url) { setCur(i); setLbOpen(true); } }}>
                <Img im={im} />
              </div>
            ))}
          </div>
        ) : (
          /* 단일형 — 큰 이미지 + 좌우 넘김 + 썸네일 스트립 */
          <>
            <div className="single-viewer">
              {/* 고정 16:10 프레임 안 가운데 배치 — 실제 이미지일 때만 클릭 확대.
                  grid는 암시적 row가 콘텐츠 높이로 늘어나 max-height:100%가 무력화됨(세로 긴 그림 잘림) → flex (v1.9) */}
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: imgs[cur].url ? 'zoom-in' : undefined,
              }}
                onClick={() => { if (imgs[cur].url) setLbOpen(true); }}>
                <Img im={imgs[cur]} natural />
              </div>
              {imgs.length > 1 && (
                <>
                  <button className="nav" style={{ left: 10 }}
                    onClick={() => setCur(c => (c - 1 + imgs.length) % imgs.length)}>◁</button>
                  <button className="nav" style={{ right: 10 }}
                    onClick={() => setCur(c => (c + 1) % imgs.length)}>▷</button>
                </>
              )}
            </div>
            {imgs.length > 1 && (
              <div className="thumb-strip">
                {imgs.map((im, i) => (
                  <div key={i} className={`t ${i === cur ? 'on' : ''}`} onClick={() => setCur(i)}>
                    <Img im={im} ratio="4/3" />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* 단일형·단일(세로) 확대 보기 — 뷰어와 같은 순번에서 시작, ‹ ›로 이어 넘김 */}
      {lbOpen && (p.type === 'single' || p.type === 'vlist') && p.images.length > 0 && (
        <Lightbox srcs={p.images} index={cur} onClose={() => setLbOpen(false)} />
      )}

      <ConfirmModal open={delAsk} title="게시물을 삭제하시겠습니까?" body="삭제한 게시물은 복구할 수 없습니다."
        onClose={() => setDelAsk(false)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => { setPosts(posts.filter(x => x.id !== p.id)); router.push(tt.href); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelAsk(false) },
        ]} />
    </section>
  );
}
