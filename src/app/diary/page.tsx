'use client';
// 다이어리 (4.14) — 아코디언 목록: 제목+무드+날짜 한 줄, 클릭 시 그 자리에서 펼침 ·
// 무드 필터 · 페이지네이션 · 공개범위(비공개는 관리자만)
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSectionParam, filterSection, sectionSetter } from '@/lib/sectionStore';
import { useLocalList } from '@/lib/postStore';
import { DiaryPost, DIARY_SEED, Mood, MOOD_SEED, moodTint } from '@/lib/diaryStore';
import { renderBody } from '@/lib/sanitize';
import { SearchBar, Pager } from '@/components/ui/Kit';
import { ConfirmModal } from '@/components/ui/Modal';
import { Lightbox } from '@/components/ui/Lightbox';
import { BlobImg } from '@/lib/blobStore';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';

const PAGE_SIZE = 10;

function MoodIcon({ mood, size = 30 }: { mood?: Mood; size?: number }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      // 줄높이를 1로 눌러야 글자 상자가 아니라 글자 자체가 가운데로 온다 (v2.0 사용자 발견)
      display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
      fontSize: size * 0.45,
      background: moodTint(mood?.color ?? '#888'), color: mood?.color ?? 'var(--sub)',
    }}>{mood?.icon ?? '·'}</span>
  );
}

function DiaryBody({ p, onOpen }: { p: DiaryPost; onOpen: (ids: string[], idx: number) => void }) {
  const html = useMemo(() => renderBody('md', p.body), [p.body]);
  return (
    <div className="dy-body">
      <div className="post-body" dangerouslySetInnerHTML={{ __html: html }} />
      {/* 이미지는 썸네일 리스트로 — 클릭하면 뷰어(좌우 넘김) (v1.9 사용자 확정) */}
      {p.imgIds.length > 0 && (
        <div className="dy-thumbs">
          {p.imgIds.map((id, i) => (
            <div key={id} className="dy-thumb" onClick={() => onOpen(p.imgIds, i)}>
              <BlobImg fileRef={id} ph="" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DiaryPageInner() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [postsAll, setPostsAll, loaded] = useLocalList<DiaryPost>('ohome.diary.v1', DIARY_SEED);
  // 여러 개로 만든 섹션 (v2.0) — 주소의 ?s= 가 가리키는 것만 보여 준다
  const sec = useSectionParam('diary');
  const posts = filterSection(postsAll, sec.id);
  // 저장은 이 섹션 자리만 교체 — 걸러진 목록을 그대로 넘겨도 다른 섹션이 지워지지 않는다
  const setPosts = sectionSetter(postsAll, sec.id, setPostsAll);
  const [moods] = useLocalList<Mood>('ohome.moods.v1', MOOD_SEED);
  const [open, setOpen] = useState<string | null>(null);
  const [fMood, setFMood] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [delFor, setDelFor] = useState<DiaryPost | null>(null);
  const [lb, setLb] = useState<{ srcs: string[]; idx: number } | null>(null); // 이미지 뷰어 (v1.9)
  // 미니 캘린더 (4.14 달력 보기) — 달을 넘기면 그 달의 일기만 표시
  const now = new Date();
  const [view, setView] = useState<{ y: number; m: number }>({ y: now.getFullYear(), m: now.getMonth() });
  const [monthFilter, setMonthFilter] = useState(false);

  // 메인 위젯에서 특정 일기로 진입 — /diary#id (4.14)
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (h) setOpen(h);
  }, [loaded]);

  if (!loaded) return <section className="page" />;

  const query = q.trim().toLowerCase();
  const monthKey = `${view.y}-${String(view.m + 1).padStart(2, '0')}`;
  const canSee = (p: DiaryPost) => isAdmin || (p.visibility === 'public' || (p.visibility === 'member' && !!user));
  const visible = posts
    .filter(canSee)
    .filter(p => fMood === 'all' || p.moodId === fMood)
    .filter(p => !query || p.title.toLowerCase().includes(query))
    .filter(p => !monthFilter || p.date.startsWith(monthKey))
    .sort((a, b) => b.date.localeCompare(a.date));

  // 캘린더 표시용 — 보이는 달의 일기 (일 → 글 목록)
  const byDay = new Map<number, DiaryPost[]>();
  posts.filter(canSee).filter(p => p.date.startsWith(monthKey)).forEach(p => {
    const d = parseInt(p.date.slice(8, 10), 10);
    byDay.set(d, [...(byDay.get(d) ?? []), p]);
  });
  const firstDay = new Date(view.y, view.m, 1).getDay();
  const dim = new Date(view.y, view.m + 1, 0).getDate();
  const mv = (d: number) => {
    setView(v => { const nm = v.m + d; return { y: v.y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 }; });
    setMonthFilter(true); setPage(1);
  };
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const shown = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const moodOf = (id: string) => moods.find(m => m.id === id);
  const cnt = (mid: string) => posts
    .filter(p => isAdmin || (p.visibility === 'public' || (p.visibility === 'member' && !!user)))
    .filter(p => mid === 'all' || p.moodId === mid).length;

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'DIARY' : sec.name}</PageTitle>
        <EditableDesc k="diary-desc" def="무드 일기 — 클릭하면 그 자리에서 펼쳐집니다" />
      </div>

      {/* 무드 필터 + 달 필터 표시 + 검색·WRITE — 필터 줄 오른쪽 정렬 (v1.9 사용자 요청).
          그리드 밖(풀폭): 캘린더가 일기 패널과 같은 높이에서 시작 */}
      <div className="toolrow" style={{ marginBottom: 16 }}>
        <div className="tag-row">
          <div className={`tag ${fMood === 'all' ? 'on' : ''}`} onClick={() => { setFMood('all'); setPage(1); }}>
            전체 <small>{cnt('all')}</small>
          </div>
          {moods.map(m => (
            <div key={m.id} className={`tag ${fMood === m.id ? 'on' : ''}`} onClick={() => { setFMood(m.id); setPage(1); }}>
              <span style={{ color: m.color }}>{m.icon}</span> {m.name} <small>{cnt(m.id)}</small>
            </div>
          ))}
          {monthFilter && (
            <div className="tag on" onClick={() => { setMonthFilter(false); setPage(1); }}
              data-tip="달 필터 해제">
              {view.y}.{String(view.m + 1).padStart(2, '0')} ✕
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SearchBar placeholder="제목 검색" onSearch={v => { setQ(v); setPage(1); }} />
          {isAdmin && <button className="btn btn-dark" onClick={() => router.push('/diary/write')}>＋ WRITE</button>}
        </div>
      </div>

      {/* 좌 리스트 + 우 미니 캘린더 (4.14 달력 보기) — 두 패널 시작 높이 동일 */}
      <div className="dy-layout">
      <div>
      <div className="panel" style={{ padding: '6px 20px' }}>
        {shown.map(p => {
          const m = moodOf(p.moodId);
          const opened = open === p.id;
          return (
            <div key={p.id} id={p.id} className={`dy-row ${opened ? 'open' : ''}`}>
              {/* 접힘: 제목 세로 중앙 / 펼침: 위 정렬 (4.14 v1.8) */}
              <div className="hd" onClick={() => setOpen(o => (o === p.id ? null : p.id))}>
                <MoodIcon mood={m} />
                <b className="tt">{p.title}</b>
                {p.visibility !== 'public' && (
                  <span className="pill" style={{ flexShrink: 0 }}>{p.visibility === 'member' ? '멤버' : '비공개'}</span>
                )}
                <small className="dt">{p.date.replace(/-/g, '.')}{m ? ` · ${m.name}` : ''}</small>
                <span className={`arr ${opened ? 'up' : ''}`} />
              </div>
              {/* 항상 렌더 + grid-rows 트랜지션으로 부드럽게 펼침 (덜컥임 방지) */}
              <div className="dy-fold" aria-hidden={!opened}>
                <div className="dy-fold-in">
                  <DiaryBody p={p} onOpen={(ids, idx) => setLb({ srcs: ids, idx })} />
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', padding: '0 0 14px' }}>
                      <button className="btn btn-ghost" style={{ padding: '4px 11px', fontSize: 10.5 }}
                        onClick={() => router.push(`/diary/${p.id}/edit`)}>EDIT</button>
                      <button className="btn btn-ghost" style={{ padding: '4px 11px', fontSize: 10.5 }}
                        onClick={() => setDelFor(p)}>DELETE</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {shown.length === 0 && <p className="hint" style={{ padding: 16 }}>{query ? '검색 결과가 없습니다' : '일기가 없습니다'}</p>}
      </div>

      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
        <Pager page={page} total={totalPages} onChange={setPage} />
      </div>
      </div>

      {/* 우: 미니 캘린더 — 일기 쓴 날은 무드색 점, 달을 넘기면 그 달만 목록에 */}
      <div className="panel dy-cal">
        <div className="hd">
          <button type="button" onClick={() => mv(-1)}>‹</button>
          <b>{view.y}년 {view.m + 1}월</b>
          <button type="button" onClick={() => mv(1)}>›</button>
        </div>
        <div className="wk">{['일', '월', '화', '수', '목', '금', '토'].map(w => <span key={w}>{w}</span>)}</div>
        <div className="days">
          {Array.from({ length: firstDay }, (_, i) => <span key={`e${i}`} />)}
          {Array.from({ length: dim }, (_, i) => {
            const d = i + 1;
            const entries = byDay.get(d);
            return (
              <button type="button" key={d} className={entries ? 'has' : ''}
                data-tip={entries ? entries.map(p => p.title).join(' · ') : undefined}
                onClick={() => {
                  if (!entries) return;
                  setMonthFilter(true); setPage(1); setOpen(entries[0].id);
                }}>
                {d}
                <span className="dots">
                  {(entries ?? []).slice(0, 2).map(p => (
                    <i key={p.id} style={{ background: moodOf(p.moodId)?.color ?? 'var(--faint)' }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      </div>

      <ConfirmModal open={delFor !== null} title="일기를 삭제하시겠습니까?"
        body={`"${delFor?.title}" — 삭제하면 복구할 수 없습니다.`}
        onClose={() => setDelFor(null)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => { setPosts(posts.filter(x => x.id !== delFor!.id)); setDelFor(null); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelFor(null) },
        ]} />
      {/* 이미지 뷰어 — 썸네일 클릭 시 (v1.9 사용자 확정) */}
      {lb && <Lightbox srcs={lb.srcs} index={lb.idx} onClose={() => setLb(null)} />}
    </section>
  );
}

/** ?s= 를 읽으므로 Suspense 경계가 필요하다 (Next App Router) */
export default function DiaryPage() {
  return <Suspense fallback={<section className="page" />}><DiaryPageInner /></Suspense>;
}
