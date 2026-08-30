'use client';
// TRPG 플레이기록 (4.16) — 표 형식 · Date 정렬 · 검색 · 페이지네이션 ·
// Url 열은 클립 픽토그램(새 탭) · 로그 연결 시 Playtime 클릭으로 로그 이동
import React, { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSectionParam, filterSection, sectionSetter, secQuery } from '@/lib/sectionStore';
import { useLocalList } from '@/lib/postStore';
import { PlayRecord, PLAYLOG_SEED } from '@/lib/galleryStore';
import { useMenuSettings } from '@/lib/menuStore';
import { useMainStore } from '@/lib/mainStore';
import { useCardSort, mergeOrder } from '@/lib/cardSort';
import { SearchBar, Pager } from '@/components/ui/Kit';
import { ConfirmModal } from '@/components/ui/Modal';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';

const PAGE_SIZE = 15;

/** 클립 픽토그램 (선 아이콘 — 이모지 아님) */
function ClipIcon() {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, stroke: 'currentColor', fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
      <path d="M21 12.5 12.2 21.3a5.6 5.6 0 0 1-8-8L13.5 4a3.7 3.7 0 0 1 5.3 5.3l-9.2 9.2a1.9 1.9 0 0 1-2.7-2.7l8.5-8.4" />
    </svg>
  );
}

function PlaylogPageInner() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [recordsAll, setRecordsAll, loaded] = useLocalList<PlayRecord>('ohome.playlog.v1', PLAYLOG_SEED);
  // 여러 개로 만든 섹션 (v2.0) — 주소의 ?s= 가 가리키는 것만 보여 준다
  const sec = useSectionParam('playlog');
  const records = filterSection(recordsAll, sec.id);
  // 저장은 이 섹션 자리만 교체 — 걸러진 목록을 그대로 넘겨도 다른 섹션이 지워지지 않는다
  const setRecords = sectionSetter(recordsAll, sec.id, setRecordsAll);
  const [q, setQ] = useState('');
  const [desc, setDesc] = useState(true);       // Date 정렬 방향
  const [page, setPage] = useState(1);
  const [delFor, setDelFor] = useState<PlayRecord | null>(null);

  // 표시 열 — 환경설정 > 메뉴 관리에서 PC/모바일 각각 선택 (4.16 v1.8)
  const [menuSet] = useMenuSettings();
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width:620px)');
    const f = () => setIsMobile(mq.matches);
    f();
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  const cols = isMobile ? menuSet.playlogMobile : menuSet.playlogPc;
  const show = (k: string) => cols.includes(k);

  // 편집모드 행 드래그 정렬 (v1.9) — 편집 중에는 정렬·페이지 없이 저장 순서 전체 표시
  const { editOn } = useMainStore();
  const rowSort = useCardSort(records, next => setRecords(mergeOrder(records, next)), editOn && isAdmin);

  if (!loaded) return <section className="page" />;

  const query = q.trim().toLowerCase();
  const filtered = records.filter(r => !query
    || r.scenario.toLowerCase().includes(query)
    || r.writer.toLowerCase().includes(query)
    || r.withText.toLowerCase().includes(query));

  // Date 정렬 — 날짜 없는 기록은 항상 맨 아래 (4.16)
  const sorted = [...filtered].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return desc ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
  });
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  // 편집모드: 저장 순서 전체 표시 (드래그 인덱스와 1:1 매칭)
  const shown = editOn ? records : sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // 모바일 전용 — URL 열이 없으므로 Playtime 밑줄 탭으로 로그 이동 (4.16)
  const openLogMobile = (r: PlayRecord) => {
    if (r.logId && window.matchMedia('(max-width:620px)').matches) router.push(`/trpg/${r.logId}`);
  };

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'PLAY LOG' : sec.name}</PageTitle>
        <EditableDesc k="playlog-desc" def="다녀온 세션 기록 — 표 형식" />
        <div className="head-actions">
          <SearchBar placeholder="시나리오·라이터·동행 검색" onSearch={v => { setQ(v); setPage(1); }} />
          {isAdmin && <button className="btn btn-dark" onClick={() => router.push('/playlog/new' + secQuery('playlog', sec.id))}>＋ ADD RECORD</button>}
        </div>
      </div>

      <div className="panel" style={{ padding: '10px 16px 16px', overflowX: 'auto' }}>
        <table className="pl-table">
          {/* 열 구성 — 환경설정 > 메뉴 관리에서 PC/모바일 각각 선택 (4.16 v1.8) */}
          <colgroup>
            {show('date') && <col className="c-date" />}
            {show('scenario') && <col className="c-sc" />}
            {show('writer') && <col className="c-wr" />}
            {show('with') && <col className="c-with" />}
            {show('role') && <col className="c-role" />}
            {show('playtime') && <col className="c-pt" />}
            {show('url') && <col className="c-url" />}
            {isAdmin && !isMobile && <col className="c-mng" />}
          </colgroup>
          <thead>
            <tr>
              {show('date') && (
                <th className="sortable" onClick={() => { if (!editOn) setDesc(d => !d); }}>
                  Date {editOn ? '⠿' : desc ? '▾' : '▴'}
                </th>
              )}
              {show('scenario') && <th>Scenario</th>}
              {show('writer') && <th>Writer</th>}
              {show('with') && <th>With</th>}
              {show('role') && <th>Role</th>}
              {show('playtime') && <th>Playtime</th>}
              {show('url') && <th aria-label="Url" />}
              {isAdmin && !isMobile && <th aria-label="관리" />}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.id} {...(editOn ? rowSort(i) : {})}>
                {show('date') && <td className="td-date">{r.date ? r.date.replace(/-/g, '.') : ''}</td>}
                {show('scenario') && (
                  <td className="td-sc">
                    {r.scenarioLink
                      ? <a href={r.scenarioLink} target="_blank" rel="noreferrer" data-tip="시나리오 링크 (새 탭)">{r.scenario}</a>
                      : r.scenario}
                  </td>
                )}
                {show('writer') && <td>{r.writer}</td>}
                {show('with') && <td>{r.withText}</td>}
                {show('role') && <td className="td-role">{r.role}</td>}
                {show('playtime') && (
                  <td className={`td-pt ${r.logId ? 'linked' : ''}`}
                    onClick={() => openLogMobile(r)}>
                    {r.playtime}
                  </td>
                )}
                {/* 클립 칸 — 외부 URL 또는 백업 로그 연결 (4.16) */}
                {show('url') && (
                  <td className="td-url">
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer" data-tip="링크 열기 (새 탭)"><ClipIcon /></a>
                    ) : r.logId ? (
                      <a data-tip="백업 로그 보기" style={{ cursor: 'var(--cur-pointer,pointer)' }}
                        onClick={() => router.push(`/trpg/${r.logId}`)}><ClipIcon /></a>
                    ) : null}
                  </td>
                )}
                {isAdmin && !isMobile && (
                  <td className="td-mng">
                    <button onClick={() => router.push(`/playlog/${r.id}/edit`)} data-tip="편집">✎</button>
                    <button onClick={() => setDelFor(r)} data-tip="삭제">✕</button>
                  </td>
                )}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={cols.length + (isAdmin && !isMobile ? 1 : 0)} style={{ textAlign: 'center', padding: 32, color: 'var(--faint)' }}>
                {query ? '검색 결과가 없습니다' : '기록이 없습니다'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
        {!editOn && <Pager page={page} total={totalPages} onChange={setPage} />}
      </div>

      <ConfirmModal open={delFor !== null} title="기록을 삭제하시겠습니까?"
        body={`"${delFor?.scenario}" — 삭제하면 복구할 수 없습니다.`}
        onClose={() => setDelFor(null)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => { setRecords(records.filter(x => x.id !== delFor!.id)); setDelFor(null); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelFor(null) },
        ]} />
    </section>
  );
}

/** ?s= 를 읽으므로 Suspense 경계가 필요하다 (Next App Router) */
export default function PlaylogPage() {
  return <Suspense fallback={<section className="page" />}><PlaylogPageInner /></Suspense>;
}
