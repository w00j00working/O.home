'use client';
// 감상타래 — 새 타래 시작 (작품 등록, 4.17 페이지형)
import { Suspense } from 'react';
import { useAuth } from '@/lib/auth';
import { useSectionParam, useSectionTitle } from '@/lib/sectionStore';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';
import { ThreadForm } from '@/components/threads/ThreadForm';

function ThreadNewInner() {
  const { isAdmin } = useAuth();
  // 큰 글씨 — 추가 섹션에서 들어왔으면(?s=) 그 이름, 눌렀을 때도 그 목록으로 (v2.0 사용자 제보)
  const sec = useSectionParam('threads');
  const tt = useSectionTitle('threads', sec.id, 'THREADS');
  if (!isAdmin) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>관리자 전용 페이지</p></div>
      </section>
    );
  }
  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href={tt.href}>{tt.title}</PageTitle>
        <EditableDesc k="threads-new-desc" def="새 타래 시작 — 작품 정보를 등록하면 타래에 글을 이어 쓸 수 있습니다" />
      </div>
      <ThreadForm />
    </section>
  );
}

/** ?s= 를 읽으므로 Suspense 경계가 필요하다 (Next App Router) */
export default function ThreadNewPage() {
  return <Suspense fallback={<section className="page" />}><ThreadNewInner /></Suspense>;
}
