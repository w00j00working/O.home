'use client';
// 캐릭터 등록/프로필 편집 — 전용 페이지 폼 (4.4)
// 모달이 아니라 페이지라 잘못 클릭해도 닫히지 않음. 탭 내용은 별도 편집 화면으로 전환해 작성.
// 아트는 여러 장 — 첫 장이 대표 풀 아트이자 리스트 썸네일(3:4 크롭) 원본 (6.1)
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Character, CharTab, ColorChip, Visibility, CharGrant } from '@/lib/charStore';
import { GrantsEditor } from '@/components/chars/GrantsEditor';
import { newId } from '@/lib/postStore';
import { putBlob, getBlob, useBlobUrl } from '@/lib/blobStore';
import { useFonts, deVarFamily } from '@/lib/fontStore';
import { KInput, KSelect, KStep, KCheck } from '@/components/ui/Kit';
import { RichEditor } from '@/components/ui/RichEditor';
import { ColorField } from '@/components/ui/ColorField';
import { CropEditor, CropValue, CropImg } from '@/components/ui/CropEditor';
import { DragList } from '@/components/ui/DragList';
import { useConfirmDelete } from '@/components/ui/Modal';
import { SymbolInput } from '@/components/ui/SymbolInput';
import { fileDrop } from '@/lib/dnd';
import { isValidSlug, slugify } from '@/lib/link';
import { useToast } from '@/components/ui/Toast';
import { Lightbox } from '@/components/ui/Lightbox';

interface SpecRow { id: string; label: string; value: string }
interface ColorRow extends ColorChip { id: string }
interface ArtItem { id: string; ref?: string; url?: string; file?: File }

function ArtThumb({ item, crop }: { item: ArtItem; crop?: CropValue }) {
  const loaded = useBlobUrl(item.ref);
  const src = item.url ?? loaded;
  if (!src) return <div className="ph" style={{ width: '100%', height: '100%' }} />;
  return <CropImg src={src} crop={crop} />;
}

export function CharEditForm({ initial, onSave, onCancel, auMode, existingIds }: {
  initial: Character | null;               // null = 신규 등록
  onSave: (c: Character) => void;
  onCancel: () => void;
  auMode?: boolean;                        // AU 전용 편집 (v1.9) — 공개범위·회원권한은 base 소관이라 숨김
  existingIds?: string[];                  // 페이지 주소 중복 검사용 (v1.9 — 신규 등록)
}) {
  const { fonts, familyOf } = useFonts();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const isNew = !initial;

  const [name, setName] = useState(initial?.name ?? '');
  // 페이지 주소 /chars/{slug} — 신규는 비우면 자동(id). 수정에서도 바꿀 수 있다 (v2.0 사용자 요청):
  // id는 그대로 두고 별명(slug)만 저장하므로 참조가 끊어지지 않고 옛 주소도 계속 열린다
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [sub, setSub] = useState(initial?.sub ?? '');
  const [color, setColor] = useState(initial?.color ?? '#5d636d');
  const [themeMode, setThemeMode] = useState<'default' | 'custom'>(initial?.themeMode ?? 'default');
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? 'public');
  const [fontId, setFontId] = useState(initial?.fontId ?? 'serif');
  const [nameSize, setNameSize] = useState(initial?.nameSize ?? 38);   // 상세 큰 이름 크기 (v2.0)
  const [nameBold, setNameBold] = useState(initial?.nameBold ?? true); // 상세 이름 볼드 (v2.0 — 기본 켜짐)
  const [bodyFontId, setBodyFontId] = useState(initial?.bodyFontId ?? 'default');
  const [specs, setSpecs] = useState<SpecRow[]>(
    (initial?.specs ?? [{ label: '성별', value: '' }, { label: '키', value: '' }]).map(s => ({ ...s, id: newId() })));
  const [colors, setColors] = useState<ColorRow[]>((initial?.colors ?? []).map(c => ({ ...c, id: newId() })));
  const [colorTipMode, setColorTipMode] = useState<'hex' | 'both' | 'label'>(initial?.colorTipMode ?? 'hex');
  // 색 점 테두리 (v2.0 사용자 요청) — 없음 / 1px(색 지정). 미지정이면 지금까지의 옅은 테두리
  const [colorBd, setColorBd] = useState<string | undefined>(initial?.colorBd);
  const [basicHtml, setBasicHtml] = useState(initial?.basicHtml ?? '');
  const [tabs, setTabs] = useState<CharTab[]>(initial?.tabs ?? []);
  const [arts, setArts] = useState<ArtItem[]>(() => {
    const refs = initial?.arts ?? (initial?.artId ? [initial.artId] : initial?.thumbId ? [initial.thumbId] : []);
    return refs.map(r => ({ id: newId(), ref: r }));
  });
  const [thumbCrop, setThumbCrop] = useState<CropValue | undefined>(initial?.thumbCrop);
  const [grants, setGrants] = useState<CharGrant[]>(initial?.grants ?? []); // 상대 캐릭터 회원 권한 (v1.9)
  const [cropOpen, setCropOpen] = useState(false);
  const [lb, setLb] = useState<number | null>(null);   // 아트 썸네일 클릭 → 원본 보기
  // 화면 전환: 메인 폼 / 탭 전용 편집 화면
  const [view, setView] = useState<'main' | string>('main');

  const addArts = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const items = Array.from(list).map(f => ({ id: newId(), url: URL.createObjectURL(f), file: f }));
    setArts(prev => {
      if (prev.length === 0) { setThumbCrop(undefined); setCropOpen(true); } // 첫 장 → 썸네일 크롭 (6.1)
      return [...prev, ...items];
    });
  };

  const save = async () => {
    if (!name.trim()) { toast('이름을 입력해 주세요'); return; }
    // 페이지 주소 (v1.9 / 수정도 가능 v2.0) — 유효성·중복 검사
    if (slug && slug !== (initial?.slug ?? '')) {
      if (!isValidSlug(slug)) { toast('주소는 영문 소문자·숫자·하이픈만 쓸 수 있습니다'); return; }
      if (existingIds?.includes(slug)) { toast('이미 사용 중인 주소입니다 — 다른 주소를 입력해 주세요'); return; }
    }
    const artIds = await Promise.all(arts.map(a => (a.file ? putBlob(a.file) : Promise.resolve(a.ref!))));
    onSave({
      id: initial?.id ?? (slug || newId()),
      // 수정에서 정한 주소는 별명으로 (v2.0) — 신규는 주소가 곧 id라 따로 남기지 않는다
      slug: !isNew ? (slug.trim() || undefined) : undefined,
      // 입력한 그대로 저장 — 예전에는 대문자로 바꿔 저장해서 소문자 이름을 쓸 수 없었다
      name: name.trim(),
      sub: sub.trim(),
      color,
      themeMode,
      colors: colors.filter(x => x.hex).map(({ hex, label }) => ({ hex, label })),
      colorTipMode,
      colorBd,
      specs: specs.filter(s => s.label.trim()).map(({ label, value }) => ({ label: label.trim(), value })),
      tabs,   // 제목이 비어도 유지 — 필터로 사라지던 버그 수정 (v1.9 사용자 지적)
      basicHtml,
      visibility,
      fontId,
      nameSize,
      nameBold,
      bodyFontId,
      thumbClass: initial?.thumbClass ?? '',
      arts: artIds,
      thumbId: artIds[0],       // 썸네일 = 첫 아트 + 크롭
      thumbCrop,
      artId: artIds[0],
      own: initial?.own ?? true,
      grants: grants.length ? grants : undefined,
    });
  };

  const rowInp: React.CSSProperties = { fontSize: 12, padding: '7px 10px' };
  const addBtn: React.CSSProperties = { padding: '5px 12px', fontSize: 11, justifySelf: 'center' };

  // 탭 삭제 — 경고 모달을 거침 (v1.9)
  const del = useConfirmDelete();
  const askDeleteTab = (tabId: string, after?: () => void) => {
    const t = tabs.find(x => x.id === tabId);
    del.ask(`탭 「${t?.title || '제목 없음'}」을 삭제하시겠습니까?`, () => {
      setTabs(l => l.filter(x => x.id !== tabId));
      after?.();
    }, '탭에 작성한 내용도 함께 사라집니다. 저장(SAVE) 전까지는 CANCEL로 폼을 벗어나면 되돌릴 수 있습니다.');
  };

  /* ---------- 탭 전용 편집 화면 ---------- */
  const curTab = tabs.find(t => t.id === view);
  if (curTab) {
    return <>
      <TabEditView
        tab={curTab}
        onChange={patch => setTabs(l => l.map(x => (x.id === curTab.id ? { ...x, ...patch } : x)))}
        onDelete={() => askDeleteTab(curTab.id, () => setView('main'))}
        onBack={() => setView('main')} />
      {del.element}
    </>;
  }

  /* ---------- 메인 폼 ---------- */
  return (
    <div className="write-grid">
      {/* 좌: 아트/스펙/컬러/본문/탭 */}
      <div className="panel" style={{ padding: 24, display: 'grid', gap: 12, alignContent: 'start' }}>
        {/* 아트 목록 */}
        <label className="k-label" style={{ margin: 0 }}>
          아트 <span style={{ fontWeight: 400, color: 'var(--faint)' }}>— 첫 장이 대표 풀 아트 · 리스트 썸네일은 첫 장에서 3:4 크롭 · ⠿ 순서 변경</span>
        </label>
        {arts.length > 0 && (
          <DragList items={arts} keyOf={a => a.id} onReorder={setArts}
            render={(a, i) => (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', padding: '3px 0' }}>
                <span className="drag-h">⠿</span>
                <div data-tip="클릭하면 원본 보기" onClick={() => setLb(i)}
                  style={{ width: 64, aspectRatio: '3/4', borderRadius: 7, overflow: 'hidden', position: 'relative', flexShrink: 0, cursor: 'zoom-in' }}>
                  <ArtThumb item={a} crop={i === 0 ? thumbCrop : undefined} />
                </div>
                {i === 0 ? (
                  <>
                    <span className="pill dark">대표 · 썸네일</span>
                    {/* 옆의 「대표 · 썸네일」 뱃지와 세로 크기 통일 (23px).
                        상세 화면에 보일 위치는 상세에서 우클릭으로 잡는다 (v2.0) */}
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
        <input id="chArtsF" type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { addArts(e.target.files); e.target.value = ''; }} />
        <button className="btn btn-ghost" style={addBtn}
          onClick={() => document.getElementById('chArtsF')?.click()}
          {...fileDrop(fl => addArts(fl))}>
          ＋ ADD ART {arts.length === 0 && '(첫 장 등록 시 썸네일 크롭 지정)'}
        </button>

        {/* 기본 정보 스펙 */}
        <label className="k-label" style={{ margin: 0 }}>기본 정보 항목</label>
        <DragList items={specs} keyOf={s => s.id} onReorder={setSpecs}
          render={s => (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', width: '100%', padding: '2px 0' }}>
              <span className="drag-h">⠿</span>
              <KInput placeholder="항목" value={s.label} style={{ ...rowInp, width: 90 }}
                onChange={e => setSpecs(l => l.map(x => x.id === s.id ? { ...x, label: e.target.value } : x))} />
              <KInput placeholder="값" value={s.value} style={rowInp}
                onChange={e => setSpecs(l => l.map(x => x.id === s.id ? { ...x, value: e.target.value } : x))} />
              <span className="fx" onClick={() => {
                const remove = () => setSpecs(l => l.filter(x => x.id !== s.id));
                if (s.label.trim() || s.value.trim()) del.ask('이 항목을 삭제하시겠습니까?', remove, `${s.label} — ${s.value}`);
                else remove();
              }}>✕</span>
            </div>
          )} />
        <button className="btn btn-ghost" style={addBtn}
          onClick={() => setSpecs(l => [...l, { id: newId(), label: '', value: '' }])}>＋ ADD</button>

        {/* 테마 컬러 — 한 줄에 2개 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label className="k-label" style={{ margin: 0 }}>테마 컬러 (프로필 색 점 나열)</label>
          <div className="mini-seg" data-tip="색 점 호버 툴팁 표기 방식">
            <button className={colorTipMode === 'hex' ? 'on' : ''} onClick={() => setColorTipMode('hex')}>hex</button>
            <button className={colorTipMode === 'both' ? 'on' : ''} onClick={() => setColorTipMode('both')}>이름+hex</button>
            <button className={colorTipMode === 'label' ? 'on' : ''} onClick={() => setColorTipMode('label')}>이름만</button>
          </div>
          {/* 색 점 테두리 (v2.0 사용자 요청) — 안 정하면 지금까지의 옅은 테두리 그대로 */}
          <div className="mini-seg" data-tip="색 점 테두리">
            <button className={colorBd === undefined ? 'on' : ''} onClick={() => setColorBd(undefined)}>기본</button>
            <button className={colorBd === 'none' ? 'on' : ''} onClick={() => setColorBd('none')}>없음</button>
            <button className={colorBd !== undefined && colorBd !== 'none' ? 'on' : ''}
              onClick={() => setColorBd(c => (c && c !== 'none' ? c : '#1d2025'))}>1px</button>
          </div>
          {colorBd !== undefined && colorBd !== 'none' && (
            <ColorField value={colorBd} onChange={setColorBd} />
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 10px' }}>
          {colors.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
              <ColorField value={c.hex} onChange={hex => setColors(l => l.map(x => x.id === c.id ? { ...x, hex } : x))} />
              <KInput placeholder="라벨" value={c.label} style={{ ...rowInp, flex: 1, minWidth: 50 }}
                onChange={e => setColors(l => l.map(x => x.id === c.id ? { ...x, label: e.target.value } : x))} />
              <span className="fx" onClick={() => del.ask('이 컬러를 삭제하시겠습니까?', () => setColors(l => l.filter(x => x.id !== c.id)), c.label || c.hex)}>✕</span>
            </div>
          ))}
        </div>
        <button className="btn btn-ghost" style={addBtn}
          onClick={() => setColors(l => [...l, { id: newId(), hex: '#888888', label: '' }])}>＋ ADD COLOR</button>

        {/* 기본 소개 본문 — 리치 에디터 */}
        <label className="k-label" style={{ margin: 0 }}>기본 정보 소개 본문</label>
        <RichEditor value={basicHtml} onChange={setBasicHtml}
          placeholder="캐릭터 소개를 작성하세요 — 이미지 삽입 가능 (스크립트 불허 6.3)" />

        {/* 추가 탭 — 목록만, 내용은 전용 화면에서 */}
        <label className="k-label" style={{ margin: 0 }}>추가 탭 — 내용은 [편집]을 눌러 전용 화면에서 작성</label>
        {tabs.map(t => (
          <div key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center', border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 10px' }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: '#eef0f2', display: 'grid', placeItems: 'center', fontSize: 14, flexShrink: 0 }}>{t.icon}</span>
            <b style={{ fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title || '(제목 없음)'}</b>
            {t.subtitle && <small style={{ color: 'var(--faint)', fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subtitle}</small>}
            <small style={{ color: 'var(--faint)', fontSize: 10.5, flexShrink: 0 }}>{t.html ? `${t.html.length.toLocaleString()}자` : '비어 있음'}</small>
            <button className="btn btn-dark" style={{ marginLeft: 'auto', height: 27, padding: '0 12px', fontSize: 11 }}
              onClick={() => setView(t.id)}>편집 ›</button>
            <span className="fx" onClick={() => askDeleteTab(t.id)}>✕</span>
          </div>
        ))}
        <button className="btn btn-ghost" style={addBtn}
          onClick={() => {
            const id = newId();
            setTabs(l => [...l, { id, icon: '✦', title: '', html: '' }]);
            setView(id); // 바로 전용 편집 화면으로
          }}>＋ ADD TAB</button>

        {/* 회원 권한 — 역극 플레이 / 편집까지 (3차 회원-캐릭터 연결, v1.9) — AU 편집에선 base 소관.
            **관리자만** (v2.0 사용자 확정) — 편집 권한을 받은 회원이 이 화면에 들어와도
            권한 관리는 못 한다. 열어 두면 자기가 받은 권한으로 남에게 권한을 나눠 줄 수 있다.
            저장 시에는 기존 grants가 그대로 보존된다(이 화면에서 건드리지 않으므로).
            **own 여부와 무관하게** (v2.0 포크 제보) — 예전에는 상대 캐릭터(own=false)에만 떠서,
            상대방 캐릭터까지 정식 캐릭터로 직접 등록해 쓰는 홈에서는 권한을 줄 방법이 없었다.
            관리자 전용이 된 지금은 이 제한이 있을 이유가 없다 — 권한 판정(charGrant·역극 참여)은
            원래부터 own을 보지 않는다. */}
        {!auMode && isAdmin && (
          <>
            <label className="k-label" style={{ margin: '6px 0 0' }}>회원 권한 — 역극 플레이 · 캐릭터 편집</label>
            <GrantsEditor value={grants} onChange={setGrants} />
          </>
        )}
      </div>

      {/* 우: 기본 설정 + 저장 */}
      <div>
        <div className="panel widget" style={{ marginBottom: 14 }}>
          <h4>기본</h4>
          <div style={{ display: 'grid', gap: 9 }}>
            <KInput placeholder="이름" value={name} onChange={e => setName(e.target.value)}
              style={{ fontFamily: familyOf(fontId) }} />
            {/* 페이지 주소 (v1.9) — /chars/{slug}, 비우면 자동 · 중복이면 경고.
                수정에서도 바꿀 수 있다 (v2.0 사용자 요청) — 비우면 원래 주소(id) 그대로.
                AU 편집에서는 주소가 base 소관이라 숨긴다 */}
            {!auMode && (
              <div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--faint)', whiteSpace: 'nowrap' }}>/chars/</span>
                  <KInput placeholder={isNew ? '페이지 주소 (선택)' : `페이지 주소 (비우면 ${initial?.id})`} value={slug}
                    onChange={e => setSlug(slugify(e.target.value))} style={{ flex: 1 }} />
                </div>
                {slug && slug !== (initial?.slug ?? '') && existingIds?.includes(slug) && (
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--accent)' }}>이미 사용 중인 주소입니다</p>
                )}
              </div>
            )}
            <KInput placeholder="한 줄 소개 (선택)" value={sub} onChange={e => setSub(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="cp-lb">대표 테마색</span>
              <ColorField value={color} onChange={setColor} />
            </div>
            {/* 상세 페이지 테마 (v1.9 사용자 확정) — 기존 테마 유지 / 대표 테마색으로 팔레트 전환 */}
            <div className="mini-seg">
              <button className={themeMode === 'default' ? 'on' : ''} onClick={() => setThemeMode('default')}>기존 테마 따르기</button>
              <button className={themeMode === 'custom' ? 'on' : ''} onClick={() => setThemeMode('custom')}>캐릭터 테마색</button>
            </div>
            {/* 공개범위는 base 소관 — AU 편집에선 숨김 (v1.9) */}
            {!auMode && (
              <KSelect value={visibility} onChange={v => setVisibility(v as Visibility)}
                options={[
                  { value: 'public', label: '전체공개' },
                  { value: 'member', label: '멤버공개' },
                  { value: 'private', label: '나만보기' },
                ]} />
            )}
            {/* 설명은 드롭다운 **위에** (v2.0 사용자 요청 — 자관 폼과 같은 배치) */}
            <p className="hint" style={{ margin: '2px 0 0' }}>이름 폰트 — 리스트·상세 이름에 적용</p>
            <KSelect value={fontId} onChange={setFontId}
              options={fonts.map(f => ({
                value: f.id,
                label: <span style={{ fontFamily: deVarFamily(f.family) }}>{f.name}</span>,
              }))} />
            {/* 이름 길이가 제각각이라 자동으로 줄이면 어중간해진다 — 캐릭터마다 직접 정한다 (v2.0) */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="k-label" style={{ margin: 0, flex: 1 }}>상세 이름 크기</span>
              {/* 폰트에 따라 볼드가 어색한 경우가 있어 끌 수 있게 (v2.0 사용자 요청) — 기본은 지금까지처럼 볼드 */}
              <KCheck label="Bold" checked={nameBold} onChange={setNameBold} />
              <KStep value={nameSize} onChange={setNameSize} min={14} max={72} step={1} suffix="px" />
            </div>
            <p className="hint" style={{ margin: '2px 0 0' }}>본문 폰트 — 프로필 정보·소개 텍스트에 적용</p>
            <KSelect value={bodyFontId} onChange={setBodyFontId}
              options={fonts.map(f => ({
                value: f.id,
                label: <span style={{ fontFamily: deVarFamily(f.family) }}>{f.name}</span>,
              }))} />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn btn-onbk" onClick={onCancel}>CANCEL</button>
          <button className="btn btn-accent" onClick={save}>
            {isNew ? 'ADD' : 'SAVE'}
          </button>
        </div>
      </div>

      {/* 썸네일 크롭 (3:4 — 첫 아트 기준, 6.1) */}
      {arts[0] && (
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

/* ---------- 탭 전용 편집 화면 — 큰 에디터 + 실시간 미리보기 ---------- */
function TabEditView({ tab, onChange, onDelete, onBack }: {
  tab: CharTab;
  onChange: (patch: Partial<CharTab>) => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  return (
    <div className="panel" style={{ padding: 24, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-ghost" onClick={onBack}>‹ 돌아가기</button>
        <b style={{ fontSize: 14 }}>탭 편집</b>
        <span className="hint" style={{ margin: 0 }}>이 화면의 내용은 프로필 [SAVE] 시 함께 저장됩니다</span>
        <button className="btn btn-ghost" style={{ marginLeft: 'auto', fontSize: 11 }} onClick={onDelete}>탭 삭제</button>
      </div>
      {/* 아이콘 + Title/Subtitle 한 줄 — Subtitle은 제목 아래 작은 글씨 (없으면 표시 안 됨) */}
      <div style={{ display: 'flex', gap: 8 }}>
        {/* 아이콘 — 클릭하면 특수문자 프리셋, 직접 입력도 가능 (v1.9) */}
        <SymbolInput value={tab.icon} maxLength={2} style={{ width: 56, textAlign: 'center' }}
          onChange={v => onChange({ icon: v })} />
        <KInput placeholder="탭 제목" value={tab.title}
          onChange={e => onChange({ title: e.target.value })} />
        <KInput placeholder="소제목 (선택)" value={tab.subtitle ?? ''}
          onChange={e => onChange({ subtitle: e.target.value })} />
      </div>
      {/* 리치 에디터 (TipTap) — 툴바로 서식·이미지 삽입, 출력은 HTML */}
      <RichEditor value={tab.html} onChange={html => onChange({ html })}
        placeholder="탭 내용을 작성하세요 — 이미지 삽입 가능 (스크립트 불허 6.3)" />
      <button className="btn btn-dark" style={{ justifySelf: 'end' }} onClick={onBack}>완료 — 목록으로</button>
    </div>
  );
}

/** 첫 아트(새 파일 또는 저장된 blob)를 소스로 3:4 크롭 편집기 표시 */
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
  if (!src || !open) return null;
  return <CropEditor open={open} src={src} aspect="3:4" initial={crop} onClose={onClose} onApply={onApply} />;
}

