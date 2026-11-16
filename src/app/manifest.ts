import type { MetadataRoute } from 'next';
import { siteMeta } from '@/lib/siteMeta';

/** 웹앱 매니페스트 (커플홈 — 웹푸시) — 아이폰은 사파리 「홈 화면에 추가」로 설치한 웹앱에서만 푸시를 받을 수 있고,
 *  그러려면 standalone 매니페스트가 있어야 한다. 이름은 사이트 제목(환경설정)에서. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { title } = await siteMeta();
  const name = (title || 'O.HOME').replace(/ — 개인홈$/, '').trim() || 'O.HOME';
  return {
    name,
    short_name: name.slice(0, 12),
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#22272e',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
