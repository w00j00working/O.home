'use client';
// 도토리 등록/수정 공용 폼 (4.15) — 16:9 이미지 + 시나리오 정보 + 상태
import React, { useEffect, useState } from 'react';
import { DotoriItem, DotoriStatus, DOTORI_STATUS_KEYS, useTrpgSettings } from '@/lib/galleryStore';
import { KInput, KSelect } from '@/components/ui/Kit';
import { CropEditor, CropValue, CropImg, CroppedBlobImg } from '@/components/ui/CropEditor';
import { useToast } from '@/components/ui/Toast';
import { useImageSource, resolveImageRef, type ImageSource } from '@/components/ui/ImageSource';

export interface DotoriFormValue {
  name: string; writer: string; rule: string; people: string;
  tags: string[]; link?: string; status: DotoriStatus;
  imgId?: string; thumbCrop?: CropValue;
}

export function DotoriForm({ initial, onSave, onCancel }: {
  initial: DotoriItem | null;
  onSave: (v: DotoriFormValue) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [trpgSet] = useTrpgSettings(); // 상태 라벨 (환경설정 > TRPG)
  const isNew = !initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [writer, setWriter] = useState(initial?.writer ?? '');
  const [rule, setRule] = useState(initial?.rule ?? '');
  const [people, setPeople] = useState(initial?.people ?? '');
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '));
  const [link, setLink] = useState(initial?.link ?? '');
  // 새로 담는 시나리오는 대개 아직 일정이 없다 — 기본값을 「일정 미정」으로 (사용자 확정)
  const [status, setStatus] = useState<DotoriStatus>(initial?.status ?? 'undecided');
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState('');
  const [removed, setRemoved] = useState(false);
  const [crop, setCrop] = useState<CropValue | undefined>(initial?.thumbCrop);
  const [cropOpen, setCropOpen] = useState(false);
  const source = useImageSource(url => {
    setFile(null); setFileUrl(url); setRemoved(false); setCrop(undefined); setCropOpen(true);
  });
  useEffect(() => () => { if (fileUrl.startsWith('blob:')) URL.revokeObjectURL(fileUrl); }, [fileUrl]);

  const save = async () => {
    if (!name.trim()) { toast('시나리오 이름을 입력해 주세요'); return; }
    const image: ImageSource | undefined = file ? { kind: 'file', file } : fileUrl ? { kind: 'url', url: fileUrl } : undefined;
    onSave({
      name: name.trim(), writer: writer.trim(), rule: rule.trim(), people: people.trim(),
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      link: link.trim() || undefined, status,
      imgId: image ? await resolveImageRef(image) : (removed ? undefined : initial?.imgId),
      thumbCrop: crop,
    });
  };

  return (
    <div className="write-grid">
      {/* 좌: 이미지 */}
      <div className="panel" style={{ padding: 24, display: 'grid', gap: 12, alignContent: 'start' }}>
        <label className="k-label" style={{ margin: 0 }}>
          이미지 <span style={{ fontWeight: 400, color: 'var(--faint)' }}>— 카드 썸네일 16:9 · 원본은 잘리지 않음 (선택)</span>
        </label>
        <div tabIndex={0} {...source.handlers} style={{ aspectRatio: '16/9', borderRadius: 9, overflow: 'hidden', position: 'relative', border: '1.5px dashed var(--line)', cursor: 'var(--cur-pointer,pointer)' }} onClick={() => document.getElementById('dtImgF')?.click()}>
          {fileUrl
            ? <CropImg src={fileUrl} crop={crop} />
            : (!removed && initial?.imgId)
              ? <CroppedBlobImg fileRef={initial.imgId} crop={crop} ph="" />
              : <div className="ph" style={{ position: 'absolute', inset: 0 }}><span style={{ fontSize: 10 }}>SCENARIO</span></div>}
        </div>
        <input id="dtImgF" type="file" accept="image/*" style={{ display: 'none' }}
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) { setFile(f); setFileUrl(URL.createObjectURL(f)); setRemoved(false); setCrop(undefined); setCropOpen(true); }
            e.target.value = '';
          }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-ghost" onClick={() => source.open()}>🔗 이미지 주소 붙여넣기</button>
          {(fileUrl || (!removed && initial?.imgId)) && (
            <>
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                onClick={() => setCropOpen(true)}>✂ 썸네일 위치</button>
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                onClick={() => { setFile(null); setFileUrl(''); setRemoved(true); setCrop(undefined); }}>이미지 제거</button>
            </>
          )}
        </div>
      </div>

      {/* 우: 정보 + 저장 */}
      <div>
        <div className="panel widget" style={{ marginBottom: 14 }}>
          <h4>시나리오</h4>
          <div style={{ display: 'grid', gap: 9 }}>
            <KInput placeholder="시나리오 이름" value={name} onChange={e => setName(e.target.value)} />
            <div style={{ display: 'flex', gap: 8 }}>
              <KInput placeholder="라이터" value={writer} onChange={e => setWriter(e.target.value)} />
              <KInput placeholder="룰" value={rule} onChange={e => setRule(e.target.value)} style={{ maxWidth: 130 }} />
              <KInput placeholder="인원" value={people} onChange={e => setPeople(e.target.value)} style={{ maxWidth: 90 }} />
            </div>
            <KInput placeholder="태그 — 쉼표로 구분" value={tags} onChange={e => setTags(e.target.value)} />
            <KInput placeholder="링크 (선택)" value={link} onChange={e => setLink(e.target.value)} />
            <KSelect value={status} onChange={v => setStatus(v as DotoriStatus)}
              options={DOTORI_STATUS_KEYS.map(s => ({ value: s, label: trpgSet.statuses[s].label }))} />
            <p className="hint" style={{ margin: 0 }}>뱃지는 공수표·일정 확정만 카드에 표시 — 완은 완 탭에서만 보입니다</p>
          </div>
        </div>
        <div className="form-actions">
          <button className="btn btn-onbk" onClick={onCancel}>CANCEL</button>
          <button className="btn btn-accent" onClick={save}>
            {isNew ? 'ADD' : 'SAVE'}
          </button>
        </div>
      </div>

      {cropOpen && (fileUrl || initial?.imgId) && (
        <DtCrop src={fileUrl} refId={!fileUrl ? initial?.imgId : undefined} crop={crop}
          onClose={() => setCropOpen(false)}
          onApply={c => { setCrop(c); setCropOpen(false); }} />
      )}
      {source.element}
    </div>
  );
}

/** 새 파일(objectURL) 또는 저장 블롭을 소스로 16:9 크롭 */
import { useBlobUrl } from '@/lib/blobStore';
function DtCrop({ src, refId, crop, onClose, onApply }: {
  src: string; refId?: string; crop?: CropValue; onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const loaded = useBlobUrl(refId);
  const s = src || loaded;
  if (!s) return null;
  return <CropEditor open src={s} aspect="16:9" initial={crop} onClose={onClose} onApply={onApply} />;
}
