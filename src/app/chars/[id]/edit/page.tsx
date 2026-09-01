'use client';
// 캐릭터 프로필 편집 페이지 (4.4) — 전용 페이지 (모달 아님)
// ?au=<relId:auId> 로 진입하면 그 AU 전용 프로필 편집 (v1.9 사용자 확정) —
// 아예 새 프로필처럼 이름·스펙·아트·탭 전부 그 AU만의 값으로 작성. base는 건드리지 않음.
import React, { Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { Character, CHAR_SEED, charGrant, charWithAu, Relation, REL_SEED , findByKey } from '@/lib/charStore';
import { CharEditForm } from '@/components/chars/CharEditForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

function CharEditInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const params = useSearchParams();
  const auKey = params.get('au');   // `${relId}:${auId}`
  const [chars, setChars, loaded] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const [rels] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);

  // 별명 주소로도 열린다 (v2.0 사용자 요청 — 주소를 나중에 바꿔도 옛 주소가 살아 있게)
  const ch = findByKey(chars, id);
  // 관리자 또는 「편집까지」 권한이 부여된 회원 (3차 회원-캐릭터 연결, v1.9)
  const canEdit = isAdmin || (ch && charGrant(ch, user?.id) === 'edit');
  if (!loaded) return <section className="page" />;
  if (!canEdit || !ch) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>EDIT</PageTitle><p>{!ch ? '캐릭터를 찾을 수 없습니다' : '편집 권한이 없습니다'}</p></div>
      </section>
    );
  }

  // AU 라벨 (타이틀 표시용)
  const auLabel = (() => {
    if (!auKey) return null;
    const [relId, auId] = auKey.split(':');
    return rels.find(r => r.id === relId)?.aus.find(a => a.id === auId)?.label ?? auKey;
  })();

  const back = auKey ? `/chars/${ch.id}?au=${encodeURIComponent(auKey)}` : `/chars/${ch.id}`;

  // AU 프로필 초기값 (v1.9 사용자 확정) — 이미 등록된 AU면 그 값, 처음이면 "아예 새 등록"처럼 빈 폼
  // (이름·스펙·아트·탭 전부 비움 — 폰트·대표색 등 스타일 기본만 base에서)
  const auProf = auKey ? ch.auProfiles?.[auKey] : undefined;
  const formInitial = auKey
    ? (auProf
      ? charWithAu(ch, auKey)
      : {
        ...ch, name: '', sub: '', basicHtml: '', tabs: [], colors: [], colorTipMode: 'hex' as const,
        specs: [{ label: '성별', value: '' }, { label: '키', value: '' }],
        arts: [], artId: undefined, thumbId: undefined, thumbCrop: undefined,
      })
    : ch;

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>EDIT — {auKey ? `${ch.name} · ${auLabel}` : ch.name}</PageTitle>
        {!auKey && <EditableDesc k="chars-edit-desc" def="프로필 편집 — 변경은 [SAVE]를 눌러야 저장됩니다" />}
      </div>
      <CharEditForm
        initial={formInitial}
        existingIds={chars.filter(c => c.id !== ch.id).flatMap(c => [c.id, ...(c.slug ? [c.slug] : [])])}
        auMode={!!auKey}
        onCancel={() => router.push(back)}
        onSave={c => {
          if (auKey) {
            // AU 프로필 스냅샷 저장 — base 필드는 그대로, auProfiles[auKey]만 폼 값 전체로
            setChars(chars.map(x => (x.id === ch.id ? {
              ...x,
              auProfiles: {
                ...x.auProfiles,
                [auKey]: {
                  // 폼 밖에서 정한 값(상세 아트 위치 등)은 그대로 두고 폼 값만 덮어쓴다 (v2.0)
                  ...x.auProfiles?.[auKey],
                  name: c.name, sub: c.sub, color: c.color, themeMode: c.themeMode,
                  colors: c.colors, colorTipMode: c.colorTipMode,
                  specs: c.specs, tabs: c.tabs, basicHtml: c.basicHtml,
                  arts: c.arts, thumbId: c.thumbId, thumbCrop: c.thumbCrop,
                  fontId: c.fontId, nameSize: c.nameSize, nameBold: c.nameBold, bodyFontId: c.bodyFontId,
                },
              },
            } : x)));
            toast('AU 프로필이 저장되었습니다');
          } else {
            // 폼이 다루지 않는 값(상세 아트 위치 등)이 저장할 때마다 사라지지 않게 덮어쓰지 않고 합친다 (v2.0)
            setChars(chars.map(x => (x.id === c.id ? { ...x, ...c } : x)));
            toast('저장되었습니다');
          }
          router.push(back);
        }}
      />
    </section>
  );
}

export default function CharEditPage() {
  // useSearchParams는 Suspense 경계 필요 (Next App Router)
  return <Suspense fallback={<section className="page" />}><CharEditInner /></Suspense>;
}
