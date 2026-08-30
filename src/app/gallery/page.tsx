'use client';
// EditableDesc 주입
// 그림백업게시판 (4.11) — 갤러리/리스트 토글 · 로그/단일 뱃지 · 접기 썸네일 블러
import React, { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSectionParam, filterSection, sectionSetter, secQuery } from '@/lib/sectionStore';
import { useLocalList, fmtDate } from '@/lib/postStore';
import { BackupPost, BACKUP_SEED } from '@/lib/galleryStore';
import { SearchBar, Pager } from '@/components/ui/Kit';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { useBoardSettings, boardBadgeStyle } from '@/lib/boardStore';
import { useMainStore } from '@/lib/mainStore';
import { useCardSort, mergeOrder } from '@/lib/cardSort';
import { useMenuSettings } from '@/lib/menuStore';

const FOLD_LABEL = { spoiler: '스포일러', adult: '수위 주의' };

function BackupPageInner() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { editOn } = useMainStore();
  const [postsAll, setPostsAll] = useLocalList<BackupPost>('ohome.backup.v1', BACKUP_SEED);
  // 여러 개로 만든 섹션 (v2.0) — 주소의 ?s= 가 가리키는 것만 보여 준다
  const sec = useSectionParam('gallery');
  const posts = filterSection(postsAll, sec.id);
  // 저장은 이 섹션 자리만 교체 — 걸러진 목록을 그대로 넘겨도 다른 섹션이 지워지지 않는다
  const setPosts = sectionSetter(postsAll, sec.id, setPostsAll);
  // 기본 보기 — 환경설정 > 메뉴 관리의 갤러리 항목에서 지정 (5.2)
  const [menuSet, , menuLoaded] = useMenuSettings();
  const [view, setView] = useState<'gal' | 'list'>('gal');
  const [viewInit, setViewInit] = useState(false);
  useEffect(() => {
    if (menuLoaded && !viewInit) { setView(menuSet.backupView); setViewInit(true); }
  }, [menuLoaded, viewInit, menuSet.backupView]);
  const { st: boardSet } = useBoardSettings(); // 유형 뱃지 색 (환경설정 > 게시판 관리)
  const typeBadge = (t: 'log' | 'single' | 'vlist') => boardSet.gallery.find(b => b.id === t);
  const [q, setQ] = useState('');
  const [unveiled, setUnveiled] = useState<Record<string, boolean>>({});

  const visible = posts
    .filter(p => isAdmin || p.visibility === 'public' || (p.visibility === 'member' && user))
    .filter(p => !q || p.title.includes(q) || p.category.includes(q)
      || (p.tags ?? []).some(t => t.toLowerCase().includes(q.toLowerCase())));   // 태그 검색 (v2.0)

  // 편집모드 카드 드래그 정렬 (v1.9 — 갤러리 보기)
  const sort = useCardSort(visible, next => setPosts(mergeOrder(posts, next)), editOn && isAdmin);

  /* 게시물이 쌓이면 페이지로 (v2.0 사용자 요청) — 보기에 따라 한 장 분량이 다르다.
     갤러리 보기는 한 줄에 3개라 12개(4줄), 리스트 보기는 글 목록과 같은 20개. */
  const PER = view === 'gal' ? 12 : 20;
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(visible.length / PER));
  const cur = Math.min(page, pages);      // 검색·보기 전환으로 줄면 마지막 장으로 당긴다
  const start = (cur - 1) * PER;
  const paged = visible.slice(start, start + PER);
  useEffect(() => { setPage(1); }, [q, view]);   // 검색어·보기를 바꾸면 첫 장부터

  const count = (p: BackupPost) => Math.max(p.images.length, p.phList.length);
  const meta = (p: BackupPost) =>
    `${count(p)}장 · ${fmtDate(p.madeDate ? p.madeDate + 'T00:00:00' : p.date)}`;

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'GALLERY' : sec.name}</PageTitle>
        <EditableDesc k="backup-desc" def="로그형(웹툰 스크롤) / 단일형(좌우 넘김) · 리스트/갤러리 보기 전환" />
      </div>
      <div className="toolrow">
        <div className="seg">
          <button className={view === 'gal' ? 'on' : ''} onClick={() => setView('gal')}>갤러리</button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>리스트</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SearchBar onSearch={setQ} />
          {user && <button className="btn btn-dark" onClick={() => router.push('/gallery/write' + secQuery('gallery', sec.id))}>✎ WRITE</button>}
        </div>
      </div>

      {/* 갤러리/리스트 모두 렌더해 두고 display로만 전환 (v1.9) —
          전환 때마다 재마운트되며 이미지가 다시 로드·등장하던 깜빡임 제거 */}
      <div className="g3" style={{ display: view === 'gal' && visible.length > 0 ? undefined : 'none' }}>
          {paged.map((p, si) => {
            const i = start + si;   // 정렬은 전체 기준 위치로
            const folded = p.fold && !unveiled[p.id];
            return (
              <div key={p.id} className="panel g-item" {...sort(i)}
                onClick={() => { if (!folded && !editOn) router.push(`/gallery/${p.id}`); }}>
                <div className={`thumb ${folded ? 'veil' : ''}`}>
                  <div style={{ position: 'absolute', inset: 0 }}>
                    <CroppedBlobImg fileRef={p.images[0]} crop={p.thumbCrop} ph={p.phList[0] ?? 'cool'} />
                  </div>
                  {!folded && (
                    <span className="typ" style={boardBadgeStyle(typeBadge(p.type))}>
                      {typeBadge(p.type)?.label}
                    </span>
                  )}
                  {folded && (
                    <div className="cover" onClick={e => { e.stopPropagation(); setUnveiled(u => ({ ...u, [p.id]: true })); }}>
                      <div>
                        <b>{p.fold!.type === 'custom' ? (p.fold!.label || '접힘') : FOLD_LABEL[p.fold!.type]}</b><br />
                        <span>클릭하여 표시</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="info">
                  <b>{p.title}</b>
                  <small>
                    {meta(p)}
                    {/* 태그 (v2.0 사용자 요청) */}
                    {(p.tags ?? []).map(t => <i key={t} className="tag-in">#{t}</i>)}
                  </small>
                </div>
              </div>
            );
          })}
        </div>
      {/* 게시물이 없으면 컨테이너 자체를 숨김 — 빈 패널이 안내문 위에 카드처럼 남던 버그 (v1.9 사용자 발견) */}
      <div className="panel flush" style={{ display: view === 'list' && visible.length > 0 ? undefined : 'none' }}>
          {paged.map(p => (
            <div key={p.id} className="list-item" onClick={() => router.push(`/gallery/${p.id}`)}>
              <div className="th" style={{ position: 'relative' }}><CroppedBlobImg fileRef={p.images[0]} crop={p.thumbCrop} ph={p.phList[0] ?? 'cool'} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>
                  {p.title}
                  {p.fold
                    ? <span className="pill red" style={{ marginLeft: 6 }}>접힘</span>
                    : <span style={{ ...boardBadgeStyle(typeBadge(p.type)), marginLeft: 6 }}>{typeBadge(p.type)?.label}</span>}
                </b>
                <small>
                  {meta(p)}
                  {/* 태그 — 작성자 왼쪽 줄에 (v2.0 사용자 요청) */}
                  {(p.tags ?? []).map(t => <i key={t} className="tag-in">#{t}</i>)}
                </small>
              </div>
              <small>{p.author}</small>
            </div>
          ))}
        </div>
      {visible.length === 0 && (
        <div className="panel" style={{ textAlign: 'center', padding: 44, fontSize: 13, color: 'var(--faint)' }}>
          게시물이 없습니다
        </div>
      )}
      {visible.length > PER && <Pager page={cur} total={pages} onChange={setPage} />}
    </section>
  );
}

/** ?s= 를 읽으므로 Suspense 경계가 필요하다 (Next App Router) */
export default function BackupPage() {
  return <Suspense fallback={<section className="page" />}><BackupPageInner /></Suspense>;
}
