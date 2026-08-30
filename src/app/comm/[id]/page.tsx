'use client';
// 커미션 상세 (4.18) — 중앙 세리프 타이틀 + 뷰어(호버 화살표) + 썸네일 줄 +
// 우측 정렬 가격/마감 기준/슬롯/문의 링크 + 격리 렌더 설명 + 커미션별 테마컬러
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useHrefBlock } from '@/components/shell/MenuGuard';
import { sectionHref, MAIN_SEC } from '@/lib/sectionStore';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/ThemeProvider';
import { useLocalList } from '@/lib/postStore';
import {
  CommItem, COMM_SEED, useCommSettings, badgeStyle, fmtPrice, slotView, SLOT_CHARS, slotCount, slotTip,
} from '@/lib/commStore';
import { useFonts } from '@/lib/fontStore';
import { sanitizeHtml } from '@/lib/sanitize';
import { useBlobUrl } from '@/lib/blobStore';
import { CropImg, CropEditor, CropValue } from '@/components/ui/CropEditor';
import { Tip } from '@/components/ui/Kit';
import { ConfirmModal } from '@/components/ui/Modal';
import { PageTitle } from '@/components/ui/PageText';
import { Lightbox } from '@/components/ui/Lightbox';
import { CommFormFill } from '@/components/comm/FormFill';

/** 편지봉투 픽토그램 (선 아이콘 — 4.18 문의 링크) */
function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, stroke: 'currentColor', fill: 'none', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  );
}

function ViewerImg({ fileRef, ph }: { fileRef?: string; ph: string }) {
  const url = useBlobUrl(fileRef);
  if (!url) return <div className={`ph ${ph}`} style={{ position: 'absolute', inset: 0 }}><span>COMMISSION</span></div>;
  // 절대 잘리지 않게 — 프레임 전체를 채우되 contain(비율 유지·세로 긴 이미지는 세로를 프레임에 맞춤)
  // 갤러리 단일형과 동일 규칙 (v1.9)
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" style={{
      position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
    }} />
  );
}

function StripThumb({ fileRef, ph, crop }: { fileRef?: string; ph: string; crop?: CropValue }) {
  const url = useBlobUrl(fileRef);
  if (!url) return <div className={`ph ${ph}`} style={{ position: 'absolute', inset: 0 }} />;
  return <CropImg src={url} crop={crop} />;
}

/** 썸네일 위치 잡기 — 줄의 칸과 같은 4:3으로 (v2.0 사용자 요청) */
function StripCropModal({ fileRef, crop, onClose, onApply }: {
  fileRef: string; crop?: CropValue; onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const url = useBlobUrl(fileRef);
  if (!url) return null;
  return <CropEditor open src={url} aspect="4:3" initial={crop} onClose={onClose} onApply={onApply} />;
}

export default function CommDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [items, setItems, loaded] = useLocalList<CommItem>('ohome.comm.v1', COMM_SEED);
  const [settings, , setLoaded] = useCommSettings();
  const { familyOf } = useFonts();
  const [cur, setCur] = useState(0);
  const [delAsk, setDelAsk] = useState(false);
  const [lbOpen, setLbOpen] = useState(false); // 대표 이미지 클릭 확대 보기
  // 썸네일 우클릭 순서 바꾸기 (v2.0) — 훅이므로 조기 return보다 먼저
  const [cropFor, setCropFor] = useState<string | null>(null);   // 썸네일 위치 잡는 중인 이미지

  const c = items.find(x => x.id === id);
  /* 이 글이 속한 곳이 비공개면 주소로 들어와도 열리지 않게 (v2.0 사용자 요청).
     글 주소에는 섹션이 없어 MenuGuard가 못 막는다 — 글을 읽어 소속을 알아낸 여기서 판정한다.
     **다른 early return보다 먼저 불러야 한다**(훅이므로 렌더마다 개수가 같아야 한다) */
  const blocked = useHrefBlock(c && sectionHref('comm', c.secId ?? MAIN_SEC));

  // 커미션별 페이지 테마컬러 (4.18) — 접속 시 전체 팔레트 전환, 벗어나면 원복
  const { setPageTheme } = useTheme();
  const pageColor = c?.themeMode === 'custom' && c.themeColor ? c.themeColor : null;
  const pageTone = c?.themeTone;
  useEffect(() => {
    setPageTheme(pageColor, pageTone);
    return () => setPageTheme(null);
  }, [pageColor, pageTone, setPageTheme]);

  const descHtml = useMemo(() => (loaded && c ? sanitizeHtml(c.descHtml) : ''), [loaded, c]);

  // 막힌 곳이면 여기서 되돌아간다 — 훅을 모두 부른 뒤여야 렌더마다 개수가 같다
  if (blocked) return blocked;
  if (!loaded || !setLoaded) return <section className="page" />;
  if (!c) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>COMMISSION</PageTitle><p>커미션을 찾을 수 없습니다</p></div>
      </section>
    );
  }

  const badge = settings.commBadges.find(b => b.id === c.badgeId);
  const sv = slotView(c, settings);
  const imgs: (string | undefined)[] = c.images.length ? c.images : [undefined];
  const curIdx = Math.min(cur, imgs.length - 1);

  /* 썸네일 위치 잡기 (v2.0 사용자 요청) — 우클릭 「썸네일 위치」.
     줄의 칸은 4:3이라 세로로 긴 그림은 가운데가 잘려 얼굴이 안 보인다. 이미지마다 따로 잡는다.
     원본은 건드리지 않고 어디를 보여 줄지만 저장한다(다른 자리의 이미지는 그대로). */
  const saveStripCrop = (ref: string, cv: CropValue) => {
    setItems(items.map(x => (x.id === c.id
      ? { ...x, stripCrops: { ...(x.stripCrops ?? {}), [ref]: cv } }
      : x)));
    setCropFor(null);
  };
  const sc = SLOT_CHARS[c.slotShape];

  return (
    <section className="page">
      {/* 제목 없는 헤더(버튼만) — 아래 히어로 타이틀과의 간격 최소화 */}
      <div className="page-head" style={{ marginBottom: 2 }}>
        <PageTitle style={{ visibility: 'hidden', height: 0, margin: 0 }}>{c.name}</PageTitle>
        <div className="head-actions">
          {isAdmin && <button className="btn btn-dark" onClick={() => router.push(`/comm/${c.id}/edit`)}>EDIT</button>}
          {isAdmin && <button className="btn btn-dark" onClick={() => setDelAsk(true)}>DELETE</button>}
        </div>
      </div>

      {/* 본문만 폭 제한 — 히어로 타이틀 클릭 = 커미션 목록 */}
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
      {/* 1. 커미션 이름 — 최상단 중앙 (4.18) */}
      <div className="cm-hero">
        <h2 style={{ fontFamily: familyOf(c.titleFontId), cursor: 'var(--cur-pointer,pointer)', userSelect: 'none' }}
          data-tip="커미션 목록으로" onClick={() => router.push('/comm')}>{c.name}</h2>
        {c.sub && <small>{c.sub}</small>}
        {badge && <div style={{ marginTop: 10 }}><span style={badgeStyle(badge, settings.badgeShape)}>{badge.label}</span></div>}
      </div>

      {/* 2. 대표 이미지 뷰어 — 좌우 화살표는 호버 시 · 클릭 시 확대 보기 */}
      <div className="cm-viewer" style={{ cursor: imgs[curIdx] ? 'zoom-in' : undefined }}
        onClick={() => { if (imgs[curIdx]) setLbOpen(true); }}>
        <ViewerImg fileRef={imgs[curIdx]} ph={c.ph} />
        {imgs.length > 1 && (
          <>
            <button className="nav hv-actions" style={{ left: 12 }}
              onClick={e => { e.stopPropagation(); setCur(i => (i - 1 + imgs.length) % imgs.length); }}>◁</button>
            <button className="nav hv-actions" style={{ right: 12 }}
              onClick={e => { e.stopPropagation(); setCur(i => (i + 1) % imgs.length); }}>▷</button>
          </>
        )}
      </div>
      {/* 3. 썸네일 줄 — 현재 이미지는 포인트색 테두리 */}
      {imgs.length > 1 && (
        <div className="cm-strip">
          {imgs.map((im, i) => (
            <div key={i} className={`t ${i === curIdx ? 'on' : ''}`} onClick={() => setCur(i)}
              data-tip={isAdmin && im ? '우클릭 — 썸네일 위치' : undefined}
              onContextMenu={e => {
                if (!isAdmin || !im) return;
                e.preventDefault();
                setCropFor(im);
              }}>
              <StripThumb fileRef={im} ph={c.ph} crop={im ? c.stripCrops?.[im] : undefined} />
            </div>
          ))}
        </div>
      )}

      {/* 4. 우측 정렬 — 가격(크게) + 마감 기준 + 슬롯 + 문의 링크 */}
      <div className="cm-meta">
        <div className="price">₩{fmtPrice(c.priceMin)}{c.priceMax > c.priceMin && ` – ₩${fmtPrice(c.priceMax)}`}</div>
        {c.deadlineNote && <div className="due">{c.deadlineNote}</div>}
        <div className="slot-row">
          <Tip tip={slotTip(sv, settings)}>
            <span className="slots" style={{ letterSpacing: '.12em' }}>
              {Array.from({ length: sv.total }, (_, i) => (
                <span key={i} style={{ color: i < sv.used ? c.slotColor : 'var(--faint)' }}>
                  {i < sv.used ? sc.filled : sc.empty}
                </span>
              ))}
              <b style={{ marginLeft: 8, letterSpacing: '.04em' }}>SLOT {slotCount(sv, settings)}/{sv.total}</b>
            </span>
          </Tip>
          {c.contactUrl && (
            <a className="mail" href={c.contactUrl} target="_blank" rel="noreferrer" data-tip="문의하기 (새 탭)">
              <MailIcon />
            </a>
          )}
        </div>
      </div>

      {/* 5. 커미션 설명 — 격리 새니타이즈 렌더 (게시판과 동일 규칙) */}
      <div className="panel" style={{ padding: 26, marginTop: 18 }}>
        <div className="post-body" style={{ fontFamily: familyOf(c.bodyFontId) }}
          dangerouslySetInnerHTML={{ __html: descHtml }} />
        {!c.descHtml && <p className="hint">설명이 비어 있습니다</p>}
      </div>

      {/* 6. 커미션 양식 (v1.9) — 사용함일 때만: 방문자가 직접 작성 → 이미지 인라인 HTML로 저장·제출 */}
      {c.formEnabled && (c.form?.length ?? 0) > 0 && (
        <div className="panel" style={{ padding: 26, marginTop: 18 }}>
          <h4 style={{ fontSize: 11.5, letterSpacing: '.12em', color: 'var(--faint)', marginBottom: 16 }}>COMMISSION FORM</h4>
          <div style={{ fontFamily: familyOf(c.bodyFontId) }}>
            <CommFormFill fields={c.form!} commName={c.name} />
          </div>
        </div>
      )}
      </div>

      {/* 대표 이미지 확대 보기 — 현재 순번에서 시작, ‹ ›로 이어 넘김 */}
      {/* 썸네일 우클릭 > 썸네일 위치 (v2.0 사용자 요청) */}
      {cropFor && (
        <StripCropModal fileRef={cropFor} crop={c.stripCrops?.[cropFor]}
          onClose={() => setCropFor(null)} onApply={cv => saveStripCrop(cropFor, cv)} />
      )}

      {lbOpen && c.images.length > 0 && (
        <Lightbox srcs={c.images} index={curIdx} onClose={() => setLbOpen(false)} />
      )}

      <ConfirmModal open={delAsk} title="커미션을 삭제하시겠습니까?"
        body={`"${c.name}" — 삭제하면 복구할 수 없습니다. 신청자 리스트의 연결 표시는 해제됩니다.`}
        onClose={() => setDelAsk(false)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => { setItems(items.filter(x => x.id !== c.id)); router.push('/comm'); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelAsk(false) },
        ]} />
    </section>
  );
}
