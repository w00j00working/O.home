'use client';
// 그림백업 수정 (4.11) — 작성자 또는 관리자만
import React from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { BackupPost, BACKUP_SEED } from '@/lib/galleryStore';
import { BackupForm } from '@/components/backup/BackupForm';
import { PageTitle } from '@/components/ui/PageText';

export default function BackupEditPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  const [posts, , loaded] = useLocalList<BackupPost>('ohome.backup.v1', BACKUP_SEED);
  const p = posts.find(x => x.id === id);

  if (!loaded) return <section className="page" />;
  // authorId가 없는 글 + 비로그인이면 둘 다 undefined라 통과하던 것 (v2.0 발견)
  if (!p || !(isAdmin || (!!p.authorId && p.authorId === user?.id))) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>EDIT</PageTitle><p>게시물을 찾을 수 없거나 수정 권한이 없습니다</p></div>
      </section>
    );
  }
  return <BackupForm initial={p} />;
}
