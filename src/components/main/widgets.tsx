'use client';
// 메인 위젯 렌더러 (4.0) — DIARY/LATEST/UPCOMING 등은 해당 기능(2·3차) 전까지 데모 데이터
import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WidgetConf, useMainStore, WIDGET_META, decoSlides } from '@/lib/mainStore';
import { useAuth } from '@/lib/auth';
import { boardEntries, useMenuSettings, buildMenu, canViewHref } from '@/lib/menuStore';
import { sectionHref, MAIN_SEC, useSections, sectionMenuEntries } from '@/lib/sectionStore';
import { useCustomLinks, linkEntries } from '@/lib/linkStore';
import { useBoards } from '@/lib/boardStore';
import { Modal } from '@/components/ui/Modal';
import { KTextarea, KSelect, KStep, KCheck } from '@/components/ui/Kit';
import { ColorField } from '@/components/ui/ColorField';
import { useFonts } from '@/lib/fontStore';
import { BannerEditor, BannerSlide, DEMO_SLIDES, DdayEditor, DecoEditor, TodoEditor, TodoSetItem } from '@/components/main/widgetEditors';
import { CroppedBlobImg, CropValue } from '@/components/ui/CropEditor';
import { useLocalList } from '@/lib/postStore';
import { RoadItem, ROAD_SEED, BackupPost, BACKUP_SEED } from '@/lib/galleryStore';
import { DiaryPost, DIARY_SEED, Mood, MOOD_SEED, moodTint } from '@/lib/diaryStore';
import { useSched, eventColor } from '@/lib/schedStore';
import { StickyMemo, MEMO_SEED, MEMO_SIZE_W, useMemoSettings } from '@/lib/memoStore';
import { BlobImg, useBlobUrl } from '@/lib/blobStore';
import { normalizeInternalLink } from '@/lib/link';
import {
  Applicant, APPLY_SEED, useCommSettings, badgeStyle, maskName, inTrash,
} from '@/lib/commStore';

/* 편집모드 우클릭 「설정」 → 해당 위젯의 설정 모달 열기 (v1.9 사용자 확정 — 이벤트로 연결) */
function useEditEvent(id: string, onOpen: () => void) {
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent).detail?.id === id) onOpen(); };
    window.addEventListener('ohome-widget-edit', h);
    return () => window.removeEventListener('ohome-widget-edit', h);
  }, [id, onOpen]);
}

/* ---------- 슬라이드 배너 (고정 요소, 4.0) — 이미지·링크·간격·순서 관리 ---------- */

export function BannerWidget({ conf }: { conf: WidgetConf }) {
  const { isAdmin } = useAuth();
  const { editOn, updateWidget } = useMainStore();
  const router = useRouter();
  const [cur, setCur] = useState(0);
  const [mngOpen, setMngOpen] = useState(false);
  useEditEvent(conf.id, () => setMngOpen(true));   // 편집모드 우클릭 → 설정 (v1.9)
  const slides = ((conf.settings.slides as BannerSlide[]) ?? []).length > 0
    ? (conf.settings.slides as BannerSlide[]) : DEMO_SLIDES;
  const interval = (conf.settings.interval as number) ?? 4;

  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setCur(c => (c + 1) % slides.length), Math.max(2, interval) * 1000);
    return () => clearInterval(t);
  }, [slides.length, interval]);

  const s = slides[Math.min(cur, slides.length - 1)];
  const go = () => {
    if (editOn || !s.link) return;
    // 기존 저장분에 풀주소가 있어도 같은 사이트면 내부 이동으로 (v1.9)
    const l = normalizeInternalLink(s.link);
    if (/^https?:\/\//.test(l)) window.open(l, '_blank');
    else router.push(l);
  };

  return (
    <div className="banner" style={{ cursor: s.link && !editOn ? 'pointer' : undefined }} onClick={go}>
      {slides.map((sl, i) => (
        <div key={sl.id} className={`slide ${i === Math.min(cur, slides.length - 1) ? 'on' : ''}`}>
          {sl.imgId
            /* 업로드 이미지 — 원본 보존 + 위치 크롭만 적용 (배너 크기가 바뀌어도 비율 좌표로 재현) */
            ? <CroppedBlobImg fileRef={sl.imgId} crop={sl.crop} ph="" />
            : sl.img
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={sl.img} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div className={`ph ${sl.cls ?? ''}`} style={{ position: 'absolute', inset: 0 }}><span>SLIDE BANNER {String(i + 1).padStart(2, '0')}</span></div>}
        </div>
      ))}
      <div className="cap"><b>{s.cap}</b><span>{s.sub}</span></div>
      <div className="dots" onClick={e => e.stopPropagation()}>
        {slides.map((sl, i) => (
          <i key={sl.id} className={i === Math.min(cur, slides.length - 1) ? 'on' : ''} onClick={() => setCur(i)} />
        ))}
      </div>
      {/* 배너 관리 (관리자) — 배너에 마우스를 올렸을 때만 표시 */}
      {isAdmin && !editOn && (
        <button className="hv-actions"
          style={{
            position: 'absolute', top: 10, right: 10, zIndex: 4, fontSize: 10.5, letterSpacing: '.06em',
            padding: '5px 11px', borderRadius: 999, background: 'rgba(15,17,20,.55)', color: '#dfe2e7',
          }}
          onClick={e => { e.stopPropagation(); setMngOpen(true); }}>MANAGE</button>
      )}
      <div onClick={e => e.stopPropagation()}>
        <Modal open={mngOpen} onClose={() => setMngOpen(false)} title="슬라이드 배너 관리"
          desc="이미지 업로드 · 캡션 · 링크(내부 경로 또는 외부 URL) · ⠿ 드래그로 순서 · 원본은 잘리지 않음">
          {mngOpen && <BannerEditor conf={conf} onSaved={() => setMngOpen(false)} onClose={() => setMngOpen(false)} />}
        </Modal>
      </div>
    </div>
  );
}

/* ---------- 메뉴리스트 (모바일 전용, 8장) ---------- */
export function MenuListWidget() {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [menuSet, , menuLoaded] = useMenuSettings(); // 메뉴 관리 (5.2) 반영
  const { boards, loaded: boardsLoaded } = useBoards(); // 다중 게시판 (5.2)
  const { user: wUser, isAdmin: wIsAdmin } = useAuth(); // 공개범위 필터 (v1.9)
  const { map: wSecMap } = useSections();      // 여러 개로 만든 섹션 (v2.0 — 빠져 있었다)
  const { links: wLinks } = useCustomLinks();  // 커스텀 링크 (v2.0)
  return (
    <div className="panel menu-list wgt-menu">
      {(menuLoaded && boardsLoaded
        ? buildMenu(menuSet, [...boardEntries(boards), ...sectionMenuEntries(wSecMap), ...linkEntries(wLinks)], { loggedIn: !!wUser, isAdmin: wIsAdmin, id: wUser?.id })
        : []).map(m =>
        m.children ? (
          <div key={m.label} className={`mgrp ${open === m.label ? 'open' : ''}`}>
            <a onClick={() => setOpen(o => (o === m.label ? null : m.label))}>{m.label}</a>
            <div className="msub">
              {/* 커스텀 링크의 외부 주소는 새 창 (v2.0) — 상단 메뉴와 같은 규칙 */}
              {m.children.map(c => (
                <a key={c.href} onClick={() => (/^https?:\/\//.test(c.href) ? window.open(c.href, '_blank') : router.push(c.href))}>{c.label}</a>
              ))}
            </div>
          </div>
        ) : (
          <a key={m.label} onClick={() => (/^https?:\/\//.test(m.href!) ? window.open(m.href!, '_blank') : router.push(m.href!))}>{m.label}</a>
        )
      )}
    </div>
  );
}

/* ---------- MEMO — 관리자 클릭 시 큰 편집 모달 (4.12 v1.8) ---------- */
export function MemoWidget({ conf }: { conf: WidgetConf }) {
  const { isAdmin } = useAuth();
  const { editOn, updateWidget } = useMainStore();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const text = (conf.settings.text as string) ?? '';
  useEditEvent(conf.id, () => { setDraft(text); setOpen(true); });   // 편집모드 우클릭 → 설정 (v1.9)
  return (
    <div className="panel widget" style={{ cursor: isAdmin ? 'pointer' : undefined }}
      onClick={e => { if ((e.target as HTMLElement).closest('.modal-ov')) return; if (isAdmin && !editOn) { setDraft(text); setOpen(true); } }}>
      <h4>MEMO {isAdmin && <span className="more">관리 ›</span>}</h4>
      <p style={{ fontSize: 12, lineHeight: 1.7, color: '#3a3f47', whiteSpace: 'pre-line' }}>{text || '메모가 비어 있습니다'}</p>

      <Modal open={open} onClose={() => setOpen(false)} title="메모 관리" desc="메인 메모 위젯 내용 — 관리자 전용"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={() => {
            updateWidget(conf.id, { settings: { ...conf.settings, text: draft } }, { persist: true }); setOpen(false);
          }}>SAVE</button>
        </>}>
        <KTextarea value={draft} onChange={e => setDraft(e.target.value)} />
      </Modal>
    </div>
  );
}

/* ---------- DIARY (최근 일기 — 실데이터, 4.14) ---------- */
export function DiaryWidget() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [posts] = useLocalList<DiaryPost>('ohome.diary.v1', DIARY_SEED);
  const [moods] = useLocalList<Mood>('ohome.moods.v1', MOOD_SEED);
  // 메뉴에서 비공개로 둔 다이어리는 위젯에도 안 나온다 (v2.0 사용자 발견 — 위젯으로 새던 것)
  const [menuSet] = useMenuSettings();
  const viewer = { loggedIn: !!user, isAdmin, id: user?.id };
  const canSee = canViewHref(menuSet, '/diary', viewer);
  // 비공개 일기는 위젯에 절대 노출되지 않음 — 관리자여도 (4.14)
  const latest = posts
    .filter(p => canViewHref(menuSet, sectionHref('diary', p.secId ?? MAIN_SEC), viewer))
    .filter(p => p.visibility === 'public' || (p.visibility === 'member' && !!user))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  if (!canSee) return null;   // 메뉴가 비공개면 위젯 자체를 띄우지 않는다 (v2.0)
  return (
    <div className="panel widget" style={{ margin: 0 }}>
      <h4>DIARY <span className="more" onClick={() => router.push('/diary')}>더보기 ›</span></h4>
      {latest.map(p => {
        const m = moods.find(x => x.id === p.moodId);
        return (
          <div key={p.id} className="diary-mini" onClick={() => router.push(`/diary#${p.id}`)}>
            <div className="mood" style={{ background: moodTint(m?.color ?? '#888'), color: m?.color }}>{m?.icon ?? '·'}</div>
            <div className="t"><span className="tt">{p.title}</span> <small>{p.date.slice(5).replace('-', '.')}{m ? ` · ${m.name}` : ''}</small></div>
          </div>
        );
      })}
      {latest.length === 0 && <p className="hint">공개된 일기가 없습니다</p>}
    </div>
  );
}

/* ---------- LATEST (최신 그림 — 로드비 + 갤러리 통합 최신 3장, v1.9 사용자 피드백) ---------- */
export function LatestWidget() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [roads] = useLocalList<RoadItem>('ohome.road.v1', ROAD_SEED);
  const [backups] = useLocalList<BackupPost>('ohome.backup.v1', BACKUP_SEED);
  /* 메뉴에서 비공개로 둔 곳은 빼고 모은다 (v2.0 사용자 발견) — 로드비와 갤러리를 함께 보여 주는
     위젯이라 **소스별로** 따진다. 한쪽만 비공개면 나머지는 그대로 나온다. */
  const [menuSet] = useMenuSettings();
  const viewer = { loggedIn: !!user, isAdmin, id: user?.id };
  const seeRoad = canViewHref(menuSet, '/loadb', viewer);
  const seeGal = canViewHref(menuSet, '/gallery', viewer);
  const latest = [
    ...(seeRoad ? roads : []).filter(it => canViewHref(menuSet, sectionHref('roadview', it.secId ?? MAIN_SEC), viewer)).map(it => ({
      id: `r-${it.id}`, date: it.date, ref: it.imgId ?? it.imgUrl, ph: it.ph,
      href: '/loadb', tip: `로드비 · No.${String(it.no ?? 0).padStart(3, '0')}`,
    })),
    // 갤러리 — 전체공개 + 접기 없는 게시물의 대표(첫) 이미지
    ...(seeGal ? backups : [])
      .filter(p => canViewHref(menuSet, sectionHref('gallery', p.secId ?? MAIN_SEC), viewer))
      .filter(p => p.visibility === 'public' && !p.fold).map(p => ({
      id: `b-${p.id}`, date: p.date, ref: p.images[0], ph: p.phList[0] ?? 'cool',
      href: `/gallery/${p.id}`, tip: `갤러리 · ${p.title}`,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const phFallback = ['cool', 'warm', 'red'];
  if (!seeRoad && !seeGal) return null;   // 둘 다 비공개면 위젯 자체를 띄우지 않는다 (v2.0)
  return (
    <div className="panel widget" style={{ margin: 0 }}>
      <h4>LATEST <span className="more" onClick={() => router.push('/gallery')}>더보기 ›</span></h4>
      <div className="latest-grid">
        {[0, 1, 2].map(i => {
          const it = latest[i];
          return (
            <div key={it?.id ?? i} style={{ aspectRatio: '1', borderRadius: 9, overflow: 'hidden', position: 'relative', cursor: it ? 'pointer' : undefined }}
              onClick={() => { if (it) router.push(it.href); }} data-tip={it?.tip}>
              <BlobImg fileRef={it?.ref} ph={it?.ph || phFallback[i]} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- D-DAY (4.12 — 스케줄러 연동은 3차) ---------- */
interface DdayItem { title: string; date: string; plusOne?: boolean }
function ddayLabel(date: string, plusOne?: boolean): { label: string; passed: boolean; near: boolean } {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(date + 'T00:00:00');
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  // +1 Day: 시작일을 1일로 세는 기념일 카운트 (커플 기념일 등) — 당일 = D+1
  if (plusOne && diff <= 0) return { label: `D+${-diff + 1}`, passed: true, near: false };
  if (diff === 0) return { label: 'D-DAY', passed: false, near: true };
  return diff > 0
    ? { label: `D-${diff}`, passed: false, near: diff <= 7 }
    : { label: `D+${-diff}`, passed: true, near: false };
}

export function DdayWidget({ conf }: { conf: WidgetConf }) {
  const { isAdmin } = useAuth();
  const { editOn } = useMainStore();
  const { familyOf } = useFonts();
  const [open, setOpen] = useState(false);
  const items = (conf.settings.items as DdayItem[]) ?? [];
  // 날짜 표시(D-2·D+3 등) 폰트·색 — 미지정이면 기존 세리프 기본값 그대로 (v2.0 사용자 요청)
  // 'serif'는 폰트 라이브러리의 실제(잠금) 폰트라 편집기의 기본 옵션과 값이 늘 일치한다
  const dFontId = (conf.settings.fontId as string | undefined) ?? 'serif';
  const dColor = conf.settings.color as string | undefined;
  useEditEvent(conf.id, () => setOpen(true));   // 편집모드 우클릭 → 설정 (v1.9)
  return (
    <div className="panel widget" style={{ cursor: isAdmin ? 'pointer' : undefined }}
      onClick={e => { if ((e.target as HTMLElement).closest('.modal-ov')) return; if (isAdmin && !editOn) setOpen(true); }}>
      <h4>D-DAY {isAdmin && <span className="more">관리 ›</span>}</h4>
      {items.map(it => {
        const d = ddayLabel(it.date, it.plusOne);
        return (
          <div className="dday-row" key={it.title}>
            <span>{it.title}</span>
            <b className={d.near && !dColor ? 'd-red' : ''}
              style={{ fontFamily: familyOf(dFontId), color: dColor }}>{d.label}</b>
          </div>
        );
      })}
      {items.length === 0 && <p className="hint">등록된 D-day가 없습니다</p>}

      <Modal open={open} onClose={() => setOpen(false)} title="D-day 관리"
        desc="추가 · 수정 · 삭제 · ⠿ 드래그로 순서 조정 — 환경설정 「위젯」에서도 관리 가능"
        actions={<button className="btn btn-dark" onClick={() => setOpen(false)}>CLOSE</button>}>
        {open && <DdayEditor conf={conf} />}
      </Modal>
    </div>
  );
}

/* ---------- TO-DO — 관리자 클릭 시 관리 모달 (4.12 확정) ---------- */
export function TodoWidget({ conf }: { conf: WidgetConf }) {
  const { isAdmin } = useAuth();
  const { editOn, updateWidget } = useMainStore();
  const [open, setOpen] = useState(false);
  const items = (conf.settings.items as TodoSetItem[]) ?? [];
  useEditEvent(conf.id, () => setOpen(true));   // 편집모드 우클릭 → 설정 (v1.9)

  const setItems = (next: TodoSetItem[]) => {
    updateWidget(conf.id, { settings: { ...conf.settings, items: next } }, { persist: true });
  };

  return (
    <div className="panel widget" style={{ cursor: isAdmin ? 'pointer' : undefined }}
      onClick={e => {
        if (!isAdmin || editOn) return;
        if ((e.target as HTMLElement).closest('.k-check') || (e.target as HTMLElement).closest('.modal-ov')) return;
        setOpen(true);
      }}>
      <h4>TO-DO {isAdmin && <span className="more">관리 ›</span>}</h4>
      {items.map((it, i) => (
        <label className={`todo-row k-check ${it.done ? 'done' : ''}`} key={`${it.text}-${i}`}
          style={!isAdmin ? { pointerEvents: 'none' } : undefined}>
          <input type="checkbox" checked={it.done}
            onChange={ev => setItems(items.map((x, j) => (j === i ? { ...x, done: ev.target.checked } : x)))} />
          <span className="box" /><span>{it.text}</span>
        </label>
      ))}
      {items.length === 0 && <p className="hint">할 일이 없습니다</p>}

      <Modal open={open} onClose={() => setOpen(false)} title="투두 관리"
        desc="추가 · 체크 · 삭제 · ⠿ 드래그로 순서 조정 — 환경설정 「위젯」에서도 관리 가능">
        {open && <TodoEditor conf={conf} />}
        <div className="modal-actions">
          <button className="btn btn-dark" onClick={() => setOpen(false)}>CLOSE</button>
        </div>
      </Modal>
    </div>
  );
}

/* ---------- UPCOMING (다가오는 일정 — 스케줄러 실데이터, 4.12) ---------- */
export function UpcomingWidget() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { st } = useSched();   // 인자 없이 = 모든 스케줄러 (v2.0 — 어느 것이든 다가오는 일정은 다가온다)
  /* 메뉴에서 비공개로 둔 스케줄러는 위젯에도 안 나온다 (v2.0).
     스케줄러를 여러 개 만들 수 있으므로 **일정마다 그 스케줄러 기준**으로 따지고,
     볼 수 있는 스케줄러가 하나도 없을 때만 위젯을 통째로 감춘다. */
  const [menuSet] = useMenuSettings();
  const { list } = useSections();
  const viewer = { loggedIn: !!user, isAdmin, id: user?.id };
  const seeSec = (secId?: string) => canViewHref(menuSet, sectionHref('sched', secId ?? MAIN_SEC), viewer);
  const canSee = list('sched').some(s => seeSec(s.id));
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  // 오늘 포함 이후 일정 — 매년 반복은 올해 날짜로 환산해 가장 가까운 3개
  const upcoming = st.events
    .filter(e => seeSec(e.secId))
    .filter(e => isAdmin || e.visibility === 'public' || (e.visibility === 'member' && !!user))
    .map(e => {
      let d = e.start;
      if (e.repeat === 'yearly') {
        const thisYear = `${today.getFullYear()}-${e.start.slice(5)}`;
        d = thisYear >= todayStr ? thisYear : `${today.getFullYear() + 1}-${e.start.slice(5)}`;
      }
      return { e, d };
    })
    .filter(x => x.d >= todayStr)
    .sort((a, b) => a.d.localeCompare(b.d))
    .slice(0, 3);
  if (!canSee) return null;   // 메뉴가 비공개면 위젯 자체를 띄우지 않는다 (v2.0)
  return (
    <div className="panel widget" style={{ cursor: 'var(--cur-pointer,pointer)' }} onClick={() => router.push('/cal')}>
      <h4>UPCOMING <span className="more">더보기 ›</span></h4>
      {upcoming.map(({ e, d }) => (
        <div key={e.id} className="dday-row">
          <span>{d.slice(5).replace('-', '.')} · {e.title}</span>
          <b style={{ fontSize: 11, color: eventColor(e, st.cats) }}>●</b>
        </div>
      ))}
      {upcoming.length === 0 && <p className="hint">다가오는 일정이 없습니다</p>}
    </div>
  );
}

/* ---------- 자유 텍스트 (v1.9 개편 — 사용자 확정) ----------
   패널 없이 문구만 — 폰트·크기·색·정렬을 지정해 장식처럼 아무 곳에나 배치(위젯 드래그·크기 공통).
   편집은 편집모드에서만 — 우클릭 「설정」 (v1.9 사용자 확정: 평상시 클릭 편집 제거). */
export function FreeTextWidget({ conf }: { conf: WidgetConf }) {
  const { isAdmin } = useAuth();
  const { updateWidget } = useMainStore();
  const { fonts, familyOf } = useFonts();
  const [open, setOpen] = useState(false);
  const s = conf.settings as { text?: string; fontId?: string; size?: number; color?: string; align?: 'left' | 'center' | 'right'; bold?: boolean };
  const [draft, setDraft] = useState(s);
  useEditEvent(conf.id, () => { setDraft({ ...s }); setOpen(true); });
  return (
    <div>
      <p style={{
        fontFamily: familyOf(s.fontId) ?? 'var(--sans)',
        fontSize: s.size ?? 15, color: s.color ?? 'var(--page-desc)',
        textAlign: s.align ?? 'left', fontWeight: s.bold ? 700 : 400,
        lineHeight: 1.7, whiteSpace: 'pre-line', margin: 0, wordBreak: 'keep-all',
      }}>
        {s.text || (isAdmin ? '자유 텍스트 — 편집모드에서 우클릭 → 설정' : '')}
      </p>
      <Modal open={open} onClose={() => setOpen(false)} title="자유 텍스트"
        desc="패널 없이 문구만 표시 — 폰트·크기·색·정렬 지정, 배치는 편집모드에서 드래그"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={() => {
            updateWidget(conf.id, { settings: { ...conf.settings, ...draft } }, { persist: true }); setOpen(false);
          }}>SAVE</button>
        </>}>
        <div style={{ display: 'grid', gap: 10 }}>
          <KTextarea value={draft.text ?? ''} onChange={e => setDraft(d => ({ ...d, text: e.target.value }))} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <KSelect minWidth={170} value={draft.fontId ?? 'default'}
              onChange={v => setDraft(d => ({ ...d, fontId: v }))}
              options={fonts.map(f => ({ value: f.id, label: <span style={{ fontFamily: familyOf(f.id) }}>{f.name}</span> }))} />
            <span className="cp-lb">크기</span>
            <KStep value={draft.size ?? 15} min={10} max={64} step={1} suffix="px"
              onChange={v => setDraft(d => ({ ...d, size: v }))} />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="cp-lb">글씨색</span>
            <ColorField value={draft.color ?? '#5d636d'} onChange={hex => setDraft(d => ({ ...d, color: hex }))} />
            <div className="mini-seg">
              {(['left', 'center', 'right'] as const).map(a => (
                <button key={a} className={(draft.align ?? 'left') === a ? 'on' : ''}
                  onClick={() => setDraft(d => ({ ...d, align: a }))}>
                  {a === 'left' ? '왼쪽' : a === 'center' ? '가운데' : '오른쪽'}
                </button>
              ))}
            </div>
            <KCheck label="굵게" checked={!!draft.bold} onChange={v => setDraft(d => ({ ...d, bold: v }))} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ---------- 장식 이미지 — 패널 없이 이미지만 (장식용) ---------- */
/** 비율 유지(안 잘림) 렌더 — cover(크롭)와 선택제 (v1.9 사용자 요청)
 *  둥근 모서리는 위젯 박스가 아니라 **이미지 크기**에 맞춰 적용 (v1.9 사용자 피드백 — 여백까지 둥글면 티가 안 남) */
function ContainImg({ fileRef, rounded, onActivate }: {
  fileRef: string; rounded: boolean; onActivate?: () => void;
}) {
  const url = useBlobUrl(fileRef);
  const imgRef = useRef<HTMLImageElement>(null);
  // 투명 픽셀 판독용 캔버스 — 이미지마다 한 번만 그린다
  const cacheRef = useRef<{ url: string; c: HTMLCanvasElement } | null>(null);
  if (!url) return null;
  /* 클릭이 실제 그림 위인지 (v2.0 사용자 요청 — 「투명 영역은 클릭 영역이 아니게」).
     장식 이미지는 배경이 투명한 PNG가 많다 — 빈 데를 눌러도 링크로 가면 이상하다.
     픽셀의 투명도를 읽어 거의 투명하면 클릭으로 치지 않는다. 외부 주소 이미지처럼
     판독이 막히면(캔버스 보안) 이미지 사각형 기준으로만 제한한다. */
  const hitTest = (e: React.MouseEvent): boolean => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return true;
    const r = img.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * img.naturalWidth);
    const y = Math.floor((e.clientY - r.top) / r.height * img.naturalHeight);
    try {
      if (!cacheRef.current || cacheRef.current.url !== url) {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0);
        cacheRef.current = { url, c };
      }
      return cacheRef.current.c.getContext('2d')!.getImageData(x, y, 1, 1).data[3] > 8;
    } catch { return true; }
  };
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imgRef} src={url} alt="" draggable={false}
        onClick={e => { if (onActivate && hitTest(e)) onActivate(); }}
        style={{
          maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', display: 'block',
          borderRadius: rounded ? 'var(--radius)' : 0,
          cursor: onActivate ? 'var(--cur-pointer,pointer)' : undefined,
        }} />
    </div>
  );
}

export function DecoWidget({ conf }: { conf: WidgetConf }) {
  const { isAdmin } = useAuth();
  const { editOn } = useMainStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rounded = (conf.settings.rounded as boolean) ?? true;
  const fit = (conf.settings.fit as 'cover' | 'contain') ?? 'cover';   // 꽉 채움(잘림) / 비율 유지 (v1.9)
  // 여러 장 슬라이드 (v2.0) — 한 장만 넣던 옛 저장분도 같은 목록으로 읽힌다
  const slides = decoSlides(conf.settings);
  const sec = (conf.settings.interval as number) ?? 5;
  const [idx, setIdx] = useState(0);
  const cur = slides[Math.min(idx, slides.length - 1)];
  // 자동 넘김 — 편집 중이거나 설정 모달이 열려 있으면 멈춘다 (위치를 맞추는 중이라)
  useEffect(() => {
    if (slides.length < 2 || editOn || open) return;
    const t = setInterval(() => setIdx(i => (i + 1) % slides.length), Math.max(1, sec) * 1000);
    return () => clearInterval(t);
  }, [slides.length, sec, editOn, open]);
  useEffect(() => { if (idx >= slides.length) setIdx(0); }, [slides.length, idx]);
  useEditEvent(conf.id, () => setOpen(true));   // 편집은 편집모드 우클릭 「설정」 전용 (v1.9 사용자 확정)
  // 링크 이동 (v1.9 — 이미지+링크를 위젯 테두리 없이) — 링크는 장면마다 따로 (v2.0)
  const onBody = () => {
    if (editOn) return;
    if (cur?.link) {
      const l = normalizeInternalLink(cur.link);
      if (/^https?:\/\//.test(l)) window.open(l, '_blank');
      else router.push(l);
    }
  };
  // 직접 정한 크기 (v2.0 사용자 요청) — 비우면 지금까지처럼 자리(그리드 칸)를 따라간다
  const wPx = conf.settings.wPx as number | undefined;
  const hPx = conf.settings.hPx as number | undefined;
  const canGo = !editOn && !!cur?.link;
  return (
    <div className="deco-wgt"
      style={{
        position: 'relative', overflow: 'hidden',
        width: wPx ? `${wPx}px` : '100%', maxWidth: '100%',
        height: hPx ? `${hPx}px` : '100%', minHeight: hPx ? undefined : 80,
        margin: wPx ? '0 auto' : undefined,
        aspectRatio: conf.h == null && !hPx ? '1/1' : undefined, // 크기 동결 전 기본 정사각
        borderRadius: rounded ? 'var(--radius)' : 0,
      }}>
      {/* 클릭은 이미지 위에서만 (v2.0 사용자 요청) — 예전에는 위젯 칸 전체가 눌렸다.
          꽉 채움은 이미지가 칸을 채우므로 그대로 칸 전체, 비율 유지는 그림 픽셀 기준(투명 제외) */}
      {cur
        ? (fit === 'contain'
          ? <ContainImg key={cur.id} fileRef={cur.imgId} rounded={rounded} onActivate={canGo ? onBody : undefined} />
          : (
            <div style={{ position: 'absolute', inset: 0, cursor: canGo ? 'var(--cur-pointer,pointer)' : undefined }}
              onClick={canGo ? onBody : undefined}>
              <CroppedBlobImg key={cur.id} fileRef={cur.imgId} crop={cur.crop} ph="" />
            </div>
          ))
        : (
          <div className="ph" style={{ position: 'absolute', inset: 0 }}>
            <span style={{ fontSize: 10 }}>{isAdmin ? 'DECO — 편집모드에서 우클릭 → 설정' : 'DECO'}</span>
          </div>
        )}
      {/* 여러 장일 때만 지금 몇 번째인지 표시 — 눌러서 바로 넘길 수도 있다 (v2.0) */}
      {slides.length > 1 && !editOn && (
        <div className="deco-dots" onClick={e => e.stopPropagation()}>
          {slides.map((sl, i) => (
            <i key={sl.id} className={i === idx ? 'on' : ''} onClick={() => setIdx(i)} />
          ))}
        </div>
      )}
      <div onClick={e => e.stopPropagation()}>
        <Modal open={open} onClose={() => setOpen(false)} small title="장식 이미지"
          desc="여러 장을 넣으면 순서대로 넘어갑니다 — 위치 크롭은 현재 위젯 비율 기준, 원본은 잘리지 않음">
          {open && <DecoEditor conf={conf} onClose={() => setOpen(false)} />}
        </Modal>
      </div>
    </div>
  );
}

/* ---------- 스티커 메모 미니보드 (4.6) — 읽기 전용 축소 보드, 클릭 시 /memo ---------- */
export function MemoBoardWidget() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [memos] = useLocalList<StickyMemo>('ohome.memo.v1', MEMO_SEED);
  const [settings] = useMemoSettings();
  // 메뉴에서 비공개로 둔 메모장은 위젯에도 안 나온다 (v2.0)
  const [menuSet] = useMenuSettings();
  if (!canViewHref(menuSet, '/memo', { loggedIn: !!user, isAdmin, id: user?.id })) return null;
  return (
    <div className="panel widget" style={{ display: 'flex', flexDirection: 'column' }}>
      <h4>STICKY</h4>
      <div className="memo-mini" onClick={() => router.push('/memo')}>
        {memos.map(m => (
          <div key={m.id} className="postit"
            style={{
              left: `${m.x}%`, top: `${m.y}%`, zIndex: m.z,
              transform: `rotate(${m.rot}deg)`, background: m.color,
              width: Math.round(MEMO_SIZE_W[m.size] * 0.53),
            }}>
            {settings.showAuthor && <b>{m.author}</b>}
            {m.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- 커미션 신청자 (v2.0 사용자 요청) ----------
   다가오는 마감이 빠른 순으로. 몇 명까지 볼지는 설정에서 (기본 5명).
   이름은 신청자 리스트와 **같은 규칙**으로 가린다 — 관리자만 전체, 나머지는 앞 몇 글자만.
   마감이 없는 신청은 「다가오는 마감」이 아니므로 넣지 않는다. 지난 마감도 뺀다. */
export function ApplyWidget({ conf }: { conf: WidgetConf }) {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { editOn, updateWidget } = useMainStore();
  // 메뉴에서 비공개로 둔 신청자 리스트는 위젯에도 안 나온다 (v2.0)
  const [menuSet] = useMenuSettings();
  const [settings] = useCommSettings();
  const [apps] = useLocalList<Applicant>('ohome.commapply.v1', APPLY_SEED);
  const [open, setOpen] = useState(false);
  useEditEvent(conf.id, () => setOpen(true));

  const max = Math.max(1, Math.min(20, (conf.settings.count as number) ?? 5));
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const shown = apps
    .filter(a => !inTrash(a) && !!a.deadline && a.deadline >= todayStr)
    .sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? ''))
    .slice(0, max);

  /** 남은 날 — 오늘이면 D-DAY */
  const dleft = (d: string) => {
    const ms = Date.parse(`${d}T00:00:00`) - Date.parse(`${todayStr}T00:00:00`);
    const n = Math.round(ms / 86400000);
    return n === 0 ? 'D-DAY' : `D-${n}`;
  };

  // 훅을 모두 부른 뒤에 판정한다 — 중간에서 빠지면 렌더마다 훅 수가 달라진다
  if (!canViewHref(menuSet, '/comm-apply', { loggedIn: !!user, isAdmin, id: user?.id })) return null;

  return (
    /* 누르면 관리자든 아니든 신청자 페이지로 간다 (v2.0 사용자 요청).
       설정은 편집모드에서 우클릭 > 설정으로만 — 목록을 보러 눌렀는데 관리 창이 뜨면 안 된다 */
    <div className="panel widget" style={{ cursor: 'var(--cur-pointer,pointer)' }}
      onClick={e => {
        if ((e.target as HTMLElement).closest('.modal-ov')) return;
        if (editOn) return;   // 편집모드에서는 배치·우클릭 메뉴가 우선
        router.push('/comm-apply');
      }}>
      <h4>COMMISSION <span className="more" onClick={e => { e.stopPropagation(); router.push('/comm-apply'); }}>전체 ›</span></h4>
      {shown.map(a => {
        const badge = settings.applyBadges.find(b => b.id === a.badgeId);
        return (
          <div className="apply-row" key={a.id}>
            <b>{dleft(a.deadline!)}</b>
            <span>{isAdmin ? a.name : maskName(a.name, a.nameOpen ?? 1)}</span>
            {badge && <i style={badgeStyle(badge, settings.badgeShape)}>{badge.label}</i>}
          </div>
        );
      })}
      {shown.length === 0 && <p className="hint">다가오는 마감이 없습니다</p>}

      <Modal open={open} onClose={() => setOpen(false)} small title="커미션 신청자 위젯"
        desc="마감이 가까운 순으로 보여 줍니다 — 마감일이 없거나 지난 신청은 빼고 셉니다"
        actions={<button className="btn btn-dark" onClick={() => setOpen(false)}>확인</button>}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="cp-lb">몇 명까지</span>
          <KStep value={(conf.settings.count as number) ?? 5} min={1} max={20} suffix="명"
            onChange={v => updateWidget(conf.id, { settings: { ...conf.settings, count: v } }, { persist: true })} />
        </div>
      </Modal>
    </div>
  );
}

/* ---------- 타입 → 렌더러 ---------- */
export function renderWidget(conf: WidgetConf) {
  switch (conf.type) {
    case 'banner': return <BannerWidget conf={conf} />;
    case 'menu': return <MenuListWidget />;
    case 'memo': return <MemoWidget conf={conf} />;
    case 'diary': return <DiaryWidget />;
    case 'latest': return <LatestWidget />;
    case 'dday': return <DdayWidget conf={conf} />;
    case 'todo': return <TodoWidget conf={conf} />;
    case 'upcoming': return <UpcomingWidget />;
    case 'freetext': return <FreeTextWidget conf={conf} />;
    case 'deco': return <DecoWidget conf={conf} />;
    case 'memoboard': return <MemoBoardWidget />;
    case 'apply': return <ApplyWidget conf={conf} />;
    default: return <div className="panel widget"><h4>{WIDGET_META[conf.type]?.title ?? conf.type}</h4></div>;
  }
}
