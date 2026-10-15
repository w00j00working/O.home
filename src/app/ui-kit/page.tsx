'use client';
// UI 킷 데모 — 0차 결과물 확인용 (기획서 7장 "예쁜 컨트롤")
import React, { useState } from 'react';
import {
  KInput, KTextarea, KCheck, KRadio, KToggle, KStep, KSelect, SearchBar, Pager, Tip,
} from '@/components/ui/Kit';
import { ColorField } from '@/components/ui/ColorField';
import { FileDrop } from '@/components/ui/FileDrop';
import { CropEditor, CropValue, CropAspect } from '@/components/ui/CropEditor';
import { ConfirmModal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { PageTitle } from '@/components/ui/PageText';

export default function UiKitPage() {
  const toast = useToast();
  const [check, setCheck] = useState(true);
  const [radio, setRadio] = useState('a');
  const [toggle, setToggle] = useState(true);
  const [num, setNum] = useState(5);
  const [sel, setSel] = useState('md');
  const [color, setColor] = useState('#a63a45');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [text, setText] = useState('');
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropAspect, setCropAspect] = useState<CropAspect>('3:4');
  const [cropResult, setCropResult] = useState<CropValue | null>(null);

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>UI KIT</PageTitle>
        <p>기본 브라우저 UI 전면 대체 — 전 기능이 이 컴포넌트만 사용 (기획서 7장)</p>
        <div className="head-actions">
          <SearchBar onSearch={q => toast(`검색: ${q || '(비어 있음)'}`)} />
          <button className="btn btn-dark" onClick={() => toast('버튼 클릭')}>✎ WRITE</button>
        </div>
      </div>

      <div className="panel">
        <div className="set-sec">
          <h3>입력</h3>
          <div className="d">텍스트 인풋 · 자동 높이 textarea(리사이즈 핸들 없음)</div>
          <div style={{ display: 'grid', gap: 10, maxWidth: 460 }}>
            <KInput placeholder="텍스트 입력" />
            <KTextarea placeholder="내용 따라 높이가 자동으로 늘어나는 textarea" value={text} onChange={e => setText(e.target.value)} />
          </div>
        </div>

        <div className="set-sec">
          <h3>선택 컨트롤</h3>
          <div className="d">체크박스 15px · 라디오 14px · 토글 · 스테퍼 — 체크 정중앙, 라벨과 수직 정렬</div>
          <div style={{ display: 'flex', gap: 26, alignItems: 'center', flexWrap: 'wrap' }}>
            <KCheck label="체크박스" checked={check} onChange={setCheck} />
            <KRadio label="라디오 A" value="a" current={radio} onChange={setRadio} name="demo" />
            <KRadio label="라디오 B" value="b" current={radio} onChange={setRadio} name="demo" />
            <KToggle label="토글" checked={toggle} onChange={setToggle} />
            <KStep value={num} onChange={setNum} />
          </div>
        </div>

        <div className="set-sec">
          <h3>드롭다운 · 컬러 · 툴팁</h3>
          <div className="d">자체 셀렉트(화살표 수직 중앙) · hex+컬러피커 쌍 · 커스텀 툴팁</div>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <KSelect
              value={sel}
              onChange={setSel}
              options={[
                { value: 'md', label: 'Markdown' },
                { value: 'html', label: 'HTML' },
                { value: 'txt', label: '일반 텍스트' },
              ]}
            />
            <ColorField value={color} onChange={setColor} />
            <Tip tip="자체 디자인 커스텀 툴팁">
              <span className="pill">호버해 보세요</span>
            </Tip>
            <Tip tip="드롭다운 색을 따르는 변형" dd>
              <span className="pill dark">이것도</span>
            </Tip>
          </div>
        </div>

        <div className="set-sec">
          <h3>버튼</h3>
          <div className="d">등록/글쓰기(btn-dark)는 검색창과 같은 세로 35px 고정</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-dark">＋ ADD CHARACTER</button>
            <button className="btn btn-accent">POST</button>
            <button className="btn btn-ghost">CANCEL</button>
            <button className="btn btn-dark" onClick={() => setModal(true)}>모달 열기</button>
            <button className="btn btn-ghost" onClick={() => toast('토스트 알림입니다')}>토스트</button>
          </div>
        </div>

        <div className="set-sec">
          <h3>파일 업로드</h3>
          <div className="d">드래그&드롭 존 + 파일별 용량 표시</div>
          <div style={{ maxWidth: 460 }}>
            <FileDrop multiple onFiles={fs => toast(`${fs.length}개 파일 선택됨`)} />
          </div>
        </div>

        <div className="set-sec">
          <h3>썸네일 크롭 편집기</h3>
          <div className="d">이미지 선택 → 드래그 이동 + 확대/축소, 규격 고정 비율 + 3분할 가이드</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <KSelect minWidth={120} value={cropAspect} onChange={v => setCropAspect(v as CropAspect)}
              options={[
                { value: '3:4', label: '3:4 (캐릭터)' },
                { value: '4:3', label: '4:3 (자관)' },
                { value: '16:9', label: '16:9 (티켓·도토리)' },
                { value: '1:1', label: '1:1' },
              ]} />
            <div style={{ maxWidth: 320, flex: 1 }}>
              <FileDrop accept="image/*" label="크롭할 이미지 선택"
                onUrl={url => setCropSrc(url)}
                onFiles={fs => { if (fs[0]) setCropSrc(URL.createObjectURL(fs[0])); }} />
            </div>
            {cropResult && (
              <span className="pill">crop: x {Math.round(cropResult.x)} · y {Math.round(cropResult.y)} · {cropResult.scale.toFixed(2)}×</span>
            )}
          </div>
          {cropSrc && (
            <CropEditor open={!!cropSrc} src={cropSrc} aspect={cropAspect}
              onClose={() => setCropSrc(null)}
              onApply={c => { setCropResult(c); setCropSrc(null); toast('크롭 좌표 저장됨 (원본 유지)'); }} />
          )}
        </div>

        <div className="set-sec">
          <h3>리스트 행 호버 · 페이지네이션</h3>
          <div className="d">행 호버는 배경+글씨색 변경, 라운드 밖으로 삐져나오지 않음</div>
          <div className="hover-list" style={{ border: '1px solid var(--line)' }}>
            {['첫 번째 게시글 제목', '두 번째 게시글 제목', '세 번째 게시글 제목'].map(t => (
              <div className="row" key={t}><span className="pill">잡담</span>{t}</div>
            ))}
          </div>
          <Pager page={page} total={4} onChange={setPage} />
        </div>
      </div>

      <ConfirmModal
        open={modal}
        title="편집을 종료하시겠습니까?"
        body="저장하지 않은 변경사항은 사라집니다. (편집 종료 확인 모달 데모 — v1.8)"
        onClose={() => setModal(false)}
        buttons={[
          { label: '저장 후 종료', kind: 'dark', onClick: () => { setModal(false); toast('저장되었습니다'); } },
          { label: '저장하지 않고 종료', kind: 'ghost', onClick: () => setModal(false) },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setModal(false) },
        ]}
      />
    </section>
  );
}
