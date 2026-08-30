'use client';
// 플레이기록 수정 (4.16) — 페이지형 편집
import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { useSectionTitle } from '@/lib/sectionStore';
import { PlayRecord, PLAYLOG_SEED } from '@/lib/galleryStore';
import { PlaylogForm } from '@/components/trpg/PlaylogForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle } from '@/components/ui/PageText';

export default function PlaylogEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [records, setRecords, loaded] = useLocalList<PlayRecord>('ohome.playlog.v1', PLAYLOG_SEED);
  // 큰 글씨 — 추가 섹션 항목이면 그 이름, 눌렀을 때도 그 목록으로 (v2.0 사용자 제보)
  const tt = useSectionTitle('playlog', records.find(x => x.id === id)?.secId, 'EDIT RECORD');
  const r = records.find(x => x.id === id);

  if (!loaded) return <section className="page" />;
  if (!isAdmin || !r) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>기록을 찾을 수 없거나 권한이 없습니다</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>{r.scenario}</p></div>
      <PlaylogForm initial={r} records={records}
        onCancel={() => router.push('/playlog')}
        onSave={v => {
          setRecords(records.map(x => (x.id === r.id ? { ...x, ...v, date: v.date, url: v.url, logId: v.logId, scenarioLink: v.scenarioLink } : x)));
          toast('저장되었습니다');
          router.push('/playlog');
        }} />
    </section>
  );
}
