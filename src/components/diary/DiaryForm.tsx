'use client';
// 일기 작성/수정 공용 폼 (4.14) — 제목 · 날짜 · 무드 · 내용(MD) · 이미지 · 공개범위
import React, { useState } from 'react';
import { DiaryPost, Mood, moodTint } from '@/lib/diaryStore';
import { Visibility } from '@/lib/charStore';
import { newId } from '@/lib/postStore';
import { KInput, KTextarea, KSelect, KDate } from '@/components/ui/Kit';
import { DragList } from '@/components/ui/DragList';
import { useConfirmDelete } from '@/components/ui/Modal';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { useToast } from '@/components/ui/Toast';
import { useImageSource } from '@/components/ui/ImageSource';
import { fileDrop } from '@/lib/dnd';

export interface DiaryFormValue {
  title: string; date: string; moodId: string; body: string;
  imgIds: string[]; visibility: Visibility;
}

interface ImgItem { id: string; ref?: string; url?: string; file?: File }

function ImgThumb({ item, onReplace }: { item: ImgItem; onReplace: (url: string) => void }) {
  const loaded = useBlobUrl(item.ref);
  const src = item.url ?? loaded;
  const source = useImageSource(onReplace);
  return <div tabIndex={0} style={{ display: 'flex', gap: 8, alignItems: 'center' }} {...source.handlers}
    onDragOver={e => e.preventDefault()}>
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {src && <img src={src} alt="" referrerPolicy="no-referrer" style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 6 }} />}
    <button type="button" className="btn btn-ghost" style={{ padding: '4px 8px', fontSize: 10 }}
      onClick={() => source.open()}>🔗 주소로 교체</button>
    {source.element}
  </div>;
}

export function DiaryForm({ initial, moods, onSave, onCancel }: {
  initial: DiaryPost | null;
  moods: Mood[];
  onSave: (v: DiaryFormValue) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const isNew = !initial;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(initial?.date ?? todayStr);
  const [moodId, setMoodId] = useState(initial?.moodId ?? moods[0]?.id ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [imgs, setImgs] = useState<ImgItem[]>(() => (initial?.imgIds ?? []).map(r => ({ id: newId(), ref: r })));
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? 'public');
  const del = useConfirmDelete();   // 이미지 제거도 경고를 거친다
  const addImages = (list: FileList | null) => {
    if (list) setImgs(prev => [...prev, ...Array.from(list).map(f => ({ id: newId(), url: URL.createObjectURL(f), file: f }))]);
  };
  const imageSource = useImageSource(url => setImgs(prev => [...prev, { id: newId(), ref: url }]));

  const save = async () => {
    if (!title.trim()) { toast('제목을 입력해 주세요'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('날짜를 YYYY-MM-DD 형식으로 입력해 주세요'); return; }
    const imgIds = await Promise.all(imgs.map(i => (i.file ? putBlob(i.file) : Promise.resolve(i.ref!))));
    onSave({ title: title.trim(), date, moodId, body, imgIds, visibility });
  };

  return (
    <div className="write-grid">
      <div className="panel" style={{ padding: 24, display: 'grid', gap: 12, alignContent: 'start' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <KInput placeholder="제목" value={title} onChange={e => setTitle(e.target.value)} style={{ flex: 1 }} />
          <KDate value={date} onChange={setDate} style={{ maxWidth: 130 }} />
        </div>
        <div>
          <label className="k-label" style={{ marginBottom: 6 }}>무드</label>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {moods.map(m => (
              <button key={m.id}
                className="mood-pick"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 13px', borderRadius: 999,
                  border: `1.5px solid ${moodId === m.id ? m.color : 'var(--line)'}`,
                  background: moodId === m.id ? moodTint(m.color) : 'transparent',
                  fontSize: 12, transition: '.15s',
                }}
                onClick={() => setMoodId(m.id)}>
                <span style={{ color: m.color }}>{m.icon}</span> {m.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="k-label" style={{ marginBottom: 6 }}>내용 — 마크다운 지원</label>
          <KTextarea value={body} onChange={e => setBody(e.target.value)} style={{ minHeight: 180 }} />
        </div>
        <label className="k-label" style={{ margin: 0 }}>이미지 (선택) — 본문 아래에 순서대로 표시 · ⠿ 순서</label>
        {imgs.length > 0 && (
          <DragList items={imgs} keyOf={i => i.id} onReorder={setImgs}
            render={i => (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', padding: '3px 0' }}>
                <span className="drag-h">⠿</span>
                <ImgThumb item={i} onReplace={url =>
                  setImgs(list => list.map(item => item.id === i.id ? { id: item.id, ref: url } : item))} />
                <span className="fx" style={{ marginLeft: 'auto' }}
                  onClick={() => del.ask('이 이미지를 빼시겠습니까?',
                    () => setImgs(l => l.filter(x => x.id !== i.id)))}>✕</span>
              </div>
            )} />
        )}
        <input id="dyImgF" type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => {
            addImages(e.target.files);
            e.target.value = '';
          }} />
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11, justifySelf: 'center' }}
          {...imageSource.handlers} {...fileDrop(addImages)}
          onClick={() => document.getElementById('dyImgF')?.click()}>＋ ADD IMAGE</button>
        <button type="button" className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11, justifySelf: 'center' }}
          onClick={() => imageSource.open()}>🔗 이미지 주소로 넣기</button>
        {imageSource.element}
      </div>

      <div>
        <div className="panel widget" style={{ marginBottom: 14 }}>
          <h4>공개범위</h4>
          <KSelect value={visibility} onChange={v => setVisibility(v as Visibility)}
            options={[
              { value: 'public', label: '전체공개' },
              { value: 'member', label: '멤버공개' },
              { value: 'private', label: '나만보기' },
            ]} />
          <p className="hint" style={{ marginTop: 8 }}>비공개 일기는 메인 「최근 일기」 위젯에 절대 노출되지 않습니다</p>
        </div>
        <div className="form-actions">
          <button className="btn btn-onbk" onClick={onCancel}>CANCEL</button>
          <button className="btn btn-accent" onClick={save}>
            {isNew ? 'POST' : 'SAVE'}
          </button>
        </div>
      </div>
      {del.element}
    </div>
  );
}
