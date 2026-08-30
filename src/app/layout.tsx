import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/lib/ThemeProvider';
import { AuthProvider } from '@/lib/auth';
import { MainStoreProvider } from '@/lib/mainStore';
import { BgmStoreProvider } from '@/lib/bgmStore';
import { FontProvider } from '@/lib/fontStore';
import { ToastProvider } from '@/components/ui/Toast';
import { TopBar } from '@/components/shell/TopBar';
import { BgmPlayer } from '@/components/shell/BgmPlayer';
import { TipLayer } from '@/components/ui/TipLayer';
import { CursorLayer } from '@/components/shell/CursorLayer';
import { ImgProtect } from '@/components/shell/ImgProtect';
import { SetupGate } from '@/components/shell/SetupGate';
import { DocTitle } from '@/components/shell/DocTitle';
import { DocIcon } from '@/components/shell/DocIcon';
import { SettingSync } from '@/components/shell/SettingSync';
import { ListSync } from '@/components/shell/ListSync';
import { UploadBusy } from '@/components/shell/UploadBusy';
import { SpellCheck } from '@/components/shell/SpellCheck';
import { PageFrame } from '@/lib/pageRefresh';
import { MenuGuard } from '@/components/shell/MenuGuard';
import { ServerBoot } from '@/components/shell/ServerBoot';
import { siteMeta } from '@/lib/siteMeta';

/**
 * 링크를 미리 읽어 가는 쪽(카톡·디스코드·검색)은 서버가 돌려준 HTML만 본다.
 * 탭 제목은 화면이 뜬 뒤에 바꾸므로 그쪽에는 늘 기본값이 나갔다 —
 * 여기서 같은 설정을 한 번 읽어 제목을 맞춘다 (읽기 실패하면 기본값).
 */
export async function generateMetadata(): Promise<Metadata> {
  const { title, subtitle, crawlDesc, favicon } = await siteMeta();
  // 크롤링 설명 문구 (v2.0 사용자 요청) — 환경설정에서 직접 지정 > 서브타이틀 > 기본 문구
  const description = crawlDesc?.trim() || subtitle?.trim() || '자캐놀이용 개인 아카이브';
  return {
    title,
    description,
    // 탭 아이콘 (v2.0 사용자 요청) — 지정했으면 기본 favicon.ico 대신 그것을 쓴다.
    // 지정이 없으면 icons를 아예 넣지 않아 Next의 기본 파일 처리를 그대로 둔다
    ...(favicon ? { icons: { icon: favicon } } : {}),
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

// 서버 함수 리전은 코드로 못 정한다 — preferredRegion은 이 Next 버전에서 deprecated이고,
// vercel.json의 regions는 새 프로젝트에서도 적용되지 않는 것을 실측으로 확인했다.
// Vercel 프로젝트 Settings > Functions > Function Region에서 직접 지정 후 재배포해야 한다(설치 안내 2-B ④).

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 테마 FOUC 방지 — <body> 안에 있으면 body 배경이 :root의 다크 기본값으로 먼저 페인트될 여지가
            있다(사용자 발견 — "처음 접속할 때 기본 다크모드가 깜빡") — body 자체가 파싱되는 순간 CSS만으로도
            그려질 수 있기 때문. <head> 맨 앞으로 옮겨 렌더 차단 구간(첫 페인트 전) 안에서 먼저 실행되게 한다 (v2.0) */}
        <script dangerouslySetInnerHTML={{
          __html: `(function(){try{var m=JSON.parse(localStorage.getItem('ohome.themeCss.v1'));if(m){var s=document.documentElement.style;for(var k in m)s.setProperty(k,m[k]);}}catch(e){}})();`,
        }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Noto+Serif+KR:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* 서버 연결 확정 후에 앱을 그림 — 설정(ohome.config.json/로컬/env)을 한 번 읽는다 (v2.0) */}
        <ServerBoot>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <FontProvider>
              <MainStoreProvider>
                <BgmStoreProvider>
                  {/* 설치 초기 화면 — 첫 실행이면 관리자·게스트 설정/백업 복원만 표시 (v1.9) */}
                  <SetupGate>
                  <TopBar />
                  {/* 앱 셸: 스크롤은 이 영역 안에서만 (7장) */}
                  {/* PageFrame: 같은 메뉴를 다시 누르면 이 안쪽만 remount (BGM·상단바는 유지, v1.9) */}
                  {/* MenuGuard: 비공개로 둔 메뉴는 주소로 들어와도 열리지 않게 (v2.0 사용자 요청) */}
                  <main id="appMain"><PageFrame><MenuGuard>{children}</MenuGuard></PageFrame></main>
                  {/* BGM 미니 플레이어 — 전역 상주, 페이지 이동에도 유지 (4.1) */}
                  <BgmPlayer />
                  {/* 전역 커스텀 툴팁 — data-tip 요소 공통 (7장) */}
                  <TipLayer />
                  {/* 커스텀 마우스 커서 (5.1) */}
                  <CursorLayer />
                  {/* 이미지 저장 방지 — 메뉴 관리 > 권한에서 영역별 지정 (v1.9) */}
                  <ImgProtect />
                  {/* 브라우저 탭 제목 — 디자인 탭에서 지정 (v1.9) */}
                  <DocTitle />
                  <DocIcon />
                  {/* 설정이 서버에 저장되지 않았을 때 알림 (v2.0) — 조용히 실패하면 원인을 알 수 없다 */}
                  <SettingSync />
                  {/* 글·댓글 저장이 거부됐을 때 이유를 알림 (v2.0) — 조용히 되돌리면 스스로 사라진 것처럼 보인다 */}
                  <ListSync />
                  {/* 이미지 올리는 중 표시 (v2.0) — 느린 업로드를 다시 누르지 않게 */}
                  <UploadBusy />
                  {/* 맞춤법 검사 밑줄 숨김 — 디자인 탭 (v2.0) */}
                  <SpellCheck />
                  </SetupGate>
                </BgmStoreProvider>
              </MainStoreProvider>
              </FontProvider>
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
        </ServerBoot>
      </body>
    </html>
  );
}
