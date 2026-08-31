'use client';
// TRPG 캐릭터 리스트 (v1.9 신규) — 1:1 대표 인장 카드 · 클릭 시 상세(표정 전환은 상세에서)
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { TrpgChar, TCHAR_SEED, faceCrop } from '@/lib/tcharStore';
import { SearchBar } from '@/components/ui/Kit';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { useConfirmDelete } from '@/components/ui/Modal';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { useMainStore } from '@/lib/mainStore';
import { useCardSort, mergeOrder } from '@/lib/cardSort';
import { useMenuSettings } from '@/lib/menuStore'; // 🌟 권한 설정 추가

export default function TCharsPage() {
  const router = useRouter();
  const { user, isAdmin } = useAuth(); // 🌟 user 추가
  const { editOn } = useMainStore();
  const del = useConfirmDelete();
  const [tchars, setTchars, loaded] = useLocalList<TrpgChar>('ohome.tchars.v1', TCHAR_SEED);
  const [q, setQ] = useState('');

  // 🌟 환경설정 메뉴 관리에서 지정한 tcharsWrite 권한 연동
  const [menuSet] = useMenuSettings();
  const permWrite = (menuSet as any).tcharsWrite ?? 'member';
  const canWrite = isAdmin || (permWrite === 'guest') || (permWrite === 'member' && !!user);

  const query = q.trim().toLowerCase();
  const shown = tchars.filter(c => !query
    || c.name.toLowerCase().includes(query)
    || c.scenario.toLowerCase().includes(query)
    || c.rule.toLowerCase().includes(query)
    || c.role.toLowerCase().includes(query));

  const sort = useCardSort(shown, next => setTchars(mergeOrder(tchars, next)), editOn && isAdmin);

  if (!loaded) return <section className="page" />;

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>TRPG CHARACTERS</PageTitle>
        <EditableDesc k="tchars-desc" def="1:1 인장 카드 — 클릭하면 표정과 소개를 볼 수 있습니다" />
        <div className="head-actions">
          <SearchBar placeholder="이름·시나리오·룰·역할 검색" onSearch={setQ} />
          {/* 🌟 canWrite 조건 적용 */}
          {canWrite && <button className="btn btn-dark" onClick={() => router.push('/tchars/new')}>＋ ADD</button>}
        </div>
      </div>

      <div className="tc-grid">
        {shown.map((c, i) => {
          const face = c.faces[0];
          return (
            <div key={c.id} className="panel tc-card" {...sort(i)}
              style={{ cursor: 'var(--cur-pointer,pointer)', ...(sort(i) as { style?: React.CSSProperties }).style }}
              onClick={() => { if (!editOn) router.push(`/tchars/${c.id}`); }}>
              <div className="main" style={{ cursor: 'var(--cur-pointer,pointer)' }}>
                <CroppedBlobImg fileRef={face?.imgId} crop={faceCrop(c, face)} ph={face?.ph ?? c.ph} />
                {isAdmin && (
                  <div className="th-actions hv-actions">
                    <button onClick={e => { e.stopPropagation(); router.push(`/tchars/${c.id}/edit`); }}>EDIT</button>
                    <button className="del" onClick={e => {
                      e.stopPropagation();
                      del.ask(`「${c.name}」를 삭제하시겠습니까?`, () => setTchars(tchars.filter(x => x.id !== c.id)));
                    }}>DELETE</button>
                  </div>
                )}
              </div>
              <div className="bd">
                <b className="nm">
                  {c.name}
                  {c.role && <span className="pill dark">{c.role}</span>}
                </b>
                <small className="meta">{[c.scenario, c.rule].filter(Boolean).join(' · ')}</small>
                {c.desc && (
                  <div className="desc">
                    {c.desc.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {shown.length === 0 && (
        <div className="panel" style={{ textAlign: 'center', padding: 44, fontSize: 13, color: 'var(--faint)' }}>
          {query ? '검색 결과가 없습니다' : '등록된 캐릭터가 없습니다'}
        </div>
      )}
      {del.element}
    </section>
  );
}
