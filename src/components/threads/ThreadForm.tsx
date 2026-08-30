'use client';
// 감상타래 작품 등록/수정 폼 (4.17) — 페이지형 (등록: /threads/new · 수정: /threads/[id]/edit)
import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocalList, newId } from '@/lib/postStore';
import { useSectionParam, secStamp, secQuery, MAIN_SEC } from '@/lib/sectionStore';
import { ThreadWork, THREAD_SEED, useThreadSettings, threadCats } from '@/lib/threadStore';
import { useFonts } from '@/lib/fontStore';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { CropEditor, CropImg, CropValue } from '@/components/ui/CropEditor';
import { KInput, KSelect, KLabel } from '@/components/ui/Kit';
import { useToast } from '@/components/ui/Toast';

const PHS = ['cool', 'warm', 'pale', 'red'];

export function ThreadForm({ editId }: { editId?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [works, setWorks, loaded] = useLocalList<ThreadWork>('ohome.threads.v1', THREAD_SEED);
  // 어느 감상타래에서 눌러 왔는지 (v2.0)
  const sec = useSectionParam('threads');
  const [settings] = useThreadSettings();
  const { fonts, familyOf } = useFonts();
  const orig = editId ? works.find(w => w.id === editId) : undefined;
  /* **수정 중이면 그 글이 속한 곳이 기준이다** (v2.0 사용자 발견 — 포크 사용자 제보).
     수정 주소에는 `?s=`가 없어서 주소만 보면 늘 기본 섹션으로 읽힌다. 그러면 분류 목록이
     기본 섹션 것으로 바뀌어, 원래 고른 분류가 목록에 없으니 첫 항목으로 풀려 버린다. */
  const secId = orig ? (orig.secId ?? MAIN_SEC) : sec.id;
  // 분류는 섹션마다 따로 (v2.0 사용자 요청)
  const cats = threadCats(settings, secId);

  const [title, setTitle] = useState(orig?.title ?? '');
  const [fontId, setFontId] = useState(orig?.titleFontId ?? 'default');
  const [author, setAuthor] = useState(orig?.author ?? '');
  const [role, setRole] = useState(orig?.authorRole ?? '');
  const [catId, setCatId] = useState(orig?.catId ?? cats[0]?.id ?? 'book');
  /* 섹션 목록은 한 박자 늦게 읽힌다 — 처음 렌더에서는 기본 섹션으로 보여 첫 분류가
     이 타래에 없는 것으로 잡힐 수 있다(분류 칸이 「선택」인 채로 남았다).
     **새로 쓸 때만** 목록 안의 것으로 맞춘다 — 수정 중인 글의 분류를 말없이 바꾸면 안 된다. */
  useEffect(() => {
    if (!orig && cats.length > 0 && !cats.some(c => c.id === catId)) setCatId(cats[0].id);
  }, [cats, orig, catId]);
  const [vis, setVis] = useState<ThreadWork['visibility']>(orig?.visibility ?? 'public');
  // 포스터 (3:4) — 업로드 즉시 크롭 에디터 자동 오픈, 원본 무손실
  const [poster, setPoster] = useState<File | null>(null);
  const [posterUrl, setPosterUrl] = useState('');
  const [crop, setCrop] = useState<CropValue | undefined>(orig?.posterCrop);
  const [cropOpen, setCropOpen] = useState(false);
  const posterRef = useRef<HTMLInputElement>(null);
  const origUrl = useBlobUrl(orig?.posterId);
  const previewUrl = posterUrl || origUrl;

  // 수정 모드 — 저장본은 mount 후에 로드되므로, 로드가 끝나면 폼을 한 번 채움
  // (첫 렌더 시점엔 시드뿐이라 직접 등록한 타래는 폼이 비어 있던 버그 수정 — TCharForm과 동일 패턴)
  const hydrated = useRef(false);
  useEffect(() => {
    if (!editId || !loaded || hydrated.current) return;
    const o = works.find(w => w.id === editId);
    if (!o) return;
    hydrated.current = true;
    setTitle(o.title); setFontId(o.titleFontId ?? 'default');
    setAuthor(o.author); setRole(o.authorRole ?? '');
    setCatId(o.catId); setVis(o.visibility);
    setCrop(o.posterCrop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId, loaded, works]);

  const save = async () => {
    if (!title.trim()) { toast('작품명을 입력해 주세요'); return; }
    const posterId = poster ? await putBlob(poster) : orig?.posterId;
    if (orig) {
      setWorks(works.map(w => w.id === orig.id ? {
        ...w,
        title: title.trim(), titleFontId: fontId === 'default' ? undefined : fontId,
        author: author.trim(), authorRole: role.trim() || undefined,
        catId, visibility: vis, posterId, posterCrop: crop,
      } : w));
      toast('저장되었습니다');
    } else {
      const w: ThreadWork = {
        id: newId(),
        title: title.trim(), titleFontId: fontId === 'default' ? undefined : fontId,
        author: author.trim(), authorRole: role.trim() || undefined,
        catId, visibility: vis, posterId, posterCrop: crop,
        ph: PHS[works.length % PHS.length],
        created: new Date().toISOString(), posts: [],
      };
      setWorks([{ ...w, ...secStamp(sec.id) }, ...works]);
      toast('타래가 시작되었습니다');
    }
    router.push('/threads' + secQuery('threads', secId));
  };

  return (
    <>
      <div className="panel" style={{ maxWidth: 560, margin: '0 auto', padding: 26 }}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div>
            <KLabel>Title</KLabel>
            <div style={{ display: 'flex', gap: 8 }}>
              <KInput value={title} onChange={e => setTitle(e.target.value)}
                style={{ fontFamily: familyOf(fontId === 'default' ? undefined : fontId) }} />
              <KSelect minWidth={150} value={fontId} onChange={setFontId}
                options={[
                  { value: 'default', label: '기본 폰트' },
                  ...fonts.map(f => ({ value: f.id, label: <span style={{ fontFamily: familyOf(f.id) }}>{f.name}</span> })),
                ]} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}>
              <KLabel>Author</KLabel>
              <KInput value={author} onChange={e => setAuthor(e.target.value)} />
            </div>
            <div style={{ width: 140 }}>
              <KLabel>Role (optional)</KLabel>
              {/* 이름 뒤 옅은 표기 — 감독·작가 등 */}
              <KInput value={role} onChange={e => setRole(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <div>
              <KLabel>Category</KLabel>
              <KSelect minWidth={130} value={catId} onChange={setCatId}
                options={cats.map(c => ({ value: c.id, label: c.label }))} />
            </div>
            <div>
              <KLabel>Visibility</KLabel>
              <KSelect minWidth={130} value={vis} onChange={v => setVis(v as ThreadWork['visibility'])}
                options={[
                  { value: 'public', label: '전체공개' },
                  { value: 'member', label: '멤버공개' },
                  { value: 'private', label: '나만보기' },
                ]} />
            </div>
          </div>
          <div>
            <KLabel>Poster</KLabel>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div
                style={{
                  width: 110, aspectRatio: '3/4', borderRadius: 9, overflow: 'hidden', cursor: 'var(--cur-pointer,pointer)',
                  border: '1.5px dashed var(--line)', position: 'relative', flexShrink: 0,
                }}
                onClick={() => posterRef.current?.click()}>
                {previewUrl && <CropImg src={previewUrl} crop={crop} />}
              </div>
              <input ref={posterRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) { setPoster(f); setPosterUrl(URL.createObjectURL(f)); setCrop(undefined); setCropOpen(true); }
                  e.target.value = '';
                }} />
              {previewUrl && (
                <button className="btn btn-ghost" style={{ padding: '5px 11px', fontSize: 11 }}
                  onClick={() => setCropOpen(true)}>✂ 위치·확대 조정</button>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 6 }}>
            <button className="btn btn-ghost" onClick={() => router.push('/threads' + secQuery('threads', secId))}>CANCEL</button>
            <button className="btn btn-dark" onClick={save}>{orig ? 'SAVE' : 'ADD'}</button>
          </div>
        </div>
      </div>
      {previewUrl && (
        <CropEditor open={cropOpen} src={previewUrl} aspect="3:4" initial={crop}
          onClose={() => setCropOpen(false)}
          onApply={c => { setCrop(c); setCropOpen(false); }} />
      )}
    </>
  );
}
