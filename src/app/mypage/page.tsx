'use client';
// 마이페이지 (v1.9) — 내 정보 수정(닉네임·프로필 이미지·비밀번호) +
// 일반 회원: 나에게 연동된 캐릭터 리스트 · 내가 쓴 글/댓글 리스트 (관리자는 기본정보만)
import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  useLocalList, BOARD_SEED, GUEST_SEED, Post, GuestEntry, fmtDate,
  CommentRow, COMMENT_KEY, COMMENT_SEED,
} from '@/lib/postStore';
import { Character, CHAR_SEED } from '@/lib/charStore';
import { RoadItem, ROAD_SEED } from '@/lib/galleryStore';
import { useBoards } from '@/lib/boardStore';
import { collectMyItems, MyItem } from '@/lib/myActivity';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { putBlob, useBlobUrl, promoteToStorage } from '@/lib/blobStore';
import { KInput } from '@/components/ui/Kit';
import { Modal } from '@/components/ui/Modal';
import { ColorField } from '@/components/ui/ColorField';
import { fileDrop } from '@/lib/dnd';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';
import { PushSettings } from '@/components/shell/PushSettings';

export default function MyPage() {
  const router = useRouter();
  const toast = useToast();
  const { user, isAdmin, updateProfile } = useAuth();
  const [chars] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const [posts] = useLocalList<Post>('ohome.board.v1', BOARD_SEED);
  const [roads] = useLocalList<RoadItem>('ohome.road.v1', ROAD_SEED);
  const [guestEntries] = useLocalList<GuestEntry>('ohome.guest.v1', GUEST_SEED);
  // 댓글은 글과 따로 저장된다 (v2.0)
  const [cmtRows] = useLocalList<CommentRow>(COMMENT_KEY, COMMENT_SEED);
  const { boards } = useBoards();

  const [nick, setNick] = useState('');
  const [nickInit, setNickInit] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarSrc = useBlobUrl(user?.avatarUrl);
  // 프로필 이미지 선택 모달 (v1.9) — 단색 / 이미지 업로드 / 기본
  const [avOpen, setAvOpen] = useState(false);
  const [avColor, setAvColor] = useState('#6b7280');

  // 백엔드를 붙이기 전에 올린 프로필 사진은 참조가 이 브라우저의 파일 id라 다른 데서 로그인하면
  // 안 보인다 (v2.0 사용자 발견). 원본이 여기 남아 있으면 저장소로 올리고 주소로 바꿔 둔다.
  //
  // 처음엔 조용히 처리했는데, 안 될 때 아무 말이 없어서 「올렸는데 왜 안 보이지」에서 막혔다
  // (v2.0 사용자 지적). 못 옮겼으면 **왜** 못 옮겼는지 사진 밑에 그대로 적어 준다.
  const avatarRef = user?.avatarUrl;
  const [avNote, setAvNote] = useState('');
  useEffect(() => {
    if (!avatarRef) { setAvNote(''); return; }
    let alive = true;
    void (async () => {
      const r = await promoteToStorage(avatarRef);
      if (!alive) return;
      if (r.kind === 'uploaded') {
        const up = await updateProfile({ avatarUrl: r.url });
        if (!alive) return;
        setAvNote(up.ok ? '' : `저장소에는 올렸지만 프로필에 반영하지 못했습니다 — ${up.error}`);
      } else if (r.kind === 'no-origin') {
        setAvNote('이 사진의 원본이 이 브라우저에 없어 저장소로 옮길 수 없습니다 — 사진을 다시 올려 주세요');
      } else if (r.kind === 'local-mode') {
        setAvNote('서버에 연결되어 있지 않아 이 사진은 이 브라우저에만 저장됩니다');
      } else if (r.kind === 'failed') {
        setAvNote(`저장소로 올리지 못했습니다 — ${r.error}`);
      } else {
        setAvNote('');
      }
    })();
    return () => { alive = false; };
  }, [avatarRef, updateProfile]);

  // 닉네임 초기값 — user 로드 후 한 번
  if (user && !nickInit) { setNick(user.nickname); setNickInit(true); }

  if (!user) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>MY PAGE</PageTitle><p>로그인 후 이용할 수 있습니다</p></div>
      </section>
    );
  }

  const saveNick = async () => {
    if (!nick.trim()) { toast('닉네임을 입력해 주세요'); return; }
    const r = await updateProfile({ nickname: nick });
    toast(r.ok ? '저장되었습니다 — 이전에 쓴 글의 표시 이름은 그대로 남습니다' : r.error!);
  };
  const changeAvatar = async (f: File | undefined) => {
    if (!f) return;
    // 올리기가 실패하면 예전엔 여기서 그냥 튕겨서 **아무 말도 없이** 끝났다 — 모달만 열린 채라
    // 저장된 줄 알고 넘어가게 된다 (v2.0 사용자 지적: 「저장 안 됐는지 다른 브라우저에서 안 보인다」).
    // 저장소 규칙을 안 붙였거나 버킷 설정이 없으면 여기서 걸리므로, 이유를 그대로 보여 준다.
    let id: string;
    try {
      id = await putBlob(f);
    } catch (e) {
      toast(`이미지를 저장소에 올리지 못했습니다 — ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const r = await updateProfile({ avatarUrl: id });
    setAvOpen(false);
    toast(r.ok ? '프로필 이미지가 변경되었습니다' : r.error!);
  };
  const changePw = async () => {
    if (!curPw || !newPw) { toast('현재 비밀번호와 새 비밀번호를 입력해 주세요'); return; }
    if (newPw !== newPw2) { toast('새 비밀번호가 서로 다릅니다'); return; }
    const r = await updateProfile({ currentPassword: curPw, newPassword: newPw });
    if (r.ok) { setCurPw(''); setNewPw(''); setNewPw2(''); }
    toast(r.ok ? '비밀번호가 변경되었습니다' : r.error!);
  };

  // 나에게 연동된 캐릭터 (일반 회원)
  const myChars = chars.filter(c => c.grants?.some(g => g.userId === user.id));

  // 내가 쓴 글/댓글 (일반 회원) — 6개까지만, 나머지는 전체 리스트에서 (v1.9)
  const myItems: MyItem[] = collectMyItems(user.id, posts, roads, guestEntries, boards, cmtRows);

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>MY PAGE</PageTitle>
        <EditableDesc k="mypage-desc" def="내 정보 수정" />
      </div>

      <div style={{ maxWidth: 620, margin: '0 auto', display: 'grid', gap: 14 }}>
        {/* 기본 정보 */}
        <div className="panel" style={{ padding: 24 }}>
          <h4 style={{ fontSize: 11.5, letterSpacing: '.12em', color: 'var(--faint)', marginBottom: 16 }}>PROFILE</h4>
          <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* 프로필 이미지 — 클릭하면 단색/이미지 선택 모달 (v1.9, 이니셜 표시 없음) */}
            <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
              <div style={{
                width: 84, height: 84, borderRadius: '50%', overflow: 'hidden', cursor: 'var(--cur-pointer,pointer)',
                background: avatarSrc ? undefined : (user.avatarColor ?? 'linear-gradient(135deg,#6b7280,#3c434d)'),
                border: '1px solid var(--line)',
              }} onClick={() => { setAvColor(user.avatarColor ?? '#6b7280'); setAvOpen(true); }} data-tip="프로필 이미지 변경"
                {...fileDrop(fl => changeAvatar(fl[0]))}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {avatarSrc && <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => { changeAvatar(e.target.files?.[0]); e.target.value = ''; }} />
              {/* 이 사진이 다른 곳에서 안 보이는 이유 — 있을 때만 (v2.0 사용자 지적) */}
              {avNote && (
                <p className="hint" style={{ margin: 0, maxWidth: 190, textAlign: 'center', lineHeight: 1.5 }}>
                  {avNote}
                </p>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 220, display: 'grid', gap: 10 }}>
              <div>
                <label className="k-label" style={{ marginBottom: 5 }}>아이디</label>
                <KInput value={user.id} disabled style={{ opacity: 0.6 }} />
              </div>
              <div>
                <label className="k-label" style={{ marginBottom: 5 }}>닉네임</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <KInput value={nick} onChange={e => setNick(e.target.value)} style={{ flex: 1 }} />
                  <button className="btn btn-dark" onClick={saveNick}>SAVE</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 비밀번호 변경 */}
        <div className="panel" style={{ padding: 24 }}>
          <h4 style={{ fontSize: 11.5, letterSpacing: '.12em', color: 'var(--faint)', marginBottom: 16 }}>PASSWORD</h4>
          <div style={{ display: 'grid', gap: 9 }}>
            <KInput type="password" placeholder="현재 비밀번호" value={curPw} onChange={e => setCurPw(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <KInput type="password" placeholder="새 비밀번호" value={newPw} onChange={e => setNewPw(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
              <KInput type="password" placeholder="새 비밀번호 확인" value={newPw2} onChange={e => setNewPw2(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-dark" onClick={changePw}>CHANGE</button>
            </div>
          </div>
        </div>

        {/* 웹푸시 알림 받기 (자놀 이식) — PC·모바일 체크, 처음에는 둘 다 해제 */}
        <PushSettings />

        {/* 나에게 연동된 캐릭터 — 일반 회원만 (관리자는 전권이라 불필요) */}
        {!isAdmin && (
          <div className="panel" style={{ padding: 24 }}>
            <h4 style={{ fontSize: 11.5, letterSpacing: '.12em', color: 'var(--faint)', marginBottom: 14 }}>MY CHARACTERS</h4>
            {myChars.length === 0 && <p className="hint" style={{ margin: 0 }}>연동된 캐릭터가 없습니다</p>}
            {/* 1:1 썸네일 그리드 (v1.9) — 8열 균등(좁으면 자동 감소), 이미지 없으면 캐릭터 테마색, 호버 툴팁 이름 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: 10 }}>
              {myChars.map(c => (
                <div key={c.id}
                  data-tip={c.name}
                  onClick={() => router.push(`/chars/${c.id}`)}
                  style={{
                    aspectRatio: '1/1', borderRadius: 12, overflow: 'hidden', position: 'relative',
                    cursor: 'var(--cur-pointer,pointer)', background: c.color, border: '1px solid var(--line)',
                  }}>
                  {(c.thumbId ?? c.arts?.[0]) && (
                    <CroppedBlobImg fileRef={c.thumbId ?? c.arts?.[0]} crop={c.thumbCrop} ph={c.thumbClass} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 내가 쓴 글/댓글 — 일반 회원만 */}
        {!isAdmin && (
          <div className="panel" style={{ padding: 24 }}>
            <h4 style={{ fontSize: 11.5, letterSpacing: '.12em', color: 'var(--faint)', marginBottom: 14 }}>
              MY POSTS {myItems.length > 0 && <span style={{ color: 'var(--accent)' }}>{myItems.length}</span>}
              {myItems.length > 6 && (
                <span style={{ float: 'right', fontSize: 11, color: 'var(--accent)', cursor: 'var(--cur-pointer,pointer)', letterSpacing: 0 }}
                  onClick={() => router.push('/mypage/posts')}>더보기 ›</span>
              )}
            </h4>
            {myItems.length === 0 && <p className="hint" style={{ margin: 0 }}>작성한 글이 없습니다</p>}
            <div style={{ display: 'grid', gap: 2 }}>
              {myItems.slice(0, 6).map((it, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line)', cursor: 'var(--cur-pointer,pointer)' }}
                  onClick={() => router.push(it.href)}>
                  <span className="pill" style={{ flexShrink: 0 }}>{it.kind}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.text}</span>
                  <small style={{ color: 'var(--faint)', flexShrink: 0 }}>{fmtDate(it.date)}</small>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 프로필 이미지 선택 (v1.9) — 단색 또는 이미지 업로드(드래그앤드롭 포함) */}
      <Modal open={avOpen} onClose={() => setAvOpen(false)} small title="프로필 이미지"
        actions={<button className="btn btn-ghost" onClick={() => setAvOpen(false)}>CANCEL</button>}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="cp-lb">단색</span>
            <ColorField value={avColor} onChange={setAvColor} />
            <button className="btn btn-dark" style={{ marginLeft: 'auto', padding: '5px 14px', fontSize: 11 }}
              onClick={async () => {
                const r = await updateProfile({ avatarColor: avColor, avatarUrl: null });
                setAvOpen(false);
                toast(r.ok ? '단색 프로필로 변경되었습니다' : r.error!);
              }}>적용</button>
          </div>
          <div className="upzone" style={{ padding: '18px 14px', textAlign: 'center' }}
            onClick={() => fileRef.current?.click()}
            {...fileDrop(fl => changeAvatar(fl[0]))}>
            <b style={{ display: 'block', marginBottom: 3 }}>이미지를 끌어다 놓거나 클릭</b>
          </div>
          {(user.avatarUrl || user.avatarColor) && (
            <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 11, justifySelf: 'end' }}
              onClick={async () => {
                const r = await updateProfile({ avatarUrl: null, avatarColor: null });
                setAvOpen(false);
                toast(r.ok ? '기본 프로필로 되돌렸습니다' : r.error!);
              }}>기본으로</button>
          )}
        </div>
      </Modal>
    </section>
  );
}
