'use client';
// 공용 UI 킷 (기획서 7장 — 기본 UI 절대 금지)
// 클래스명·스타일은 프로토타입(개인홈_프로토타입_2.html)을 그대로 계승
import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* ---------- 텍스트 인풋 ---------- */
export function KInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`k-input ${props.className ?? ''}`} />;
}

/**
 * 한글 입력이 깨지지 않는 인풋 — 값이 바깥 저장소를 거쳐 되돌아오는 곳에 쓴다.
 *
 * 한글은 자모를 모으는 동안(조합 중) 입력창이 임시 상태를 들고 있는데,
 * 이때 리렌더로 value가 덮이면 조합이 끊겨 「두 번씩 찍히고 글자가 이상해지는」 증상이 난다.
 * 그래서 조합 중에는 바깥 값을 받지 않고, 조합이 끝난 뒤에만 맞춘다.
 */
export function LiveInput({ value, onValue, ...rest }: {
  value: string; onValue: (v: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [local, setLocal] = useState(value);
  const composing = useRef(false);
  useEffect(() => { if (!composing.current) setLocal(value); }, [value]);
  return (
    <KInput {...rest} value={local}
      onCompositionStart={() => { composing.current = true; }}
      onCompositionEnd={e => {
        composing.current = false;
        const v = (e.target as HTMLInputElement).value;
        setLocal(v); onValue(v);
      }}
      onChange={e => {
        const v = e.target.value;
        setLocal(v);
        // 조합 중에는 밖으로 내보내지 않는다 — 되돌아온 값이 조합을 깬다
        if (!composing.current) onValue(v);
      }} />
  );
}

/**
 * 한 줄에 들어가도록 글씨를 줄이는 상자 (v2.0) — 긴 이름이 두 줄로 갈라지는 것을 막는다.
 * 말줄임(…)과 달리 이름 전체를 보여 준다. min까지 줄여도 안 들어가면 거기서 멈춘다.
 */
export function FitText({ children, min, minRatio = 0.85, className, style }: {
  children: React.ReactNode;
  /** 절대 하한(px). 없으면 기준 크기의 minRatio까지만 줄인다 */
  min?: number;
  /** 기준 크기 대비 하한 비율 — 너무 작아져서 오히려 안 예뻐지는 것을 막는다.
   *  85%까지만 줄이고, 그래도 안 들어가면 …로 마무리 (사용자 확정) */
  minRatio?: number;
  className?: string; style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const baseRef = useRef<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      // 기준 크기는 처음 한 번만 잰다. 인라인 크기를 지우고 다시 재면
      // 호출한 쪽이 style로 준 크기까지 날아가 상속값(작은 값)을 기준으로 삼게 된다.
      if (baseRef.current == null) baseRef.current = parseFloat(getComputedStyle(el).fontSize) || 14;
      const base = baseRef.current;
      el.style.fontSize = `${base}px`;              // 기준 크기에서 다시 계산
      const floor = min ?? base * minRatio;
      let size = base;
      while (size > floor && el.scrollWidth > el.clientWidth + 1) {
        size -= 0.5;
        el.style.fontSize = `${size}px`;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  });
  return (
    <span ref={ref} className={className}
      // 최소 크기까지 줄여도 안 들어가는 아주 긴 이름은 …로 마무리 (잘린 채 끝나지 않게)
      style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', ...style }}>
      {children}
    </span>
  );
}

/* ---------- textarea — 리사이즈 핸들 제거 + 내용 따라 자동 높이 ---------- */
export function KTextarea({ autoGrow = true, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { autoGrow?: boolean }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el || !autoGrow) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useEffect(fit, [props.value, autoGrow]);
  return (
    <textarea
      {...props}
      ref={ref}
      className={`k-textarea ${props.className ?? ''}`}
      onInput={e => { fit(); props.onInput?.(e); }}
    />
  );
}

/* ---------- 체크박스 (15px, 체크 정중앙) ---------- */
export function KCheck({ label, checked, onChange, ...rest }: {
  label?: React.ReactNode; checked: boolean; onChange: (v: boolean) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'checked'>) {
  return (
    <label className="k-check">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} {...rest} />
      <span className="box" />
      {label && <span>{label}</span>}
    </label>
  );
}

/* ---------- 라디오 (14px) ---------- */
export function KRadio({ label, value, current, onChange, name, disabled }: {
  label?: React.ReactNode; value: string; current: string; onChange: (v: string) => void; name?: string;
  disabled?: boolean;   // 선택 불가 표시 (v1.9 — 위젯 중복 추가 방지 등)
}) {
  return (
    <label className={`k-radio ${disabled ? 'dis' : ''}`}>
      <input type="radio" name={name} checked={current === value} disabled={disabled} onChange={() => onChange(value)} />
      <span className="dot" />
      {label && <span>{label}</span>}
    </label>
  );
}

/* ---------- 토글 스위치 ---------- */
export function KToggle({ label, checked, onChange, className }: {
  label?: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; className?: string;
}) {
  return (
    <label className={`k-toggle ${className ?? ''}`}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="tr" />
      {label && <span>{label}</span>}
    </label>
  );
}

/* ---------- 숫자 스테퍼 (스피너 대체) — 가운데 숫자는 직접 타이핑도 가능 (v1.9) ---------- */
export function KStep({ value, onChange, min = 0, max = 99, step = 1, suffix }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; suffix?: string;
}) {
  const set = (v: number) => onChange(Math.min(max, Math.max(min, v)));
  const [txt, setTxt] = useState<string | null>(null); // 편집 중에만 문자열 상태(비편집 시 value 표시)
  const commit = () => {
    if (txt !== null) {
      const n = parseFloat(txt.replace(/[^\d.\-]/g, ''));
      if (!Number.isNaN(n)) set(n);
    }
    setTxt(null);
  };
  return (
    <span className="k-step">
      <button type="button" onClick={() => set(value - step)}>−</button>
      <input
        value={txt ?? `${value}${suffix ?? ''}`}
        onFocus={e => { setTxt(String(value)); requestAnimationFrame(() => e.target.select()); }}
        onChange={e => setTxt(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { commit(); (e.target as HTMLInputElement).blur(); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); set(value + step); setTxt(null); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); set(value - step); setTxt(null); }
        }}
      />
      <button type="button" onClick={() => set(value + step)}>＋</button>
    </span>
  );
}

/* ---------- 커스텀 셀렉트 (화살표 수직 중앙 정렬, v1.9) ----------
   옵션 패널은 body 포털(fixed)로 띄움 — 패널의 overflow:hidden에 잘리지 않음 */
export interface KOption { value: string; label: React.ReactNode }
// 트리거 폭 상한 기본값 (v2.0 사용자 요청) — 개별 호출부가 maxWidth를 안 줘도 긴 이름(폰트 이름 등)
// 때문에 가로로 계속 늘어나지 않게. minWidth가 이보다 크면 그쪽을 따른다(더 좁게 만들지 않음)
const SELECT_MAX_W_DEFAULT = 210;

export function KSelect({ options, value, onChange, minWidth, maxWidth, placeholder }: {
  options: KOption[]; value: string; onChange: (v: string) => void;
  minWidth?: number;
  /** 긴 이름이 들어와도 이만큼까지만 넓어지고 나머지는 … 로 줄인다 (v2.0) — 목록은 필요한 만큼 넓게 뜬다.
   *  생략하면 SELECT_MAX_W_DEFAULT가 적용된다 — 넓혀야 할 이유가 있을 때만 명시로 늘릴 것 */
  maxWidth?: number;
  placeholder?: string;
}) {
  const effMaxWidth = maxWidth ?? Math.max(SELECT_MAX_W_DEFAULT, minWidth ?? 0);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const openAt = () => {
    const r = ref.current!.getBoundingClientRect();
    const belowSpace = window.innerHeight - r.bottom;
    const estH = Math.min(260, options.length * 34 + 10);
    const top = belowSpace < estH + 12 ? Math.max(8, r.top - estH - 6) : r.bottom + 6;
    setPos({ left: r.left, top, width: r.width });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !popRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // 위치 어긋남 방지 — 바깥 스크롤 시 닫음. 단 팝업 내부(긴 옵션 목록) 스크롤은 제외
    const onScroll = (e: Event) => { if (!popRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open]);

  const cur = options.find(o => o.value === value);
  return (
    <div ref={ref} className={`k-select ${open ? 'open' : ''}`}
      style={{ ...(minWidth ? { minWidth } : null), maxWidth: effMaxWidth }}>
      <div className="cur" onClick={() => (open ? setOpen(false) : openAt())}>{cur?.label ?? placeholder ?? '선택'}</div>
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div ref={popRef} className="k-sel-pop light-scroll"
          /* 트리거가 좁아도 목록은 이름이 다 보이게 — 화면 오른쪽을 넘지 않는 선에서 */
          style={{
            left: pos.left, top: pos.top, minWidth: pos.width,
            maxWidth: Math.max(pos.width, window.innerWidth - pos.left - 12),
          }}>
          {options.map(o => (
            <div key={o.value} className={o.value === value ? 'sel' : ''}
              onClick={() => { onChange(o.value); setOpen(false); }}>
              {o.label}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ---------- 날짜 입력 + 커스텀 달력 팝업 (7장 — 기본 브라우저 UI 미사용) ----------
   직접 타이핑(YYYY-MM-DD)도 가능, 포커스 시 달력이 떠서 클릭으로 선택 */
export function KDate({ value, onChange, placeholder = 'YYYY-MM-DD', style }: {
  value: string; onChange: (v: string) => void; placeholder?: string; style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [view, setView] = useState<{ y: number; m: number }>(() => {
    const m = /^(\d{4})-(\d{2})/.exec(value);
    const d = new Date();
    return m ? { y: +m[1], m: +m[2] - 1 } : { y: d.getFullYear(), m: d.getMonth() };
  });
  const ref = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  const openAt = () => {
    const r = ref.current!.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const top = below < 272 ? Math.max(8, r.top - 266) : r.bottom + 6;
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 256)), top });
    const m = /^(\d{4})-(\d{2})/.exec(value);
    if (m) setView({ y: +m[1], m: +m[2] - 1 });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !popRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onScroll = (e: Event) => { if (!popRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', () => setOpen(false));
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const firstDay = new Date(view.y, view.m, 1).getDay();
  const dim = new Date(view.y, view.m + 1, 0).getDate();
  const fmt = (d: number) => `${view.y}-${String(view.m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const mv = (d: number) => setView(v => {
    const nm = v.m + d;
    return { y: v.y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 };
  });

  return (
    <div ref={ref} style={{ display: 'inline-flex', ...style }}>
      <KInput value={value} placeholder={placeholder} style={{ width: '100%' }}
        onChange={e => onChange(e.target.value)} onFocus={openAt} />
      {open && pos && typeof document !== 'undefined' && createPortal(
        <div ref={popRef} className="k-cal" style={{ left: pos.left, top: pos.top }}
          onMouseDown={e => e.preventDefault() /* 인풋 포커스 유지 */}>
          <div className="hd">
            <button type="button" onClick={() => mv(-1)}>‹</button>
            <b>{view.y}년 {view.m + 1}월</b>
            <button type="button" onClick={() => mv(1)}>›</button>
          </div>
          <div className="wk">{['일', '월', '화', '수', '목', '금', '토'].map(w => <span key={w}>{w}</span>)}</div>
          <div className="days">
            {Array.from({ length: firstDay }, (_, i) => <span key={`e${i}`} />)}
            {Array.from({ length: dim }, (_, i) => {
              const ds = fmt(i + 1);
              return (
                <button type="button" key={ds}
                  className={`${ds === value ? 'sel' : ''} ${ds === todayStr ? 'today' : ''}`}
                  onClick={() => { onChange(ds); setOpen(false); }}>
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ---------- 접힘형 검색 (6.4) ---------- */
export function SearchBar({ placeholder = '검색', light, onSearch }: {
  placeholder?: string; light?: boolean; onSearch?: (q: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className={`searchbar ${light ? 'light' : ''} ${open ? 'open' : ''}`}>
      <input
        ref={inputRef}
        placeholder={placeholder}
        value={q}
        onChange={e => setQ(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') onSearch?.(q); }}
        onBlur={() => { if (!q) setOpen(false); }}
      />
      <button type="button" onClick={() => {
        if (!open) { setOpen(true); setTimeout(() => inputRef.current?.focus(), 60); }
        else onSearch?.(q);
      }}>
        {/* 돋보기 — 선 픽토그램 (글리프는 베이스라인이 낮아 중앙이 안 맞음) */}
        <svg viewBox="0 0 24 24" style={{ width: 15, height: 15, stroke: 'currentColor', fill: 'none', strokeWidth: 2.1, strokeLinecap: 'round', display: 'block' }}>
          <circle cx="10.5" cy="10.5" r="6.3" />
          <path d="m15.3 15.3 5.2 5.2" />
        </svg>
      </button>
    </div>
  );
}

/* ---------- 페이지네이션 (v1.6) ---------- */
export function Pager({ page, total, onChange }: { page: number; total: number; onChange: (p: number) => void }) {
  if (total <= 1) return null;
  const pages = Array.from({ length: total }, (_, i) => i + 1);
  return (
    <div className="pager">
      <button disabled={page <= 1} onClick={() => onChange(page - 1)}>‹</button>
      {pages.map(p => (
        <button key={p} className={p === page ? 'on' : ''} onClick={() => onChange(p)}>{p}</button>
      ))}
      <button disabled={page >= total} onClick={() => onChange(page + 1)}>›</button>
    </div>
  );
}

/* ---------- 툴팁 래퍼 (v1.9 커스텀 툴팁 — data-tip) ---------- */
export function Tip({ tip, dd, children, className }: {
  tip: string; dd?: boolean; children: React.ReactNode; className?: string;
}) {
  return (
    <span className={`tipd ${dd ? 'tipd-dd' : ''} ${className ?? ''}`} data-tip={tip}>
      {children}
    </span>
  );
}

/* ---------- 라벨 ---------- */
export function KLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  const id = useId();
  return <label className="k-label" htmlFor={htmlFor ?? id}>{children}</label>;
}
