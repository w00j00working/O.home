'use client';
// 자관 수정 페이지 (4.5) — 이름/캐치프레이즈/유형/공개범위/폰트/썸네일. 멤버는 상세에서.
// ?au=<AU id> 로 진입하면 그 AU의 일러·캐치프레이즈를 편집 (v1.9 — AU 선택 상태에서 EDIT)
import React, { Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { Character, CHAR_SEED, Relation, REL_SEED, findByKey } from '@/lib/charStore';
import { RelForm } from '@/components/rels/RelForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

function RelEditInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const params = useSearchParams();
  const auId = params.get('au') ?? undefined;
  const [rels, setRels, loaded] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const [chars] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);

  // 별명 주소로도 열린다 (v2.0 사용자 요청)
  const rel = findByKey(rels, id);
  const auObj = auId ? rel?.aus.find(a => a.id === auId && a.id !== 'base') : undefined;
  if (!loaded) return <section className="page" />;
  if (!isAdmin || !rel) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>EDIT</PageTitle><p>{!rel ? '자관을 찾을 수 없습니다' : '관리자 전용'}</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>EDIT — {rel.name}{auObj ? ` · ${auObj.label}` : ''}</PageTitle>
        <EditableDesc k="rels-edit-desc" def="자관 정보 수정 — 멤버·타임라인·문답·AU는 상세 페이지에서 관리합니다" />
      </div>
      <RelForm
        initial={rel}
        auId={auObj?.id}
        myChars={chars.filter(c => c.own)}
        memberNames={Object.fromEntries(rel.members.map(m => [m.charId, chars.find(c => c.id === m.charId)?.name ?? m.charId]))}
        onCancel={() => router.push(`/rels/${rel.id}`)}
        existingIds={rels.filter(r => r.id !== rel.id).flatMap(r => [r.id, ...(r.slug ? [r.slug] : [])])}
        onSave={v => {
          setRels(rels.map(r => (r.id === rel.id ? {
            ...r,
            name: v.name, kind: v.kind,
            fontId: v.fontId, bodyFontId: v.bodyFontId, visibility: v.visibility,
            // 헤더는 AU 편집이면 그 AU에만 저장 — base 헤더는 유지 (v1.9 AU별 헤더 분리)
            ...(auObj ? {} : { headerImgId: v.headerImgId, headerCrop: v.headerCrop, slug: v.slug }),
            // 페이지 테마 — AU 편집이면 그 AU에만 (base 테마는 유지, v1.9)
            ...(auObj ? {} : { themeMode: v.themeMode, themeColor: v.themeColor, themeTone: v.themeTone, illuBg: v.illuBg, illuOn: v.illuOn, nameColor: v.nameColor, cpColor: v.cpColor, cpTagBg: v.cpTagBg, cpTagFg: v.cpTagFg,
                nameShadowColor: v.nameShadowColor, nameShadow: v.nameShadow,
                headerBgG1: v.headerBgG1, headerBgG2: v.headerBgG2, headerBgAngle: v.headerBgAngle,
                pageBgG1: v.pageBgG1, pageBgG2: v.pageBgG2, pageBgAngle: v.pageBgAngle }),
            cp: v.cp,
            qaHide: v.qaHide,
            fullFront: v.fullFront ?? r.fullFront,
            illustMode: v.kind === 'pair' ? r.illustMode : 'one',
            // 전신 크기·위치·한마디·대사 색 — **AU를 편집 중이면 자관 공통을 건드리지 않는다**
            // (v2.0 사용자 발견: AU에서 고치면 다른 AU 페이지까지 같이 바뀌던 것.
            //  예전엔 이 줄이 auObj와 상관없이 늘 돌아서 자관 공통 members를 덮어썼다.
            //  AU 값은 아래 aus의 mset에 따로 담는다)
            members: (!auObj && (v.fullScales || v.fullOffsets || v.quoteColors || v.quotes))
              ? r.members.map(m => ({
                ...m,
                fullScale: v.fullScales?.[m.charId] ?? m.fullScale,
                fullOffX: v.fullOffsets?.[m.charId]?.x ?? m.fullOffX,
                fullOffY: v.fullOffsets?.[m.charId]?.y ?? m.fullOffY,
                quote: v.quotes?.[m.charId] ?? m.quote,
                nameSize: v.nameSizes?.[m.charId] ?? m.nameSize,
                quoteColor: v.quoteColors?.[m.charId]?.fg ?? m.quoteColor,
                quoteMarkColor: v.quoteColors?.[m.charId]?.mark ?? m.quoteMarkColor,
              }))
              : r.members,
            // AU 편집 모드 — 아트·캐치프레이즈·전신은 그 AU에만 (원본 것은 유지)
            ...(auObj
              ? {
                aus: r.aus.map(a => (a.id === auObj.id ? {
                  ...a, arts: v.arts, catchphrase: v.catchphrase,
                  // AU별 자관명 (v2.0 사용자 요청) — 비우면 자관 이름 그대로 쓰게 아예 지운다
                  name: v.auName?.trim() ? v.auName.trim() : undefined,
                  // AU별 색·배경 (v2.0 사용자 요청) — 「직접 지정」을 끄면 undefined가 되어
                  // 자관 값으로 되돌아간다(auStyle이 묶음 단위로 판정한다)
                  style: {
                    nameColor: v.nameColor, cpColor: v.cpColor,
                    cpTagBg: v.cpTagBg, cpTagFg: v.cpTagFg,
                    nameShadowColor: v.nameShadowColor, nameShadow: v.nameShadow,
                    headerBgG1: v.headerBgG1, headerBgG2: v.headerBgG2, headerBgAngle: v.headerBgAngle,
                    pageBgG1: v.pageBgG1, pageBgG2: v.pageBgG2, pageBgAngle: v.pageBgAngle,
                    illuBg: v.illuBg, illuOn: v.illuOn,
                  },
                  // AU별 멤버 표시값 (v2.0 사용자 발견) — 이 AU에서만 쓰는 전신 위치·한마디·대사 색.
                  // 자관 공통(members)은 위에서 건드리지 않았으므로 다른 AU는 그대로다
                  mset: Object.fromEntries(r.members.map(m => [m.charId, {
                    fullScale: v.fullScales?.[m.charId],
                    fullOffX: v.fullOffsets?.[m.charId]?.x,
                    fullOffY: v.fullOffsets?.[m.charId]?.y,
                    quote: v.quotes?.[m.charId],
                    nameSize: v.nameSizes?.[m.charId],
                    quoteColor: v.quoteColors?.[m.charId]?.fg,
                    quoteMarkColor: v.quoteColors?.[m.charId]?.mark,
                  }])),
                  // AU별 헤더 (v1.9) — 제거하면 "없음 명시"(null): base 헤더로 되돌아가지 않음
                  headerImgId: v.headerRemoved ? undefined : v.headerImgId,
                  headerCrop: v.headerRemoved ? undefined : v.headerCrop,
                  // AU별 페이지 테마 — 기존 따라가기면 미지정 (v1.9)
                  theme: v.themeFollow ? undefined : { mode: v.themeMode, color: v.themeColor, tone: v.themeTone },
                  fulls: v.fulls
                    ? Object.fromEntries(Object.entries(v.fulls).filter(([, id2]) => id2) as [string, string][])
                    : a.fulls,
                } : a)),
              }
              : {
                catchphrase: v.catchphrase, arts: v.arts, thumbId: v.arts[0], thumbCrop: v.thumbCrop,
                ...(v.fulls
                  ? {
                    members: r.members.map(m => ({
                      ...m, fullImgId: v.fulls![m.charId],
                      fullScale: v.fullScales?.[m.charId] ?? m.fullScale,
                      fullOffX: v.fullOffsets?.[m.charId]?.x ?? m.fullOffX,
                      fullOffY: v.fullOffsets?.[m.charId]?.y ?? m.fullOffY,
                      quote: v.quotes?.[m.charId] ?? m.quote,
                      nameSize: v.nameSizes?.[m.charId] ?? m.nameSize,
                      quoteColor: v.quoteColors?.[m.charId]?.fg ?? m.quoteColor,
                      quoteMarkColor: v.quoteColors?.[m.charId]?.mark ?? m.quoteMarkColor,
                    })),
                  }
                  : {}),
              }),
          } : r)));
          toast('저장되었습니다');
          router.push(`/rels/${rel.id}`);
        }}
      />
    </section>
  );
}

export default function RelEditPage() {
  // useSearchParams는 Suspense 경계 필요 (Next App Router)
  return <Suspense fallback={<section className="page" />}><RelEditInner /></Suspense>;
}
