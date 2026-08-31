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
import { useMenuSettings } from '@/lib/menuStore'; // 🌟 권한 설정 추가

const PAGE_SIZE = 10;

function MoodIcon({ mood, size = 30 }: { mood?: Mood; size?: number }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
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
  const sec = useSectionParam('diary');
  const posts = filterSection(postsAll, sec.id);
  const setPosts = sectionSetter(postsAll, sec.id, setPostsAll);
  const [moods] = useLocalList<Mood>('ohome.moods.v1', MOOD_SEED);
  const [open, setOpen] = useState<string | null>(null);
  const [fMood, setFMood] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [delFor, setDelFor] = useState<DiaryPost | null>(null);
  const [lb, setLb] = useState<{ srcs: string[]; idx: number } | null>(null);
  const now = new Date();
  const [view, setView] = useState<{ y: number; m: number }>({ y: now.getFullYear(), m: now.getMonth() });
  const [monthFilter, setMonthFilter] = useState(false);

  // 🌟 환경설정 메뉴 관리에서 지정한 diaryWrite 권한 연동
  const [menuSet] = useMenuSettings();
  const permWrite = (menuSet as any).diaryWrite ?? 'member';
  const canWrite = isAdmin || (permWrite === 'guest') || (permWrite === 'member' && !!user);

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
          {/* 🌟 canWrite 조건 적용 */}
          {canWrite && <button className="btn btn-dark" onClick={() => router.push('/diary/write')}>＋ WRITE</button>}
        </div>
      </div>

      <div className="dy-layout">
      <div>
      <div className="panel" style={{ padding: '6px 20px' }}>
        {shown.map(p => {
          const m = moodOf(p.moodId);
          const opened = open === p.id;
          return (
            <div key={p.id} id={p.id} className={`dy-row ${opened ? 'open' : ''}`}>
              <div className="hd" onClick={() => setOpen(o => (o === p.id ? null : p.id))}>
                <MoodIcon mood={m} />
                <b className="tt">{p.title}</b>
                {p.visibility !== 'public' && (
                  <span className="pill" style={{ flexShrink: 0 }}>{p.visibility === 'member' ? '멤버' : '비공개'}</span>
                )}
                <small className="dt">{p.date.replace(/-/g, '.')}{m ? ` · ${m.name}` : ''}</small>
                <span className={`arr ${opened ? 'up' : ''}`} />
              </div>
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
      {lb && <Lightbox srcs={lb.srcs} index={lb.idx} onClose={() => setLb(null)} />}
    </section>
  );
}

export default function DiaryPage() {
  return <Suspense fallback={<section className="page" />}><DiaryPageInner /></Suspense>;
}
