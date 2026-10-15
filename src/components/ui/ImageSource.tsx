'use client';
// 외부 이미지는 주소만 저장 — Storage에 복사하지 않는다 (사용자 요청).
import React, { useCallback, useEffect, useState } from 'react';
import { putBlob } from '@/lib/blobStore';
import { KInput } from './Kit';
import { Modal } from './Modal';
import { useToast } from './Toast';

export type ImageSource = { kind: 'file'; file: File } | { kind: 'url'; url: string };

export function imageHttpUrl(text: string): string | null {
  const url = text.trim();
  if (!/^https?:\/\//i.test(url)) return null;
  try {
    const parsed = new URL(url);
    return parsed.hostname && ['http:', 'https:'].includes(parsed.protocol) ? url : null;
  } catch {
    return null;
  }
}

export async function resolveImageRef(source: ImageSource): Promise<string> {
  if (source.kind === 'file') return putBlob(source.file);
  const url = imageHttpUrl(source.url);
  if (!url) throw new Error('http(s) 이미지 주소만 사용할 수 있습니다');
  return url;
}

export function useImageSource(onSelect: (url: string) => void) {
  const toast = useToast();
  const [text, setText] = useState('');
  const [isOpen, setOpen] = useState(false);
  const [loaded, setLoaded] = useState('');
  const [loading, setLoading] = useState(false);
  const open = useCallback((value = '') => {
    setLoaded('');
    setText(value.trim());
    setOpen(true);
  }, []);

  useEffect(() => {
    setLoaded('');
    setLoading(false);
    if (!isOpen || !text.trim()) return;
    const url = imageHttpUrl(text);
    if (!url) {
      toast('http(s) 이미지 주소만 사용할 수 있습니다');
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.referrerPolicy = 'no-referrer';
    setLoading(true);
    const fail = () => {
      if (cancelled) return;
      setLoading(false);
      toast('이미지를 불러올 수 없는 주소입니다');
    };
    const timer = window.setTimeout(fail, 15000);
    image.onload = () => {
      window.clearTimeout(timer);
      if (cancelled) return;
      setLoading(false);
      setLoaded(url);
    };
    image.onerror = () => { window.clearTimeout(timer); fail(); };
    image.src = url;
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      image.onload = null;
      image.onerror = null;
    };
  }, [isOpen, text, toast]);

  const handlers = {
    onDropCapture: (event: React.DragEvent<HTMLElement>) => {
      if (event.target instanceof Element && event.target.closest('.modal-ov')?.querySelector('[data-image-source-modal]')) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')) return;
      if (event.dataTransfer.files.length) return;
      const url = imageHttpUrl(event.dataTransfer.getData('text/plain') || event.dataTransfer.getData('text/uri-list'));
      if (!url) return;
      event.preventDefault();
      event.stopPropagation();
      open(url);
    },
    onPasteCapture: (event: React.ClipboardEvent<HTMLElement>) => {
      if (event.target instanceof Element && event.target.closest('.modal-ov')?.querySelector('[data-image-source-modal]')) return;
      if (event.target instanceof Element && event.target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')) return;
      const url = imageHttpUrl(event.clipboardData.getData('text/plain'));
      if (!url) return;
      event.preventDefault();
      event.stopPropagation();
      open(url);
    },
  };

  const element = (
    <span onClick={event => event.stopPropagation()} onMouseDown={event => event.stopPropagation()}>
      <Modal open={isOpen} title="이미지 주소 붙여넣기" small onClose={() => setOpen(false)}
        actions={<>
          <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>CANCEL</button>
          <button type="button" className="btn btn-accent" disabled={!loaded || loaded !== imageHttpUrl(text)}
            onClick={() => { onSelect(loaded); setOpen(false); }}>APPLY</button>
        </>}>
        <KInput data-image-source-modal aria-label="이미지 주소" placeholder="https://…" value={text}
          onChange={event => { setLoaded(''); setText(event.target.value); }} autoFocus />
        {loading && <p className="hint">이미지 확인 중…</p>}
        {loaded && <img src={loaded} alt="외부 이미지 미리보기" referrerPolicy="no-referrer"
          style={{ display: 'block', maxWidth: '100%', maxHeight: 240, margin: '12px auto', objectFit: 'contain' }} />}
        <p className="hint" style={{ marginTop: 12 }}>
          외부 주소 이미지는 이 사이트에 저장되지 않습니다. 원본 사이트에서 삭제되면 여기서도 보이지 않게 됩니다.
        </p>
      </Modal>
    </span>
  );
  return { open, element, handlers };
}

export function ImageUrlButton({ onSelect, label = '🔗 이미지 주소 붙여넣기' }: {
  onSelect: (url: string) => void; label?: string;
}) {
  const source = useImageSource(onSelect);
  return <>
    <button type="button" className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }}
      onClick={event => { event.stopPropagation(); source.open(); }}>{label}</button>
    {source.element}
  </>;
}
