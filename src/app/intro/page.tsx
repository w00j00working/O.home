'use client';
/**
 * 인트로(소개) 페이지 (v2.0 사용자 요청) — **에디터로 쓰고, 글 하나만 보이는 페이지.**
 *
 * 목록·댓글·말머리가 없다. 본문 하나뿐이라 글 테이블이 아니라 설정 한 칸에 담고(introStore),
 * 수정도 별도 화면으로 넘기지 않고 **이 자리에서** 한다 — 글이 하나뿐인데 목록↔쓰기로
 * 오가는 것은 번거롭기만 하다. 큰 제목·설명 문구는 다른 페이지와 똑같이 메뉴 관리에서 바꾼다.
 *
 * 쓰는 방식은 두 가지 (v2.0 사용자 요청):
 *   · **에디터** — 버튼으로 굵게·목록·이미지. 편하지만 다루는 서식이 정해져 있다.
 *   · **HTML** — 태그를 직접 쓴다. 다른 데서 만든 소개글을 그대로 붙여 넣을 때.
 * 저장 형태는 둘 다 HTML로 같고, 어느 쪽으로 쓰고 있었는지만 함께 기억한다.
 */
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useIntro } from '@/lib/introStore';
import { RichEditor } from '@/components/ui/RichEditor';
import { HtmlBody } from '@/components/ui/HtmlBody';
import { KTextarea } from '@/components/ui/Kit';
import { ConfirmModal } from '@/components/ui/Modal';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';
import { useToast } from '@/components/ui/Toast';

/** 에디터가 다루지 못해 사라질 만한 태그·속성이 들어 있는가 (경고 판단용) */
const hasRichHtml = (html: string) =>
  /<(table|thead|tbody|tr|td|th|div|span|section|article|iframe|video|audio|details|summary|font|center)\b/i.test(html)
  || /\s(style|class|id)\s*=/i.test(html);

export default function IntroPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [doc, save, loaded] = useIntro();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<'editor' | 'html'>('editor');
  const [askEditor, setAskEditor] = useState(false);   // HTML → 에디터로 갈 때 확인

  // 저장본이 늦게 도착해도(서버 모드) 편집 중이 아니면 화면 값을 맞춰 둔다
  useEffect(() => { if (!editing) setDraft(doc.html); }, [doc.html, editing]);

  const start = () => { setDraft(doc.html); setMode(doc.mode ?? 'editor'); setEditing(true); };
  const done = () => {
    save({ html: draft, mode });
    setEditing(false);
    toast('저장되었습니다');
  };
  /* HTML로 쓴 글을 에디터로 열면 다루지 못하는 태그가 조용히 사라진다 —
     되돌릴 수 없으므로 그럴 만한 내용일 때만 물어본다 */
  const toEditor = () => {
    if (hasRichHtml(draft)) { setAskEditor(true); return; }
    setMode('editor');
  };

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>INTRO</PageTitle>
        <EditableDesc k="intro-desc" def="이 홈에 대한 소개" />
        {isAdmin && (
          <div className="head-actions">
            {editing ? (
              <>
                <div className="mini-seg" style={{ marginRight: 6 }}>
                  <button className={mode === 'editor' ? 'on' : ''} onClick={toEditor}>에디터</button>
                  <button className={mode === 'html' ? 'on' : ''} onClick={() => setMode('html')}>HTML</button>
                </div>
                <button className="btn btn-dark" onClick={done}>SAVE</button>
                <button className="btn btn-ghost" onClick={() => { setDraft(doc.html); setEditing(false); }}>CANCEL</button>
              </>
            ) : (
              <button className="btn btn-dark" onClick={start}>✎ EDIT</button>
            )}
          </div>
        )}
      </div>

      <div className="panel" style={{ padding: 26 }}>
        {editing
          ? (mode === 'html'
            ? (
              <>
                <KTextarea value={draft} onChange={e => setDraft(e.target.value)}
                  style={{ minHeight: 420, fontFamily: 'var(--mono, Consolas, "D2Coding", monospace)', fontSize: 12.5, lineHeight: 1.7 }} />
                <p className="hint" style={{ margin: '8px 0 0' }}>
                  태그를 직접 씁니다 — 보여 줄 때 <b>스크립트·프레임은 걷어냅니다</b>(안전 때문). 이미지는 주소로 넣거나 에디터 모드에서 올려 주세요.
                </p>
              </>
            )
            : <RichEditor value={draft} onChange={setDraft} />)
          /* 저장본이 아직 안 왔을 때 「비어 있습니다」가 잠깐 스치지 않게 loaded를 본다 */
          : loaded && !doc.html.trim()
            ? (
              <p className="hint" style={{ margin: 0, textAlign: 'center', padding: '38px 0' }}>
                {isAdmin ? '아직 비어 있습니다 — 오른쪽 위 EDIT으로 소개를 작성해 주세요' : '아직 준비 중입니다'}
              </p>
            )
            : <HtmlBody html={doc.html} className="html-body" />}
      </div>

      <ConfirmModal open={askEditor} title="에디터로 바꾸면 일부 태그가 사라집니다"
        body="에디터는 굵게·기울임·목록·인용·이미지 같은 기본 서식만 다룹니다. 표·div·style·class 등은 열면서 정리되고, 되돌릴 수 없습니다. HTML 그대로 두려면 취소하세요."
        onClose={() => setAskEditor(false)}
        buttons={[
          { label: 'CANCEL', kind: 'ghost', onClick: () => setAskEditor(false) },
          { label: '에디터로', kind: 'accent', onClick: () => { setMode('editor'); setAskEditor(false); } },
        ]} />
    </section>
  );
}
