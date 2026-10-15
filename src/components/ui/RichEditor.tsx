'use client';

import dynamic from 'next/dynamic';

export const RichEditor = dynamic(
  () => import('./RichEditorContent').then(mod => mod.RichEditorContent),
  { ssr: false, loading: () => <div className="re-wrap" style={{ minHeight: 200 }} aria-busy="true" /> },
);
