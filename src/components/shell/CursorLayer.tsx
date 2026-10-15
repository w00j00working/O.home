'use client';
// 커스텀 마우스 커서 적용 (5.1 v1.1 · v1.9 애니메이션) — 상태별 등록 이미지를 전역 스타일로 주입.
// 등록 안 한 상태는 기본 커서 폴백 · 전체 끄면 스타일 제거.
// .ani(윈도우 애니메이션 커서)는 프레임을 뽑아 CSS cursor를 교체하며 재생 (lib/aniCursor).
// .cur는 파일에 내장된 핫스팟을 그대로 사용 (CSS 좌표 생략).
import { useEffect } from 'react';
import { useCursorSettings, CursorState } from '@/lib/cursorStore';
import { getBlob } from '@/lib/blobStore';
import { parseAni, isCur } from '@/lib/aniCursor';
import { imageHttpUrl } from '@/components/ui/ImageSource';
import { isFileUrl } from '@/lib/transfer';

// 상태 → 전역 CSS 변수 (v1.9) — globals.css·인라인 스타일의 cursor:var(--cur-pointer,pointer) /
// var(--cur-grab,grab) 사용처 전부에 자동 적용. 셀렉터 나열로 못 잡던 div+onClick 요소
// (로고·알림 종·프로필 등)도 이 변수로 커버 — 미등록 상태면 fallback 키워드로 동작.
const VAR_NAME: Partial<Record<CursorState, string>> = {
  default: '--cur-default', pointer: '--cur-pointer', grab: '--cur-grab', active: '--cur-active',
  // 크기조절 4방향 (v1.9) — .rs 핸들·드래그 중 전역 고정 규칙이 사용
  rsNwse: '--cur-rs-nwse', rsNesw: '--cur-rs-nesw', rsEw: '--cur-rs-ew', rsNs: '--cur-rs-ns',
};

// 상태 → 적용 셀렉터 (커서 폴백 포함)
const RULES: Record<CursorState, { sel: string; fallback: string }> = {
  default: { sel: 'body, .page, .panel', fallback: 'auto' },
  pointer: {
    sel: [
      'a', 'button', 'label', '.btn', '.tag', '.pill', '.k-select', '.k-toggle', '.k-check', '.k-radio',
      '.rp-room', '.thr-item', '.memo-list-item', '.fc', '.g-item', '.char-card', '.rel-card',
      '.cm-card', '.dt-card', '.tc-card', '.list-item', '.brow', '.ap-row', '.ticket', '.more', '.cur',
    ].join(', '),
    fallback: 'pointer',
  },
  text: { sel: 'input, textarea, [contenteditable="true"], .re-content', fallback: 'text' },
  active: { sel: 'body:active, *:active', fallback: 'auto' },
  // .wgt는 편집모드에서만 드래그 가능 — 평상시 배너 등 위젯 위에서 grab이 뜨던 문제 수정 (v1.9)
  // 편집모드에선 메인 영역 전체 grab 통일 — 드래그 중 내부 요소를 지나며 커서가 튀지 않게
  // 편집 핸들(.rs 크기조절 · .rr 기울기)은 제외 — 전체 grab 규칙(!important)이 핸들 커서를 덮어
  // 시스템 커서와 커스텀 커서가 섞여 깨져 보이던 문제 (v1.9 사용자 발견)
  grab: { sel: '.drag-h, .postit:not(.ro), [draggable="true"], body.edit-on .page-main-wrap, body.edit-on .page-main-wrap *:not(.rs):not(.rr)', fallback: 'grab' },
  // 크기조절 4방향 (v1.9 사용자 요청) — nwse는 위젯 우하단 핸들, 나머지는 예약 클래스(향후 사용처)
  rsNwse: { sel: '.wgt .rs, .cur-rs-nwse', fallback: 'nwse-resize' },
  rsNesw: { sel: '.cur-rs-nesw', fallback: 'nesw-resize' },
  rsEw: { sel: '.cur-rs-ew', fallback: 'ew-resize' },
  rsNs: { sel: '.cur-rs-ns', fallback: 'ns-resize' },
};

interface AnimState { key: CursorState; urls: string[]; delays: number[] }

export function CursorLayer() {
  const [st] = useCursorSettings();

  useEffect(() => {
    const styleId = 'ohome-cursor-style';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!st.enabled || Object.keys(st.states).length === 0) {
      styleEl?.remove();
      return;
    }
    let cancelled = false;
    const urls: string[] = [];
    const timers: number[] = [];
    (async () => {
      const staticParts: string[] = [];
      const anims: AnimState[] = [];
      for (const key of Object.keys(st.states) as CursorState[]) {
        const entry = st.states[key];
        if (!entry) continue;
        const external = imageHttpUrl(entry.imgId);
        if (external && !isFileUrl(external)) {
          // 외부 커서는 CORS 다운로드 없이 주소를 직접 사용하고 CSS 문자열만 안전하게 이스케이프한다.
          const url = new URL(external).href.replace(/["\\\n\r\f]/g, char => `\\${char.charCodeAt(0).toString(16)} `);
          const rule = RULES[key];
          const hs = ` ${entry.hx} ${entry.hy}`;
          staticParts.push(`${rule.sel}{cursor:url("${url}")${hs}, ${rule.fallback} !important}`);
          const vn = VAR_NAME[key];
          if (vn) staticParts.push(`:root{${vn}:url("${url}")${hs}, ${rule.fallback}}`);
          continue;
        }
        const blob = await getBlob(entry.imgId);
        if (!blob || cancelled) continue;
        const buf = await blob.arrayBuffer();
        if (cancelled) return;
        const ani = parseAni(buf);
        if (ani) {
          // 스텝 순서대로 프레임 URL 배열 — 타이머가 이 순서로 커서를 교체
          const frameUrls = ani.frames.map(f => { const u = URL.createObjectURL(f); urls.push(u); return u; });
          anims.push({ key, urls: ani.steps.map(i => frameUrls[i]), delays: ani.delays });
        } else {
          const url = URL.createObjectURL(blob);
          urls.push(url);
          const rule = RULES[key];
          // .cur는 내장 핫스팟 사용 — CSS 좌표를 붙이면 무시되는 브라우저가 있어 생략
          const hs = isCur(buf) ? '' : ` ${entry.hx} ${entry.hy}`;
          staticParts.push(`${rule.sel}{cursor:url("${url}")${hs}, ${rule.fallback} !important}`);
          const vn = VAR_NAME[key];
          if (vn) staticParts.push(`:root{${vn}:url("${url}")${hs}, ${rule.fallback}}`);
        }
      }
      if (cancelled) return;
      if (!styleEl || !document.getElementById(styleId)) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }
      const stepIdx: Partial<Record<CursorState, number>> = {};
      const render = () => {
        const animParts = anims.flatMap(a => {
          const rule = RULES[a.key];
          const u = a.urls[stepIdx[a.key] ?? 0];
          const vn = VAR_NAME[a.key];
          return [
            `${rule.sel}{cursor:url("${u}"), ${rule.fallback} !important}`,
            ...(vn ? [`:root{${vn}:url("${u}"), ${rule.fallback}}`] : []),
          ];
        });
        styleEl!.textContent = [...staticParts, ...animParts].join('\n');
      };
      render();
      for (const a of anims) {
        if (a.urls.length < 2) continue;
        let i = 0;
        const tick = () => {
          if (cancelled) return;
          i = (i + 1) % a.urls.length;
          stepIdx[a.key] = i;
          render();
          timers.push(window.setTimeout(tick, a.delays[i] ?? 100));
        };
        timers.push(window.setTimeout(tick, a.delays[0] ?? 100));
      }
    })();
    return () => {
      cancelled = true;
      timers.forEach(t => clearTimeout(t));
      urls.forEach(u => URL.revokeObjectURL(u));
      document.getElementById(styleId)?.remove();
    };
  }, [st]);

  return null;
}
