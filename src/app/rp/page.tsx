'use client';
// 역극 (4.9) — 실시간 채팅형. 방 개설(자관 기반/자유) · 참여자에게만 존재 노출 ·
// 캐릭터 선택 발화(테마색 말풍선) · 지문(/desc) · 메시지 수정/삭제 · 완결/공개 전환 · HTML 내보내기
// ※ 실시간 송수신·입력 중 표시·참여자 전원 동의는 Supabase Realtime 연동 시 활성화 (현재 localStorage)
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useLocalList, newId } from '@/lib/postStore';
import {
  RpRoom, RpMessage, RP_SEED, hexRgb, rpLastDate, rpHasNew,
  RpMessageRow, RP_MSG_KEY, RP_MSG_SEED, messagesFor, rpMarkRead, rpMemberIds,
} from '@/lib/rpStore';
import { Character, CHAR_SEED, Relation, REL_SEED, charGrant, charWithAu } from '@/lib/charStore';
import { Modal, ConfirmModal, useConfirmDelete } from '@/components/ui/Modal';
import { KInput, KTextarea, KSelect, KCheck } from '@/components/ui/Kit';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { useToast } from '@/components/ui/Toast';

/** 캐릭터 얼굴 칩 (썸네일 or 데모 플레이스홀더) */
function Face({ ch, className }: { ch?: Character; className: string }) {
  return (
    <div className={`${className} ${!ch?.thumbId ? `ph ${ch?.thumbClass ?? ''}` : ''}`}>
      {ch?.thumbId && <CroppedBlobImg fileRef={ch.thumbId} crop={ch.thumbCrop} />}
    </div>
  );
}

const fmtHM = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

import { useMembers } from '@/lib/members';
import { pushNotif } from '@/lib/notifStore';

export default function RpPage() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const del = useConfirmDelete();
  const [rooms, setRooms, loaded] = useLocalList<RpRoom>('ohome.rp.v1', RP_SEED);
  // 발화는 방과 따로 저장한다 (v2.0) — 방 안에 두면 말할 때마다 방을 UPDATE 해야 해서
  // 남이 만든 방에서는 참여자가 발화할 수 없었다 (댓글·문답과 같은 뿌리)
  const [msgRows, setMsgRows] = useLocalList<RpMessageRow>(RP_MSG_KEY, RP_MSG_SEED);
  // 방 하나의 발화 — 옛 방 안의 것 + 분리 저장분
  const msgsOf = (r: RpRoom) => messagesFor(msgRows, r.id, r.messages);
  // 참여 회원 — 기반 자관이 있으면 그 자관 캐릭터의 권한자에서 자동으로 (v2.0 사용자 확정).
  // 계산해서 쓰므로 권한이 다른 사람에게 넘어가면 그 자관 기반 역극 전체에 바로 반영된다
  const memberIdsOf = (r: RpRoom) => rpMemberIds(r, rels, chars);
  const [chars] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const [rels] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const [selId, setSelId] = useState<string | null>(null);
  const [fStatus, setFStatus] = useState<'all' | 'ongoing' | 'done'>('ongoing'); // 우측 상태 필터 — 진행중이 기본
  // 모바일 (v1.9 사용자 확정) — 방 목록은 위에 접힌 바로, 입력창 포커스 중엔 역극 영역만 표시
  const [mListOpen, setMListOpen] = useState(false);
  const [mFocus, setMFocus] = useState(false);

  // 참여자에게만 존재 노출 (확정 — 관리자도 비참여 방은 보지 않음)
  const allMine = useMemo(() => (user
    ? rooms.filter(r => memberIdsOf(r).includes(user.id))
      .sort((a, b) => rpLastDate(b, messagesFor(msgRows, b.id, b.messages))
        .localeCompare(rpLastDate(a, messagesFor(msgRows, a.id, a.messages))))
    : []), [rooms, user, msgRows, rels, chars]);
  const myRooms = useMemo(() => allMine.filter(r => fStatus === 'all' || r.status === fStatus), [allMine, fStatus]);
  const sel = myRooms.find(r => r.id === selId) ?? myRooms[0];
  const cntS = (s: 'all' | 'ongoing' | 'done') =>
    allMine.filter(r => s === 'all' || r.status === s).length;

  // 발화자 선택 — 관리자는 기반 자관 멤버 전부(+자유 개설이면 자캐 전부),
  // 회원은 권한(grants — 역극 플레이/편집)이 부여된 캐릭터만 (3차 회원-캐릭터 연결, v1.9)
  const rel = rels.find(r => r.id === sel?.relId);
  /* 이 방이 어느 AU로 노는지 (v2.0 사용자 요청) — 방 안에서 쓰는 캐릭터를 통째로
     그 AU 프로필로 갈아 끼운다. 발화자 선택·말풍선·방 소제목이 모두 이 목록을 보므로
     한 곳만 바꾸면 전부 따라온다. AU가 없으면 원래 목록 그대로다(참조도 같다).

     **키는 `자관id:AU id`다** (v2.0 사용자 발견 — 「AU를 골랐는데 이름·사진이 원본으로 뜬다」).
     캐릭터의 AU 프로필은 자관마다 따로 갖는 값이라 자관 id가 앞에 붙는다. 처음에 AU id만
     넘겨서 프로필을 못 찾고 조용히 원본으로 떨어졌다 — 자관 상세가 쓰는 방식과 맞췄다. */
  const auCharKey = sel?.relId && sel?.auId && sel.auId !== 'base' ? `${sel.relId}:${sel.auId}` : null;
  const rpChars = useMemo(
    () => (auCharKey ? chars.map(c => charWithAu(c, auCharKey)) : chars),
    [chars, auCharKey],
  );
  const speakChars = useMemo(() => {
    if (rel) {
      const members = rel.members.map(m => rpChars.find(c => c.id === m.charId)).filter(Boolean) as Character[];
      return isAdmin ? members : members.filter(c => !!charGrant(c, user?.id));
    }
    return isAdmin ? rpChars.filter(c => c.own) : rpChars.filter(c => !!charGrant(c, user?.id));
  }, [rel, rpChars, isAdmin, user?.id]);

  const [speaker, setSpeaker] = useState<string>('');   // charId | 'desc' (플레이어 발화는 없앴다, v2.0)
  const [pickOpen, setPickOpen] = useState(false);
  useEffect(() => { setSpeaker(speakChars[0]?.id ?? 'desc'); setPickOpen(false); }, [sel?.id, speakChars]);

  // 입장 시 읽음 처리 (N 뱃지 해제) — 브라우저에만 기록한다 (v2.0).
  // 예전엔 방 문서의 lastRead에 써서, 방을 열어 보기만 해도 남의 방을 UPDATE 하게 되어
  // 참여자에게는 규칙이 막았다(뱃지가 안 없어짐). 읽음 시각은 원래 사람마다 다른 값이다.
  useEffect(() => {
    if (!sel || !user) return;
    rpMarkRead(sel.id, user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.id, user?.id, msgRows.length]);

  // 새 메시지 → 맨 아래로
  const msgsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = msgsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [sel?.id, msgRows.length]);

  const [text, setText] = useState('');
  const send = () => {
    if (!sel || !user) return;
    let t = text.trim();
    if (!t) return;
    let kind: RpMessage['kind'] = speaker === 'desc' ? 'desc' : 'char';
    if (t.startsWith('/desc ')) { kind = 'desc'; t = t.slice(6).trim(); } // /desc 명령 (v1.8)
    if (!t) return;
    const m: RpMessage = {
      id: newId(), kind, charId: kind === 'char' ? speaker : undefined,
      // 발화 당시 소유 기록 — 캐릭터가 삭제돼도 재연동 시 어느 리스트에서 고를지 판별 (v1.9)
      charOwn: kind === 'char' ? rpChars.find(c => c.id === speaker)?.own : undefined,
      authorId: user.id, text: t, date: new Date().toISOString(),
    };
    // 방은 건드리지 않는다 — 발화만 자기 행으로 (v2.0)
    setMsgRows([...msgRows, { ...m, roomId: sel.id }]);
    rpMarkRead(sel.id, user.id, m.date);
    setText('');
    // 알림 (4.13) — 나를 제외한 참여자에게, 방 단위로 묶어서 (디스코드 DM은 봇 연동 시)
    memberIdsOf(sel).filter(id => id !== user.id).forEach(id =>
      pushNotif({
        type: 'rp', toUserId: id, href: '/rp', dedupeKey: `rp:${sel.id}`,
        title: `역극 「${sel.title}」 새 메시지`,
        body: t.slice(0, 60),
      }));
  };

  // 메시지 수정(본인) — 모달
  const [editMsg, setEditMsg] = useState<RpMessage | null>(null);
  const [editText, setEditText] = useState('');
  const saveMsg = () => {
    if (!sel || !editMsg) return;
    if (!editText.trim()) { toast('내용을 입력해 주세요'); return; }
    const t = editText.trim();
    if (msgRows.some(x => x.id === editMsg.id)) {
      setMsgRows(msgRows.map(x => (x.id === editMsg.id ? { ...x, text: t } : x)));
    } else {
      setRooms(rooms.map(r => r.id === sel.id
        ? { ...r, messages: r.messages.map(m => m.id === editMsg.id ? { ...m, text: t } : m) } : r));
    }
    setEditMsg(null);
  };
  const removeMsg = (m: RpMessage) => {
    if (!sel) return;
    del.ask('이 메시지를 삭제하시겠습니까?', () => {
      if (msgRows.some(x => x.id === m.id)) setMsgRows(msgRows.filter(x => x.id !== m.id));
      else setRooms(rooms.map(r => r.id === sel.id
        ? { ...r, messages: r.messages.filter(x => x.id !== m.id) } : r));
    });
  };

  // 방 개설 모달
  const [newOpen, setNewOpen] = useState(false);
  const [nTitle, setNTitle] = useState('');
  const [nRel, setNRel] = useState('none');
  const [nAu, setNAu] = useState('base');   // 고른 자관의 AU (v2.0 사용자 요청)
  const [nMembers, setNMembers] = useState<string[]>([]);
  const pool = useMembers();
  // 개설 모달에서 보여 줄 자동 참여자 (개설자 제외) — 권한자를 이름으로 (v2.0)
  const newRelGrantNames = (() => {
    if (nRel === 'none') return [] as string[];
    const ids = rpMemberIds(
      { relId: nRel, createdBy: user?.id ?? '', memberIds: [] } as unknown as RpRoom, rels, chars);
    return ids.filter(id => id !== user?.id)
      .map(id => pool.find(pp => pp.id === id)?.nickname ?? id);
  })();
  // 고른 자관의 AU 목록 (기본 설정 줄은 위 셀렉트가 직접 넣는다)
  const newRelAus = (rels.find(r => r.id === nRel)?.aus ?? []).filter(a => a.id !== 'base');
  const createRoom = () => {
    if (!user) return;
    if (!nTitle.trim()) { toast('방 제목을 입력해 주세요'); return; }
    const members = Array.from(new Set([user.id, ...nMembers]));
    const room: RpRoom = {
      id: newId(), title: nTitle.trim(), relId: nRel === 'none' ? undefined : nRel,
      // 원래 설정(base)이면 남기지 않는다 — 예전 방과 같은 모습이라 되돌리기도 쉽다
      auId: nRel !== 'none' && nAu !== 'base' ? nAu : undefined,
      memberIds: members, status: 'ongoing', isPublic: false,
      createdBy: user.id, created: new Date().toISOString(), lastRead: {}, messages: [],
    };
    setRooms([room, ...rooms]);
    setSelId(room.id);
    setNewOpen(false);
    setNTitle(''); setNRel('none'); setNMembers([]);
  };

  const canManage = sel && user && (sel.createdBy === user.id || isAdmin);
  const [endAsk, setEndAsk] = useState(false); // 완결 확인 — 삭제가 아니므로 전용 모달

  // 연결이 해제된(삭제된) 캐릭터 — 발화가 남아 있으면 다른 캐릭터로 재연동 (v1.9)
  // own은 화면 표시 규칙과 동일하게 !!charOwn 정규화 — 기록이 없으면 왼쪽(상대) 취급 (v1.9 버그 수정:
  // 왼쪽에 보이는 삭제 캐릭터의 RELINK 후보로 내 캐릭터 리스트가 뜨던 문제)
  const brokenChars = useMemo(() => {
    if (!sel) return [] as { charId: string; own: boolean }[];
    const map = new Map<string, boolean>();
    for (const m of msgsOf(sel)) {
      if (m.kind === 'char' && m.charId && !chars.some(c => c.id === m.charId) && !map.has(m.charId)) {
        map.set(m.charId, !!m.charOwn);
      }
    }
    return [...map.entries()].map(([charId, own]) => ({ charId, own }));
  }, [sel, chars]);
  const [relinkOpen, setRelinkOpen] = useState(false);
  const [relinkSel, setRelinkSel] = useState<Record<string, string>>({});
  // 대체 후보 — 반드시 같은 영역(own)의 캐릭터만 (v1.9 버그 수정, 사용자 발견)
  // 자관 멤버 목록에는 내 캐릭터도 함께 들어 있어서, 상대 영역 후보에 내 캐릭터가 떴고
  // 그걸 고르면 양쪽 대사가 한 캐릭터로 합쳐지던 문제 → 소유 구분으로 먼저 거른다.
  const relinkCands = (own: boolean): Character[] => {
    const sameSide = (c: Character) => !!c.own === own;
    const relList = rel
      ? (rel.members.map(mm => rpChars.find(c => c.id === mm.charId)).filter(Boolean) as Character[]).filter(sameSide)
      : [];
    return relList.length ? relList : chars.filter(sameSide);
  };
  // 이미 이 방에서 발화 중인 캐릭터 — 고르면 대사가 합쳐지므로 표시해 준다 (v1.9)
  const speakingIds = useMemo(() => new Set(
    (sel ? msgsOf(sel) : []).filter(m => m.kind === 'char' && m.charId).map(m => m.charId as string)), [sel, msgRows]);
  const applyRelink = () => {
    if (!sel) return;
    const picked = Object.entries(relinkSel).filter(([, v]) => v);
    if (picked.length === 0) { setRelinkOpen(false); return; }
    const relink = <M extends RpMessage>(m: M): M => {
      const nid = m.charId ? relinkSel[m.charId] : undefined;
      if (!nid) return m;
      return { ...m, charId: nid, charOwn: rpChars.find(c => c.id === nid)?.own };
    };
    setMsgRows(msgRows.map(x => (x.roomId === sel.id ? relink(x) : x)));
    setRooms(rooms.map(r => (r.id === sel.id ? { ...r, messages: r.messages.map(relink) } : r)));
    setRelinkOpen(false);
    setRelinkSel({});
    toast('캐릭터를 다시 연결했습니다');
  };
  const patchRoom = (p: Partial<RpRoom>) => {
    if (!sel) return;
    setRooms(rooms.map(r => r.id === sel.id ? { ...r, ...p } : r));
  };
  const removeRoom = () => {
    if (!sel) return;
    const count = msgsOf(sel).length;
    del.ask(`「${sel.title}」 방을 삭제하시겠습니까?`, () => {
      setRooms(rooms.filter(r => r.id !== sel.id));
      setMsgRows(msgRows.filter(x => x.roomId !== sel.id));   // 딸린 발화도 함께 (v2.0)
      setSelId(null);
    }, `대화 ${count}개도 함께 삭제됩니다.`);
  };

  // 완결 로그 HTML 내보내기 (4.9 — TRPG 백업에 붙일 수 있는 형태)
  const exportHtml = () => {
    if (!sel) return;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
    const rows = msgsOf(sel).map(m => {
      if (m.kind === 'desc') {
        return `<p style="text-align:center;color:#4a505a;line-height:1.8;margin:14px 0">${esc(m.text)}</p>`;
      }
      const ch = rpChars.find(c => c.id === m.charId);
      const name = ch?.name ?? '';
      const color = ch?.color ?? '#5d636d';
      return `<div style="margin:10px 0;line-height:1.7"><b style="color:${color};letter-spacing:.05em">${esc(name)}</b> — ${esc(m.text)}</div>`;
    }).join('\n');
    const html = `<div style="font-family:sans-serif;max-width:720px;margin:0 auto">
<h2 style="letter-spacing:.08em">${esc(sel.title)}</h2>
${rows}
</div>`;
    const u = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = u; a.download = `${sel.title}.html`;
    a.click();
    URL.revokeObjectURL(u);
  };

  if (!loaded) return <section className="page" />;

  if (!user) {
    return (
      <section className="page">
        {/* 비로그인 안내 — 관리자가 문구 수정 가능 (v1.9), 헤더 표시 옵션에도 항상 표시 */}
        <div className="page-head"><PageTitle>ROLEPLAY</PageTitle>
          <EditableDesc k="rp-gate-desc" def="역극은 로그인한 참여자에게만 표시됩니다" always /></div>
      </section>
    );
  }

  const relName = (id?: string) => rels.find(r => r.id === id)?.name;
  // 표시는 캐릭터 기준 (프로토타입 — "ALLOW 기반 · ALONE · WOOD") · 회원 계정은 접근 권한용일 뿐 노출 안 함
  const relCharNames = (relId?: string) => {
    const rel = rels.find(r => r.id === relId);
    if (!rel) return [];
    return rel.members
      .map(m => rpChars.find(c => c.id === m.charId)?.name)
      .filter(Boolean) as string[];
  };
  /** 방 소제목 (v2.0 사용자 확정) — 페어면 캐릭터 이름 둘만, 다인관이면 자관명만.
   *  「~기반」 같은 군더더기와 회원 계정 표기는 넣지 않는다 */
  const roomLabel = (r: RpRoom) => {
    const rel = rels.find(x => x.id === r.relId);
    if (!rel) return '자유 개설';
    const names = relCharNames(r.relId);
    const isPair = rel.kind === 'pair' || rel.members.length === 2;
    return isPair && names.length ? names.join(' · ') : rel.name;
  };
  const roomSub = (r: RpRoom) => [
    roomLabel(r),
    r.status === 'done' ? (r.isPublic ? '완결 · 공개 전환됨' : '완결') : '진행중',
  ].join(' · ');

  // 회원 계정(오너) 이름은 화면에 내지 않는다 — 계정은 접근 권한용일 뿐 (v2.0 사용자 요청).
  const speakerLabel = speaker === 'desc' ? '지문 (DESC)' : (rpChars.find(c => c.id === speaker)?.name ?? '');
  const speakerChar = rpChars.find(c => c.id === speaker);

  return (
    <section className={`page ${mFocus ? 'rp-focus' : ''}`}>
      <div className="page-head">
        <PageTitle>ROLEPLAY</PageTitle>
        <EditableDesc k="rp-desc" def="실시간 채팅형 · 참여자에게만 존재 노출 · 캐릭터 선택 발화" />
      </div>

      <div className={`rp-layout ${mListOpen ? 'mopen' : ''}`}>
        {/* 모바일 전용 접힘 바 — 탭하면 방 목록·상태 필터가 펼쳐짐 (v1.9) */}
        <button type="button" className="rp-mfold" onClick={() => setMListOpen(o => !o)}>
          <b>{sel ? sel.title : '방 목록'}</b>
          <small>MY ROOMS {myRooms.length} {mListOpen ? '▴' : '▾'}</small>
        </button>
        {/* 방 목록 — 내 참여 방만 · 헤더 고정, 리스트만 내부 스크롤 */}
        <div className="panel rp-rooms">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px 12px', flexShrink: 0 }}>
            <b style={{ fontSize: 12, letterSpacing: '.1em', color: 'var(--sub)' }}>MY ROOMS</b>
            <button className="btn btn-dark" style={{ padding: '0 12px', height: 30, fontSize: 11 }}
              onClick={() => setNewOpen(true)}>＋ NEW ROOM</button>
          </div>
          <div className="rp-rooms-list">
            {myRooms.map(r => (
              <div key={r.id} className={`rp-room ${sel?.id === r.id ? 'on' : ''}`}
                onClick={() => { setSelId(r.id); setMListOpen(false); }}>
                <b>{r.title} {rpHasNew(r, user.id, msgsOf(r)) && sel?.id !== r.id && <span className="new">N</span>}</b>
                <small>{roomSub(r)}</small>
              </div>
            ))}
            {myRooms.length === 0 && (
              <p className="hint" style={{ padding: '10px 6px 0' }}>
                {fStatus === 'all' ? '참여 중인 방이 없습니다' : '이 상태의 방이 없습니다'}
              </p>
            )}
          </div>
        </div>

        {/* 채팅 */}
        <div className="panel rp-chat">
          {sel ? (
            <>
              <div className="rp-head">
                <div>
                  <b>{sel.title}</b>
                  <small>{roomLabel(sel)}</small>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="pill">{sel.status === 'done' ? (sel.isPublic ? '완결 · 공개' : '완결') : '진행중'}</span>
                  {/* 삭제된 캐릭터가 남아 있으면 재연동 (v1.9) */}
                  {canManage && brokenChars.length > 0 && (
                    <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5, color: 'var(--accent)' }}
                      onClick={() => setRelinkOpen(true)}>RELINK</button>
                  )}
                  {canManage && sel.status === 'ongoing' && (
                    <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                      onClick={() => setEndAsk(true)}>END</button>
                  )}
                  {canManage && sel.status === 'done' && (
                    <>
                      {/* 완결 취소 — 다시 진행중으로 (공개 상태였다면 비공개로 복귀) */}
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                        onClick={() => patchRoom({ status: 'ongoing', isPublic: false })}>REOPEN</button>
                      {/* 공개 전환 — 참여자 전원 동의 흐름은 Supabase 연동 시 (현재는 개설자/관리자 전환) */}
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                        onClick={() => patchRoom({ isPublic: !sel.isPublic })}>
                        {sel.isPublic ? 'UNPUBLISH' : 'PUBLISH'}
                      </button>
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                        onClick={exportHtml}>EXPORT</button>
                    </>
                  )}
                  {canManage && (
                    <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                      onClick={removeRoom}>DELETE</button>
                  )}
                </div>
              </div>

              <div className="rp-msgs" ref={msgsRef}>
                {msgsOf(sel).map(m => {
                  const mine = m.authorId === user.id;
                  if (m.kind === 'desc') {
                    return (
                      <div key={m.id} className="msg-desc">
                        {m.text}
                        {mine && (
                          <span className="m-act">
                            <button onClick={() => { setEditMsg(m); setEditText(m.text); }}>EDIT</button>
                            <button onClick={() => removeMsg(m)}>DEL</button>
                          </span>
                        )}
                      </div>
                    );
                  }
                  const ch = rpChars.find(c => c.id === m.charId);
                  const name = ch?.name ?? '';
                  // 영역은 「보는 사람」 기준 (v2.0 사용자 확정): 내가 권한을 가진 캐릭터가 오른쪽,
                  // 아닌 캐릭터가 왼쪽. 관리자에게는 자캐(own)가 자기 캐릭터다.
                  // 그래서 같은 방이라도 사람마다 좌우가 반대로 보인다(각자 자기 쪽이 오른쪽).
                  // 삭제된 캐릭터는 발화 당시 기록(charOwn)으로 판단.
                  const rightSide = ch
                    ? (!!charGrant(ch, user.id) || (!!ch.own && isAdmin))
                    : (!!m.charOwn && isAdmin);
                  return (
                    <div key={m.id} className={`msg ${rightSide ? 'me' : ''}`} style={{ ['--cc' as string]: hexRgb(ch?.color) }}>
                      <Face ch={ch} className="face" />
                      <div>
                        <div className="who">{name}</div>
                        <div className="bub">{m.text}</div>
                        <div style={{ fontSize: 9, color: 'var(--faint)', marginTop: 3 }}>{fmtHM(m.date)}</div>
                      </div>
                      {mine && (
                        <span className="m-act">
                          <button onClick={() => { setEditMsg(m); setEditText(m.text); }}>EDIT</button>
                          <button onClick={() => removeMsg(m)}>DEL</button>
                        </span>
                      )}
                    </div>
                  );
                })}
                {msgsOf(sel).length === 0 && (
                  <p className="hint" style={{ textAlign: 'center', marginTop: 30 }}>첫 메시지를 남겨보세요</p>
                )}
              </div>

              {sel.status === 'ongoing' && (
                <div className="rp-input">
                  {/* 발화자 선택 — 캐릭터 / 지문 (v2.0 사용자 확정: 역극에는 이 둘만 있으면 된다) */}
                  <div className="char-pick" onClick={() => setPickOpen(o => !o)}>
                    {speaker === 'desc'
                      ? <div className="f" style={{ display: 'grid', placeItems: 'center', fontSize: 13, color: 'var(--sub)' }}>❝</div>
                      : <Face ch={speakerChar} className="f" />}
                    <small>{speakerLabel} ▾</small>
                    {pickOpen && (
                      <div className="rp-pick-pop" onClick={e => e.stopPropagation()}>
                        {speakChars.map(c => (
                          <button key={c.id} onClick={() => { setSpeaker(c.id); setPickOpen(false); }}>
                            <Face ch={c} className="f" />{c.name}
                          </button>
                        ))}
                        <button onClick={() => { setSpeaker('desc'); setPickOpen(false); }}>
                          <span className="f" style={{ display: 'grid', placeItems: 'center', color: 'var(--sub)' }}>❝</span>
                          지문 (DESC)
                        </button>
                      </div>
                    )}
                  </div>
                  {/* 플레이스홀더 없음 (v1.8) · Enter 전송 / Shift+Enter 줄바꿈 · /desc 명령 지원
                      포커스 중엔 모바일에서 역극 영역만 표시 (v1.9 — blur는 SEND 클릭이 씹히지 않게 지연) */}
                  <KTextarea style={{ minHeight: 44 }} value={text} onChange={e => setText(e.target.value)}
                    onFocus={() => setMFocus(true)}
                    onBlur={() => setTimeout(() => setMFocus(false), 180)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
                  <button className="btn btn-dark" onClick={send}>SEND</button>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'grid', placeItems: 'center', flex: 1 }}>
              <p className="hint">방을 개설하면 여기에 채팅이 표시됩니다</p>
            </div>
          )}
        </div>

        {/* 우측 상태 필터 — 진행중/완결 따로 보기 */}
        <div className="panel tagside" style={{ padding: 16, alignSelf: 'start' }}>
          <h4>상태</h4>
          {/* 진행중이 기본 — 진행중 / 전체 / 완결 순 (사용자 확정) */}
          <div className={`tag ${fStatus === 'ongoing' ? 'on' : ''}`} onClick={() => setFStatus('ongoing')}>
            진행중 <small>{cntS('ongoing')}</small>
          </div>
          <div className={`tag ${fStatus === 'all' ? 'on' : ''}`} onClick={() => setFStatus('all')}>
            전체 <small>{cntS('all')}</small>
          </div>
          <div className={`tag ${fStatus === 'done' ? 'on' : ''}`} onClick={() => setFStatus('done')}>
            완결 <small>{cntS('done')}</small>
          </div>
        </div>
      </div>

      {/* 방 개설 — 제목 + 기반 자관(선택) + 참여 회원 (4.9) */}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} small title="역극 방 개설"
        desc="비참여자에게는 방의 존재가 보이지 않습니다" dirty
        actions={<>
          <button className="btn btn-ghost" onClick={() => setNewOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={createRoom}>ADD</button>
        </>}>
        <div style={{ display: 'grid', gap: 11 }}>
          <div>
            <label className="k-label" style={{ marginBottom: 5 }}>Title</label>
            <KInput value={nTitle} onChange={e => setNTitle(e.target.value)} />
          </div>
          {/* 기반 자관 + 그 자관의 AU (v2.0 사용자 요청) — AU를 고르면 방 안의 캐릭터가
              그 AU 프로필(이름·색·이미지)로 보인다. AU가 없는 자관에는 옆 칸이 뜨지 않는다 */}
          <div>
            <label className="k-label" style={{ marginBottom: 5 }}>기반 자관 (선택)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <KSelect value={nRel} onChange={v => { setNRel(v); setNAu('base'); }}
                minWidth={160}
                options={[{ value: 'none', label: '자유 개설 (자관 없음)' }, ...rels.map(r => ({ value: r.id, label: r.name }))]} />
              {newRelAus.length > 0 && (
                <KSelect value={nAu} onChange={setNAu} minWidth={140}
                  options={[{ value: 'base', label: '원래 설정' },
                    ...newRelAus.map(a => ({ value: a.id, label: a.label || 'AU' }))]} />
              )}
            </div>
          </div>
          <div>
            <label className="k-label" style={{ marginBottom: 7 }}>참여 회원</label>
            {nRel === 'none' ? (
              /* 자유 개설일 때만 직접 고른다 */
              <div style={{ display: 'grid', gap: 8 }}>
                {pool.filter(p => p.id !== user.id).map(p => (
                  <KCheck key={p.id} label={p.nickname}
                    checked={nMembers.includes(p.id)}
                    onChange={v => setNMembers(ms => v ? [...ms, p.id] : ms.filter(x => x !== p.id))} />
                ))}
              </div>
            ) : (
              /* 자관 기반이면 그 자관 캐릭터의 권한자가 자동 참여 (v2.0 사용자 확정) —
                 나중에 권한이 다른 사람에게 넘어가도 이 방에 그대로 따라온다 */
              <p className="hint" style={{ margin: 0 }}>
                {newRelGrantNames.length
                  ? `이 자관 캐릭터에 권한이 있는 회원이 자동으로 참여합니다 — ${newRelGrantNames.join(' · ')}`
                  : '아직 이 자관 캐릭터에 권한을 준 회원이 없습니다 — 캐릭터 수정의 「회원 권한」에서 지정하면 이 방에도 자동으로 반영됩니다'}
              </p>
            )}
          </div>
        </div>
      </Modal>

      {/* 메시지 수정 (본인) */}
      <Modal open={editMsg !== null} onClose={() => setEditMsg(null)} small title="메시지 수정" dirty
        actions={<>
          <button className="btn btn-ghost" onClick={() => setEditMsg(null)}>CANCEL</button>
          <button className="btn btn-dark" onClick={saveMsg}>SAVE</button>
        </>}>
        <KTextarea style={{ minHeight: 100 }} value={editText} onChange={e => setEditText(e.target.value)} />
      </Modal>
      {/* 캐릭터 다시 연결 — 삭제된 캐릭터의 발화를 다른 캐릭터로 (v1.9) */}
      <Modal open={relinkOpen} onClose={() => setRelinkOpen(false)} small title="캐릭터 다시 연결"
        desc="연결이 해제된 캐릭터의 발화를 다른 캐릭터로 옮깁니다 — 같은 영역(왼쪽/오른쪽)의 캐릭터만 선택할 수 있습니다" dirty
        actions={<>
          <button className="btn btn-ghost" onClick={() => setRelinkOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={applyRelink}>APPLY</button>
        </>}>
        <div style={{ display: 'grid', gap: 12 }}>
          {brokenChars.map(b => (
            <div key={b.charId}>
              <label className="k-label" style={{ marginBottom: 5 }}>
                삭제된 캐릭터 — {b.own ? '내 캐릭터 영역 (내 캐릭터만 선택 가능)' : '상대 영역 (상대 캐릭터만 선택 가능)'}
              </label>
              <KSelect value={relinkSel[b.charId] ?? ''} onChange={v => setRelinkSel(s => ({ ...s, [b.charId]: v }))}
                options={[
                  { value: '', label: '선택 안 함' },
                  // 이미 발화 중인 캐릭터를 고르면 대사가 합쳐지므로 표시 (v1.9 사용자 피드백)
                  ...relinkCands(b.own).map(c => ({
                    value: c.id,
                    label: speakingIds.has(c.id) ? `${c.name} — 이미 발화 중 (대사가 합쳐집니다)` : c.name,
                  })),
                ]} />
            </div>
          ))}
        </div>
      </Modal>

      {/* 완결 확인 (삭제 아님 — END/CANCEL) */}
      <ConfirmModal open={endAsk} title="역극을 완결 처리하시겠습니까?"
        body="완결 후에는 공개 전환과 로그 내보내기를 사용할 수 있습니다."
        onClose={() => setEndAsk(false)}
        buttons={[
          { label: 'END', kind: 'dark', onClick: () => { patchRoom({ status: 'done' }); setEndAsk(false); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setEndAsk(false) },
        ]} />
      {del.element}
    </section>
  );
}
