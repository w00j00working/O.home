'use client';
// 도토리 수정 (4.15) — 페이지형 편집
import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { useSectionTitle } from '@/lib/sectionStore';
import { DotoriItem, DOTORI_SEED } from '@/lib/galleryStore';
import { DotoriForm } from '@/components/trpg/DotoriForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle } from '@/components/ui/PageText';

export default function DotoriEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [items, setItems, loaded] = useLocalList<DotoriItem>('ohome.dotori.v1', DOTORI_SEED);
  // 큰 글씨 — 추가 섹션 항목이면 그 이름, 눌렀을 때도 그 목록으로 (v2.0 사용자 제보)
  const tt = useSectionTitle('dotori', items.find(x => x.id === id)?.secId, 'EDIT DOTORI');
  const it = items.find(x => x.id === id);

  if (!loaded) return <section className="page" />;
  if (!isAdmin || !it) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>항목을 찾을 수 없거나 권한이 없습니다</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>{it.name}</p></div>
      <DotoriForm initial={it}
        onCancel={() => router.push('/dotori')}
        onSave={v => {
          setItems(items.map(x => (x.id === it.id ? { ...x, ...v } : x)));
          toast('저장되었습니다');
          router.push('/dotori');
        }} />
    </section>
  );
}
