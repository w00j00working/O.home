'use client';
/**
 * 커스텀 링크 메뉴 (v2.0 사용자 요청).
 *
 * 「자관 목록에 들어가서 골라야 갈 수 있던 페이지(`/rels/latte`)를 메뉴에서 바로」 —
 * 이름과 주소만 적어 두면 메뉴에 올릴 수 있는 항목이 된다. **사이트 안에서의 이동**이라
 * 새 창이 아니라 다른 메뉴와 똑같이 화면만 갈아 끼운다.
 *
 * 게시판·섹션과 같은 「메뉴에 얹는 추가 항목」이라, 만들면 **메뉴 관리의 미배치**에 놓이고
 * 원하는 상위 메뉴에 직접 넣는다(자동 배치 없음 — 사용자 확정).
 */
import { useCallback, useEffect, useReducer } from 'react';
import { getRawSetting, setSetting } from './settingStore';
import type { ExtraEntry } from './menuStore';

const KEY = 'ohome.links.v1';
const EVT = 'ohome-links';

export interface CustomLink {
  id: string;
  name: string;
  /** 사이트 안의 경로 — 저장할 때 `/`로 시작하는 형태로 맞춘다 */
  href: string;
}

/**
 * 입력을 메뉴에 걸 주소로 (v2.0).
 *
 * **내 홈 주소만** 경로로 줄인다 (v2.0 사용자 발견) — 예전에는 풀주소를 무조건 경로로
 * 잘라서, **다른 홈**(같은 vercel 배포 방식의 남의 홈 등) 주소를 붙여 넣으면 도메인이
 * 떨어져 나가 내 홈의 존재하지 않는 페이지로 가 버렸다. 다른 오리진의 풀주소는 그대로
 * 남기고, 메뉴에서 누르면 새 창으로 연다(TopBar가 처리).
 */
export function toInternalPath(v: string): string {
  const s = v.trim();
  if (!s) return '';
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      if (typeof window !== 'undefined' && u.origin === window.location.origin) {
        return u.pathname + u.search + u.hash;
      }
      return u.href;   // 남의 사이트 — 도메인을 떼면 안 된다
    }
  } catch { /* 파싱 실패 — 아래에서 경로로 다룬다 */ }
  return s.startsWith('/') ? s : `/${s}`;
}

let cache: CustomLink[] = [];
let loaded = false;

function load() {
  if (loaded) return;
  try {
    const raw = getRawSetting(KEY);
    if (raw) cache = JSON.parse(raw) as CustomLink[];
  } catch { /* 기본값 */ }
  loaded = true;
}

function notify() { try { window.dispatchEvent(new Event(EVT)); } catch { /* 무시 */ } }

export function useCustomLinks(): {
  links: CustomLink[];
  setLinks: (next: CustomLink[]) => void;
  loaded: boolean;
} {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const h = () => force();
    window.addEventListener(EVT, h);
    window.addEventListener('ohome-setting', h);
    return () => { window.removeEventListener(EVT, h); window.removeEventListener('ohome-setting', h); };
  }, []);
  load();

  const setLinks = useCallback((next: CustomLink[]) => {
    cache = next;
    try { setSetting(KEY, cache); } catch { /* 무시 */ }
    notify();
  }, []);

  return { links: cache, setLinks, loaded };
}

/** 메뉴에 얹을 형태로 — 주소가 비어 있는 것은 뺀다(메뉴에 눌러도 아무 데도 안 가는 항목이 생긴다).
 *  anchor는 자동 배치에만 쓰이던 값이라 지금은 의미가 없지만, 형태를 맞춰 둔다 */
export const linkEntries = (links: CustomLink[]): ExtraEntry[] =>
  links.filter(l => l.href.trim() && l.href !== '/')
    .map(l => ({ id: l.id, name: l.name.trim() || l.href, href: l.href, anchor: '/' }));
