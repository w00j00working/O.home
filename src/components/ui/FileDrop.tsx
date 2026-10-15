'use client';
// 파일 업로드 공용 (6.1) — 드래그&드롭 존 + 파일별 용량 표시
// 원본/최적화 선택·크롭 편집기는 실제 업로드 붙일 때(2차) 확장
import React, { useRef, useState } from 'react';
import { useImageSource } from './ImageSource';

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

export function FileDrop({ accept, multiple, onFiles, onUrl, label }: {
  accept?: string; multiple?: boolean; onFiles: (files: File[]) => void;
  onUrl?: (url: string) => void; label?: string;
}) {
  const [drag, setDrag] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const source = useImageSource(url => {
    setUrls(previous => multiple ? [...previous, url] : [url]);
    if (!multiple) setFiles([]);
    setDrag(false);
    onUrl?.(url);
  });
  const images = !!onUrl && !!accept?.includes('image/');

  const handle = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list);
    setFiles(multiple ? f => [...f, ...arr] : arr);
    if (!multiple) setUrls([]);
    onFiles(arr);
  };

  return (
    <div>
      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        tabIndex={0}
        {...(images ? source.handlers : {})}
        onDropCapture={images ? event => { setDrag(false); source.handlers.onDropCapture(event); } : undefined}
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); handle(e.dataTransfer.files); }}
      >
        {label ?? '클릭 또는 파일을 끌어다 놓기'}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        style={{ display: 'none' }}
        onChange={e => { handle(e.target.files); e.target.value = ''; }}
      />
      {images && <>
        <button type="button" className="btn btn-ghost" style={{ marginTop: 8 }}
          onClick={() => source.open()}>🔗 이미지 주소 붙여넣기</button>
        {source.element}
      </>}
      {urls.map((url, i) => <div className="file-row" key={`${url}-${i}`}>
        <span style={{ overflowWrap: 'anywhere' }}>{url}</span><span className="size">외부 주소</span>
      </div>)}
      {files.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {files.map((f, i) => (
            <div className="file-row" key={`${f.name}-${i}`}>
              <span>{f.name}</span>
              <span className="size">{fmtSize(f.size)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
