'use client';
// 커미션 양식 작성 (v1.9) — 상세 페이지 하단에서 방문자가 직접 입력하고,
// 업로드 이미지는 인라인(base64), 외부 이미지는 주소로 단일 HTML 파일에 저장해 커미션주에게 제출.
// 이미지 개당 10MB 제한 · 저장된 HTML에는 클릭 확대 뷰어(여러 장 좌우 넘김) 내장.
import React, { useRef, useState } from 'react';
import { CommFormField } from '@/lib/commStore';
import { KTextarea, KCheck } from '@/components/ui/Kit';
import { fileDrop } from '@/lib/dnd';
import { useToast } from '@/components/ui/Toast';
import { useImageSource } from '@/components/ui/ImageSource';

const IMG_LIMIT = 10 * 1024 * 1024;   // 10MB

interface ImgAns { name: string; dataUrl: string }
type Answer = string | string[] | ImgAns[];

const esc = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function ImageAnswerZone({ onSelect, children }: { onSelect: (url: string) => void; children: React.ReactNode }) {
  const source = useImageSource(onSelect);
  return (
    <div tabIndex={0} {...source.handlers} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      {children}
      <button type="button" className="btn btn-ghost" onClick={() => source.open()}>🔗 이미지 주소 붙여넣기</button>
      {source.element}
    </div>
  );
}

export function CommFormFill({ fields, commName }: { fields: CommFormField[]; commName: string }) {
  const toast = useToast();
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const setAns = (id: string, v: Answer | undefined) =>
    setAnswers(a => {
      const n = { ...a };
      if (v === undefined) delete n[id]; else n[id] = v;
      return n;
    });

  const addImages = (f: CommFormField, imgs: ImgAns[]) => {
    setAnswers(a => {
      const cur = (a[f.id] as ImgAns[] | undefined) ?? [];
      return { ...a, [f.id]: f.multiple ? [...cur, ...imgs] : imgs.slice(0, 1) };
    });
  };

  const pickImages = (f: CommFormField, files: FileList | null) => {
    const picked = Array.from(files ?? []);
    if (picked.length === 0) return;
    for (const file of picked) {
      if (file.size > IMG_LIMIT) { toast(`이미지는 개당 10MB까지 첨부할 수 있습니다 — ${file.name}`); return; }
    }
    Promise.all(picked.map(file => new Promise<ImgAns>(resolve => {
      const r = new FileReader();
      r.onload = () => resolve({ name: file.name, dataUrl: String(r.result) });
      r.readAsDataURL(file);
    }))).then(imgs => addImages(f, imgs));
  };

  const saveHtml = () => {
    for (const f of fields) {
      if (!f.required) continue;
      const a = answers[f.id];
      const empty = a === undefined
        || (typeof a === 'string' && !a.trim())
        || (Array.isArray(a) && a.length === 0);
      if (empty) { toast(`필수 항목을 입력해 주세요 — ${f.label}`); return; }
    }
    const rows = fields.map((f, i) => {
      const a = answers[f.id];
      let body = '<p class="a empty">무응답</p>';
      if (typeof a === 'string' && a.trim()) body = `<div class="a">${esc(a)}</div>`;
      else if (Array.isArray(a) && a.length) {
        if (typeof a[0] === 'string') body = `<div class="a">${(a as string[]).map(esc).join('<br>')}</div>`;
        else {
          const imgs = a as ImgAns[];
          body = `<div class="a shots">${imgs.map(im =>
            `<figure class="shot"><img src="${esc(im.dataUrl)}" alt="${esc(im.name)}"><figcaption>${esc(im.name)}</figcaption></figure>`).join('')}</div>`;
        }
      }
      return `<div class="q">${i + 1}. ${esc(f.label)}${f.required ? ' <span class="rq">*</span>' : ''}</div>${f.desc ? `<div class="qd">${esc(f.desc)}</div>` : ''}${body}`;
    }).join('\n');
    const now = new Date();
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<title>${esc(commName)} 신청서</title>
<style>
body{font-family:Pretendard,'Apple SD Gothic Neo','Malgun Gothic',sans-serif;max-width:640px;margin:40px auto;padding:0 20px 60px;color:#2c3037;background:#f4f2ef;line-height:1.7}
h1{font-family:'Noto Serif KR','Nanum Myeongjo',serif;font-size:22px;letter-spacing:.08em;border-bottom:2px solid #1d2025;padding-bottom:12px}
.q{margin-top:24px;font-weight:700;font-size:14px}
.rq{color:#a63a45}
.qd{color:#8a8f98;font-size:12px;margin-top:2px}
.a{margin-top:7px;font-size:13.5px;white-space:pre-wrap;background:#fff;border:1px solid #e2ded9;border-radius:11px;padding:11px 15px;word-break:break-word}
.a.empty{color:#b6bac1}
.shots{display:flex;flex-wrap:wrap;gap:10px}
.shot{margin:0}
.shot img{max-height:260px;max-width:100%;border-radius:9px;display:block;cursor:zoom-in}
.shot figcaption{color:#8a8f98;font-size:10.5px;margin-top:5px;letter-spacing:.04em}
.meta{color:#8a8f98;font-size:11px;margin-top:34px;letter-spacing:.12em}
#vw{position:fixed;inset:0;background:rgba(15,17,20,.9);display:none;align-items:center;justify-content:center;z-index:50}
#vw.on{display:flex}
#vw img{max-width:92vw;max-height:90vh;border-radius:10px}
#vw .nav{position:fixed;top:50%;transform:translateY(-50%);font-size:34px;color:#fff;background:none;border:none;cursor:var(--cur-pointer,pointer);padding:18px;opacity:.75}
#vw .nav:hover{opacity:1}
#vw .prev{left:8px}#vw .next{right:8px}
#vw .x{position:fixed;top:14px;right:20px;font-size:26px;color:#fff;background:none;border:none;cursor:var(--cur-pointer,pointer);opacity:.75}
</style></head><body>
<h1>${esc(commName)} — COMMISSION FORM</h1>
${rows}
<p class="meta">SAVED ${stamp}</p>
<div id="vw"><button class="x">✕</button><button class="nav prev">‹</button><img alt=""><button class="nav next">›</button></div>
<script>
(function(){
var imgs=[].slice.call(document.querySelectorAll('.shot img'));
var vw=document.getElementById('vw'),big=vw.querySelector('img'),idx=0;
function show(i){idx=(i+imgs.length)%imgs.length;big.src=imgs[idx].src;vw.classList.add('on');
 vw.querySelector('.prev').style.display=imgs.length>1?'':'none';
 vw.querySelector('.next').style.display=imgs.length>1?'':'none';}
imgs.forEach(function(im,i){im.addEventListener('click',function(){show(i)})});
vw.querySelector('.prev').addEventListener('click',function(e){e.stopPropagation();show(idx-1)});
vw.querySelector('.next').addEventListener('click',function(e){e.stopPropagation();show(idx+1)});
vw.querySelector('.x').addEventListener('click',function(){vw.classList.remove('on')});
vw.addEventListener('click',function(e){if(e.target===vw||e.target===big)vw.classList.remove('on')});
document.addEventListener('keydown',function(e){
 if(!vw.classList.contains('on'))return;
 if(e.key==='Escape')vw.classList.remove('on');
 if(e.key==='ArrowLeft')show(idx-1);
 if(e.key==='ArrowRight')show(idx+1);
});
})();
</script>
</body></html>`;
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${commName.replace(/[\\/:*?"<>|]/g, '_')}-신청서.html`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('신청서 HTML이 저장되었습니다 — 커미션주에게 파일을 전달해 주세요');
  };

  return (
    <div className="cmf-view">
      {fields.map((f, i) => {
        const a = answers[f.id];
        return (
          <div key={f.id}>
            <div className="q">{i + 1}. {f.label}{f.required && <span className="req">*</span>}</div>
            {f.desc && <div className="qd">{f.desc}</div>}
            <div style={{ marginTop: 7 }}>
              {f.type === 'text' && (
                <KTextarea style={{ minHeight: 64 }} value={typeof a === 'string' ? a : ''}
                  onChange={e => setAns(f.id, e.target.value)} />
              )}
              {f.type === 'single' && (
                <div style={{ display: 'grid', gap: 7 }}>
                  {(f.options ?? []).filter(o => o.trim()).map(op => (
                    <KCheck key={op} label={<span style={{ fontSize: 12.5 }}>{op}</span>}
                      checked={a === op} onChange={v => setAns(f.id, v ? op : undefined)} />
                  ))}
                </div>
              )}
              {f.type === 'multi' && (
                <div style={{ display: 'grid', gap: 7 }}>
                  {(f.options ?? []).filter(o => o.trim()).map(op => {
                    const list = Array.isArray(a) && typeof a[0] !== 'object' ? (a as string[]) : [];
                    return (
                      <KCheck key={op} label={<span style={{ fontSize: 12.5 }}>{op}</span>}
                        checked={list.includes(op)}
                        onChange={v => setAns(f.id, v ? [...list, op] : list.filter(x => x !== op))} />
                    );
                  })}
                </div>
              )}
              {f.type === 'image' && (() => {
                const imgs = (Array.isArray(a) && typeof a[0] === 'object' ? a : []) as ImgAns[];
                return (
                  <ImageAnswerZone onSelect={url => {
                    let name = '외부 이미지';
                    try { name = decodeURIComponent(new URL(url).pathname.split('/').pop() || '') || name; } catch {}
                    addImages(f, [{ name, dataUrl: url }]);
                  }}>
                    <input ref={el => { fileRefs.current[f.id] = el; }} type="file" accept="image/*"
                      multiple={!!f.multiple} style={{ display: 'none' }}
                      onChange={e => { pickImages(f, e.target.files); e.target.value = ''; }} />
                    {imgs.map((im, ii) => (
                      <span key={ii} style={{ position: 'relative' }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={im.dataUrl} alt="" style={{ width: 84, height: 84, objectFit: 'cover', borderRadius: 9, border: '1px solid var(--line)', display: 'block' }} />
                        <span className="fx" style={{ position: 'absolute', right: -6, top: -6, background: 'var(--panel-solid)', borderRadius: '50%', padding: '0 4px' }}
                          onClick={() => setAns(f.id, imgs.filter((_, j) => j !== ii).length ? imgs.filter((_, j) => j !== ii) : undefined)}>✕</span>
                      </span>
                    ))}
                    {(f.multiple || imgs.length === 0) && (
                      <button className="btn btn-ghost" style={{ padding: '6px 13px', fontSize: 11 }}
                        onClick={() => fileRefs.current[f.id]?.click()}
                        {...fileDrop(fl => pickImages(f, fl))}>↑ 이미지 첨부 (10MB 이하{f.multiple ? ' · 여러 장' : ''})</button>
                    )}
                    <span className="hint">외부 이미지는 저장된 HTML에서도 인터넷 연결이 필요합니다</span>
                  </ImageAnswerZone>
                );
              })()}
            </div>
          </div>
        );
      })}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
        <button className="btn btn-dark" onClick={saveHtml}>⤓ SAVE AS HTML</button>
      </div>
    </div>
  );
}
