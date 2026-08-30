'use client';
// 도토리 등록 (4.15) — 페이지형 등록
import React, { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSectionParam, secStamp, secQuery , useSectionTitle } from '@/lib/sectionStore';
import { useLocalList, newId } from '@/lib/postStore';
import { DotoriItem, DOTORI_SEED } from '@/lib/galleryStore';
import { DotoriForm } from '@/components/trpg/DotoriForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

function DotoriNewPageInner() {
  // 어느 섹션에서 눌러 왔는지 (v2.0) — 새 항목을 그 목록에 넣는다
  const sec = useSectionParam('dotori');
  // 큰 글씨 — 추가 섹션이면 그 이름, 눌렀을 때도 그 목록으로 (v2.0 사용자 제보)
  const tt = useSectionTitle('dotori', sec.id, 'ADD DOTORI');
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [items, setItems] = useLocalList<DotoriItem>('ohome.dotori.v1', DOTORI_SEED);

  if (!isAdmin) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>관리자 전용 페이지</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><EditableDesc k="dotori-new-desc" def="가고 싶은 시나리오 등록" /></div>
      <DotoriForm initial={null}
        onCancel={() => router.push('/dotori' + secQuery('dotori', sec.id))}
        onSave={v => {
          const it: DotoriItem = {
            id: newId(), ...v, link: v.link, ph: 'cool', date: new Date().toISOString(),
          };
          setItems([{ ...it, ...secStamp(sec.id) }, ...items]);
          toast('도토리가 등록되었습니다');
          router.push('/dotori' + secQuery('dotori', sec.id));
        }} />
    </section>
  );
}

export default function DotoriNewPage() {
  return <Suspense fallback={<section className="page" />}><DotoriNewPageInner /></Suspense>;
}
