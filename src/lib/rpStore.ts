'use client';
// 역극 (4.9) — 실시간 채팅형. 현재는 localStorage 단계(같은 브라우저 내 동작 확인용)이며
// 실시간 송수신·입력 중 표시·참여자 전원 동의 흐름은 Supabase Realtime 연동 시 활성화.
export interface RpMessage {
  id: string;
  // 캐릭터 발화 / 지문(가운데 서술). 'player'(회원 본인 발화)는 없앴다 —
  // 역극에는 캐릭터와 지문만 있으면 된다 (v2.0 사용자 확정). 옛 기록은 읽을 때 지문으로 바꿔 준다
  kind: 'char' | 'desc' | 'player';
  charId?: string;                  // kind==='char'일 때 발화 캐릭터
  charOwn?: boolean;                // 발화 당시 내 캐릭터(자캐)였는지 — 삭제된 캐릭터 재연동 시 리스트 판별용
  authorId: string;                 // 작성 회원 (수정/삭제 권한)
  text: string;
  date: string;                     // ISO
}

export interface RpRoom {
  id: string;
  title: string;
  relId?: string;                   // 기반 자관 (선택 — 자유 개설 가능)
  /** 그 자관의 어느 AU로 노는지 (v2.0 사용자 요청) — 없으면 원래 설정.
   *  방 안에서 캐릭터를 그 AU 프로필(이름·색·이미지)로 바꿔 보여 준다. */
  auId?: string;
  memberIds: string[];              // 참여 회원 — 이 목록에 없으면 방의 존재 자체가 보이지 않음 (확정)
  status: 'ongoing' | 'done';       // 진행중 / 완결
  isPublic: boolean;                // 완결 후 공개 전환 (자관 역극 리스트로 열람)
  createdBy: string;
  created: string;
  lastRead: Record<string, string>; // 회원별 마지막 확인 시각 — N 뱃지
  messages: RpMessage[];
}

/**
 * 이 방의 참여 회원 (v2.0 사용자 확정).
 *
 * 기반 자관이 있으면 **회원을 직접 고르지 않고** 그 자관 멤버 캐릭터에 권한이 있는 사람이
 * 자동으로 참여자가 된다. 저장된 목록이 아니라 볼 때마다 계산하므로, 캐릭터 권한을 다른
 * 사람에게 넘기면 그 자관 기반 역극들에 **따로 손대지 않아도 즉시 반영**된다
 * (방 문서를 고쳐 돌아다닐 필요가 없다 — 남의 방은 어차피 고칠 수도 없다).
 *
 * 자유 개설(자관 없음) 방은 예전처럼 저장된 memberIds를 쓴다. 개설자는 언제나 참여자.
 */
export function rpMemberIds(
  r: RpRoom,
  rels: { id: string; members: { charId: string }[] }[],
  chars: { id: string; grants?: { userId: string }[] }[],
): string[] {
  const ids = new Set<string>();
  if (r.createdBy) ids.add(r.createdBy);
  if (r.relId) {
    const rel = rels.find(x => x.id === r.relId);
    rel?.members.forEach(m => {
      chars.find(c => c.id === m.charId)?.grants?.forEach(g => ids.add(g.userId));
    });
    return [...ids];
  }
  (r.memberIds ?? []).forEach(id => ids.add(id));
  return [...ids];
}

/** hex → "r,g,b" (말풍선 저알파 배경용 — 6장 말풍선 색상 규칙) */
export function hexRgb(hex?: string): string {
  const h = (hex ?? '#5d636d').replace('#', '');
  const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return `${parseInt(f.slice(0, 2), 16) || 93},${parseInt(f.slice(2, 4), 16) || 99},${parseInt(f.slice(4, 6), 16) || 109}`;
}

/**
 * 발화 한 줄 = 자기 문서 하나 (v2.0).
 *
 * 예전에는 발화가 방(RpRoom) 문서 안 배열에 있었다. 그래서 **말을 하려면 방을 UPDATE 해야 했고**,
 * 「수정은 작성자 또는 관리자만」 규칙에 걸려 남이 만든 방에서는 참여자가 발화할 수 없었다 —
 * 댓글·문답이 막히던 것과 똑같은 뿌리다 (v2.0 사용자 요청으로 함께 정리).
 */
export const RP_MSG_KEY = 'ohome.rpmsgs.v1';

export interface RpMessageRow extends RpMessage { roomId: string }

export const RP_MSG_SEED: RpMessageRow[] = [];

/** 방 하나의 발화 — 옛 방 안의 것 + 따로 저장된 것을 시간순으로.
 *  없앤 '플레이어' 발화는 **지우지 않고 지문으로 읽는다** — 남이 실제로 한 말이라 사라지면 안 된다 */
export function messagesFor(rows: RpMessageRow[], roomId: string, legacy: RpMessage[] = []): RpMessage[] {
  const mine = rows.filter(r => r.roomId === roomId);
  const seen = new Set(mine.map(r => r.id));
  return [...legacy.filter(m => !seen.has(m.id)), ...mine]
    .map(m => (m.kind === 'player' ? { ...m, kind: 'desc' as const, charId: undefined } : m))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- 읽음 표시 (v2.0) ----------
   예전에는 방 문서의 lastRead에 적었는데, 방을 열어 보기만 해도 남의 방을 UPDATE 하게 되어
   참여자에게는 규칙이 막았다(N 뱃지가 영영 안 없어짐). 읽음 시각은 원래 사람마다 다른 값이라
   서버에 공유할 이유가 없어 브라우저에만 둔다. */
const READ_KEY = 'ohome.rpread.v1';

function readMap(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(READ_KEY) ?? '{}') as Record<string, string>; } catch { return {}; }
}

/** 내가 이 방을 마지막으로 본 시각 — 로컬 기록과 옛 방 기록 중 나중 것 */
export function rpSeenAt(r: RpRoom, userId: string): string {
  const local = readMap()[`${userId}:${r.id}`] ?? '';
  const legacy = r.lastRead?.[userId] ?? '';
  return local > legacy ? local : legacy;
}

export function rpMarkRead(roomId: string, userId: string, at = new Date().toISOString()): void {
  try {
    const m = readMap();
    m[`${userId}:${roomId}`] = at;
    localStorage.setItem(READ_KEY, JSON.stringify(m));
  } catch { /* 무시 */ }
}

/** 방의 마지막 메시지 시각 (없으면 개설 시각) */
export const rpLastDate = (r: RpRoom, msgs: RpMessage[]) =>
  msgs.length ? msgs[msgs.length - 1].date : r.created;

/** 안 읽은 새 메시지 여부 (내가 마지막으로 본 뒤에 남이 쓴 메시지) */
export function rpHasNew(r: RpRoom, userId: string, msgs: RpMessage[]): boolean {
  const seen = rpSeenAt(r, userId);
  return msgs.some(m => m.authorId !== userId && m.date > seen);
}

/* ---------- 시드 (프로토타입 데모 계승 — admin·guest 참여) ---------- */
export const RP_SEED: RpRoom[] = [];
