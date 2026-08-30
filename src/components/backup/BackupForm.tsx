'use client';
// 그림백업 작성/수정 공용 폼 (4.11) — 제목/유형/이미지 다중 업로드(원본·최적화·크롭·⠿순서)/설명/설정/접기
// 수정 모드: 기존 이미지(ref)는 그대로 유지·재정렬·삭제 가능, 새 파일 추가 가능
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList, newId, FoldType } from '@/lib/postStore';
import { useSectionParam, secStamp, MAIN_SEC, useSectionTitle } from '@/lib/sectionStore';
import { BackupPost, BACKUP_SEED } from '@/lib/galleryStore';
import { useBoardSettings, DEFAULT_GALLERY_CATS, galleryCatsOf } from '@/lib/boardStore';
import { useConfirmDelete } from '@/components/ui/Modal';
import { Visibility } from '@/lib/charStore';
import { KInput, KSelect, KRadio, KCheck, KDate } from '@/components/ui/Kit';
import { RichEditor } from '@/components/ui/RichEditor';
import { DragList } from '@/components/ui/DragList';
import { CropEditor, CropValue } from '@/components/ui/CropEditor';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { useToast } from '@/components/ui/Toast';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';

interface UpFile {
  id: string; name: string; size?: number;
  url?: string; file?: File;   // 새로 추가한 파일
  ref?: string;                // 저장돼 있던 이미지 (수정 모드)
  original: boolean; crop?: CropValue;
}

const fmtSize = (b?: number) => b == null ? '' : b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.round(b / 1024)}KB`;

function FilePreview({ f }: { f: UpFile }) {
  const loaded = useBlobUrl(f.ref);
  const src = f.url ?? loaded;
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={f.name} />;
}

/** 크롭 편집기 소스 — 새 파일이면 objectURL, 저장본이면 blob 로드 */
function CropModal({ f, onClose, onApply }: { f: UpFile; onClose: () => void; onApply: (c: CropValue) => void }) {
  const loaded = useBlobUrl(f.ref);
  const src = f.url ?? loaded;
  if (!src) return null;
  return <CropEditor open src={src} aspect="4:3" initial={f.crop} onClose={onClose} onApply={onApply} />;
}

export function BackupForm({ initial }: { initial: BackupPost | null }) {
  const router = useRouter();
  const { user } = useAuth();
  const toast = useToast();
  const [posts, setPosts] = useLocalList<BackupPost>('ohome.backup.v1', BACKUP_SEED);
  // 어느 갤러리에서 눌러 왔는지 (v2.0) — 새 글을 그 목록에 넣고, 끝나면 그 목록으로 돌아간다
  const sec = useSectionParam('gallery');
  const isNew = !initial;
  // 큰 글씨 — 추가 갤러리면 그 이름(메뉴 타이틀·이름이 우선), 누르면 그 목록으로 (v2.0 사용자 제보).
  // 수정 주소에는 ?s=가 없으므로 고치는 글 자신의 소속(secId)에서 읽는다
  const tt = useSectionTitle('gallery', initial ? (initial.secId ?? MAIN_SEC) : sec.id, isNew ? 'WRITE' : 'EDIT');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [type, setType] = useState<'log' | 'single' | 'vlist'>(initial?.type ?? 'log');
  const [files, setFiles] = useState<UpFile[]>(() =>
    (initial?.images ?? []).map((ref, i) => ({
      id: newId(), name: `이미지 ${i + 1}`, ref, original: true,
      crop: i === 0 ? initial?.thumbCrop : undefined,
    })));
  const [desc, setDesc] = useState(initial?.desc ?? '');
  const del = useConfirmDelete();   // 이미지 제거도 되돌릴 수 없어 경고를 거친다
  // 갤러리 말머리 — 환경설정 > 게시판 관리에서 관리 (v2.0)
  const { st: boardSet } = useBoardSettings();
  /* **수정 중이면 그 글이 속한 곳이 기준이다** (v2.0 사용자 발견 — 포크 사용자 제보).
     수정 주소에는 `?s=`가 없어서 주소만 보면 늘 기본 섹션으로 읽힌다. 그러면 분류 목록이
     기본 섹션 것으로 바뀌어, 원래 고른 분류가 목록에 없으니 첫 항목으로 풀려 버린다. */
  const secId = initial ? (initial.secId ?? MAIN_SEC) : sec.id;
  // 갤러리마다 말머리가 다르다 (v2.0 사용자 요청) — 보고 있는 갤러리 것을 쓴다
  const secCats = galleryCatsOf(boardSet, secId);
  const galleryCats = secCats.length ? secCats : DEFAULT_GALLERY_CATS;
  const [category, setCategory] = useState(initial?.category ?? '');
  // 태그 (v2.0 사용자 요청) — 쉼표로 구분해 입력, 저장할 때 배열로
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(', '));
  const parseTags = (v: string) =>
    [...new Set(v.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean))];
  // 목록이 로드되면 첫 말머리를 기본값으로 (등록 화면)
  useEffect(() => {
    if (!category && galleryCats[0]) setCategory(galleryCats[0].label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryCats.length]);
  const [madeDate, setMadeDate] = useState(initial?.madeDate ?? '');
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? 'public');
  const [foldType, setFoldType] = useState<FoldType | 'none'>(initial?.fold?.type ?? 'none');
  const [foldLabel, setFoldLabel] = useState(initial?.fold?.label ?? '');
  const [cropFor, setCropFor] = useState<UpFile | null>(null);

  if (!user) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>글쓰기는 로그인 후 이용할 수 있습니다</p></div>
      </section>
    );
  }

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    // input.files는 라이브 FileList — 핸들러가 끝나며 value가 초기화되면 비워지므로
    // 상태 업데이터(나중에 실행) 안이 아니라 지금 즉시 복사해야 함 (업로드가 번갈아 씹히던 버그)
    const items: UpFile[] = Array.from(list).map(x => ({
      id: newId(), name: x.name, size: x.size, url: URL.createObjectURL(x), file: x, original: true,
    }));
    setFiles(f => [...f, ...items]);
  };

  const post = async () => {
    if (!title.trim()) { toast('제목을 입력해 주세요'); return; }
    // 이미지 실저장 (IndexedDB) — 기존 ref는 유지, 새 파일만 저장
    const imageIds = await Promise.all(files.map(f => (f.file ? putBlob(f.file) : Promise.resolve(f.ref!))));
    if (isNew) {
      const p: BackupPost = {
        id: newId(), title: title.trim(), type,
        images: imageIds, phList: files.length ? [] : ['cool'],
        thumbCrop: files[0]?.crop, // 대표 이미지 크롭 (6.1)
        desc, category, tags: parseTags(tagsText), madeDate: madeDate || undefined,
        date: new Date().toISOString(), author: user.nickname, authorId: user.id,
        visibility,
        fold: foldType === 'none' ? null : { type: foldType, label: foldType === 'custom' ? foldLabel : undefined },
      };
      setPosts([{ ...p, ...secStamp(sec.id) }, ...posts]);
      toast('등록되었습니다 — 이미지는 이 브라우저에 실제 저장됩니다');
      router.push(`/gallery/${p.id}`);
    } else {
      setPosts(posts.map(x => x.id === initial.id ? {
        ...x, title: title.trim(), type,
        images: imageIds, phList: files.length ? [] : x.phList,
        thumbCrop: files[0]?.crop,
        desc, category, tags: parseTags(tagsText), madeDate: madeDate || undefined, visibility,
        fold: foldType === 'none' ? null : { type: foldType, label: foldType === 'custom' ? foldLabel : undefined },
      } : x));
      toast('저장되었습니다');
      router.push(`/gallery/${initial.id}`);
    }
  };

  return (
    <section className="page">
      <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><EditableDesc k={isNew ? 'backup-write-desc' : 'backup-edit-desc'} def={isNew ? '그림백업 글 작성' : '그림백업 글 수정'} /></div>
      <div className="write-grid">
        {/* 좌: 본문 */}
        <div className="panel" style={{ padding: 24 }}>
          <div className="form-row">
            <label className="k-label" style={{ width: 60 }}>제목</label>
            <KInput value={title} onChange={e => setTitle(e.target.value)} style={{ flex: 1 }} />
          </div>
          <div className="form-row">
            <label className="k-label" style={{ width: 60 }}>유형</label>
            {/* 모바일에서는 설명(.rd-desc)을 숨겨 한 줄 유지 — 두 줄로 넘어가면 안 예쁨 (v1.9 사용자 확정) */}
            <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
              <KRadio name="wtype" value="log" current={type} onChange={v => setType(v as 'log')}
                label={<span>로그 <span className="rd-desc">— 웹툰처럼 세로 스크롤</span></span>} />
              <KRadio name="wtype" value="single" current={type} onChange={v => setType(v as 'single')}
                label={<span>단일 <span className="rd-desc">— 큰 이미지 + 좌우 넘김</span></span>} />
              <KRadio name="wtype" value="vlist" current={type} onChange={v => setType(v as 'vlist')}
                label={<span>단일(세로) <span className="rd-desc">— 이미지 사이 갭을 두고 세로로 나열</span></span>} />
            </div>
          </div>
          <label className="k-label">이미지</label>
          <div className="upzone" onClick={() => document.getElementById('bkFiles')?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
            <b style={{ display: 'block', marginBottom: 3 }}>
              {files.length === 0 ? '이미지를 끌어다 놓거나 클릭해서 선택' : '＋ ADD IMAGE'}
            </b>
            여러 장 선택 가능 · ⠿ 드래그로 순서 조정
          </div>
          <input id="bkFiles" type="file" accept="image/*" multiple style={{ display: 'none' }}
            onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
          {files.length > 0 && (
            <div className="upfile-count">✓ {files.length}장 — 아래 순서대로 게시됩니다</div>
          )}
          <DragList
            items={files}
            keyOf={f => f.id}
            onReorder={setFiles}
            render={(f, i) => (
              <div className="upfile-row" style={{ width: '100%' }}>
                <span className="drag-h">⠿</span>
                <span className="mw-no">{i + 1}</span>
                <div className="pv"><FilePreview f={f} /></div>
                <div className="nm">
                  <b>{f.name}</b>
                  <small>{f.ref && !f.file ? '저장된 이미지' : fmtSize(f.size)}{f.crop ? ' · 썸네일 지정됨' : ''}</small>
                </div>
                {/* 원본/최적화 — 원본은 항상 서버 보존, 열람 제공본 선택 (6.1) */}
                <div className="mini-seg">
                  <button className={f.original ? 'on' : ''}
                    onClick={() => setFiles(l => l.map(x => x.id === f.id ? { ...x, original: true } : x))}>원본</button>
                  <button className={!f.original ? 'on' : ''}
                    onClick={() => setFiles(l => l.map(x => x.id === f.id ? { ...x, original: false } : x))}>최적화</button>
                </div>
                <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 10, whiteSpace: 'nowrap' }}
                  onClick={() => setCropFor(f)}>✂ 썸네일</button>
                <span className="fx" data-tip="제거"
                  onClick={() => del.ask('이 이미지를 목록에서 빼시겠습니까?',
                    () => setFiles(l => l.filter(x => x.id !== f.id)), f.name)}>✕</span>
              </div>
            )}
          />
          <div style={{ marginTop: 14 }}>
            <label className="k-label">설명</label>
            <RichEditor value={desc} onChange={setDesc} placeholder='작품 설명을 작성하세요 (선택)' />
          </div>
        </div>

        {/* 우: 설정 */}
        <div>
          <div className="panel widget" style={{ marginBottom: 14 }}>
            <h4>설정</h4>
            <div className="form-row">
              <label className="k-label" style={{ width: 70 }}>말머리</label>
              {/* 말머리 목록은 환경설정 > 게시판 관리에서 관리 (v2.0 — 예전에는 코드에 박혀 있었다) */}
              <KSelect minWidth={120} value={category} onChange={setCategory}
                options={galleryCats.map(c => ({ value: c.label, label: c.label }))} />
            </div>
            {/* 태그 (v2.0 사용자 요청) — 목록·카드에 나열되고 검색에 걸린다 */}
            <div className="form-row">
              <label className="k-label" style={{ width: 70 }}>태그</label>
              <KInput value={tagsText} onChange={e => setTagsText(e.target.value)} placeholder="쉼표로 구분" style={{ flex: 1 }} />
            </div>
            <div className="form-row">
              <label className="k-label" style={{ width: 70 }}>제작일 (선택)</label>
              <KDate value={madeDate} onChange={setMadeDate} style={{ fontSize: 12, flex: 1 }} />
            </div>
            <div className="form-row">
              <label className="k-label" style={{ width: 70 }}>공개범위</label>
              <KSelect minWidth={120} value={visibility} onChange={v => setVisibility(v as Visibility)}
                options={[
                  { value: 'public', label: '전체공개' },
                  { value: 'member', label: '멤버공개' },
                  { value: 'private', label: '나만보기' },
                ]} />
            </div>
          </div>
          <div className="panel widget" style={{ marginBottom: 14 }}>
            <h4>접기</h4>
            <div style={{ display: 'grid', gap: 9 }}>
              <KCheck label="스포일러 접기" checked={foldType === 'spoiler'} onChange={v => setFoldType(v ? 'spoiler' : 'none')} />
              <KCheck label="수위 주의 접기" checked={foldType === 'adult'} onChange={v => setFoldType(v ? 'adult' : 'none')} />
              <KCheck label="직접 입력 문구" checked={foldType === 'custom'} onChange={v => setFoldType(v ? 'custom' : 'none')} />
              {foldType === 'custom' && <KInput placeholder="접기 문구" value={foldLabel} onChange={e => setFoldLabel(e.target.value)} />}
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-onbk"
              onClick={() => router.push(isNew ? tt.href : `/gallery/${initial.id}`)}>CANCEL</button>
            <button className="btn btn-accent" onClick={post}>
              {isNew ? 'POST' : 'SAVE'}
            </button>
          </div>
        </div>
      </div>

      {del.element}
      {cropFor && (
        <CropModal f={cropFor}
          onClose={() => setCropFor(null)}
          onApply={c => {
            setFiles(l => l.map(x => x.id === cropFor.id ? { ...x, crop: c } : x));
            setCropFor(null);
            toast('썸네일 영역이 저장되었습니다 (원본 유지)');
          }} />
      )}
    </section>
  );
}
