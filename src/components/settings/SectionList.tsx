'use client';
/**
 * 「이 섹션을 여러 개로」 목록 — 설정 탭마다 맨 위에 한 덩어리씩 (v2.0 사용자 요청).
 *
 * 게시판 관리와 **같은 모양**이라 새로 배울 게 없다: ⠿ 드래그 순서 · 이름 고치기 · DELETE · ＋ ADD.
 * 개별로 두는 것은 이름뿐이고 말머리·무드 같은 세부 설정은 함께 쓰므로(사용자 확정),
 * 여기에는 「어느 것을 편집할지」 고르는 줄이 없다 — 그래서 탭이 지금처럼 깔끔하게 남는다.
 */
import React from 'react';
import { DragList } from '@/components/ui/DragList';
import { KInput } from '@/components/ui/Kit';
import { useConfirmDelete } from '@/components/ui/Modal';
import { SectionKind, SECTION_META, SECTION_KINDS, MAIN_SEC, useSections, sectionHref, cleanSlug } from '@/lib/sectionStore';
import { useMenuSettings } from '@/lib/menuStore';

/**
 * 종류를 골라 그 목록만 보여 준다 — 8종을 한꺼번에 펼치면 탭이 끝없이 길어진다.
 * 이미 여러 개 만들어 둔 종류는 개수를 함께 보여 줘서, 고르지 않아도 어디에 몇 개인지 보인다.
 */
export function SectionsBlock() {
  const { list } = useSections();
  const [kind, setKind] = React.useState<SectionKind>('gallery');
  return (
    <>
      <h3 style={{ marginTop: 20 }}>다른 목록도 여러 개로</h3>
      <div className="d">
        갤러리·다이어리 등도 게시판처럼 여러 개 만들 수 있습니다 — 만들면 메뉴에 자동으로 붙습니다.
        <b> 서버 설정을 다시 할 필요는 없습니다</b> (내용은 원래 있던 곳에 그대로 쌓입니다)
      </div>
      <div className="mini-seg" style={{ flexWrap: 'wrap', marginBottom: 4 }}>
        {SECTION_KINDS.map(k => {
          const n = list(k).length;
          return (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {SECTION_META[k].label}{n > 1 ? ` ${n}` : ''}
            </button>
          );
        })}
      </div>
      <SectionList kind={kind} />
    </>
  );
}

export function SectionList({ kind }: { kind: SectionKind }) {
  const { list, setList, add } = useSections();
  const [ms, patchMenu] = useMenuSettings();
  const del = useConfirmDelete();
  const items = list(kind);
  const meta = SECTION_META[kind];

  const patch = (id: string, name: string) => {
    const cur = items.map(s => (s.id === id ? { ...s, name } : s));
    setList(kind, cur);
  };

  /* 주소 별명 (v2.0 사용자 요청) — `?s=mt9ipt` 대신 `?s=fanart`처럼.
     **소속 표시는 계속 id로 저장하므로 글은 그대로 있다.** 다만 메뉴 트리에는 주소가
     문자열로 적혀 있어서, 별명을 바꾸면 그 자리도 같이 고쳐 줘야 배치가 풀리지 않는다. */
  const patchSlug = (id: string, raw: string) => {
    const slug = cleanSlug(raw);
    const taken = items.some(s => s.id !== id && (s.slug === slug || s.id === slug));
    if (slug && taken) return;                    // 다른 것과 겹치면 그대로 둔다
    const before = sectionHref(kind, id);
    setList(kind, items.map(s => (s.id === id ? { ...s, slug: slug || undefined } : s)));
    const after = kind && (id === MAIN_SEC ? before : `${meta.href}?s=${slug || id}`);
    if (before === after) return;
    const swap = (h: string) => (h === before ? after : h);
    patchMenu({
      tree: (ms.tree ?? []).map(g => ({
        ...g,
        ...(g.href ? { href: swap(g.href) } : {}),
        items: g.items.map(it => ({ ...it, href: swap(it.href) })),
      })),
      removedBoards: (ms.removedBoards ?? []).map(swap),
    });
  };

  return (
    <>
      <h3 style={{ marginTop: 20 }}>{meta.label} 목록</h3>
      <div className="d">
        같은 유형을 여러 개 — ⠿ 드래그로 메뉴 순서 · 이름은 상단 메뉴와 페이지 제목에 그대로 표시 ·
        아래 세부 설정은 모든 {meta.label}가 함께 씁니다
        <br />
        <b>주소</b>는 영소문자·숫자·하이픈만 쓸 수 있고, 비우면 내부 id가 그대로 주소에 나옵니다 —
        바꿔도 글은 그대로 있고 예전 주소로 들어와도 열립니다.
        <br />
        새로 만들면 <b>메뉴 관리의 「미배치」</b>에 놓입니다 — 원하는 상위 메뉴에 직접 넣어 주세요
      </div>
      <DragList items={items} keyOf={s => s.id} onReorder={next => setList(kind, next)}
        render={s => (
          <div className="set-row" style={{ width: '100%' }}>
            <div className="l" style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <span className="drag-h">⠿</span>
              <KInput value={s.name} onChange={e => patch(s.id, e.target.value)} style={{ width: 130 }} />
              {s.id === MAIN_SEC
                ? <span className="pill">기본</span>
                : (
                  <>
                    <span className="cp-lb">주소</span>
                    <KInput value={s.slug ?? ''} placeholder={s.id}
                      onChange={e => patchSlug(s.id, e.target.value)} style={{ width: 120 }} />
                    <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{sectionHref(kind, s.id)}</small>
                  </>
                )}
            </div>
            <div className="cp-group" style={{ justifyContent: 'flex-end' }}>
              {s.id !== MAIN_SEC && (
                <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                  onClick={() => del.ask(`${meta.label} 「${s.name}」를 삭제하시겠습니까?`,
                    () => setList(kind, items.filter(x => x.id !== s.id)),
                    '메뉴에서 사라지지만 여기에 쓴 내용은 그대로 보존됩니다 (3장 원칙).')}>DELETE</button>
              )}
            </div>
          </div>
        )} />
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
          onClick={() => add(kind)}>＋ ADD {meta.label.toUpperCase()}</button>
      </div>
      {del.element}
      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1.5px solid var(--line)' }} />
    </>
  );
}
