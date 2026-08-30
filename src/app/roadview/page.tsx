'use client';
/**
 * 옛 주소 유지 (v2.0 사용자 요청 — 「왜 roadview라고 해? loadb라니까」).
 *
 * 로드비 주소를 `/loadb`로 바꾸면서, 예전에 공유했거나 즐겨찾기해 둔 `/roadview` 주소가
 * 죽지 않도록 그대로 넘겨 준다. 쿼리(`?s=`)도 같이 들고 간다.
 * **저장소 테이블 이름은 `roadview` 그대로다** — 그건 주소와 무관하고, 바꾸면 기존 데이터와
 * 포크 쓰는 사람의 SQL이 전부 깨진다.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RoadviewMoved() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/loadb${window.location.search}`);
  }, [router]);
  return <section className="page" />;
}
