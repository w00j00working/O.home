// 내가 쓴 글/댓글 수집 (마이페이지, v1.9) — 게시판 글·댓글 / 로드뷰 그림·댓글 / 방명록
import { Post, GuestEntry, CommentRow } from './postStore';
import { RoadItem } from './galleryStore';
import { Board, MAIN_BOARD_ID } from './boardStore';

export interface MyItem { kind: string; text: string; date: string; href: string }

export function collectMyItems(
  userId: string,
  posts: Post[], roads: RoadItem[], guestEntries: GuestEntry[], boards: Board[],
  // 댓글은 글과 따로 저장된다 (v2.0) — 옛 글 안에 남아 있는 것도 아래에서 함께 센다
  cmtRows: CommentRow[] = [],
): MyItem[] {
  const boardName = (p: Post) => {
    const b = boards.find(x => x.id === (p.boardId ?? MAIN_BOARD_ID));
    return b && b.id !== MAIN_BOARD_ID ? b.name : '게시판';
  };
  return [
    ...posts.filter(p => p.authorId === userId)
      .map(p => ({ kind: `${boardName(p)} 글`, text: p.title, date: p.date, href: `/board/${p.id}` })),
    ...posts.flatMap(p => [
      ...p.comments,
      ...cmtRows.filter(c => c.target === 'post' && c.targetId === p.id),
    ].filter(c => c.authorId === userId)
      .map(c => ({ kind: `${boardName(p)} 댓글`, text: c.text, date: c.date, href: `/board/${p.id}` }))),
    ...roads.filter(it => it.authorId === userId)
      .map(it => ({ kind: '로드비 그림', text: it.title, date: it.date, href: '/loadb' })),
    ...roads.flatMap(it => [
      ...it.comments,
      ...cmtRows.filter(c => c.target === 'road' && c.targetId === it.id),
    ].filter(c => c.authorId === userId)
      .map(c => ({ kind: '로드비 댓글', text: c.text, date: c.date, href: '/loadb' }))),
    ...guestEntries.filter(e => e.authorId === userId)
      .map(e => ({ kind: '방명록', text: e.body, date: e.date, href: '/guest' })),
  ].sort((a, b) => b.date.localeCompare(a.date));
}
