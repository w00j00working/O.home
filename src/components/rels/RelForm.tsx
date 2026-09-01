'use client';
// 자관 등록/수정 공용 폼 (4.5) — 유형(페어/다인) · 이름/본문 폰트 · 캐치프레이즈 · 공개범위 ·
// 아트 다중 등록(첫 장 = 대표 · 리스트 썸네일 4:3 크롭) · 등록 시 내 캐릭터 연동
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Character, Relation, Visibility, RelCpTag, RelMember, auMember, auStyle, fullShadow } from '@/lib/charStore';
import { ColorField } from '@/components/ui/ColorField';
import { isValidSlug, slugify } from '@/lib/link';
import { CP_LABEL } from '@/lib/relqStore';
import { newId } from '@/lib/postStore';
import { useFonts, deVarFamily } from '@/lib/fontStore';
import { putBlob, getBlob, useBlobUrl } from '@/lib/blobStore';
import { KInput, KSelect, KCheck, KStep } from '@/components/ui/Kit';
import { CropEditor, CropValue, CropImg } from '@/components/ui/CropEditor';
import { DragList } from '@/components/ui/DragList';
import { Lightbox } from '@/components/ui/Lightbox';
import { useConfirmDelete } from '@/components/ui/Modal';
import { fileDrop } from '@/lib/dnd';
import { useToast } from '@/components/ui/Toast';

export interface RelFormValue {
  slug?: string;             // 페이지 주소 /rels/{slug} (v1.9 — 신규 등록 시, 비우면 자동 id)
  name: string;
  catchphrase: string;
  kind: 'pair' | 'multi';
  visibility: Visibility;
  fontId: string;
  bodyFontId: string;
  arts: string[];            // 첫 장 = 대표 = 리스트 썸네일 원본
  thumbCrop?: CropValue;
  headerImgId?: string;      // 헤더 이미지 (v1.5 — 풀폭 블러 + 페이드아웃)
  headerCrop?: CropValue;    // 헤더 위치 크롭 (원본 무손실)
  headerRemoved?: boolean;   // 헤더 제거 상태 (v1.9 — AU 편집에서 "없음 명시" 저장용)
  themeFollow?: boolean;     // AU 편집: true면 기존(base) 페이지 테마 따라가기 (v1.9)
  illuBg?: string;           // 전신/일러 스위치 배경색 (v1.9 — 미지정: 테마)
  illuOn?: string;           // 전신/일러 스위치 선택색 (미지정: 포인트색)
  nameColor?: string;        // 자관명(히어로 타이틀) 글씨색 (v1.9 사용자 요청 — 미지정: 테마)
  cpColor?: string;          // 캐치프레이즈 글씨색 (미지정: 테마)
  cpTagBg?: string;          // CP/NCP 뱃지 배경색 (v2.0 사용자 요청)
  cpTagFg?: string;          // CP/NCP 뱃지 글씨색
  nameShadowColor?: string;  // 자관명 그림자 색 (v2.0 사용자 요청)
  nameShadow?: number;       // 자관명 그림자 강도 %
  headerBgG1?: string;       // 헤더 이미지 없을 때 배경 그라데이션 (v2.0 사용자 요청)
  headerBgG2?: string;
  headerBgAngle?: number;
  pageBgG1?: string;         // 페이지 전체 배경 그라데이션 (v2.0 사용자 요청)
  pageBgG2?: string;
  pageBgAngle?: number;
  themeMode: 'site' | 'custom'; // 페이지 테마 — 홈페이지 그대로 / 별도 테마컬러 (4.18 방식)
  themeColor?: string;          // 별도 테마컬러 (custom일 때)
  themeTone?: 'dark' | 'light'; // 테마컬러의 다크/라이트 느낌
  cp: RelCpTag;              // CP/NCP (v1.9) — AU별로는 AU 관리에서 따로 지정
  fulls?: Record<string, string | undefined>;  // 멤버별 전신 이미지 (v1.9 — charId → blob id)
  fullScales?: Record<string, number>;         // 전신 크기 % (휠 조절)
  fullOffsets?: Record<string, { x: number; y: number }>; // 전신 위치 오프셋 % (드래그, v1.9)
  quotes?: Record<string, string>;                              // 히어로 좌/우 한마디 문구 (v2.0)
  nameSizes?: Record<string, number>;                           // 멤버 카드 이름 크기 px (v2.0)
  nameBolds?: Record<string, boolean>;                          // 멤버 카드 이름 볼드 (v2.0 — 기본 켜짐)
  quoteColors?: Record<string, { fg?: string; mark?: string }>; // 히어로 대사 글씨/따옴표색 (페어, v1.9)
  fullFront?: string;                          // 앞에 보일 캐릭터 id
  auName?: string;           // AU별 자관명 (v2.0 사용자 요청 — AU 편집일 때만)
  qaHide?: boolean;          // 문답 답변 숨기기 (v2.0 사용자 요청)
  pickedCharIds: string[];   // 등록 시 연동할 내 캐릭터 (수정 모드에선 빈 배열)
}

interface FullDraft { ref?: string; file?: File; url?: string }

/** 전신 미리보기 한 장 (v1.9 조작 개편 — 사용자 확정)
 *  · 드래그 = 위치 이동 (가로·세로)  · 휠 = 크기 (비율 유지)  · 우클릭 = 앞으로/뒤로 메뉴
 *  배치는 상세 FullImg와 동일(부모 fb 박스 기준 하단 중앙 + 오프셋) — 미리보기 = 실제 */
function FullPrevImg({ draft, scale, offX, offY, name, shadow, onScale, onOffset, onLayer }: {
  draft?: FullDraft; scale: number; offX: number; offY: number; name: string; shadow?: string;
  onScale: (v: number) => void;
  onOffset: (x: number, y: number) => void;
  onLayer: (front: boolean) => void;
}) {
  const loaded = useBlobUrl(draft?.ref);
  const src = draft?.url ?? loaded;
  const drag = React.useRef<{ x: number; y: number; ox: number; oy: number; bw: number; bh: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);
  // 휠 = 크기 — React onWheel은 passive라 preventDefault가 무시되어 페이지가 같이 스크롤됨 (v1.9 수정)
  // → 네이티브 리스너를 {passive:false}로 등록해 이미지 위에서는 기본 휠 차단
  const imgRef = React.useRef<HTMLImageElement>(null);
  const wheelState = React.useRef({ scale, onScale });
  wheelState.current = { scale, onScale };
  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { scale: s, onScale: fn } = wheelState.current;
      fn(Math.max(40, Math.min(160, Math.round(s - Math.sign(e.deltaY) * 4))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);
  if (!src) return null;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imgRef} src={src} alt={name}
        style={{
          position: 'absolute', bottom: `${offY}%`, left: `calc(50% + ${offX}%)`, transform: 'translateX(-50%)',
          height: `${scale}%`, maxWidth: 'none', cursor: 'var(--cur-grab,grab)',
          userSelect: 'none', touchAction: 'none',
          filter: shadow,
        }}
        draggable={false}
        onPointerDown={e => {
          if (e.button !== 0) return;
          e.preventDefault();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
          drag.current = { x: e.clientX, y: e.clientY, ox: offX, oy: offY, bw: box.width, bh: box.height };
        }}
        onPointerMove={e => {
          const d = drag.current;
          if (!d) return;
          const nx = d.ox + ((e.clientX - d.x) / d.bw) * 100;
          const ny = d.oy - ((e.clientY - d.y) / d.bh) * 100;
          onOffset(Math.max(-80, Math.min(80, Math.round(nx))), Math.max(-60, Math.min(80, Math.round(ny))));
        }}
        onPointerUp={() => { drag.current = null; }}
        onContextMenu={e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }} />
      {menu && createPortal(
        <div style={{
          position: 'fixed', left: menu.x, top: menu.y, zIndex: 130,
          background: 'var(--panel-solid,#fff)', border: '1px solid var(--line)', borderRadius: 9,
          boxShadow: 'var(--sh-dd)', padding: 4, display: 'grid', minWidth: 92,
        }} onMouseDown={e => e.stopPropagation()}>
          <button style={{ padding: '7px 12px', fontSize: 12, borderRadius: 6, textAlign: 'left' }}
            onClick={() => { onLayer(true); setMenu(null); }}>앞으로</button>
          <button style={{ padding: '7px 12px', fontSize: 12, borderRadius: 6, textAlign: 'left' }}
            onClick={() => { onLayer(false); setMenu(null); }}>뒤로</button>
        </div>,
        document.body,
      )}
    </>
  );
}

interface ArtItem { id: string; ref?: string; url?: string; file?: File }

function ArtThumb({ item, crop }: { item: ArtItem; crop?: CropValue }) {
  const loaded = useBlobUrl(item.ref);
  const src = item.url ?? loaded;
  if (!src) return <div className="ph" style={{ width: '100%', height: '100%' }} />;
  return <CropImg src={src} crop={crop} />;
}

export function RelForm({ initial, auId, myChars, memberNames, existingIds, onSave, onCancel }: {
  initial: Relation | null;          // null = 신규 등록
  auId?: string;                     // AU 편집 모드 (v1.9) — 아트·캐치프레이즈·전신이 이 AU의 것
  myChars: Character[];
  memberNames?: Record<string, string>;  // 멤버 charId → 이름 (전신 섹션 표기)
  existingIds?: string[];            // 페이지 주소 중복 검사용 (v1.9 — 신규 등록)
  onSave: (v: RelFormValue) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const del = useConfirmDelete();   // 삭제 확인 모달 (v1.9 — 아트·전신)
  const { fonts, familyOf } = useFonts();
  const isNew = !initial;
  const auObj = auId ? initial?.aus.find(a => a.id === auId) : undefined;

  const [kind, setKind] = useState<'pair' | 'multi'>(initial?.kind ?? 'pair');
  const [name, setName] = useState(initial?.name ?? '');
  // 페이지 주소 /rels/{slug} — 신규는 비우면 자동(id). 수정에서도 바꿀 수 있다 (v2.0 사용자 요청)
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [catchphrase, setCatchphrase] = useState(auObj ? auObj.catchphrase : (initial?.catchphrase ?? ''));
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? 'public');
  const [cp, setCp] = useState<RelCpTag>(initial?.cp ?? 'cp');   // CP/NCP (v1.9)
  const [fontId, setFontId] = useState(initial?.fontId ?? 'serif');
  const [bodyFontId, setBodyFontId] = useState(initial?.bodyFontId ?? 'default');
  const [picked, setPicked] = useState<string[]>([]);
  const [arts, setArts] = useState<ArtItem[]>(() => {
    const refs = auObj ? (auObj.arts ?? []) : (initial?.arts ?? (initial?.thumbId ? [initial.thumbId] : []));
    return refs.map(r => ({ id: newId(), ref: r }));
  });
  const [thumbCrop, setThumbCrop] = useState<CropValue | undefined>(initial?.thumbCrop);
  const [cropOpen, setCropOpen] = useState(false);
  const [lb, setLb] = useState<number | null>(null);   // 아트 썸네일 클릭 → 원본 보기
  const [headerFile, setHeaderFile] = useState<File | null>(null);
  const [headerUrl, setHeaderUrl] = useState('');
  const [headerRemoved, setHeaderRemoved] = useState(false);
  // AU 편집 모드 — 그 AU의 헤더만 시작점 (base 것을 복사해오지 않음, v1.9 AU별 완전 분리)
  const initHeaderId = auObj ? (auObj.headerImgId ?? undefined) : initial?.headerImgId;
  const initHeaderCrop = auObj ? auObj.headerCrop : initial?.headerCrop;
  const [headerCrop, setHeaderCrop] = useState<CropValue | undefined>(initHeaderCrop);
  const [headerCropOpen, setHeaderCropOpen] = useState(false);
  // 페이지 테마 (v1.9 AU별) — AU 편집: 기존(base) 따라가기 또는 이 AU 전용 테마
  const [themeFollow, setThemeFollow] = useState<boolean>(auObj ? auObj.theme === undefined : false);
  const [themeMode, setThemeMode] = useState<'site' | 'custom'>(
    (auObj?.theme?.mode ?? initial?.themeMode) ?? 'site');
  const [themeColor, setThemeColor] = useState((auObj?.theme?.color ?? initial?.themeColor) ?? '#c9a86a');
  const [themeTone, setThemeTone] = useState<'dark' | 'light'>((auObj?.theme?.tone ?? initial?.themeTone) ?? 'dark');
  // 색·배경은 AU마다 따로 정할 수 있다 (v2.0 사용자 요청) — AU 편집 중이면 그 AU에 정해 둔 값부터 보고,
  // 정한 게 없으면 자관 값이 그대로 채워진다. 체크를 끄면 AU에서 지워져 자관 값으로 되돌아간다.
  const st = initial ? auStyle(initial, auObj) : undefined;
  // 전신/일러 스위치 색 (v1.9) — 직접 지정 안 하면 테마·포인트색
  const [illuCustom, setIlluCustom] = useState(!!(st?.illuBg || st?.illuOn));
  const [illuBg, setIlluBg] = useState(st?.illuBg ?? '#1d2025');
  const [illuOn, setIlluOn] = useState(st?.illuOn ?? '#a63a45');
  // 자관명·캐치프레이즈 글씨색 (v1.9 사용자 요청) — 직접 지정 안 하면 테마색
  const [txtCustom, setTxtCustom] = useState(!!(st?.nameColor || st?.cpColor));
  const [nameColor, setNameColor] = useState(st?.nameColor ?? '#e8eaee');
  const [cpColor, setCpColor] = useState(st?.cpColor ?? '#8a8f98');
  // CP/NCP 뱃지 색 (v2.0 사용자 요청) — 미지정이면 기본 pill 색
  const [tagCustom, setTagCustom] = useState(!!(st?.cpTagBg || st?.cpTagFg));
  const [cpTagBg, setCpTagBg] = useState(st?.cpTagBg ?? '#eef0f2');
  const [cpTagFg, setCpTagFg] = useState(st?.cpTagFg ?? '#5d636d');
  // 그림자 (v2.0) — 색·강도. 자관명과 전신 이미지에 함께 걸린다 (사용자 요청). 미지정이면 기존 그대로
  const [shadowCustom, setShadowCustom] = useState(!!(st?.nameShadowColor || st?.nameShadow));
  const [nameShadowColor, setNameShadowColor] = useState(st?.nameShadowColor ?? '#000000');
  const [nameShadow, setNameShadow] = useState(st?.nameShadow ?? 100);
  // 헤더 이미지가 없을 때 대신 깔 배경 그라데이션 (v2.0 사용자 요청) — 디자인 탭 배경 설정과 같은 방식(색 2개+각도)
  const [headerBgCustom, setHeaderBgCustom] = useState(!!(st?.headerBgG1 || st?.headerBgG2));
  const [headerBgG1, setHeaderBgG1] = useState(st?.headerBgG1 ?? '#3a4150');
  const [headerBgG2, setHeaderBgG2] = useState(st?.headerBgG2 ?? '#1a1d22');
  const [headerBgAngle, setHeaderBgAngle] = useState(st?.headerBgAngle ?? 180);
  // 페이지 전체 배경 (v2.0 사용자 요청) — 디자인 탭의 사이트 배경과 같은 방식(색 2개 + 각도)
  const [pageBgCustom, setPageBgCustom] = useState(!!(st?.pageBgG1 || st?.pageBgG2));
  const [pageBgG1, setPageBgG1] = useState(st?.pageBgG1 ?? '#2b3038');
  const [pageBgG2, setPageBgG2] = useState(st?.pageBgG2 ?? '#121418');
  const [pageBgAngle, setPageBgAngle] = useState(st?.pageBgAngle ?? 180);
  const [charQuery, setCharQuery] = useState('');
  // 전신 이미지 (v1.9 — 페어 · 수정 모드) — AU 편집이면 그 AU의 전신
  const pairMembers = !isNew && (initial!.kind ? initial!.kind === 'pair' : initial!.members.length === 2)
    ? initial!.members.slice(0, 2) : [];
  const [fulls, setFulls] = useState<Record<string, FullDraft>>(() => {
    const o: Record<string, FullDraft> = {};
    for (const m of pairMembers) {
      const ref = auObj ? auObj.fulls?.[m.charId] : m.fullImgId;
      if (ref) o[m.charId] = { ref };
    }
    return o;
  });
  // AU를 편집 중이면 그 AU에 정해 둔 값부터 본다 (v2.0 사용자 발견 — 예전엔 자관 공통 값만 봐서
  // AU에서 고친 게 다른 AU에도 그대로 나타났다). 정해 둔 게 없으면 자관 기본값.
  const mOf = (m: RelMember) => (auObj ? auMember(m, auObj) : m);
  const [fullScales, setFullScales] = useState<Record<string, number>>(
    () => Object.fromEntries(pairMembers.map(m => [m.charId, mOf(m).fullScale ?? 90])));
  // 전신 위치 오프셋 % (v1.9 — 드래그로 이동, 상세와 동일 좌표계)
  const [fullOffsets, setFullOffsets] = useState<Record<string, { x: number; y: number }>>(
    () => Object.fromEntries(pairMembers.map(m => [m.charId, { x: mOf(m).fullOffX ?? 0, y: mOf(m).fullOffY ?? 0 }])));
  // 히어로 좌/우 한마디 — 색만 정할 수 있고 문구를 고칠 곳이 없었다 (v2.0 사용자 발견)
  const [quotes, setQuotes] = useState<Record<string, string>>(
    () => Object.fromEntries(pairMembers.map(m => [m.charId, mOf(m).quote ?? ''])));
  // 멤버 카드 이름 크기 (v2.0) — 카드 폭이 좁아 이름마다 알맞은 크기가 다르다
  const [nameSizes, setNameSizes] = useState<Record<string, number>>(
    () => Object.fromEntries(pairMembers.map(m => [m.charId, mOf(m).nameSize ?? 17])));
  // 이름 볼드 (v2.0 사용자 요청) — 폰트에 따라 볼드가 어색한 경우가 있어 끌 수 있게. 기본은 볼드
  const [nameBolds, setNameBolds] = useState<Record<string, boolean>>(
    () => Object.fromEntries(pairMembers.map(m => [m.charId, mOf(m).nameBold ?? true])));
  // 히어로 대사 글씨/따옴표색 (페어, v1.9)
  const [quoteColors, setQuoteColors] = useState<Record<string, { fg?: string; mark?: string }>>(
    () => Object.fromEntries(pairMembers.map(m => [m.charId, { fg: mOf(m).quoteColor, mark: mOf(m).quoteMarkColor }])));
  // AU별 자관명 (v2.0 사용자 요청) — 비우면 자관 이름 그대로
  const [auName, setAuName] = useState(auObj?.name ?? '');
  // 문답 답변 가리기 (v2.0 사용자 요청) — 질문은 그대로 두고 답변 내용만
  const [qaHide, setQaHide] = useState(!!initial?.qaHide);
  const [fullFront, setFullFront] = useState<string | undefined>(initial?.fullFront);

  // 내 캐릭터 연동 목록 — 선택된 캐릭터는 항상 표시, 나머지는 검색 필터 후 총 6명까지
  const q = charQuery.trim().toLowerCase();
  const pickedChars = myChars.filter(c => picked.includes(c.id));
  const restChars = myChars.filter(c =>
    !picked.includes(c.id) && (!q || c.name.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q)));
  const shownChars = [...pickedChars, ...restChars].slice(0, Math.max(6, pickedChars.length));
  const hiddenCount = pickedChars.length + restChars.length - shownChars.length;

  const maxPick = kind === 'pair' ? 2 : 6;

  const togglePick = (id: string, v: boolean) => {
    setPicked(list => {
      if (!v) return list.filter(x => x !== id);
      if (list.length >= maxPick) {
        toast(kind === 'pair' ? '페어는 최대 2명까지 연동할 수 있습니다' : '다인관은 최대 6명까지입니다 (4.5)');
        return list;
      }
      return [...list, id];
    });
  };

  const addArts = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const items = Array.from(list).map(f => ({ id: newId(), url: URL.createObjectURL(f), file: f }));
    setArts(prev => {
      if (prev.length === 0) { setThumbCrop(undefined); setCropOpen(true); } // 첫 장 → 썸네일 크롭 (6.1)
      return [...prev, ...items];
    });
  };

  const save = async () => {
    if (!name.trim()) { toast('자관 이름을 입력해 주세요'); return; }
    // 페이지 주소 (v1.9 / 수정도 가능 v2.0) — 유효성·중복 검사
    if (slug && slug !== (initial?.slug ?? '')) {
      if (!isValidSlug(slug)) { toast('주소는 영문 소문자·숫자·하이픈만 쓸 수 있습니다'); return; }
      if (existingIds?.includes(slug)) { toast('이미 사용 중인 주소입니다 — 다른 주소를 입력해 주세요'); return; }
    }
    const artIds = await Promise.all(arts.map(a => (a.file ? putBlob(a.file) : Promise.resolve(a.ref!))));
    onSave({
      // 수정에서 정한 주소는 별명으로 (v2.0) — 신규는 rels/new가 이 값을 id로 쓴다
      slug: slug.trim() || undefined,
      name: name.trim().toUpperCase(),
      catchphrase: catchphrase.trim(),
      kind, visibility, fontId, bodyFontId,
      arts: artIds,
      thumbCrop,
      headerImgId: headerFile ? await putBlob(headerFile) : (headerRemoved ? undefined : initHeaderId),
      headerCrop: headerRemoved ? undefined : headerCrop,
      headerRemoved,
      themeFollow,
      illuBg: illuCustom ? illuBg : undefined,
      illuOn: illuCustom ? illuOn : undefined,
      nameColor: txtCustom ? nameColor : undefined,
      cpColor: txtCustom ? cpColor : undefined,
      nameShadowColor: shadowCustom ? nameShadowColor : undefined,
      nameShadow: shadowCustom ? nameShadow : undefined,
      headerBgG1: headerBgCustom ? headerBgG1 : undefined,
      headerBgG2: headerBgCustom ? headerBgG2 : undefined,
      headerBgAngle: headerBgCustom ? headerBgAngle : undefined,
      pageBgG1: pageBgCustom ? pageBgG1 : undefined,
      pageBgG2: pageBgCustom ? pageBgG2 : undefined,
      pageBgAngle: pageBgCustom ? pageBgAngle : undefined,
      cpTagBg: tagCustom ? cpTagBg : undefined,
      cpTagFg: tagCustom ? cpTagFg : undefined,
      themeMode,
      themeColor: themeMode === 'custom' ? themeColor : undefined,
      themeTone: themeMode === 'custom' ? themeTone : undefined,
      cp,
      auName: auObj ? auName.trim() : undefined,
      qaHide: qaHide || undefined,
      fulls: pairMembers.length
        ? Object.fromEntries(await Promise.all(pairMembers.map(async m => {
          const d = fulls[m.charId];
          return [m.charId, d ? (d.file ? await putBlob(d.file) : d.ref) : undefined] as const;
        })))
        : undefined,
      fullScales: pairMembers.length ? fullScales : undefined,
      fullOffsets: pairMembers.length ? fullOffsets : undefined,
      quotes: pairMembers.length ? quotes : undefined,
      nameSizes: pairMembers.length ? nameSizes : undefined,
      nameBolds: pairMembers.length ? nameBolds : undefined,
      quoteColors: pairMembers.length ? quoteColors : undefined,
      fullFront,
      pickedCharIds: picked,
    });
  };

  return (
    <div className="write-grid">
      {/* 좌: 유형 · 내 캐릭터 연동(등록 시) · 아트 */}
      <div className="panel" style={{ padding: 24, display: 'grid', gap: 14, alignContent: 'start' }}>
        <div>
          <label className="k-label">유형</label>
          {isNew ? (
            <div className="mini-seg">
              <button className={kind === 'pair' ? 'on' : ''} onClick={() => { setKind('pair'); setPicked(p => p.slice(0, 2)); }}>
                페어 (2인)
              </button>
              <button className={kind === 'multi' ? 'on' : ''} onClick={() => setKind('multi')}>
                다인관 (3인 이상)
              </button>
            </div>
          ) : (
            /* 등록 후에는 유형 변경 불가 (v1.9) — 레이아웃·데이터 구조가 달라 전환 시 애매해짐 */
            <span className="pill dark">{kind === 'pair' ? '페어 (2인)' : '다인관 (3인 이상)'}</span>
          )}
          <p className="hint">
            {kind === 'pair'
              ? '좌/우 카드 + 중앙 일러(전신 겹침/일러 1장) 레이아웃'
              : '멤버 리스트형 레이아웃 · 최대 6인 (4.5)'}
          </p>
        </div>

        {isNew && (
          <div>
            <label className="k-label">내 캐릭터 연동 <span style={{ fontWeight: 400, color: 'var(--faint)' }}>— {picked.length}/{maxPick}명 선택</span></label>
            {myChars.length > 6 && (
              <KInput placeholder="캐릭터 검색" value={charQuery} onChange={e => setCharQuery(e.target.value)}
                style={{ marginBottom: 8 }} />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {shownChars.map(c => (
                <div key={c.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                    border: `1.5px solid ${picked.includes(c.id) ? 'var(--accent)' : 'var(--line)'}`,
                    borderRadius: 8, transition: '.15s',
                  }}>
                  <KCheck checked={picked.includes(c.id)} onChange={v => togglePick(c.id, v)}
                    label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                      <i style={{ width: 11, height: 11, borderRadius: '50%', background: c.color, fontStyle: 'normal' }} />
                      <b style={{ fontSize: 12.5 }}>{c.name}</b>
                      <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{c.sub}</small>
                    </span>} />
                </div>
              ))}
              {myChars.length === 0 && <p className="hint">등록된 캐릭터가 없습니다 — 캐릭터를 먼저 등록해 주세요</p>}
              {myChars.length > 0 && shownChars.length === 0 && <p className="hint">검색 결과가 없습니다</p>}
            </div>
            {hiddenCount > 0 && <p className="hint" style={{ marginTop: 6 }}>외 {hiddenCount}명 — 검색으로 찾아 주세요</p>}
            <p className="hint">상대(타인) 캐릭터는 자관 상세에서 [＋ 멤버 추가]로 등록합니다</p>
          </div>
        )}

        {/* 아트 다중 등록 — 첫 장 = 대표 · 리스트 썸네일(4:3 크롭) */}
        <label className="k-label" style={{ margin: 0 }}>
          {auObj ? `아트 — ${auObj.label} AU 일러` : '아트'} <span style={{ fontWeight: 400, color: 'var(--faint)' }}>
            {auObj ? '— 이 AU를 선택했을 때의 중앙 일러' : '— 첫 장이 대표 · 리스트 썸네일은 첫 장에서 4:3 크롭 · 상세 일러스트 모드에서 넘겨보기'}</span>
        </label>
        {arts.length > 0 && (
          <DragList items={arts} keyOf={a => a.id} onReorder={setArts}
            render={(a, i) => (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', padding: '3px 0' }}>
                <span className="drag-h">⠿</span>
                <div data-tip="클릭하면 원본 보기" onClick={() => setLb(i)}
                  style={{ width: 84, aspectRatio: '4/3', borderRadius: 7, overflow: 'hidden', position: 'relative', flexShrink: 0, cursor: 'zoom-in' }}>
                  <ArtThumb item={a} crop={i === 0 ? thumbCrop : undefined} />
                </div>
                {i === 0 ? (
                  <>
                    <span className="pill dark">대표 · 썸네일</span>
                    {/* 옆의 「대표 · 썸네일」 뱃지와 세로 크기 통일 (23px) */}
                    <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5, lineHeight: '13px' }}
                      onClick={() => setCropOpen(true)}>✂ 썸네일 크롭</button>
                  </>
                ) : (
                  <span className="pill">추가 아트</span>
                )}
                <span className="fx" style={{ marginLeft: 'auto' }}
                  onClick={() => del.ask('이 아트를 삭제하시겠습니까?', () => setArts(l => l.filter(x => x.id !== a.id)))}>✕</span>
              </div>
            )} />
        )}
        <input id="relArtsF" type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { addArts(e.target.files); e.target.value = ''; }} />
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11, justifySelf: 'center' }}
          onClick={() => document.getElementById('relArtsF')?.click()}
          {...fileDrop(fl => addArts(fl))}>
          ＋ ADD ART {arts.length === 0 && '(첫 장 등록 시 썸네일 크롭 지정)'}
        </button>

        {/* 전신 이미지 (v1.9) — 페어 좌/우 캐릭터, 미리보기에서 드래그=크기 · 클릭=앞으로 */}
        {pairMembers.length > 0 && (
          <>
            <label className="k-label" style={{ margin: 0 }}>
              {auObj ? `전신 이미지 — ${auObj.label} AU` : '전신 이미지'} <span style={{ fontWeight: 400, color: 'var(--faint)' }}>
                — 중앙 전신 모드의 좌/우 · 미리보기에서 드래그=크기, 클릭=앞으로</span>
            </label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {pairMembers.map(m => {
                const d = fulls[m.charId];
                const nm = memberNames?.[m.charId] ?? m.charId;
                return (
                  <div key={m.charId} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <b style={{ fontSize: 12 }}>{nm}</b>
                    <label className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5, cursor: 'var(--cur-pointer,pointer)' }}
                      {...fileDrop(fl => { const f = fl[0]; if (f) setFulls(o => ({ ...o, [m.charId]: { file: f, url: URL.createObjectURL(f) } })); })}>
                      {d ? '교체' : '↑ 업로드'}
                      <input type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={e => {
                          const f = e.target.files?.[0]; e.target.value = '';
                          if (f) setFulls(o => ({ ...o, [m.charId]: { file: f, url: URL.createObjectURL(f) } }));
                        }} />
                    </label>
                    {d && (
                      <span className="fx" onClick={() => del.ask(`${nm}의 전신 이미지를 삭제하시겠습니까?`, () => setFulls(o => {
                        const n = { ...o }; delete n[m.charId]; return n;
                      }))}>✕</span>
                    )}
                  </div>
                );
              })}
            </div>
            {Object.keys(fulls).length > 0 && (
              /* 실제 표시와 같은 비율(3/4.1)·같은 배치(fb 좌우 박스) — 여기서 잡은 크기가 상세 그대로 (v1.9) */
              <div style={{
                position: 'relative', width: '100%', maxWidth: 340, margin: '0 auto', aspectRatio: '3/4.1', borderRadius: 10,
                overflow: 'hidden', background: 'linear-gradient(180deg,#262b33,#181b20)', border: '1px solid var(--line)',
              }}>
                {pairMembers.map((m, i) => (
                  <div key={m.charId} style={{
                    position: 'absolute', width: '62%', bottom: '-2%',
                    top: i === 0 ? '5%' : '12%',
                    ...(i === 0 ? { left: '-4%' } : { right: '-4%' }),
                    zIndex: (fullFront ?? pairMembers[1]?.charId) === m.charId ? 3 : 2,
                  }}>
                    <FullPrevImg draft={fulls[m.charId]}
                      scale={fullScales[m.charId] ?? 90}
                      offX={fullOffsets[m.charId]?.x ?? 0}
                      offY={fullOffsets[m.charId]?.y ?? 0}
                      name={memberNames?.[m.charId] ?? m.charId}
                      shadow={fullShadow(shadowCustom ? nameShadowColor : undefined,
                        shadowCustom ? nameShadow : undefined, '0 6px 14px')}
                      onScale={v => setFullScales(s => ({ ...s, [m.charId]: v }))}
                      onOffset={(x, y) => setFullOffsets(s => ({ ...s, [m.charId]: { x, y } }))}
                      onLayer={front => {
                        const other = pairMembers.find(x => x.charId !== m.charId)?.charId;
                        setFullFront(front ? m.charId : (other ?? m.charId));
                      }} />
                  </div>
                ))}
                {fullFront && (
                  <span className="pill" style={{ position: 'absolute', left: 10, top: 10, zIndex: 5 }}>
                    앞: {memberNames?.[fullFront] ?? fullFront}
                  </span>
                )}
              </div>
            )}
            <p className="hint" style={{ margin: '4px 0 0' }}>드래그 = 위치 · 휠 = 크기 · 우클릭 = 앞으로/뒤로 — 미리보기 비율이 상세 화면과 동일합니다</p>

            {/* 좌/우 한마디 문구 (v2.0 사용자 발견 — 색만 있고 문구 칸이 없었다) */}
            <label className="k-label" style={{ margin: '10px 0 0' }}>한마디 — 상단 좌/우 대사</label>
            {pairMembers.map((m, i) => (
              <div key={m.charId} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <b style={{ fontSize: 12, width: 92, flexShrink: 0 }}>{i === 0 ? '왼쪽' : '오른쪽'} · {memberNames?.[m.charId] ?? m.charId}</b>
                <KInput value={quotes[m.charId] ?? ''}
                  onChange={e => setQuotes(s => ({ ...s, [m.charId]: e.target.value }))}
                  placeholder="비우면 표시하지 않습니다" style={{ flex: 1 }} />
              </div>
            ))}

            {/* 멤버 카드 이름 크기 (v2.0 사용자 확정) — 자동으로 줄이지 않고 직접 정한다 */}
            <label className="k-label" style={{ margin: '10px 0 0' }}>이름 크기 — 멤버 카드</label>
            {pairMembers.map((m, i) => (
              <div key={m.charId} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <b style={{ fontSize: 12, width: 92, flexShrink: 0 }}>{i === 0 ? '왼쪽' : '오른쪽'} · {memberNames?.[m.charId] ?? m.charId}</b>
                <KCheck label="Bold" checked={nameBolds[m.charId] ?? true}
                  onChange={(v: boolean) => setNameBolds(s => ({ ...s, [m.charId]: v }))} />
                <KStep value={nameSizes[m.charId] ?? 17}
                  onChange={(v: number) => setNameSizes(s => ({ ...s, [m.charId]: v }))}
                  min={10} max={32} step={1} suffix="px" />
              </div>
            ))}

            {/* 히어로 대사 색 (페어, v1.9 사용자 요청) — 좌/우 캐릭터 대사 글씨색·따옴표색 */}
            <label className="k-label" style={{ margin: '10px 0 0' }}>대사 색 — 상단 좌/우 한마디</label>
            {pairMembers.map((m, i) => (
              <div key={m.charId} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <b style={{ fontSize: 12, width: 92 }}>{i === 0 ? '왼쪽' : '오른쪽'} · {memberNames?.[m.charId] ?? m.charId}</b>
                <span className="cp-lb">글씨</span>
                <ColorField value={quoteColors[m.charId]?.fg ?? '#d7dae0'}
                  onChange={hex => setQuoteColors(s => ({ ...s, [m.charId]: { ...s[m.charId], fg: hex } }))} />
                <span className="cp-lb">따옴표</span>
                <ColorField value={quoteColors[m.charId]?.mark ?? '#c96a73'}
                  onChange={hex => setQuoteColors(s => ({ ...s, [m.charId]: { ...s[m.charId], mark: hex } }))} />
              </div>
            ))}
          </>
        )}

        {/* 헤더 이미지 (v1.5) — 상단 풀폭 블러 + 아래로 페이드아웃 · 위치 크롭(원본 무손실) */}
        <label className="k-label" style={{ margin: 0 }}>
          헤더 이미지 <span style={{ fontWeight: 400, color: 'var(--faint)' }}>— 상세 상단에 풀폭 블러로 깔리고 아래로 갈수록 투명해짐 (선택)</span>
        </label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 200, aspectRatio: '3/1', borderRadius: 8, overflow: 'hidden', position: 'relative', border: '1.5px dashed var(--line)', cursor: 'var(--cur-pointer,pointer)' }}
            onClick={() => document.getElementById('relHeaderF')?.click()}
            {...fileDrop(fl => {
              const hf = fl[0];
              if (hf) {
                setHeaderFile(hf); setHeaderUrl(URL.createObjectURL(hf)); setHeaderRemoved(false);
                setHeaderCrop(undefined); setHeaderCropOpen(true);
              }
            })}>
            {headerUrl ? (
              <div style={{ position: 'absolute', inset: 0, filter: 'blur(2px)' }}>
                <CropImg src={headerUrl} crop={headerCrop} />
              </div>
            ) : (!headerRemoved && initHeaderId) ? (
              <HeaderPreview refId={initHeaderId} crop={headerCrop} />
            ) : (
              <div className="ph" style={{ width: '100%', height: '100%' }}><span style={{ fontSize: 10 }}>HEADER</span></div>
            )}
          </div>
          <input id="relHeaderF" type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => {
              const hf = e.target.files?.[0];
              if (hf) {
                setHeaderFile(hf); setHeaderUrl(URL.createObjectURL(hf)); setHeaderRemoved(false);
                setHeaderCrop(undefined); setHeaderCropOpen(true);   // 업로드 즉시 위치 지정
              }
              e.target.value = '';
            }} />
          {(headerUrl || (!headerRemoved && initHeaderId)) && (
            <>
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                onClick={() => setHeaderCropOpen(true)}>✂ 위치</button>
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                onClick={() => { setHeaderFile(null); setHeaderUrl(''); setHeaderRemoved(true); setHeaderCrop(undefined); }}>제거</button>
            </>
          )}
        </div>
        {headerCropOpen && (headerUrl || (!headerRemoved && initHeaderId)) && (
          <HeaderCrop src={headerUrl} refId={!headerUrl ? initHeaderId : undefined} crop={headerCrop}
            onClose={() => setHeaderCropOpen(false)}
            onApply={c => { setHeaderCrop(c); setHeaderCropOpen(false); }} />
        )}

        {/* 헤더 이미지가 없을 때 대신 깔 배경 (v2.0 사용자 요청) — 디자인 탭 배경 설정과 같은 방식.
            지정하지 않으면 예전처럼 그 자리엔 아무것도 안 그린다. AU마다 따로 정할 수 있다 */}
        {(
          <div style={{ marginTop: 10 }}>
            <KCheck label="헤더 이미지 없을 때 배경 직접 지정" checked={headerBgCustom} onChange={setHeaderBgCustom} />
            {headerBgCustom && (
              <div className="cf-stack" style={{ marginTop: 8 }}>
                <div className="cf-row">
                  <ColorField value={headerBgG1} onChange={setHeaderBgG1} />
                  <span style={{ color: 'var(--faint)', fontSize: 11 }}>→</span>
                  <ColorField value={headerBgG2} onChange={setHeaderBgG2} />
                </div>
                <div className="cf-row">
                  <span className="cp-lb">각도</span>
                  <KStep value={headerBgAngle} min={0} max={360} step={15} suffix="°" onChange={setHeaderBgAngle} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 우: 기본 정보 + 저장 */}
      <div>
        <div className="panel widget" style={{ marginBottom: 14 }}>
          <h4>기본</h4>
          <div style={{ display: 'grid', gap: 9 }}>
            <KInput placeholder="자관 이름" value={name} onChange={e => setName(e.target.value)}
              style={{ fontFamily: familyOf(fontId), letterSpacing: '.1em' }} />
            {/* AU별 자관명 (v2.0 사용자 요청) — 이 AU를 볼 때만 쓰는 이름. 비우면 위 이름 그대로 */}
            {auObj && (
              <div>
                <label className="k-label" style={{ marginBottom: 5 }}>{auObj.label} AU 이름</label>
                <KInput placeholder={name || '자관 이름 그대로'} value={auName}
                  onChange={e => setAuName(e.target.value)}
                  style={{ fontFamily: familyOf(fontId), letterSpacing: '.1em' }} />
                <p className="hint" style={{ margin: '5px 0 0' }}>
                  이 AU를 볼 때만 쓰는 이름 — 비우면 자관 이름을 그대로 씁니다
                </p>
              </div>
            )}
            {/* 페이지 주소 (v1.9) — /rels/{slug}, 비우면 자동 · 중복이면 경고 */}
            {/* 수정에서도 바꿀 수 있다 (v2.0 사용자 요청) — 비우면 원래 주소(id) 그대로.
                AU 편집에서는 주소가 base 소관이라 숨긴다 */}
            {!auObj && (
              <div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--faint)', whiteSpace: 'nowrap' }}>/rels/</span>
                  <KInput placeholder={isNew ? '페이지 주소 (선택)' : `페이지 주소 (비우면 ${initial?.id})`} value={slug}
                    onChange={e => setSlug(slugify(e.target.value))} style={{ flex: 1 }} />
                </div>
                {slug && slug !== (initial?.slug ?? '') && existingIds?.includes(slug) && (
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--accent)' }}>이미 사용 중인 주소입니다</p>
                )}
              </div>
            )}
            <KInput placeholder="캐치프레이즈" value={catchphrase} onChange={e => setCatchphrase(e.target.value)} />
            {/* 자관명·캐치프레이즈 글씨색 (v1.9 사용자 요청) — 기본은 테마색. AU마다 따로 정할 수 있다 (v2.0) */}
            {(
              <div>
                <KCheck label="자관명·캐치프레이즈 색 직접 지정" checked={txtCustom} onChange={setTxtCustom} />
                {txtCustom && (
                  <div className="cf-row" style={{ marginTop: 8 }}>
                    <span className="cp-lb">자관명</span>
                    <ColorField value={nameColor} onChange={setNameColor} />
                    <span className="cp-lb">캐치</span>
                    <ColorField value={cpColor} onChange={setCpColor} />
                  </div>
                )}
              </div>
            )}
            {/* 그림자 (v2.0 사용자 요청) — 어떤 색으로 얼마나 진하게 깔릴지. 자관명과 전신에 함께 걸린다 */}
            {(
              <div>
                <KCheck label="그림자 직접 지정 (자관명·전신)" checked={shadowCustom} onChange={setShadowCustom} />
                {shadowCustom && (
                  <div className="cf-stack" style={{ marginTop: 8 }}>
                    <div className="cf-row">
                      <span className="cp-lb">색</span>
                      <ColorField value={nameShadowColor} onChange={setNameShadowColor} />
                    </div>
                    <div className="cf-row">
                      <span className="cp-lb">강도</span>
                      <KStep value={nameShadow} min={0} max={200} step={10} suffix="%" onChange={setNameShadow} />
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* CP/NCP (v1.9) — CP=커플 · NCP=커플 아님. AU마다 따로 지정은 상세의 AU 관리에서 */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <label className="k-label" style={{ margin: 0 }}>구분</label>
              <div className="mini-seg">
                {(['cp', 'ncp'] as RelCpTag[]).map(t => (
                  <button key={t} className={cp === t ? 'on' : ''} onClick={() => setCp(t)}>{CP_LABEL[t]}</button>
                ))}
              </div>
            </div>
            {/* 뱃지 색 (v2.0 사용자 요청) — 자관명 위에 뜨는 CP/NCP 표시. AU마다 따로 */}
            {(
              <div>
                <KCheck label="CP 뱃지 색 직접 지정" checked={tagCustom} onChange={setTagCustom} />
                {tagCustom && (
                  <div className="cf-stack" style={{ marginTop: 8 }}>
                    <div className="cf-row">
                      <span className="cp-lb">배경</span>
                      <ColorField value={cpTagBg} onChange={setCpTagBg} />
                      <span className="cp-lb">글씨</span>
                      <ColorField value={cpTagFg} onChange={setCpTagFg} />
                    </div>
                    <div className="cf-row">
                      <span className="cp-lb">미리보기</span>
                      <span className="pill" style={{ background: cpTagBg, color: cpTagFg, borderColor: cpTagBg }}>
                        {CP_LABEL[cp]}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
            <p className="hint" style={{ margin: '2px 0 0' }}>이름 폰트 — 상세 대형 타이틀에 적용</p>
            <KSelect value={fontId} onChange={setFontId}
              options={fonts.map(f => ({ value: f.id, label: <span style={{ fontFamily: deVarFamily(f.family) }}>{f.name}</span> }))} />
            <p className="hint" style={{ margin: '2px 0 0' }}>본문 폰트 — 카드 소개·타임라인·문답 텍스트에 적용</p>
            <KSelect value={bodyFontId} onChange={setBodyFontId}
              options={fonts.map(f => ({ value: f.id, label: <span style={{ fontFamily: deVarFamily(f.family) }}>{f.name}</span> }))} />
            <div>
              <label className="k-label">페이지 테마{auObj ? ` — ${auObj.label}` : ''}</label>
              {/* AU 편집 (v1.9) — 기존(원본) 테마 따라가기 / 이 AU 전용 테마 */}
              {auObj && (
                <div className="mini-seg" style={{ marginBottom: 6 }}>
                  <button className={themeFollow ? 'on' : ''} onClick={() => setThemeFollow(true)}>기존 테마 따라가기</button>
                  <button className={!themeFollow ? 'on' : ''} onClick={() => setThemeFollow(false)}>이 AU 전용</button>
                </div>
              )}
              {!(auObj && themeFollow) && (
              <div className="mini-seg">
                <button className={themeMode === 'site' ? 'on' : ''} onClick={() => setThemeMode('site')}>홈페이지 테마 그대로</button>
                <button className={themeMode === 'custom' ? 'on' : ''} onClick={() => setThemeMode('custom')}>테마컬러 입력</button>
              </div>
              )}
              {!(auObj && themeFollow) && themeMode === 'custom' && (
                /* 공용 ColorField — 다른 색 입력들과 동일 스타일 (v1.9 사용자 피드백) */
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  <ColorField value={themeColor} onChange={setThemeColor} />
                  <div className="mini-seg">
                    <button className={themeTone === 'dark' ? 'on' : ''} onClick={() => setThemeTone('dark')}>다크 느낌</button>
                    <button className={themeTone === 'light' ? 'on' : ''} onClick={() => setThemeTone('light')}>라이트 느낌</button>
                  </div>
                </div>
              )}
              <p className="hint" style={{ margin: '6px 0 0' }}>
                {auObj && themeFollow
                  ? '이 AU는 원본 자관의 페이지 테마를 그대로 사용합니다'
                  : themeMode === 'custom'
                  ? '이 페이지에 들어가면 홈페이지 전체 팔레트가 이 색 기준으로 전환되고, 벗어나면 원래 테마로 돌아옵니다'
                  : '이 페이지도 홈페이지 테마를 그대로 사용합니다'}
              </p>
            </div>
            {/* 문답 답변 가리기 (v2.0 사용자 요청) — 방문자에게 답변 내용을 안 보이게.
                자관 전체 설정이라 AU 편집에서는 두지 않는다 */}
            {!auObj && (
              <div>
                <KCheck label="문답 답변 숨기기" checked={qaHide} onChange={setQaHide} />
                <p className="hint" style={{ margin: '5px 0 0', lineHeight: 1.6 }}>
                  질문은 그대로 두고 <b>답변 내용만</b> 가립니다 — 관리자와 이 자관 캐릭터에
                  권한을 받은 회원만 볼 수 있습니다.
                  {qaHide && (
                    <>
                      <br />
                      <b style={{ color: 'var(--accent)' }}>다만 화면에서 가리는 것이라 완전한 차단은 아닙니다.</b>{' '}
                      답변은 공개로 저장돼 있어 마음먹고 찾아보는 사람에게는 보일 수 있으니,
                      정말 알려지면 안 되는 내용은 적지 말아 주세요.
                    </>
                  )}
                </p>
              </div>
            )}

            {/* 페이지 배경 (v2.0 사용자 요청) — 이 페이지에 있는 동안의 바탕 그라데이션. AU마다 따로 */}
            {(
              <div>
                <KCheck label="페이지 배경 직접 지정" checked={pageBgCustom} onChange={setPageBgCustom} />
                {pageBgCustom && (
                  <div className="cf-stack" style={{ marginTop: 8 }}>
                    <div className="cf-row">
                      <ColorField value={pageBgG1} onChange={setPageBgG1} />
                      <span style={{ color: 'var(--faint)', fontSize: 11 }}>→</span>
                      <ColorField value={pageBgG2} onChange={setPageBgG2} />
                    </div>
                    <div className="cf-row">
                      <span className="cp-lb">각도</span>
                      <KStep value={pageBgAngle} min={0} max={360} step={15} suffix="°" onChange={setPageBgAngle} />
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* 전신/일러 스위치 색 (v1.9 사용자 요청) — 페어 중앙 이미지의 전환 스위치. AU마다 따로 (v2.0) */}
            {(
              <div>
                <KCheck label="전신/일러 스위치 색 직접 지정" checked={illuCustom} onChange={setIlluCustom} />
                {illuCustom && (
                  /* 한 줄 고정 (v1.9 사용자 피드백) — 좁은 패널에서 두 줄로 내려가지 않게 인풋이 줄어듦 */
                  <div className="cf-row" style={{ marginTop: 8 }}>
                    <span className="cp-lb">배경</span>
                    <ColorField value={illuBg} onChange={setIlluBg} />
                    <span className="cp-lb">선택</span>
                    <ColorField value={illuOn} onChange={setIlluOn} />
                  </div>
                )}
              </div>
            )}
            <KSelect value={visibility} onChange={v => setVisibility(v as Visibility)}
              options={[
                { value: 'public', label: '전체공개' },
                { value: 'member', label: '멤버공개' },
                { value: 'private', label: '나만보기' },
              ]} />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn btn-onbk" onClick={onCancel}>CANCEL</button>
          <button className="btn btn-accent" onClick={save}>
            {isNew ? 'ADD' : 'SAVE'}
          </button>
        </div>
      </div>

      {arts[0] && cropOpen && (
        <FirstArtCrop open={cropOpen} item={arts[0]} crop={thumbCrop}
          onClose={() => setCropOpen(false)}
          onApply={c => { setThumbCrop(c); setCropOpen(false); }} />
      )}
      {/* 아트 원본 보기 — 아직 저장 전 파일은 url, 저장된 것은 ref (Lightbox가 둘 다 처리) */}
      {lb !== null && (
        <Lightbox srcs={arts.map(a => a.url ?? a.ref ?? '')} index={lb} onClose={() => setLb(null)} />
      )}
      {del.element}
    </div>
  );
}

/** 저장된 헤더 이미지 미리보기 — 위치 크롭 반영 */
function HeaderPreview({ refId, crop }: { refId: string; crop?: CropValue }) {
  const url = useBlobUrl(refId);
  if (!url) return <div className="ph" style={{ width: '100%', height: '100%' }} />;
  return (
    <div style={{ position: 'absolute', inset: 0, filter: 'blur(2px)' }}>
      <CropImg src={url} crop={crop} />
    </div>
  );
}

/** 헤더 위치 크롭 — 새 파일(objectURL) 또는 저장 블롭 소스, 프레임 비율 = 상세 헤더(약 3:1) */
function HeaderCrop({ src, refId, crop, onClose, onApply }: {
  src: string; refId?: string; crop?: CropValue; onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const loaded = useBlobUrl(refId);
  const s = src || loaded;
  if (!s) return null;
  return <CropEditor open src={s} aspect={3} aspectLabel="헤더 비율" initial={crop} onClose={onClose} onApply={onApply} />;
}

/** 첫 아트(새 파일 또는 저장된 blob)를 소스로 4:3 크롭 편집기 */
function FirstArtCrop({ open, item, crop, onClose, onApply }: {
  open: boolean; item: ArtItem; crop?: CropValue;
  onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const [loadedUrl, setLoadedUrl] = useState('');
  useEffect(() => {
    if (item.url || !item.ref || !open) return;
    getBlob(item.ref).then(b => { if (b) setLoadedUrl(URL.createObjectURL(b)); });
  }, [item, open]);
  const src = item.url || loadedUrl;
  if (!src) return null;
  return <CropEditor open={open} src={src} aspect="4:3" initial={crop} onClose={onClose} onApply={onApply} />;
}
