'use client';
// 캐릭터 등록 페이지 (4.4) — 전용 페이지 (모달 아님)
import React, { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { Character, CHAR_SEED } from '@/lib/charStore';
import { useSectionParam, secStamp, secQuery , useSectionTitle } from '@/lib/sectionStore';
import { CharEditForm } from '@/components/chars/CharEditForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

function CharNewInner() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [chars, setChars, loaded] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const sec = useSectionParam('chars');   // 어느 캐릭터 목록에서 눌러 왔는지 (v2.0)
  // 큰 글씨 — 추가 섹션이면 그 이름, 눌렀을 때도 그 목록으로 (v2.0 사용자 제보)
  const tt = useSectionTitle('chars', sec.id, 'ADD CHARACTER');

  if (!loaded) return <section className="page" />;
  if (!isAdmin) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>관리자 전용</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href={tt.href}>{tt.title}</PageTitle>
        <EditableDesc k="chars-new-desc" def="캐릭터 등록 — 아트 첫 장이 대표 · 탭 내용은 전용 편집 화면에서 작성" />
      </div>
      <CharEditForm
        initial={null}
        existingIds={chars.flatMap(c => [c.id, ...(c.slug ? [c.slug] : [])])}
        onCancel={() => router.push('/chars' + secQuery('chars', sec.id))}
        onSave={c => {
          setChars([...chars, { ...c, ...secStamp(sec.id) }]);
          toast('캐릭터가 등록되었습니다');
          router.push(`/chars/${c.id}`);
        }}
      />
    </section>
  );
}

export default function CharNewPage() {
  // useSearchParams는 Suspense 경계 필요 (Next App Router)
  return <Suspense fallback={<section className="page" />}><CharNewInner /></Suspense>;
}
