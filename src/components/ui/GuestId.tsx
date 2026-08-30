'use client';
/* 게스트 신원 입력 바 (v1.9) — 방문자 댓글 허용 시 댓글창 위에 붙는 컴팩트 한 줄 UI.
   GUEST 칩 + 닉네임.
   **비밀번호 칸은 없앴다** (v2.0 사용자 확정) — 「본인 수정·삭제용」이라고 받아 두었지만
   서버는 로그인한 사람만 수정·삭제를 허용하므로, 손님이 그 비밀번호로 할 수 있는 일이
   실제로는 없었다. 지울 수 없는데 지울 수 있는 것처럼 묻는 칸은 없느니만 못하다. */
import React from 'react';

export function GuestIdBar({ name, onName, style }: {
  name: string;
  onName: (v: string) => void;
  style?: React.CSSProperties;
}) {
  return (
    <div className="guest-id" style={style}>
      <span className="gi-tag">GUEST</span>
      <input value={name} placeholder="닉네임" maxLength={20}
        onChange={e => onName(e.target.value)} />
    </div>
  );
}
