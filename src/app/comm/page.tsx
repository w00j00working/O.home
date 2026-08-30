'use client';
// 커미션 리스트 (4.18) — 3열 갤러리 · 갤러리 단위 썸네일 비율 · 상태 뱃지 · 전체 슬롯 표시
import React, { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSectionParam, filterSection, sectionSetter, secQuery } from '@/lib/sectionStore';
import { useLocalList } from '@/lib/postStore';
import {
  CommItem, COMM_SEED, useCommSettings, badgeStyle, fmtPrice, slotView, SLOT_CHARS, slotCount, slotTip,
} from '@/lib/commStore';
import { SearchBar, Tip, KStep } from '@/components/ui/Kit';
import { Modal } from '@/components/ui/Modal';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { useMainStore } from '@/lib/mainStore';
import { useCardSort, mergeOrder } from '@/lib/cardSort';

function CommListPageInner() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { editOn } = useMainStore();
  const [itemsAll, setItemsAll, loaded] = useLocalList<CommItem>('ohome.comm.v1', COMM_SEED);
  // 여러 개로 만든 섹션 (v2.0) — 주소의 ?s= 가 가리키는 것만 보여 준다
  const sec = useSectionParam('comm');
  const items = filterSection(itemsAll, sec.id);
  // 저장은 이 섹션 자리만 교체 — 걸러진 목록을 그대로 넘겨도 다른 섹션이 지워지지 않는다
  const setItems = sectionSetter(itemsAll, sec.id, setItemsAll);
  const [settings, patchSettings, setLoaded] = useCommSettings();
  const [q, setQ] = useState('');
  const [slotOpen, setSlotOpen] = useState(false);   // 관리자 — SLOT 클릭 시 바로 관리 모달 (v1.9)
  // 모달 드래프트 — OK를 눌러야 적용, CANCEL/닫기는 폐기
  const [dTotal, setDTotal] = useState(0);
  const [dUsed, setDUsed] = useState(0);
  const openSlot = () => { setDTotal(settings.totalSlot); setDUsed(settings.totalUsed); setSlotOpen(true); };
  const applySlot = () => { patchSettings({ totalSlot: dTotal, totalUsed: Math.min(dUsed, dTotal) }); setSlotOpen(false); };

  const query = q.trim().toLowerCase();
  const shown = items.filter(c => !query
    || c.name.toLowerCase().includes(query) || c.sub.toLowerCase().includes(query));
  const totalRemain = Math.max(0, settings.totalSlot - settings.totalUsed);
  // 편집모드 카드 드래그 정렬 (v1.9) — 훅이므로 early return보다 먼저
  const sort = useCardSort(shown, next => setItems(mergeOrder(items, next)), editOn && isAdmin);

  if (!loaded || !setLoaded) return <section className="page" />;

  return (
    <section className="page">
      <div className="page-head head-stack">
        <PageTitle>{sec.id === 'main' ? 'COMMISSION' : sec.name}</PageTitle>
        <EditableDesc k="comm-desc" def="그림 커미션 안내 · 모집" />
        {/* 우측 스택: 슬롯(위) + 검색·등록(아래) — 제목 옆 배치라 리스트와 멀어지지 않음 (사용자 확정) */}
        <div className="head-actions stack">
          <Tip tip={isAdmin ? '슬롯 관리' : `현재 남은 슬롯은 ${totalRemain}개 입니다`}>
            <span className="cm-total-slot" style={isAdmin ? { cursor: 'var(--cur-pointer,pointer)' } : undefined}
              onClick={() => { if (isAdmin) openSlot(); }}>
              SLOT {settings.totalUsed}/{settings.totalSlot}
            </span>
          </Tip>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <SearchBar placeholder="커미션 검색" onSearch={setQ} />
            {isAdmin && <button className="btn btn-dark" onClick={() => router.push('/comm/new' + secQuery('comm', sec.id))}>＋ ADD COMMISSION</button>}
          </div>
        </div>
      </div>

      {/* 우측 스택이 translateY로 내려온 만큼 그리드를 더 내려 간격 유지
          (margin은 page-head margin-bottom과 상쇄되어 padding 사용) */}
      <div className="cm-grid" style={{ paddingTop: 16 }}>
        {shown.map((c, i) => {
          const badge = settings.commBadges.find(b => b.id === c.badgeId);
          const sv = slotView(c, settings);
          return (
            <div key={c.id} className="panel cm-card" {...sort(i)}
              onClick={() => { if (!editOn) router.push(`/comm/${c.id}`); }}>
              <div className="th" style={{ aspectRatio: settings.ratio.replace(':', '/') }}>
                <CroppedBlobImg fileRef={c.images[0]} crop={c.thumbCrop} ph={c.ph} />
                {badge && <span className="cm-badge" style={badgeStyle(badge, settings.badgeShape)}>{badge.label}</span>}
              </div>
              <div className="bd">
                <b className="nm">{c.name}</b>
                <small className="sub">{c.sub}</small>
                <div className="price">
                  ₩{fmtPrice(c.priceMin)}{c.priceMax > c.priceMin && ` – ₩${fmtPrice(c.priceMax)}`}
                </div>
                {/* 슬롯 숫자는 환경설정에서 「채워진/남은」 중 고른 기준으로 (v2.0) */}
                <div className="slotline">
                  <Tip tip={slotTip(sv, settings)}>
                    <small className="slot" style={{ color: c.slotColor }}>
                      {SLOT_CHARS[c.slotShape].filled} {slotCount(sv, settings)}/{sv.total}
                    </small>
                  </Tip>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {shown.length === 0 && (
        <div className="panel" style={{ textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: 13, color: 'var(--faint)' }}>{query ? '검색 결과가 없습니다' : '등록된 커미션이 없습니다'}</p>
        </div>
      )}

      {/* 전체 슬롯 관리 — SLOT 표시 클릭 (관리자, 환경설정 커미션 탭과 동일 값 · OK를 눌러야 적용) */}
      <Modal open={slotOpen} onClose={() => setSlotOpen(false)} small title="슬롯 관리"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setSlotOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={applySlot}>OK</button>
        </>}>
        <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <b style={{ fontSize: 12.5 }}>전체 슬롯</b>
            <KStep value={dTotal} min={1} max={50}
              onChange={v => { setDTotal(v); setDUsed(u => Math.min(u, v)); }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <b style={{ fontSize: 12.5 }}>사용 중</b>
            <KStep value={dUsed} min={0} max={dTotal} onChange={setDUsed} />
          </div>
          <small style={{ color: 'var(--faint)', fontSize: 11, textAlign: 'right' }}>
            남은 슬롯 {Math.max(0, dTotal - dUsed)}개
          </small>
        </div>
      </Modal>
    </section>
  );
}

/** ?s= 를 읽으므로 Suspense 경계가 필요하다 (Next App Router) */
export default function CommListPage() {
  return <Suspense fallback={<section className="page" />}><CommListPageInner /></Suspense>;
}
