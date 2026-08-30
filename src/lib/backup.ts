'use client';
// 백업·복원·선택 초기화 (v2.0)
//  · 서버 모드: DB의 콘텐츠·설정 + Storage 이미지를 zip으로 (다른 DB에 복원해도 이미지 주소가 자동 치환됨)
//  · 로컬 모드: localStorage + IndexedDB
//  · 초기화: 메뉴별로 골라서 (서버 모드면 DB에서도 지움)
import { allBlobs, putBlobAs } from './blobStore';
import { backend, COLLECTION_OF } from './backend';
import { dumpAll, loadAll, collectRefs, readFileByRef, isFileUrl, type Snapshot } from './transfer';
import { removeSetting } from './settingStore';

/** 회원 계정 관련 키 — 백업/초기화에서 별도로 다룬다 */
export const MEMBER_KEYS = [
  'ohome.mockreg.v1',    // 브라우저 계정(로컬 모드)
  'ohome.mockuser.v1',   // 로그인 세션
  'ohome.membertags.v1', // 회원 태그
  'ohome.invite.v1',     // 가입코드
  'ohome.setup.v1',      // 설치 완료 표시
];

const SITE_KEYS = [
  'ohome.theme.v2', 'ohome.theme.v1', 'ohome.themeCss.v1', 'ohome.themePresets.v1', 'ohome.intro.v1', 'ohome.links.v1',
  'ohome.fonts.v2', 'ohome.fonts.v1', 'ohome.menuset.v1', 'ohome.site.v1', 'ohome.pagetext.v1',
  'ohome.cursor.v1', 'ohome.bgm.v1', 'ohome.bgm.fold', 'ohome.boardset.v1', 'ohome.boards.v1',
  'ohome.commset.v1', 'ohome.memoset.v1', 'ohome.threadset.v1', 'ohome.trpgset.v1',
  'ohome.moods.v1', 'ohome.relqsets.v1', 'ohome.notifset.v1',
];

export interface ResetGroup { key: string; label: string; desc?: string; keys: string[] }

/** 콘텐츠(메뉴별) — 초기화 체크박스 */
export const RESET_CONTENT: ResetGroup[] = [
  { key: 'board', label: '게시판 글', keys: ['ohome.board.v1'] },
  { key: 'guest', label: '방명록', keys: ['ohome.guest.v1'] },
  { key: 'chars', label: '캐릭터', keys: ['ohome.chars.v1'] },
  { key: 'rels', label: '자관', keys: ['ohome.rels.v1'] },
  { key: 'backup', label: '갤러리(그림 백업)', keys: ['ohome.backup.v1'] },
  { key: 'road', label: '로드뷰', keys: ['ohome.road.v1', 'ohome.roadnext.v1'] },
  // 본문은 목록과 분리 저장이라(v2.0) 같이 지워야 로그만 지워지고 본문이 유령처럼 남지 않는다
  { key: 'trpg', label: 'TRPG 로그', keys: ['ohome.trpg.v1', 'ohome.trpgbody.v1'] },
  { key: 'tchars', label: 'TRPG 캐릭터', keys: ['ohome.tchars.v1'] },
  { key: 'dotori', label: '도토리', keys: ['ohome.dotori.v1'] },
  { key: 'playlog', label: '플레이기록', keys: ['ohome.playlog.v1'] },
  { key: 'rp', label: '역극', keys: ['ohome.rp.v1'] },
  { key: 'threads', label: '감상타래', keys: ['ohome.threads.v1'] },
  { key: 'diary', label: '다이어리', keys: ['ohome.diary.v1'] },
  { key: 'memo', label: '메모장', keys: ['ohome.memo.v1'] },
  { key: 'comm', label: '커미션·신청자', keys: ['ohome.comm.v1', 'ohome.commapply.v1'] },
  { key: 'sched', label: '스케줄러 일정', keys: ['ohome.sched.v1'] },
  { key: 'notif', label: '알림', keys: ['ohome.notif.v1'] },
];

export const RESET_EXTRA: ResetGroup[] = [
  { key: 'main', label: '메인 위젯 구성', desc: '위젯 종류·배치·크기', keys: ['ohome.main.v1'] },
  { key: 'site', label: '사이트 설정', desc: '테마·폰트·메뉴·로고·게시판/커미션 설정', keys: SITE_KEYS },
  { key: 'images', label: '업로드 이미지 전체', desc: '모든 그림·썸네일 저장소', keys: [] },
  // 로그인 계정 자체는 서비스(Firebase Authentication / Supabase Auth) 소관이라 홈에서 지울 수 없다
  {
    key: 'members', label: '회원 목록',
    desc: '홈의 회원 목록·태그·가입코드 (로그인 계정 자체는 서비스 콘솔에서 지워야 합니다)',
    keys: MEMBER_KEYS,
  },
];

/* ---------- 백업 ---------- */

export async function exportBackup(includeMembers: boolean): Promise<{ blob: Blob; dataCount: number; blobCount: number }> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const be = backend();

  // 데이터 — 서버 모드면 DB에서, 아니면 브라우저에서
  const snap = await dumpAll(be);
  if (!includeMembers) {
    MEMBER_KEYS.forEach(k => { delete snap.settings[k]; });
    delete snap.members;
  }
  zip.file('data.json', JSON.stringify({ ...snap, includeMembers }, null, 0));

  // 이미지 — 서버 모드면 데이터에 박힌 주소로 받아서, 로컬 모드면 저장소 전체
  const types: Record<string, string> = {};
  let blobCount = 0;
  if (be) {
    const refs = collectRefs({ c: snap.collections, s: snap.settings }, new Set());
    for (const ref of refs) {
      if (!isFileUrl(ref)) continue;
      const blob = await readFileByRef(ref);
      if (!blob) continue;
      const name = `f${blobCount}`;
      zip.file(`blobs/${name}`, blob);
      types[name] = blob.type;
      // 어떤 주소였는지 기록해 복원 때 짝을 맞춘다
      types[`${name}:ref`] = ref;
      blobCount += 1;
    }
  } else {
    const blobs = await allBlobs();
    for (const [id, b] of blobs) {
      zip.file(`blobs/${id}`, b);
      types[id] = b.type;
      blobCount += 1;
    }
  }
  zip.file('blobs.json', JSON.stringify(types));

  const dataCount = Object.values(snap.collections).reduce((n, l) => n + (l?.length ?? 0), 0)
    + Object.keys(snap.settings).length;
  return { blob: await zip.generateAsync({ type: 'blob' }), dataCount, blobCount };
}

/* ---------- 복원 ---------- */

export async function importBackup(file: File): Promise<{ dataCount: number; blobCount: number; hasMembers: boolean }> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);
  const dataFile = zip.file('data.json');
  if (!dataFile) throw new Error('백업 파일이 아닙니다 (data.json 없음)');
  const parsed = JSON.parse(await dataFile.async('string')) as Partial<Snapshot> & { data?: Record<string, string> };

  const typesFile = zip.file('blobs.json');
  const types: Record<string, string> = typesFile ? JSON.parse(await typesFile.async('string')) : {};

  /* 구버전(v1) 백업 — localStorage 통째 저장분 */
  if (parsed.data && !parsed.collections) {
    for (const [k, v] of Object.entries(parsed.data)) localStorage.setItem(k, v);
    const files = zip.file(/^blobs\//);
    for (const f of files) {
      const id = f.name.slice(6);
      const buf = await f.async('blob');
      await putBlobAs(id, types[id] ? new Blob([buf], { type: types[id] }) : buf);
    }
    return {
      dataCount: Object.keys(parsed.data).length,
      blobCount: files.length,
      hasMembers: MEMBER_KEYS.some(k => k in (parsed.data ?? {})),
    };
  }

  /* v2 백업 */
  const snap: Snapshot = {
    version: 2,
    createdAt: parsed.createdAt ?? new Date().toISOString(),
    collections: parsed.collections ?? {},
    settings: parsed.settings ?? {},
  };
  // 참조 → zip 안의 파일 이름 표 (서버 백업은 blobs.json에 원래 주소를 기록해 둔다)
  const byRef = new Map<string, string>();
  Object.entries(types).forEach(([k, v]) => { if (k.endsWith(':ref')) byRef.set(v, k.slice(0, -4)); });

  const getFile = async (ref: string): Promise<Blob | null> => {
    const name = byRef.get(ref) ?? ref;          // 로컬 백업은 파일 이름이 곧 id
    const f = zip.file(`blobs/${name}`);
    if (!f) return null;
    const buf = await f.async('blob');
    const t = types[name];
    return t ? new Blob([buf], { type: t }) : buf;
  };

  const { files, items } = await loadAll(backend(), snap, getFile);
  return {
    dataCount: items,
    blobCount: files,
    hasMembers: MEMBER_KEYS.some(k => k in snap.settings),
  };
}

/* ---------- 초기화 ---------- */

/** 초기화 결과 — 실패를 조용히 삼키면 "지웠다"고 나오는데 DB에는 그대로 남는다 */
export interface ResetReport { rows: number; files: number; members: number; failed: string[] }

export async function resetGroups(selected: string[]): Promise<ResetReport> {
  const all = [...RESET_CONTENT, ...RESET_EXTRA];
  const keys = new Set<string>();
  for (const g of all) {
    if (!selected.includes(g.key)) continue;
    g.keys.forEach(k => keys.add(k));
  }

  const report: ResetReport = { rows: 0, files: 0, members: 0, failed: [] };
  const be = backend();
  if (be) {
    // 서버 모드 — 고른 콘텐츠 컬렉션을 비우고, 설정 키는 지운다
    for (const key of keys) {
      const coll = COLLECTION_OF[key];
      if (coll) {
        try {
          const rows = await be.fetchList(coll);
          if (rows.length) { await be.syncList(coll, rows, [], null); report.rows += rows.length; }
        } catch { report.failed.push(coll); }
      } else {
        try { await be.saveSetting(key, null); } catch { report.failed.push(key); }
      }
    }
    // 회원 계정 — 홈의 회원 목록(profiles)을 비운다.
    // 로그인 계정 자체(Firebase Authentication / Supabase Auth)는 관리자 키가 있어야 지울 수 있어
    // 공개 홈에서는 불가능하다 — 콘솔에서 지워야 한다(설치 가이드 안내).
    if (selected.includes('members')) {
      try {
        const me = (await be.currentUser())?.id;
        for (const m of await be.listMembers()) {
          if (m.id === me) continue;   // 지금 로그인한 관리자는 남긴다
          try { await be.deleteMember(m.id); report.members += 1; } catch { report.failed.push(`profile:${m.id}`); }
        }
      } catch { report.failed.push('profiles'); }
    }
    // 업로드 이미지 전체 — 저장소 파일까지 실제로 지운다 (예전에는 참조만 사라지고 용량은 그대로였다)
    if (selected.includes('images')) {
      try {
        const files = await be.listFiles();
        for (const f of files) {
          try { await be.deleteFile(f.ref); report.files += 1; } catch { report.failed.push(f.ref); }
        }
      } catch { report.failed.push('storage'); }
    }
  }

  keys.forEach(k => { removeSetting(k); try { localStorage.removeItem(k); } catch { /* 무시 */ } });
  if (selected.includes('images')) {
    try { indexedDB.deleteDatabase('ohome-blobs'); } catch { /* 무시 */ }
  }
  return report;
}
