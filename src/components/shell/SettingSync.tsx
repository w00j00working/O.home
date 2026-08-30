'use client';
// 설정이 서버에 저장되지 않았을 때 알림 (v2.0)
//
// 저장 실패를 조용히 넘기면 이 브라우저에는 값이 남아 저장된 것처럼 보이다가,
// 다음 접속에 서버 값으로 덮여 "저장했는데 원래대로 돌아간다"가 된다.
// 원인을 알 수 있게 실패한 순간에 알려 준다.
import { useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { explainDbError } from '@/lib/dbError';
import { ERR_EVT } from '@/lib/settingStore';

const LABEL: Record<string, string> = {
  'ohome.site.v1': '로고·탭 제목',
  'ohome.theme.v2': '테마 색',
  'ohome.fonts.v2': '폰트',
  'ohome.menuset.v1': '메뉴',
  'ohome.main.v1': '메인 위젯',
  'ohome.pagetext.v1': '페이지 문구',
};

export function SettingSync() {
  const toast = useToast();
  useEffect(() => {
    let last = 0;
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as { key: string; message?: string };
      // 한 번에 여러 건이 실패해도 알림은 하나만 (같은 원인이라 줄줄이 뜨면 방해만 된다)
      const now = Date.now();
      if (now - last < 3000) return;
      last = now;
      const name = LABEL[d.key] ?? d.key;
      const why = d.message ? explainDbError(d.message) : '';
      toast(why
        ? `${name} 설정을 저장하지 못했습니다 — ${why}`
        : `${name} 설정을 서버에 저장하지 못했습니다 — 관리자 계정으로 로그인했는지, 보안 규칙을 게시했는지 확인해 주세요`);
    };
    window.addEventListener(ERR_EVT, h);
    return () => window.removeEventListener(ERR_EVT, h);
  }, [toast]);
  return null;
}
