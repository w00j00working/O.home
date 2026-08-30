'use client';
// TRPG 도토리 (4.15) — 시나리오 위시리스트 · 4열 카드 그리드 · 상태 필터 탭 · 카드에서 상태 전환
import React, { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSectionParam, filterSection, sectionSetter, secQuery } from '@/lib/sectionStore';
import { useLocalList } from '@/lib/postStore';
import {
  DotoriItem, DotoriStatus, DOTORI_SEED, DOTORI_STATUS_KEYS, useTrpgSettings, dotoriBadgeStyle,
} from '@/lib/galleryStore';
import { SearchBar, Pager } from '@/components/ui/Kit';
import { OrderMenu, orderNoOf, moveToOrder } from '@/components/ui/OrderMenu';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { ConfirmModal } from '@/components/ui/Modal';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { useMainStore } from '@/lib/mainStore';
import { useCardSort, mergeOrder } from '@/lib/cardSort';

type Tab = 'all' | DotoriStatus;

function DotoriPageInner() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [itemsAll, setItemsAll, loaded] = useLocalList<DotoriItem>('ohome.dotori.v1', DOTORI_SEED);
  // 여러 개로 만든 섹션 (v2.0) — 주소의 ?s= 가 가리키는 것만 보여 준다
  const sec = useSectionParam('dotori');
  const items = filterSection(itemsAll, sec.id);
  // 저장은 이 섹션 자리만 교체 — 걸러진 목록을 그대로 넘겨도 다른 섹션이 지워지지 않는다
  const setItems = sectionSetter(itemsAll, sec.id, setItemsAll);
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [delFor, setDelFor] = useState<DotoriItem | null>(null);
  const [statusFor, setStatusFor] = useState<string | null>(null);   // 상태 전환 팝업이 열린 카드 id
  const [trpgSet] = useTrpgSettings(); // 상태 라벨·뱃지 색 (환경설정 > TRPG)
  const { editOn } = useMainStore();

  // 필터 탭 — 라벨은 환경설정 TRPG 탭에서 수정 (v1.9)
  const TABS: { key: Tab; label: string }[] = [
    { key: 'all', label: '전체' },
    ...DOTORI_STATUS_KEYS.map(k => ({ key: k as Tab, label: trpgSet.statuses[k].label })),
  ];

  const query = q.trim().toLowerCase();
  const shown = items
    .filter(it => (tab === 'all' ? it.status !== 'done' : it.status === tab)) // 완은 전체에서 숨김 (4.15)
    .filter(it => !query
      || it.name.toLowerCase().includes(query)
      || it.writer.toLowerCase().includes(query)
      || it.tags.some(t => t.toLowerCase().includes(query)));

  const countOf = (t: Tab) =>
    items.filter(it => (t === 'all' ? it.status !== 'done' : it.status === t)).length;

  const setStatus = (id: string, s: DotoriStatus) =>
    setItems(items.map(x => (x.id === id ? { ...x, status: s } : x)));

  // 편집모드 카드 드래그 정렬 (v1.9) — 훅이므로 early return보다 먼저.
  // 정렬은 `shown` 전체 기준으로 다루고 카드에는 전체 기준 위치를 넘긴다(아래) — 페이지 안 위치로
  // 넘기면 2페이지에서 엉뚱한 카드가 움직인다 (v2.0 페이지 나누기)
  const sort = useCardSort(shown, next => setItems(mergeOrder(items, next)), editOn && isAdmin);

  // 목록이 길어지면 페이지로 (v2.0 사용자 요청 — 한 페이지 12개)
  const PER_DT = 12;
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(shown.length / PER_DT));
  const cur = Math.min(page, pages);          // 탭·검색으로 줄어 페이지가 사라지면 마지막으로 당긴다
  const start = (cur - 1) * PER_DT;
  useEffect(() => { setPage(1); }, [tab, query]);

  /* 번호로 자리 옮기기 (v2.0 사용자 요청) — 페이지가 생기면 1페이지 것을 3페이지로 드래그할 수
     없다. 번호는 저장하지 않고 자리에서 만들어(10, 20, 30 …) 배치를 바꾸면 저절로 맞는다. */
  const [ordFor, setOrdFor] = useState<{ id: string; x: number; y: number } | null>(null);
  const ordIdx = ordFor ? shown.findIndex(it => it.id === ordFor.id) : -1;
  const applyOrder = (wanted: number) => {
    if (ordIdx >= 0) setItems(mergeOrder(items, moveToOrder(shown, ordIdx, wanted)));
    setOrdFor(null);
  };

  if (!loaded) return <section className="page" />;

  return (
    <section className="page" onClick={() => setStatusFor(null)}>
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'DOTORI' : sec.name}</PageTitle>
        <EditableDesc k="dotori-desc" def="가고 싶은 시나리오 저장함 — 도토리처럼 모아두기" />
      </div>

      {/* 상태 필터 탭 + 검색·ADD — 필터 줄 오른쪽 정렬 (v1.9 사용자 요청) */}
      <div className="toolrow" style={{ marginBottom: 16 }}>
        <div className="tag-row">
          {TABS.map(t => (
            <div key={t.key} className={`tag ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>
              {t.label} <small>{countOf(t.key)}</small>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SearchBar placeholder="시나리오·라이터·태그 검색" onSearch={setQ} />
          {isAdmin && <button className="btn btn-dark" onClick={() => router.push('/dotori/new' + secQuery('dotori', sec.id))}>＋ ADD</button>}
        </div>
      </div>

      <div className="dt-grid">
        {shown.slice(start, start + PER_DT).map((it, si) => {
          const i = start + si;   // 정렬은 전체 기준 위치로
          return (
          <div key={it.id} className="panel dt-card" {...sort(i)}
            style={{ cursor: isAdmin ? 'pointer' : undefined, ...(sort(i) as { style?: React.CSSProperties }).style }}
            onContextMenu={e => {
              if (!isAdmin) return;
              e.preventDefault();
              setOrdFor({ id: it.id, x: e.clientX, y: e.clientY });
            }}
            onClick={() => { if (isAdmin && !editOn) router.push(`/dotori/${it.id}/edit`); }}>
            <div className="th">
              <CroppedBlobImg fileRef={it.imgId} crop={it.thumbCrop} ph={it.ph} />
              {/* 뱃지 — 공수표·일정 확정만, 이미지 우상단 (4.15) */}
              {(it.status === 'pledge' || it.status === 'confirmed') && (
                <span className="dt-badge" style={dotoriBadgeStyle(trpgSet.statuses[it.status])}>
                  {trpgSet.statuses[it.status].label}
                </span>
              )}
              {isAdmin && (
                <div className="hv-actions dt-actions" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setStatusFor(s => (s === it.id ? null : it.id))}>STATUS</button>
                  <button className="del" onClick={() => setDelFor(it)}>DELETE</button>
                </div>
              )}
              {/* 상태 전환 팝업 — [상태] 클릭 시에만 (기본 UI에는 미노출) */}
              {statusFor === it.id && (
                <div className="dt-status-pop" onClick={e => e.stopPropagation()}>
                  {DOTORI_STATUS_KEYS.map(s => (
                    <button key={s} className={it.status === s ? 'on' : ''}
                      onClick={() => { setStatus(it.id, s); setStatusFor(null); }}>
                      {trpgSet.statuses[s].label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="bd">
              {/* 이름 클릭 = 시나리오 링크 (새 탭) · 카드 클릭 = 편집 (관리자) */}
              <b className={`nm ${it.link ? 'has-link' : ''}`}
                onClick={e => { if (it.link) { e.stopPropagation(); window.open(it.link, '_blank'); } }}
                data-tip={it.link ? '시나리오 링크 열기 (새 탭)' : undefined}>
                {it.name}
              </b>
              <small className="meta">
                {[it.writer, it.rule, it.people].filter(Boolean).join(' · ')}
              </small>
              {/* 태그가 없어도 줄은 남긴다 — 태그 유무로 카드 키가 달라지지 않게 (v2.0 사용자 요청) */}
              <div className="kw-row">
                {it.tags.map(t => <span key={t} className="pill">{t}</span>)}
              </div>
            </div>
          </div>
          );
        })}
      </div>
      {/* 페이저는 가운데, 개수는 오른쪽 끝 (v2.0 — 다른 목록과 같은 방식) */}
      {shown.length > PER_DT && (
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center' }}>
          <span />
          <Pager page={cur} total={pages} onChange={setPage} />
          <small style={{ color: 'var(--faint)', fontSize: 10.5, justifySelf: 'end' }}>총 {shown.length}개</small>
        </div>
      )}
      {shown.length === 0 && (
        <div className="panel" style={{ textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: 13, color: 'var(--faint)' }}>
            {query ? '검색 결과가 없습니다' : '이 탭에 도토리가 없습니다'}
          </p>
        </div>
      )}

      {/* 우클릭 > 순서 번호 (v2.0 사용자 요청) */}
      {ordFor && ordIdx >= 0 && (
        <OrderMenu at={ordFor} current={orderNoOf(ordIdx)} total={shown.length}
          onApply={applyOrder} onClose={() => setOrdFor(null)} />
      )}

      <ConfirmModal open={delFor !== null} title="도토리를 삭제하시겠습니까?"
        body={`"${delFor?.name}" — 삭제하면 복구할 수 없습니다.`}
        onClose={() => setDelFor(null)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => { setItems(items.filter(x => x.id !== delFor!.id)); setDelFor(null); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelFor(null) },
        ]} />
    </section>
  );
}

/** ?s= 를 읽으므로 Suspense 경계가 필요하다 (Next App Router) */
export default function DotoriPage() {
  return <Suspense fallback={<section className="page" />}><DotoriPageInner /></Suspense>;
}
