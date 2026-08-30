'use client';
// 위젯 설정 공용 에디터 (5장 「위젯」 카테고리 · 메인 위젯 관리 모달 공유)
// 같은 mainStore를 갱신하므로 메인에서 바꾸든 환경설정에서 바꾸든 즉시 서로 반영됨
import React, { useEffect, useState } from 'react';
import { WidgetConf, useMainStore, decoSlides, DecoSlide } from '@/lib/mainStore';
import { KInput, KTextarea, KCheck, KStep, KDate } from '@/components/ui/Kit';
import { DragList } from '@/components/ui/DragList';
import { CropEditor, CropValue, CropImg, CroppedBlobImg } from '@/components/ui/CropEditor';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { useToast } from '@/components/ui/Toast';
import { useConfirmDelete } from '@/components/ui/Modal';
import { normalizeInternalLink } from '@/lib/link';
import { KSelect } from '@/components/ui/Kit';
import { ColorField } from '@/components/ui/ColorField';
import { useFonts } from '@/lib/fontStore';

/* ---------- MEMO · 자유 텍스트 — settings.text (+ freetext: 폰트·크기·색·정렬, v1.9) ---------- */
export function TextSettingEditor({ conf }: { conf: WidgetConf }) {
  const { updateWidget } = useMainStore();
  const { fonts, familyOf } = useFonts();
  const isFree = conf.type === 'freetext';
  const s = conf.settings as { text?: string; fontId?: string; size?: number; color?: string; align?: 'left' | 'center' | 'right'; bold?: boolean };
  const [draft, setDraft] = useState(s);
  // 다른 곳(메인 모달 등)에서 저장되면 반영
  useEffect(() => setDraft({ ...s }), [conf.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(draft) !== JSON.stringify(s);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <KTextarea value={draft.text ?? ''} onChange={e => setDraft(d => ({ ...d, text: e.target.value }))} />
      {isFree && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <KSelect minWidth={170} value={draft.fontId ?? 'default'}
              onChange={v => setDraft(d => ({ ...d, fontId: v }))}
              options={fonts.map(f => ({ value: f.id, label: <span style={{ fontFamily: familyOf(f.id) }}>{f.name}</span> }))} />
            <span className="cp-lb">크기</span>
            <KStep value={draft.size ?? 15} min={10} max={64} step={1} suffix="px"
              onChange={v => setDraft(d => ({ ...d, size: v }))} />
            <span className="cp-lb">글씨색</span>
            <ColorField value={draft.color ?? '#5d636d'} onChange={hex => setDraft(d => ({ ...d, color: hex }))} />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
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
        </>
      )}
      <button className="btn btn-dark" style={{ justifySelf: 'end', opacity: dirty ? 1 : 0.5 }} disabled={!dirty}
        onClick={() => updateWidget(conf.id, { settings: { ...conf.settings, ...draft } }, { persist: true })}>
        저장
      </button>
    </div>
  );
}

/* ---------- D-DAY — settings.items: {title, date, plusOne?}[] ---------- */
// plusOne: 시작일을 1일로 세는 기념일 카운트 (+1 Day — 커플 기념일 등, 당일 = D+1)
export interface DdaySetItem { title: string; date: string; plusOne?: boolean }

export function DdayEditor({ conf }: { conf: WidgetConf }) {
  const { updateWidget } = useMainStore();
  const toast = useToast();
  const { fonts, familyOf } = useFonts();
  const items = (conf.settings.items as DdaySetItem[]) ?? [];
  // 'default'는 폰트 라이브러리의 실제 폰트 id(기본 프리텐다드)라 가짜 센티널로 못 쓴다 —
  // 미지정이면 이미 있는 잠금 폰트 'serif'(기본 세리프)를 그대로 기본값으로 (v2.0 사용자 발견)
  const fontId = (conf.settings.fontId as string | undefined) ?? 'serif';
  const color = conf.settings.color as string | undefined;
  const set = (next: DdaySetItem[]) =>
    updateWidget(conf.id, { settings: { ...conf.settings, items: next } }, { persist: true });
  const setMeta = (patch: Record<string, unknown>) =>
    updateWidget(conf.id, { settings: { ...conf.settings, ...patch } }, { persist: true });
  const [nt, setNt] = useState('');
  const [nd, setNd] = useState('');

  const add = () => {
    if (!nt.trim()) { toast('제목을 입력해 주세요'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nd)) { toast('날짜를 YYYY-MM-DD 형식으로 입력해 주세요'); return; }
    set([...items, { title: nt.trim(), date: nd }]);
    setNt(''); setNd('');
  };

  return (
    <div>
      <DragList
        items={items}
        keyOf={it => `${it.title}|${it.date}`}
        onReorder={set}
        render={(it, i) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px dashed var(--line)', width: '100%' }}>
            <span className="drag-h">⠿</span>
            <KInput value={it.title} placeholder="제목"
              onChange={e => set(items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
            <KDate value={it.date} style={{ maxWidth: 122 }}
              onChange={v => set(items.map((x, j) => (j === i ? { ...x, date: v } : x)))} />
            <span data-tip="시작일을 1일로 세는 기념일 카운트 — 당일이 D+1 (커플 기념일 등)">
              <KCheck label="+1D" checked={!!it.plusOne}
                onChange={v => set(items.map((x, j) => (j === i ? { ...x, plusOne: v } : x)))} />
            </span>
            <button className="btn btn-ghost" style={{ height: 24, padding: '0 11px', fontSize: 10.5, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}
              onClick={() => set(items.filter((_, j) => j !== i))}>DELETE</button>
          </div>
        )}
      />
      {items.length === 0 && <p className="hint">등록된 D-day가 없습니다</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <KInput placeholder="제목" value={nt} onChange={e => setNt(e.target.value)} />
        <KDate value={nd} style={{ maxWidth: 122 }} onChange={setNd} />
        <button className="btn btn-dark" style={{ whiteSpace: 'nowrap' }} onClick={add}>＋ ADD</button>
      </div>
      <p className="hint" style={{ marginTop: 6 }}>+1D — 시작일을 1일로 세는 기념일 카운트 (당일 = D+1)</p>
      {/* 날짜 표시(D-2·D+3 등) 폰트·색 (v2.0 사용자 요청) — 제목 글씨는 본문 폰트를 그대로 따라간다 */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--line)' }}>
        <span className="cp-lb">날짜표시 폰트</span>
        <KSelect minWidth={150} value={fontId}
          onChange={v => setMeta({ fontId: v })}
          options={fonts.map(f => ({ value: f.id, label: <span style={{ fontFamily: familyOf(f.id) }}>{f.name}</span> }))} />
        <span className="cp-lb">색</span>
        <ColorField value={color ?? '#e6ebf2'} onChange={hex => setMeta({ color: hex })} />
      </div>
    </div>
  );
}

/* ---------- TO-DO — settings.items: {text, done}[] ---------- */
export interface TodoSetItem { text: string; done: boolean }

export function TodoEditor({ conf }: { conf: WidgetConf }) {
  const { updateWidget } = useMainStore();
  const [newText, setNewText] = useState('');
  const items = (conf.settings.items as TodoSetItem[]) ?? [];
  const set = (next: TodoSetItem[]) =>
    updateWidget(conf.id, { settings: { ...conf.settings, items: next } }, { persist: true });

  const add = () => {
    if (!newText.trim()) return;
    set([...items, { text: newText.trim(), done: false }]);
    setNewText('');
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <KInput placeholder="새 할 일" value={newText} onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); }} />
        <button className="btn btn-dark" style={{ whiteSpace: 'nowrap' }} onClick={add}>ADD</button>
      </div>
      <DragList
        items={items}
        keyOf={it => `${it.text}`}
        onReorder={set}
        render={(it, i) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px', borderBottom: '1px dashed var(--line)' }}>
            <span className="drag-h">⠿</span>
            <KCheck checked={it.done} onChange={v => set(items.map((x, j) => (j === i ? { ...x, done: v } : x)))} />
            <span style={{ fontSize: 13, textDecoration: it.done ? 'line-through' : undefined, color: it.done ? 'var(--faint)' : undefined }}>{it.text}</span>
            {/* 높이 24px 짝수 고정 + flex 세로 중앙 (v1.9 사용자 피드백) */}
            <button className="btn btn-ghost" style={{ marginLeft: 'auto', height: 24, padding: '0 11px', fontSize: 10.5, display: 'inline-flex', alignItems: 'center' }}
              onClick={() => set(items.filter((_, j) => j !== i))}>DELETE</button>
          </div>
        )}
      />
      {items.length === 0 && <p className="hint">할 일이 없습니다</p>}
    </div>
  );
}

/* (v1.9) 이미지 위젯은 장식 이미지(deco — 업로드·크롭·링크)로 일원화되어 제거됨 */

/* ---------- 장식 이미지 — settings: slides[] / interval / rounded / fit ----------
   패널 없이 이미지만 박아넣는 장식용. 원본 보존 + 위치 크롭(현재 위젯 비율 기준).
   여러 장을 넣으면 순서대로 넘어가는 슬라이드가 된다 (v2.0) — 링크는 장면마다 따로 걸 수 있다. */

/** 장면 한 장의 위치 크롭 — 저장된 원본을 불러와 현재 위젯 비율로 맞춘다 */
function DecoCrop({ sl, ratio, onClose, onApply }: {
  sl: DecoSlide; ratio: number; onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const src = useBlobUrl(sl.imgId);
  if (!src) return null;
  return <CropEditor open src={src} aspect={ratio} aspectLabel="현재 위젯 비율" initial={sl.crop} onClose={onClose} onApply={onApply} />;
}

export function DecoEditor({ conf, onClose }: { conf: WidgetConf; onClose?: () => void }) {
  const { updateWidget } = useMainStore();
  const toast = useToast();
  const del = useConfirmDelete();   // 삭제는 언제나 경고 모달 (v1.9)
  const [cropFor, setCropFor] = useState<string | null>(null);   // 위치 조정 중인 장면 id
  const [swapFor, setSwapFor] = useState<string | null>(null);   // 이미지 교체 대상 (null이면 새로 추가)
  const rounded = (conf.settings.rounded as boolean) ?? true;
  const fit = (conf.settings.fit as 'cover' | 'contain') ?? 'cover';   // 꽉 채움 / 비율 유지 (v1.9 사용자 요청)
  const sec = (conf.settings.interval as number) ?? 5;
  const ratio = (conf.w ?? 240) / (conf.h ?? 240);
  const slides = decoSlides(conf.settings);
  const inputId = `decoF-${conf.id}`;

  const set = (patch: Record<string, unknown>) =>
    updateWidget(conf.id, { settings: { ...conf.settings, ...patch } }, { persist: true });
  // 목록으로 저장할 때 한 장만 담던 옛 값은 비운다 — 두 군데 남으면 어느 쪽이 진짜인지 알 수 없다
  const setSlides = (list: DecoSlide[]) =>
    set({ slides: list, imgId: undefined, crop: undefined, link: undefined });
  const patchSlide = (id: string, p: Partial<DecoSlide>) =>
    setSlides(slides.map(x => (x.id === id ? { ...x, ...p } : x)));

  const row = (sl: DecoSlide, i: number) => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 0', borderBottom: '1px dashed var(--line)', width: '100%' }}>
      {slides.length > 1 && <span className="drag-h">⠿</span>}
      {/* 눌러서 이 장면의 이미지를 다른 것으로 교체 */}
      <div style={{ width: 84, aspectRatio: String(ratio), borderRadius: 7, overflow: 'hidden', position: 'relative', flexShrink: 0, border: '1.5px dashed var(--line)', cursor: 'var(--cur-pointer,pointer)' }}
        onClick={() => { setSwapFor(sl.id); document.getElementById(inputId)?.click(); }}>
        <CroppedBlobImg fileRef={sl.imgId} crop={fit === 'contain' ? undefined : sl.crop} ph="" />
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, minWidth: 0 }}>
        {/* 풀주소를 붙여넣어도 사이트 오리진을 떼고 상대경로로 (v1.9) */}
        <KInput placeholder="링크 (선택 — 클릭 시 이동)" value={sl.link ?? ''}
          onChange={e => patchSlide(sl.id, { link: normalizeInternalLink(e.target.value) || undefined })} />
        {fit === 'cover' && (
          <button className="btn btn-ghost" style={{ height: 24, padding: '0 9px', fontSize: 10, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}
            onClick={() => setCropFor(sl.id)}>✂ 위치</button>
        )}
      </div>
      <button className="btn btn-ghost" style={{ height: 24, padding: '0 11px', fontSize: 10.5, display: 'inline-flex', alignItems: 'center' }}
        onClick={() => del.ask(`${i + 1}번째 이미지를 위젯에서 빼시겠습니까?`,
          () => setSlides(slides.filter(x => x.id !== sl.id)),
          '원본 파일은 지워지지 않습니다.')}>DELETE</button>
    </div>
  );

  const cropTarget = slides.find(x => x.id === cropFor);

  return (
    <div style={{ display: 'grid', gap: 9 }}>
      <input id={inputId} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={async e => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          const target = swapFor;
          setSwapFor(null);
          if (!files.length) return;
          if (target) {
            // 교체 — 위치는 다시 잡아야 하므로 크롭을 비우고 바로 조정 화면을 연다
            patchSlide(target, { imgId: await putBlob(files[0]), crop: undefined });
            if (fit === 'cover') setCropFor(target);
            toast('이미지가 교체되었습니다');
            return;
          }
          const added: DecoSlide[] = [];
          for (const f of files) added.push({ id: `d${Date.now().toString(36)}-${slides.length + added.length}`, imgId: await putBlob(f) });
          setSlides([...slides, ...added]);
          // 한 장만 넣었으면 이어서 위치를 잡게 해준다
          if (added.length === 1 && fit === 'cover') setCropFor(added[0].id);
          toast(added.length > 1 ? `이미지 ${added.length}장이 추가되었습니다` : '이미지가 저장되었습니다 — 위치를 조정해 주세요');
        }} />

      {slides.length === 0
        ? (
          <div className="ph" style={{ width: 160, aspectRatio: String(ratio), borderRadius: 8, border: '1.5px dashed var(--line)', cursor: 'var(--cur-pointer,pointer)' }}
            onClick={() => { setSwapFor(null); document.getElementById(inputId)?.click(); }}>
            <span style={{ fontSize: 9 }}>IMAGE</span>
          </div>
        )
        : <DragList items={slides} keyOf={sl => sl.id} onReorder={setSlides} render={row} />}

      {/* 표시 방식 (v1.9 사용자 요청) — 꽉 채움(위젯을 채우고 잘릴 수 있음) / 비율 유지(안 잘림, 여백 생길 수 있음) */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="cp-lb">표시</span>
        <div className="mini-seg">
          <button className={fit === 'cover' ? 'on' : ''} onClick={() => set({ fit: undefined })}>꽉 채움 (잘림)</button>
          <button className={fit === 'contain' ? 'on' : ''} onClick={() => set({ fit: 'contain' })}>비율 유지 (안 잘림)</button>
        </div>
        {/* 넘길 이미지가 있을 때만 간격을 묻는다 */}
        {slides.length > 1 && (
          <>
            <span className="cp-lb">전환 간격</span>
            <KStep value={sec} min={2} max={60} suffix="초" onChange={v => set({ interval: v })} />
          </>
        )}
      </div>

      {/* 직접 크기 (v2.0 사용자 요청) — 비우면 지금처럼 자리(그리드 칸)에 맞춘다 */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="cp-lb">크기</span>
        <KInput placeholder="가로 px (비우면 자동)" value={String((conf.settings.wPx as number | undefined) ?? '')}
          onChange={e => { const n = parseInt(e.target.value, 10); set({ wPx: Number.isFinite(n) && n > 0 ? Math.min(n, 2000) : undefined }); }}
          style={{ width: 140 }} />
        <span style={{ color: 'var(--faint)', fontSize: 11 }}>×</span>
        <KInput placeholder="세로 px (비우면 자동)" value={String((conf.settings.hPx as number | undefined) ?? '')}
          onChange={e => { const n = parseInt(e.target.value, 10); set({ hPx: Number.isFinite(n) && n > 0 ? Math.min(n, 2000) : undefined }); }}
          style={{ width: 140 }} />
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
          onClick={() => { setSwapFor(null); document.getElementById(inputId)?.click(); }}>＋ 이미지 추가</button>
        <KCheck label="둥근 모서리" checked={rounded} onChange={v => set({ rounded: v })} />
        {onClose && <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={onClose}>CLOSE</button>}
      </div>

      <p className="hint" style={{ margin: 0 }}>
        원본은 잘리지 않고 위치·확대만 저장 — 위젯 크기를 바꾸면 [✂ 위치]로 다시 맞출 수 있습니다.
        여러 장을 넣으면 위 순서대로 넘어가고, 썸네일을 누르면 그 장면의 이미지를 교체합니다
      </p>

      {cropTarget && (
        <DecoCrop sl={cropTarget} ratio={ratio}
          onClose={() => setCropFor(null)}
          onApply={c => { patchSlide(cropTarget.id, { crop: c }); setCropFor(null); }} />
      )}
      {del.element}
    </div>
  );
}

/* ---------- 슬라이드 배너 — settings.slides / settings.interval ---------- */
// 이미지: 업로드(imgId, IndexedDB 원본 보존) + 위치 크롭(crop — 비율 좌표라 배너 크기가 바뀌어도 재현,
// 원본은 절대 자르지 않음 · 위치는 언제든 재조정). 구버전 img(URL)도 계속 렌더 지원.
export interface BannerSlide {
  id: string; img: string; cap: string; sub: string; link: string; cls?: string;
  imgId?: string; crop?: CropValue;
}

interface SlideDraft extends BannerSlide { file?: File; localUrl?: string }

/** 슬라이드 미리보기 — 새 파일 / 저장 블롭 / URL / 플레이스홀더 순 */
function SlidePreview({ d }: { d: SlideDraft }) {
  if (d.localUrl) return <CropImg src={d.localUrl} crop={d.crop} />;
  if (d.imgId) return <CroppedBlobImg fileRef={d.imgId} crop={d.crop} ph="" />;
  if (d.img) {
    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={d.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }
  return <div className={`ph ${d.cls ?? ''}`} style={{ position: 'absolute', inset: 0 }}><span style={{ fontSize: 8 }}>BANNER</span></div>;
}

/** 저장 블롭도 소스로 쓰는 위치 크롭 편집기 — 프레임 비율 = 현재 배너의 실제 비율 */
function SlideCrop({ d, ratio, onClose, onApply }: {
  d: SlideDraft; ratio: number; onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const loaded = useBlobUrl(d.imgId);
  const src = d.localUrl ?? loaded;
  if (!src) return null;
  return <CropEditor open src={src} aspect={ratio} aspectLabel="현재 배너 비율" initial={d.crop} onClose={onClose} onApply={onApply} />;
}

/** 저장된 슬라이드가 없을 때 배너 위젯이 보여주는 데모 (에디터도 이걸 시작점으로 프리필) */
/** 배너 기본 슬라이드 — 데모 문구 없이 빈 슬라이드 한 장 (v1.9 사용자 발견: 배포본 더미 정리 누락)
 *  이미지가 없으면 「SLIDE BANNER 01」 플레이스홀더가 보이고, MANAGE에서 채우면 된다. */
export const DEMO_SLIDES: BannerSlide[] = [
  { id: 's1', img: '', cap: '', sub: '', link: '', cls: '' },
];

export function BannerEditor({ conf, onSaved, onClose }: {
  conf: WidgetConf; onSaved?: () => void;
  onClose?: () => void;   // 모달에서 사용 시 SAVE 오른쪽에 CLOSE 버튼 렌더
}) {
  const { updateWidget } = useMainStore();
  const toast = useToast();
  const del = useConfirmDelete();   // 슬라이드 삭제 경고 모달 (v1.9 — 모든 삭제는 경고 모달)
  const stored = (conf.settings.slides as BannerSlide[]) ?? [];
  const saved = stored.length > 0 ? stored : DEMO_SLIDES;
  const [draft, setDraft] = useState<SlideDraft[]>(() => saved.map(x => ({ ...x })));
  const [interval, setIntervalSec] = useState((conf.settings.interval as number) ?? 4);
  const [cropFor, setCropFor] = useState<string | null>(null);   // 위치 조정 중인 슬라이드 id
  const [fileFor, setFileFor] = useState<string | null>(null);   // 파일 선택 대상 슬라이드 id

  // 현재 배너의 실제 비율 — 편집모드에서 크기를 바꿨으면 그 값(위젯 동결 크기), 기본은 610×210
  const bannerRatio = (conf.w ?? 610) / (conf.h ?? 210);

  const patch = (id: string, p: Partial<SlideDraft>) =>
    setDraft(list => list.map(x => (x.id === id ? { ...x, ...p } : x)));

  const row = (d: SlideDraft) => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px dashed var(--line)', width: '100%' }}>
      <span className="drag-h">⠿</span>
      {/* 이미지 업로드 미리보기 — 클릭해서 선택, 원본은 자르지 않고 위치값만 저장 */}
      <div style={{ width: 96, aspectRatio: String(bannerRatio), borderRadius: 7, overflow: 'hidden', position: 'relative', flexShrink: 0, border: '1.5px dashed var(--line)', cursor: 'var(--cur-pointer,pointer)' }}
        onClick={() => { setFileFor(d.id); document.getElementById('bnSlideF')?.click(); }}>
        <SlidePreview d={d} />
      </div>
      <div style={{ display: 'grid', gap: 6, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <KInput placeholder="캡션" value={d.cap} onChange={e => patch(d.id, { cap: e.target.value })} />
          <KInput placeholder="설명" value={d.sub} onChange={e => patch(d.id, { sub: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* 풀주소를 붙여넣어도 사이트 오리진을 떼고 /rels/… 상대경로로 (v1.9) */}
          <KInput placeholder="링크 (선택)" value={d.link} onChange={e => patch(d.id, { link: normalizeInternalLink(e.target.value) })} />
          {(d.localUrl || d.imgId) && (
            <>
              <button className="btn btn-ghost" style={{ padding: '4px 9px', fontSize: 10, whiteSpace: 'nowrap' }}
                onClick={() => setCropFor(d.id)}>✂ 위치</button>
              <button className="btn btn-ghost" style={{ padding: '4px 9px', fontSize: 10, whiteSpace: 'nowrap' }}
                onClick={() => patch(d.id, { file: undefined, localUrl: undefined, imgId: undefined, crop: undefined })}>이미지 제거</button>
            </>
          )}
        </div>
      </div>
      <button className="btn btn-ghost" style={{ height: 24, padding: '0 11px', fontSize: 10.5, display: 'inline-flex', alignItems: 'center' }}
        onClick={() => del.ask(`슬라이드${d.cap ? ` 「${d.cap}」` : ''}를 삭제하시겠습니까?`,
          () => setDraft(list => list.filter(x => x.id !== d.id)),
          '삭제는 [SAVE]를 눌러야 확정됩니다.')}>DELETE</button>
    </div>
  );

  const cropTarget = draft.find(x => x.id === cropFor);

  return (
    <div>
      <input id="bnSlideF" type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f && fileFor) { patch(fileFor, { file: f, localUrl: URL.createObjectURL(f), crop: undefined }); setCropFor(fileFor); }
          e.target.value = ''; setFileFor(null);
        }} />
      <DragList items={draft} keyOf={d => d.id} onReorder={setDraft} render={row} />
      <p className="hint" style={{ marginTop: 8 }}>
        이미지는 원본 그대로 저장되고 <b>보이는 위치·확대만</b> 기록됩니다 — 편집모드에서 배너 크기가 바뀌어도 원본이 잘리지 않고, [✂ 위치]로 언제든 다시 조정할 수 있습니다
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
        <button className="btn btn-ghost" onClick={() =>
          setDraft(list => [...list, { id: `s-${Date.now().toString(36)}`, img: '', cap: '', sub: '', link: '' }])}>
          ＋ ADD SLIDE
        </button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11.5, color: 'var(--sub)' }}>전환 간격</span>
          <KStep value={interval} min={2} max={30} suffix="초" onChange={setIntervalSec} />
          <button className="btn btn-dark" onClick={async () => {
            const slides: BannerSlide[] = await Promise.all(
              draft.filter(d => d.cap || d.img || d.imgId || d.file).map(async d => ({
                id: d.id, img: d.img, cap: d.cap, sub: d.sub, link: d.link, cls: d.cls,
                imgId: d.file ? await putBlob(d.file) : d.imgId,
                crop: d.crop,
              })));
            updateWidget(conf.id, { settings: { ...conf.settings, slides, interval } }, { persist: true });
            toast('배너가 저장되었습니다');
            onSaved?.();
          }}>SAVE</button>
          {onClose && <button className="btn btn-ghost" onClick={onClose}>CLOSE</button>}
        </div>
      </div>

      {cropTarget && (
        <SlideCrop d={cropTarget} ratio={bannerRatio}
          onClose={() => setCropFor(null)}
          onApply={c => { patch(cropTarget.id, { crop: c }); setCropFor(null); }} />
      )}
      {del.element}
    </div>
  );
}
