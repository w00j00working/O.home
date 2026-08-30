'use client';
// 커미션 등록 (4.18) — 페이지형
import React, { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSectionParam, secStamp, secQuery , useSectionTitle } from '@/lib/sectionStore';
import { useLocalList, newId } from '@/lib/postStore';
import { CommItem, COMM_SEED, useCommSettings } from '@/lib/commStore';
import { CommForm } from '@/components/comm/CommForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

function CommNewPageInner() {
  // 어느 섹션에서 눌러 왔는지 (v2.0) — 새 항목을 그 목록에 넣는다
  const sec = useSectionParam('comm');
  // 큰 글씨 — 추가 섹션이면 그 이름, 눌렀을 때도 그 목록으로 (v2.0 사용자 제보)
  const tt = useSectionTitle('comm', sec.id, 'ADD COMMISSION');
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [items, setItems] = useLocalList<CommItem>('ohome.comm.v1', COMM_SEED);
  const [settings] = useCommSettings();

  if (!isAdmin) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>관리자 전용 페이지</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><EditableDesc k="comm-new-desc" def="커미션 등록" /></div>
      <CommForm initial={null} settings={settings}
        onCancel={() => router.push('/comm' + secQuery('comm', sec.id))}
        onSave={v => {
          const c: CommItem = { id: newId(), ...v, ph: 'cool', date: new Date().toISOString() };
          setItems([{ ...c, ...secStamp(sec.id) }, ...items]);
          toast('커미션이 등록되었습니다');
          router.push(`/comm/${c.id}`);
        }} />
    </section>
  );
}

export default function CommNewPage() {
  return <Suspense fallback={<section className="page" />}><CommNewPageInner /></Suspense>;
}
