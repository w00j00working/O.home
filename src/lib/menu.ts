// 상단 메뉴 트리 — 기획서 3장 (계층 메뉴, 메뉴 선택제)
// 기본 구성은 프로토타입_2 상단 메뉴를 따름 (커미션·기록 그룹 포함)
// ※ 프로토타입의 「로그인」 gnb 항목은 임시 배치 — 실제로는 우상단 사용자 영역에 표시 (3장 주석)
// TODO(환경설정 메뉴 관리): 관리자가 이 구조를 GUI로 편집 → DB 저장으로 이전
export interface MenuItem {
  label: string;
  href?: string;             // 하위가 없는 단독 메뉴
  children?: { label: string; href: string }[];
}

/** 배치 가능한 기능(모듈) 전체 — href → 기본 이름. 메뉴 트리에 넣어야 노출됨 (3장 메뉴 선택제) */
export const FEATURES: { href: string; label: string }[] = [
  { href: '/chars', label: '캐릭터' },
  { href: '/rels', label: '자관' },
  { href: '/rp', label: '역극' },
  { href: '/board', label: '리스트' },
  { href: '/gallery', label: '갤러리' },
  { href: '/loadb', label: '로드비' },
  { href: '/tchars', label: '캐릭터' },   // TRPG 캐릭터 — 자놀 캐릭터와는 href로 구분
  { href: '/trpg', label: '로그 백업' },
  { href: '/dotori', label: '도토리' },
  { href: '/playlog', label: '플레이기록' },
  { href: '/comm', label: '커미션' },
  { href: '/comm-apply', label: '신청자 리스트' },
  { href: '/cal', label: '스케줄러' },
  { href: '/diary', label: '다이어리' },
  { href: '/threads', label: '감상타래' },
  { href: '/memo', label: '메모장' },
  { href: '/guest', label: '방명록' },
  { href: '/intro', label: '소개' },
];

export const DEFAULT_MENU: MenuItem[] = [
  {
    label: '자놀',
    children: [
      { label: '캐릭터', href: '/chars' },
      { label: '자관', href: '/rels' },
      { label: '역극', href: '/rp' },
    ],
  },
  {
    label: '게시판',
    children: [
      { label: '리스트', href: '/board' },
      { label: '갤러리', href: '/gallery' },
      { label: '로드비', href: '/loadb' },
    ],
  },
  {
    label: 'TRPG',
    children: [
      { label: '캐릭터', href: '/tchars' },
      { label: '로그 백업', href: '/trpg' },
      { label: '도토리', href: '/dotori' },
      { label: '플레이기록', href: '/playlog' },
    ],
  },
  {
    label: '커미션',
    children: [
      { label: '커미션', href: '/comm' },
      { label: '신청자 리스트', href: '/comm-apply' },
    ],
  },
  {
    label: '기록',
    children: [
      { label: '스케줄러', href: '/cal' },
      { label: '다이어리', href: '/diary' },
      { label: '감상타래', href: '/threads' },
      { label: '메모장', href: '/memo' },
    ],
  },
  { label: '방명록', href: '/guest' },
];
