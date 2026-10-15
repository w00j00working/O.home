'use client';
// TRPG 캐릭터 등록/수정 폼 (v1.9) — 페이지형.
// 이미지 방식: 단일 인장(표정마다 개별 1:1 크롭) / 스탠딩 인장(모든 파일의 가로세로 크기 동일 강제 —
// 썸네일 크롭 위치를 한 번만 잡아 전 표정에 공유). 표정: 라벨 · ⠿ 순서 · 첫 장 = 대표
import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocalList, newId } from '@/lib/postStore';
import { TrpgChar, TrpgFace, TCHAR_SEED } from '@/lib/tcharStore';
import { getBlob, useBlobUrl } from '@/lib/blobStore';
import { CropEditor, CropImg, CropValue } from '@/components/ui/CropEditor';
import { KInput } from '@/components/ui/Kit';
import { RichEditor } from '@/components/ui/RichEditor';
import { DragList } from '@/components/ui/DragList';
import { Modal, useConfirmDelete } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { useImageSource, resolveImageRef } from '@/components/ui/ImageSource';

interface FaceDraft {
  id: string;
  label: string;
  imgId?: string;            // 저장돼 있던 이미지 (수정 모드)
  file?: File;               // 새 업로드
  url?: string;              // objectURL 미리보기
  crop?: CropValue;          // 단일 인장 모드의 개별 크롭
  ph?: string;               // 시드 데모
  w?: number; h?: number;    // 원본 크기 (스탠딩 검증)
}

const imgDims = (src: string) => new Promise<{ w: number; h: number }>((resolve, reject) => {
  const im = new Image();
  im.referrerPolicy = 'no-referrer';
  im.onload = () => resolve({ w: im.naturalWidth, h: im.naturalHeight });
  im.onerror = reject;
  im.src = src;
});

/** 표정 행 썸네일 (1:1 크롭 미리보기) */
function FaceThumb({ f, crop }: { f: FaceDraft; crop?: CropValue }) {
  const loaded = useBlobUrl(f.imgId);
  const src = f.url ?? loaded;
  if (!src) return <div className={`ph ${f.ph ?? 'cool'}`} style={{ position: 'absolute', inset: 0 }} />;
  return <CropImg src={src} crop={crop} />;
}

/** 표정 원본 전체 보기 (v1.9) — 썸네일 클릭 시 크롭 없이 원본 그대로 */
function FaceViewModal({ f, onClose }: { f: FaceDraft; onClose: () => void }) {
  const loaded = useBlobUrl(f.imgId);
  const src = f.url ?? loaded;
  return (
    <Modal open onClose={onClose} title={f.label || undefined}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={f.label} style={{ display: 'block', maxWidth: '100%', maxHeight: '72vh', margin: '0 auto', borderRadius: 10 }} />
      ) : (
        <div className={`ph ${f.ph ?? 'cool'}`} style={{ height: 280, borderRadius: 10 }} />
      )}
    </Modal>
  );
}

/** 크롭 편집기 소스 — 새 파일이면 objectURL, 저장본이면 blob 로드 */
function FaceCropModal({ f, initial, onClose, onApply }: {
  f: FaceDraft; initial?: CropValue; onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const loaded = useBlobUrl(f.imgId);
  const src = f.url ?? loaded;
  if (!src) return null;
  return <CropEditor open src={src} aspect="1:1" initial={initial} onClose={onClose} onApply={onApply} />;
}

export function TCharForm({ editId }: { editId?: string }) {
  const router = useRouter();
  const toast = useToast();
  const del = useConfirmDelete();
  const [tchars, setTchars, loaded] = useLocalList<TrpgChar>('ohome.tchars.v1', TCHAR_SEED);
  const orig = editId ? tchars.find(c => c.id === editId) : undefined;

  const [name, setName] = useState(orig?.name ?? '');
  const [scenario, setScenario] = useState(orig?.scenario ?? '');
  const [rule, setRule] = useState(orig?.rule ?? '');
  const [role, setRole] = useState(orig?.role ?? '');
  const [desc, setDesc] = useState(orig?.desc ?? '');
  const [imgMode, setImgMode] = useState<'stamp' | 'standing'>(orig?.imgMode ?? 'stamp');
  const [sharedCrop, setSharedCrop] = useState<CropValue | undefined>(orig?.crop);
  const [stdDims, setStdDims] = useState<{ w: number; h: number } | null>(
    orig?.stdW && orig?.stdH ? { w: orig.stdW, h: orig.stdH } : null);
  const [faces, setFaces] = useState<FaceDraft[]>(() =>
    (orig?.faces ?? []).map(f => ({ id: f.id, label: f.label ?? '', imgId: f.imgId, crop: f.crop, ph: f.ph })));
  const [cropFor, setCropFor] = useState<FaceDraft | null>(null);      // 단일 인장 — 개별 크롭
  const [viewFor, setViewFor] = useState<FaceDraft | null>(null);      // 썸네일 클릭 — 원본 전체 보기 (v1.9)
  const [sharedCropOpen, setSharedCropOpen] = useState(false);         // 스탠딩 — 공유 크롭
  const fileRef = useRef<HTMLInputElement>(null);
  const blobUrls = useRef(new Set<string>());
  useEffect(() => {
    const current = new Set(faces.map(f => f.url).filter((url): url is string => !!url?.startsWith('blob:')));
    blobUrls.current.forEach(url => { if (!current.has(url)) URL.revokeObjectURL(url); });
    blobUrls.current = current;
  }, [faces]);
  useEffect(() => () => { blobUrls.current.forEach(url => URL.revokeObjectURL(url)); }, []);

  // 수정 모드 — 저장본은 mount 후에 로드되므로, 로드가 끝나면 폼을 한 번 채움
  // (첫 렌더의 useState 초기값 시점엔 orig가 아직 시드뿐이라 직접 등록한 캐릭터는 비어 있던 버그 수정)
  const hydrated = useRef(false);
  useEffect(() => {
    if (!editId || !loaded || hydrated.current) return;
    const o = tchars.find(c => c.id === editId);
    if (!o) return;
    hydrated.current = true;
    setName(o.name); setScenario(o.scenario ?? ''); setRule(o.rule ?? ''); setRole(o.role ?? '');
    setDesc(o.desc ?? '');
    setImgMode(o.imgMode ?? 'stamp');
    setSharedCrop(o.crop);
    setStdDims(o.stdW && o.stdH ? { w: o.stdW, h: o.stdH } : null);
    setFaces((o.faces ?? []).map(f => ({ id: f.id, label: f.label ?? '', imgId: f.imgId, crop: f.crop, ph: f.ph })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, loaded, tchars]);

  // 스탠딩 기준 크기 — 첫 이미지에서 확정 (기존 저장분은 저장된 기준값 사용)
  const resolveBase = async (): Promise<{ w: number; h: number } | null> => {
    if (stdDims) return stdDims;
    const first = faces.find(f => f.url || f.imgId);
    if (!first) return null;
    const blob = !first.url && first.imgId && !/^https?:\/\//i.test(first.imgId) ? await getBlob(first.imgId) : null;
    const temporaryUrl = blob ? URL.createObjectURL(blob) : null;
    const src = first.url ?? temporaryUrl ?? first.imgId;
    if (!src) return null;
    try {
      const d = await imgDims(src);
      setStdDims(d);
      return d;
    } finally {
      if (temporaryUrl) URL.revokeObjectURL(temporaryUrl);
    }
  };

  const addFaces = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const picked = Array.from(list); // 라이브 FileList 즉시 복사
    const items: FaceDraft[] = [];
    let base: { w: number; h: number } | null;
    try { base = imgMode === 'standing' ? await resolveBase() : null; }
    catch { toast('기준 이미지를 읽을 수 없습니다'); return; }
    for (const f of picked) {
      const url = URL.createObjectURL(f);
      const d = await imgDims(url).catch(() => null);
      if (!d) { toast(`이미지를 읽을 수 없습니다: ${f.name}`); URL.revokeObjectURL(url); continue; }
      if (imgMode === 'standing') {
        // 스탠딩 인장 — 모든 파일의 가로세로 크기가 같아야 썸네일 위치를 공유할 수 있음 (v1.9)
        if (!base) { base = d; setStdDims(d); }
        else if (d.w !== base.w || d.h !== base.h) {
          toast(`크기가 달라 제외되었습니다: ${f.name} (기준 ${base.w}×${base.h})`);
          URL.revokeObjectURL(url);
          continue;
        }
      }
      items.push({ id: newId(), label: '', file: f, url, w: d.w, h: d.h });
    }
    if (items.length === 0) return;
    setFaces(fs => [...fs, ...items]);
    // 첫 이미지면 바로 썸네일 위치 잡기
    if (faces.length === 0) {
      if (imgMode === 'standing') setSharedCropOpen(true);
      else setCropFor(items[0]);
    }
  };

  const source = useImageSource(url => {
    void (async () => {
      try {
        const d = await imgDims(url);
        const base = imgMode === 'standing' ? await resolveBase() : null;
        if (base && (d.w !== base.w || d.h !== base.h)) {
          toast(`크기가 달라 제외되었습니다 (기준 ${base.w}×${base.h})`);
          return;
        }
        if (imgMode === 'standing' && !base) setStdDims(d);
        const item: FaceDraft = { id: newId(), label: '', imgId: url, url, w: d.w, h: d.h };
        setFaces(fs => [...fs, item]);
        if (!faces.length) {
          if (imgMode === 'standing') setSharedCropOpen(true);
          else setCropFor(item);
        }
      } catch { toast('이미지를 읽을 수 없습니다'); }
    })();
  });

  const save = async () => {
    if (!name.trim()) { toast('이름을 입력해 주세요'); return; }
    const outFaces: TrpgFace[] = [];
    for (const f of faces) {
      outFaces.push({
        id: f.id, label: f.label.trim() || undefined,
        imgId: f.file ? await resolveImageRef({ kind: 'file', file: f.file }) : f.imgId,
        crop: imgMode === 'stamp' ? f.crop : undefined,
        ph: f.ph,
      });
    }
    if (outFaces.length === 0) outFaces.push({ id: newId(), label: '기본', ph: 'cool' });
    const patch = {
      name: name.trim(), scenario: scenario.trim(), rule: rule.trim(), role: role.trim(),
      desc, faces: outFaces, imgMode,
      crop: imgMode === 'standing' ? sharedCrop : undefined,
      stdW: imgMode === 'standing' ? stdDims?.w : undefined,
      stdH: imgMode === 'standing' ? stdDims?.h : undefined,
    };
    if (orig) {
      setTchars(tchars.map(c => c.id === orig.id ? { ...c, ...patch } : c));
      toast('저장되었습니다');
    } else {
      setTchars([{ id: newId(), ph: 'cool', ...patch }, ...tchars]);
      toast('캐릭터가 등록되었습니다');
    }
    router.push('/tchars');
  };

  const firstFace = faces.find(f => f.url || f.imgId);

  return (
    <div className="panel" style={{ maxWidth: 620, margin: '0 auto', padding: 26, display: 'grid', gap: 13 }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label className="k-label" style={{ marginBottom: 5 }}>Name</label>
          <KInput value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div style={{ width: 130 }}>
          <label className="k-label" style={{ marginBottom: 5 }}>Role</label>
          {/* PL · GMPC · HO1 등 자유 표기 */}
          <KInput value={role} onChange={e => setRole(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label className="k-label" style={{ marginBottom: 5 }}>Scenario</label>
          <KInput value={scenario} onChange={e => setScenario(e.target.value)} />
        </div>
        <div style={{ width: 160 }}>
          <label className="k-label" style={{ marginBottom: 5 }}>Rule</label>
          <KInput value={rule} onChange={e => setRule(e.target.value)} />
        </div>
      </div>

      {/* 이미지 방식 + 표정 목록 */}
      <div>
        <label className="k-label" style={{ marginBottom: 7 }}>이미지 방식</label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="mini-seg">
            <button className={imgMode === 'stamp' ? 'on' : ''} onClick={() => setImgMode('stamp')}>단일 인장</button>
            <button className={imgMode === 'standing' ? 'on' : ''} onClick={() => setImgMode('standing')}>스탠딩 인장</button>
          </div>
          {imgMode === 'standing' && (
            <>
              {stdDims && <span style={{ fontSize: 11, color: 'var(--faint)' }}>기준 {stdDims.w}×{stdDims.h}</span>}
              {firstFace && (
                <button className="btn btn-ghost" style={{ padding: '5px 11px', fontSize: 11 }}
                  onClick={() => setSharedCropOpen(true)}>✂ 썸네일 위치 (전 표정 공유)</button>
              )}
            </>
          )}
        </div>
        <p className="hint" style={{ margin: '6px 0 8px' }}>
          {imgMode === 'standing'
            ? '스탠딩 인장은 모든 표정 파일의 가로세로 크기가 같아야 합니다 — 썸네일 위치를 한 번만 잡아 전 표정에 적용'
            : '단일 인장은 표정마다 1:1 썸네일 위치를 따로 지정합니다'}
        </p>
        <div className="upzone" tabIndex={0} {...source.handlers} style={{ marginBottom: 8 }} onClick={() => fileRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); addFaces(e.dataTransfer.files); }}>
          <b style={{ display: 'block', marginBottom: 3 }}>
            {faces.length === 0 ? '표정 이미지를 끌어다 놓거나 클릭' : '＋ ADD FACE'}
          </b>
          표정별로 여러 장 등록 · ⠿ 드래그로 순서 · 첫 장이 대표
        </div>
        <button type="button" className="btn btn-ghost" onClick={() => source.open()}>🔗 이미지 주소 붙여넣기</button>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { addFaces(e.target.files); e.target.value = ''; }} />
        <DragList items={faces} keyOf={f => f.id} onReorder={setFaces}
          render={(f, i) => (
            <div className="upfile-row" style={{ width: '100%' }}>
              <span className="drag-h">⠿</span>
              <span className="mw-no">{i + 1}</span>
              <div className="pv" style={{ width: 44, height: 44, borderRadius: 9, overflow: 'hidden', position: 'relative', flexShrink: 0, cursor: 'var(--cur-pointer,pointer)' }}
                onClick={() => setViewFor(f)}>
                <FaceThumb f={f} crop={imgMode === 'standing' ? sharedCrop : f.crop} />
              </div>
              <KInput placeholder="표정 이름 (선택)" value={f.label}
                onChange={e => setFaces(l => l.map(x => x.id === f.id ? { ...x, label: e.target.value } : x))}
                style={{ flex: 1 }} />
              {imgMode === 'stamp' && (
                <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 10, whiteSpace: 'nowrap' }}
                  onClick={() => setCropFor(f)}>✂ 위치</button>
              )}
              <span className="fx" onClick={() =>
                del.ask('이 표정을 삭제하시겠습니까?', () => setFaces(l => l.filter(x => x.id !== f.id)))}>✕</span>
            </div>
          )} />
      </div>

      <div>
        <label className="k-label" style={{ marginBottom: 5 }}>간단한 설명</label>
        <RichEditor value={desc} onChange={setDesc} placeholder="캐릭터 소개를 작성하세요 (선택)" />
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        <button className="btn btn-ghost" onClick={() => router.push('/tchars')}>CANCEL</button>
        <button className="btn btn-dark" onClick={save}>{orig ? 'SAVE' : 'ADD'}</button>
      </div>

      {/* 단일 인장 — 표정별 개별 크롭 */}
      {cropFor && imgMode === 'stamp' && (
        <FaceCropModal f={faces.find(x => x.id === cropFor.id) ?? cropFor}
          initial={faces.find(x => x.id === cropFor.id)?.crop}
          onClose={() => setCropFor(null)}
          onApply={c => {
            setFaces(l => l.map(x => x.id === cropFor.id ? { ...x, crop: c } : x));
            setCropFor(null);
          }} />
      )}
      {/* 스탠딩 인장 — 공유 크롭 (첫 이미지 기준, 전 표정 동일 적용) */}
      {sharedCropOpen && firstFace && (
        <FaceCropModal f={firstFace} initial={sharedCrop}
          onClose={() => setSharedCropOpen(false)}
          onApply={c => { setSharedCrop(c); setSharedCropOpen(false); }} />
      )}
      {/* 썸네일 클릭 — 원본 전체 보기 (v1.9) */}
      {viewFor && <FaceViewModal f={faces.find(x => x.id === viewFor.id) ?? viewFor} onClose={() => setViewFor(null)} />}
      {del.element}
      {source.element}
    </div>
  );
}
