'use client';
// 브라우저 탭 아이콘 (v2.0 사용자 요청) — 디자인 탭에서 지정, 비우면 기본 아이콘.
//
// 서버 메타데이터(generateMetadata)로도 넣지만 그건 **저장소 주소일 때만** 가능하다.
// 로컬 모드에서는 참조가 파일 id라 서버가 알 수 없으므로 화면에서 붙여 준다.
// 그리고 Next는 src/app/favicon.ico를 자동으로 걸기 때문에, 그냥 <link>를 더하면
// 기본 아이콘이 남아 어느 쪽이 이길지 브라우저마다 달라진다 — 기존 것을 지우고 우리 것만 남긴다.
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSiteSettings } from '@/lib/siteStore';
import { useBlobUrl } from '@/lib/blobStore';

const MARK = 'ohome-favicon';
const ORIG = 'data-ohome-icon-orig';   // 남의 링크를 덮어쓰기 전 원래 주소

export function DocIcon() {
  const [site, , loaded] = useSiteSettings();
  const url = useBlobUrl(site.favicon);
  const pathname = usePathname();

  useEffect(() => {
    if (!loaded) return;

    const apply = () => {
      const mine = document.querySelector<HTMLLinkElement>(`link[data-${MARK}]`);
      // 우리가 만들지 않은 아이콘 링크 = Next(React)가 그린 것
      const theirs = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')]
        .filter(l => !l.hasAttribute(`data-${MARK}`));

      if (!url) {
        // 지정을 지웠으면 우리 것만 걷어내고(우리가 만든 노드라 안전) 남의 것은 원래대로 되돌린다
        mine?.remove();
        theirs.forEach(l => {
          const o = l.getAttribute(ORIG);
          if (o !== null) { l.href = o; l.removeAttribute(ORIG); }
        });
        return;
      }

      /* **React가 그린 노드는 절대 지우지 않는다** (v2.0 사용자 발견).
         예전에는 기본 아이콘 링크를 remove()로 없앴는데, 그러면 나중에 React가 그 노드를
         정리할 때 parentNode가 이미 없어 `removeChild`가 터진다. 그 예외가 렌더 커밋 도중에
         나므로 **화면 갱신이 통째로 실패**한다 — 「메뉴를 눌러도 주소만 바뀌고 화면은 그대로,
         새로고침하면 바뀜」이 이것이었다(파비콘을 지정한 홈에서만 나타나 원인 찾기가 어려웠다).
         지우는 대신 **주소만 우리 것으로 덮어쓴다** — 노드는 그대로 두므로 React가 다칠 일이 없고,
         브라우저는 어느 링크를 고르든 같은 아이콘을 받는다. */
      theirs.forEach(l => {
        if (!l.hasAttribute(ORIG)) l.setAttribute(ORIG, l.getAttribute('href') ?? '');
        if (l.href !== url) l.href = url;
      });

      if (mine) {
        if (mine.href !== url) mine.href = url;
        return;
      }
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = url;
      link.setAttribute(`data-${MARK}`, '');
      document.head.appendChild(link);
    };

    apply();
    // 페이지를 옮기면 Next가 head를 다시 그리며 기본 아이콘을 되돌려 놓는다 (제목과 같은 이유).
    // 이미 우리 값이면 아무것도 하지 않으므로 되풀이되지 않는다.
    // href까지 지켜본다 — React가 자기 링크의 주소를 되돌려 놓아도 다시 덮어쓴다.
    // 이미 우리 값이면 아무것도 하지 않으므로 되풀이되지 않는다
    const ob = new MutationObserver(apply);
    ob.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
    return () => ob.disconnect();
  }, [loaded, url, pathname]);

  return null;
}
