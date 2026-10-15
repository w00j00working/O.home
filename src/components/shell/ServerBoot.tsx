'use client';
// 서버 연결 부팅 (v2.0) — 앱이 그려지기 전에 런타임 설정(ohome.config.json → localStorage → env)을
// 한 번 읽어 Supabase 클라이언트를 확정한다. 확정 전에는 자식을 그리지 않아
// "로컬 모드로 한 번 그렸다가 서버 모드로 다시 그리는" 깜빡임을 막는다.
import React, { useEffect, useState } from 'react';
import { initSupabase } from '@/lib/supabase';
import { primeSettings } from '@/lib/settingStore';

export function ServerBoot({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  // 대기가 길어질 때만 표시 — 빠르게 끝나는 경우 스피너가 깜빡이는 게 더 거슬린다
  const [slow, setSlow] = useState(false);
  const [delayed, setDelayed] = useState(false);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => { if (alive) setSlow(true); }, 400);
    const warning = setTimeout(() => { if (alive) setDelayed(true); }, 8000);
    // 백엔드 확정 → 사이트 설정(테마·메뉴·폰트…)을 한 번에 받아 캐시 → 그 다음에 화면을 그린다.
    // 각 스토어가 렌더 중 동기적으로 설정을 읽기 때문에 순서가 중요하다.
    initSupabase()
      .then(() => primeSettings())
      .finally(() => { if (alive) { clearTimeout(t); clearTimeout(warning); setReady(true); } });
    return () => { alive = false; clearTimeout(t); clearTimeout(warning); };
  }, []);
  // 배경(테마 그라데이션)은 body가 첫 페인트 전에 이미 칠하므로 여기서는 표시만 얹는다
  if (!ready) {
    if (delayed) return (
      <div className="boot-wait" role="status">
        <div style={{ textAlign: 'center', padding: 24, color: 'var(--page-title)', pointerEvents: 'auto' }}>
          <p>사이트 설정 연결이 지연되고 있습니다. 연결되면 자동으로 계속합니다.</p>
          <button className="btn btn-dark" style={{ marginTop: 14 }} onClick={() => window.location.reload()}>다시 시도</button>
        </div>
      </div>
    );
    return slow ? <div className="boot-wait"><i /></div> : null;
  }
  return <>{children}</>;
}
