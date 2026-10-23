'use client';
// EditableDesc 주입
// 캐릭터 리스트 (4.4) — 한 줄 5개 · 3:4 썸네일(크롭 반영) · 전용 폰트 · ＋ ADD CHARACTER
import React, { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { Character, CHAR_SEED, charPath } from '@/lib/charStore';
import { backend, isServerMode } from '@/lib/backend';
import { useSectionParam, filterSection, sectionSetter, secQuery } from '@/lib/sectionStore';
import { SearchBar, FitText } from '@/components/ui/Kit';
import { CroppedBlobImg } from '@/components/ui/CropEditor';

import { useToast } from '@/components/ui/Toast';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { useMainStore } from '@/lib/mainStore';
import { useCardSort, mergeOrder } from '@/lib/cardSort';

function CharsInner() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const { editOn } = useMainStore();
  const [charsAll, setCharsAll] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  // 여러 개로 만든 캐릭터 목록 (v2.0 사용자 요청) — 주소의 ?s= 가 가리키는 것만
  const sec = useSectionParam('chars');
  const chars = filterSection(charsAll, sec.id);
  // 저장은 이 목록 자리만 교체 — 걸러진 목록을 그대로 넘겨도 다른 목록이 지워지지 않는다
  const setChars = sectionSetter(charsAll, sec.id, setCharsAll);
  const [q, setQ] = useState('');

  // 💡 [추가] 현재 페이지 번호를 저장하는 상태 변수 (기본값: 1페이지)
  const [currentPage, setCurrentPage] = useState<number>(1);
  const itemsPerPage = 10; // 한 페이지에 보여줄 캐릭터 수

  /* 편집 권한 문서 자가 치유 (v2.0 포크 제보 — 「권한을 줬는데 그 회원의 저장이 거부된다」). */
  useEffect(() => {
    if (!isAdmin || !isServerMode()) return;
    const withGrants = charsAll.filter(c => c.grants?.some(g => g.level === 'edit'));
    if (!withGrants.length) return;
    try {
      if (sessionStorage.getItem('ohome.editorids.healed') === '1') return;
      sessionStorage.setItem('ohome.editorids.healed', '1');
    } catch { /* 무시 */ }
    void backend()?.refreshVis('characters', withGrants as unknown as { id: string }[], null)
      .catch(() => { /* 무시 — 다음 세션에 다시 */ });
  }, [isAdmin, charsAll]);

  // 💡 [변경] 검색어를 입력하면 언제나 1페이지로 강제 리셋되도록 하여 검색 결과 누락 방지
  const handleSearch = (text: string) => {
    setQ(text);
    setCurrentPage(1);
  };

  const visible = chars
    .filter(c => c.own)
    .filter(c => isAdmin || c.visibility === 'public')
    .filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.sub.includes(q));

  // 편집모드 카드 드래그 정렬 (v1.9)
  const sort = useCardSort(visible, next => setChars(mergeOrder(chars, next)), editOn && isAdmin);

  // 💡 [추가] 페이지네이션 연산 로직
  // 단, '관리자 편집 모드(editOn)'가 켜져 있을 때는 카드 정렬을 위해 전체 목록을 다 보여줍니다.
  const isPaginationActive = !editOn; 
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  
  const currentItems = isPaginationActive 
    ? visible.slice(indexOfFirstItem, indexOfLastItem) 
    : visible;

  const totalPages = Math.ceil(visible.length / itemsPerPage);

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'CHARACTERS' : sec.name}</PageTitle>
        <EditableDesc k="chars-desc" def="운영자의 자캐 목록 · 3:4 두상 썸네일 · 클릭 시 프로필로 이동" />
        <div className="head-actions">
          {/* 💡 [변경] 기존 setQ 대신 페이지 리셋 기능이 결합된 handleSearch 연결 */}
          <SearchBar onSearch={handleSearch} />
          {isAdmin && <button className="btn btn-dark" onClick={() => router.push('/chars/new' + secQuery('chars', sec.id))}>＋ ADD CHARACTER</button>}
        </div>
      </div>
      <div className="g5 chars-grid">
        {/* 💡 [변경] 원래 visible.map 이던 부분을 쪼개진 데이터인 currentItems.map 으로 교체 */}
        {currentItems.map((c, i) => {
          const priv = c.visibility === 'private';
          
          // 💡 [변경] slice 로직 때문에 인덱스 번호가 달라지므로, 순수 원래 배열의 인덱스를 매핑해 정렬 기능을 보존합니다.
          const originalIndex = isPaginationActive ? indexOfFirstItem + i : i;
          const sp = sort(originalIndex) as { style?: React.CSSProperties };
          
          return (
            <div key={c.id} className="char-card" {...sort(originalIndex)}
              style={{ ...(priv ? { opacity: .45 } : undefined), ...sp.style }}
              onClick={() => { if (!editOn) router.push(charPath(c)); }}>
              <div className="thumb" style={{ position: 'relative' }}>
                <CroppedBlobImg fileRef={c.arts?.[0] ?? c.thumbId} crop={c.thumbCrop} ph={c.thumbClass}
                  label={priv ? '비공개' : '3:4'} />
              </div>
              <div className="nm">
                <b style={{ minWidth: 0, flex: 1 }}><FitText>{c.name}</FitText></b>
                <i style={{ background: c.color }} />
              </div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <p style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--page-desc)', fontSize: 13, padding: 40 }}>
            표시할 캐릭터가 없습니다
          </p>
        )}
      </div>

      {/* 💡 [추가] 다음 페이지 / 이전 페이지로 넘어가는 깔끔한 디자인의 버튼 바 컨트롤러 */}
      {isPaginationActive && totalPages > 1 && (
        <div className="pagination-bar" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', marginTop: '40px' }}>
          <button 
            onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              border: '1px solid var(--border-color, #eee)',
              background: 'var(--bg-card, #fff)',
              cursor: currentPage === 1 ? 'not-allowed' : 'pointer',
              opacity: currentPage === 1 ? 0.4 : 1,
              borderRadius: '4px'
            }}
          >
            이전
          </button>

          {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
            <button
              key={pageNumber}
              onClick={() => setCurrentPage(pageNumber)}
              style={{
                padding: '6px 12px',
                fontSize: '13px',
                fontWeight: currentPage === pageNumber ? 'bold' : 'normal',
                border: '1px solid',
                borderColor: currentPage === pageNumber ? 'var(--text-main, #333)' : 'var(--border-color, #eee)',
                backgroundColor: currentPage === pageNumber ? 'var(--text-main, #333)' : 'var(--bg-card, #fff)',
                color: currentPage === pageNumber ? 'var(--bg-page, #fff)' : 'var(--text-main, #333)',
                cursor: 'pointer',
                borderRadius: '4px'
              }}
            >
              {pageNumber}
            </button>
          ))}

          <button 
            onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages}
            style={{
              padding: '6px 12px',
              fontSize: '13px',
              border: '1px solid var(--border-color, #eee)',
              background: 'var(--bg-card, #fff)',
              cursor: currentPage === totalPages ? 'not-allowed' : 'pointer',
              opacity: currentPage === totalPages ? 0.4 : 1,
              borderRadius: '4px'
            }}
          >
            다음
          </button>
        </div>
      )}
    </section>
  );
}

export default function CharsPage() {
  return <Suspense fallback={<section className="page" />}><CharsInner /></Suspense>;
}
