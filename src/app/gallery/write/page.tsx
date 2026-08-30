'use client';
// 그림백업 작성창 (4.11) — 공용 폼(BackupForm) 사용, 수정은 /backup/[id]/edit
import React from 'react';
import { BackupForm } from '@/components/backup/BackupForm';

export default function BackupWritePage() {
  return <BackupForm initial={null} />;
}
