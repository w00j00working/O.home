'use client';
// 설치 화면에서 복사해 쓰는 Firebase 보안 규칙 — 원본: firebase/firestore.rules · firebase/storage.rules
// (원본을 고치면 이 파일도 함께 갱신)

export const FIRESTORE_RULES = `rules_version = '2';

// ============================================================
// O.HOME Firestore 보안 규칙
// Firebase 콘솔 → Firestore Database → 규칙 에 붙여넣고 [게시].
//
// 문서 구조
//   meta/owner            { uid, admins[] }   ← 첫 로그인 계정이 1회만 자기를 등록
//   profiles/{uid}        { nickname, avatarUrl, avatarColor }
//   settings/{key}        { value }           ← 테마·메뉴·폰트·메인 위젯 등
//   <콘텐츠>/{id}          { data, authorId, visibility, sort }
// ============================================================

service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }

    function ownerData() {
      return get(/databases/$(database)/documents/meta/owner).data;
    }

    function isAdmin() {
      return signedIn()
        && exists(/databases/$(database)/documents/meta/owner)
        && (ownerData().uid == request.auth.uid
            || (ownerData().keys().hasAny(['admins']) && request.auth.uid in ownerData().admins));
    }

    // 콘텐츠 컬렉션 목록 — 여기 없는 이름은 아무 권한도 없다
    function isContent(name) {
      return name in [
        'posts', 'guestbook', 'characters', 'relations', 'gallery', 'roadview',
        'trpg_logs', 'trpg_log_bodies', 'trpg_chars', 'dotori', 'playlog', 'rp_rooms', 'threads',
        'diary', 'memos', 'commissions', 'applicants', 'moods', 'comments', 'qa_answers', 'rp_messages',
        'notifications'
      ];
    }

    // ── 소유자(관리자) 지정 — 아직 없을 때 딱 한 번 ──────────────
    match /meta/owner {
      allow read: if true;
      allow create: if signedIn() && !exists(/databases/$(database)/documents/meta/owner);
      allow update, delete: if isAdmin();
    }

    // ── 회원 프로필 ─────────────────────────────────────────────
    match /profiles/{uid} {
      allow read: if true;
      allow create, update: if signedIn() && (request.auth.uid == uid || isAdmin());
      allow delete: if isAdmin();
    }

    // ── 사이트 설정 (읽기 공개 · 쓰기 관리자) ────────────────────
    match /settings/{key} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // ── 콘텐츠 ─────────────────────────────────────────────────
    match /{coll}/{docId} {
      // 읽기: 전체공개 / 멤버공개(로그인) / 내가 쓴 것 / 관리자
      allow read: if isContent(coll) && (
        resource.data.visibility == 'public'
        || (resource.data.visibility == 'member' && signedIn())
        || (signedIn() && resource.data.authorId == request.auth.uid)
        || isAdmin()
      );

      // 쓰기: 로그인 회원 — 방명록·댓글은 비로그인 방문자도 남길 수 있음(닉네임+비밀번호 방식)
      // notifications: 손님 댓글·방명록이 관리자에게 알림을 남길 수 있어야 한다 (v2.0) —
      // 행 주인(authorId)은 받는 사람이라 읽기·수정·삭제는 받는 사람·관리자만 (아래 공통 규칙)
      allow create: if isContent(coll) && (signedIn() || coll in ['guestbook', 'comments', 'notifications']);

      // 수정·삭제: 작성자 본인 · 편집 권한을 받은 회원 · 관리자
      // 댓글은 글과 따로 저장되므로(v2.0) 댓글을 달 때 글을 수정할 필요가 없다 —
      // 예전엔 댓글이 글 안에 있어서 일반 회원이 관리자 글에 댓글을 달면 이 규칙에 막혔다.
      // 게스트 댓글(로그인 없이 남긴 것)은 authorId가 비어 있어 본인 확인이 안 되므로
      // 지우는 것은 관리자만 — 방명록의 게스트 글과 같은 규칙이다.
      // editorIds: 캐릭터에 「편집까지」 권한을 준 회원 (v2.0). grants는 객체 배열이라
      // 규칙에서 훑을 수 없어, 저장할 때 회원 id만 뽑아 둔 평평한 배열을 본다.
      allow update, delete: if isContent(coll)
        && signedIn()
        && (resource.data.authorId == request.auth.uid
            || isAdmin()
            || (resource.data.keys().hasAny(['editorIds'])
                && request.auth.uid in resource.data.editorIds));
    }
  }
}
`;

export const STORAGE_RULES = `rules_version = '2';

// ============================================================
// O.HOME Storage 보안 규칙 (이미지·파일)
// Firebase 콘솔 → Storage → 규칙 에 붙여넣고 [게시].
//   · 읽기는 공개 (방문자가 그림을 봐야 하므로)
//   · 올리기·지우기는 로그인 회원만
//   · 한 번에 20MB 초과 업로드 차단
// ============================================================

service firebase.storage {
  match /b/{bucket}/o {
    match /ohome/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null
        && request.resource.size < 20 * 1024 * 1024;
      allow delete: if request.auth != null;
    }
  }
}
`;
