'use client';
/**
 * 비공개로 둔 메뉴는 주소로 들어와도 열리지 않게 (v2.0 사용자 요청).
 *
 * 메뉴 관리의 공개범위는 원래 **메뉴를 그릴 때만** 쓰였다 — 링크가 안 보일 뿐,
 * `/board`를 직접 치면 그대로 열렸다. 여기서 한 곳에 모아 막는다.
 * 판정은 위젯이 쓰는 것과 **같은 함수**(`hrefVis`)라 메뉴·위젯·페이지가 늘 같은 답을 낸다.
 *
 * **완전한 차단은 아니다.** 화면을 그리지 않는 것이지, 글 자체는 여전히 공개로 저장돼 있어
 * 서버에 직접 물어보는 사람에게는 보인다. 서버가 막아 주는 것은 **글의 공개범위**(`visibility`)뿐이다.
 * 정말 알려지면 안 되는 글은 글 자체를 비공개/회원공개로 두어야 한다.
 */
import React, { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useMenuSettings, hrefAccess, canAccessHref } from '@/lib/menuStore';
import { PageTitle } from '@/components/ui/PageText';

function GuardInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const { user, isAdmin, ready } = useAuth();
  const [menuSet, , loaded] = useMenuSettings();

  /* 메뉴에 적힌 주소 형태로 맞춘다 — 섹션은 `?s=`, 추가 게시판은 `?b=`.
     `sp.toString()`을 그대로 쓰면 다른 파라미터가 섞이거나 순서가 달라져 못 알아본다. */
  const s = sp.get('s');
  const b = sp.get('b');
  const path = pathname + (s ? `?s=${s}` : b ? `?b=${b}` : '');

  // 설정과 로그인 확인이 끝나기 전에는 아무것도 그리지 않는다 —
  // 먼저 그려 두면 한 프레임이라도 내용이 비치고, 반대로 관리자에게 「비공개」가 번쩍인다
  if (!loaded || !ready) return <section className="page" />;

  // 멤버 선택(visMembers)까지 판정에 들어가므로 공용 함수로 (v2.0)
  const ok = canAccessHref(menuSet, path, { loggedIn: !!user, isAdmin, id: user?.id });
  if (ok) return <>{children}</>;

  const vis = hrefAccess(menuSet, path);
  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>PRIVATE</PageTitle>
        {/* 로그인했는데 막혔으면 멤버 선택에서 빠진 것 — 로그인하라는 안내는 어리둥절하다 */}
        <p>{blockedMsg(vis === 'admin' ? 'admin' : 'member', !!user)}</p>
      </div>
    </section>
  );
}

const blockedMsg = (vis: 'member' | 'admin', loggedIn: boolean) =>
  vis === 'admin' ? '관리자만 볼 수 있는 곳입니다'
    : loggedIn ? '허용된 회원만 볼 수 있는 곳입니다'
      : '로그인한 회원만 볼 수 있는 곳입니다';

export function MenuGuard({ children }: { children: React.ReactNode }) {
  // useSearchParams는 Suspense 경계 필요 (Next App Router)
  return <Suspense fallback={<section className="page" />}><GuardInner>{children}</GuardInner></Suspense>;
}

/** 못 들어가는 곳에 보여 줄 화면 — 위의 MenuGuard와 같은 문구를 쓴다 */
function blockedView(vis: 'member' | 'admin', loggedIn: boolean) {
  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>PRIVATE</PageTitle>
        <p>{blockedMsg(vis, loggedIn)}</p>
      </div>
    </section>
  );
}

/**
 * 상세 페이지용 (v2.0) — **글 주소에는 섹션이 안 들어간다.**
 * `/gallery/b1`만 보고는 그 글이 비공개 갤러리 것인지 알 수 없어 MenuGuard가 못 막는다.
 * 글을 읽어 소속을 알아낸 페이지가 그 주소(`/gallery?s=fan`)를 넘겨 주면 여기서 판정한다.
 *
 * 반환값이 있으면 그것을 그대로 return 하면 된다 —
 * **훅이므로 페이지의 다른 early return보다 먼저 불러야 한다**(렌더마다 훅 수가 달라지면 안 된다).
 * href가 아직 없으면(글을 읽는 중) 막지 않는다 — 보여 줄 내용도 아직 없다.
 */
export function useHrefBlock(href?: string): React.ReactElement | null {
  const { user, isAdmin, ready } = useAuth();
  const [menuSet, , loaded] = useMenuSettings();
  if (!href || !loaded || !ready) return null;
  if (canAccessHref(menuSet, href, { loggedIn: !!user, isAdmin, id: user?.id })) return null;
  const vis = hrefAccess(menuSet, href);
  return blockedView(vis === 'admin' ? 'admin' : 'member', !!user);
}
