import { putBlob } from './blobStore';

/** 목록용 이미지는 원본 대신 최대 640px의 정적 미리보기로 저장한다. */
export async function putThumbnail(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('이미지 파일을 선택해 주세요');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('이미지를 읽을 수 없습니다'));
      image.src = url;
    });
    const scale = Math.min(1, 640 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('이미지를 변환할 수 없습니다');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error('이미지를 변환할 수 없습니다')), 'image/webp', 0.82);
    });
    return await putBlob(blob);
  } finally {
    URL.revokeObjectURL(url);
  }
}
