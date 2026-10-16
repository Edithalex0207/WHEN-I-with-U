/*
 * SchoolEnrollFlow.jsx —— 「办理入学」三步仪式弹窗。
 *
 *   第 1 步  选班级    向日葵班 / 云朵班 / 小星星班
 *   第 2 步  选老师    3 位 NPC 老师，各带性格和口头禅
 *   第 3 步  拍入学照片  生成一张入学纪念卡（小伙伴头像 + 班级 + 老师 + 日期 + 边框）
 *                      "重拍"会换一个边框、换一个小倾斜角度并闪一下；
 *                      "收进学校相册"才真正办理入学。
 *
 * 外壳沿用 .cp-overlay.center / .cp-backdrop（跟娃娃机弹窗一样的居中卡片）。
 *
 * 【入学是怎么落库的】
 * 点"收进学校相册"时：先用 html-to-image 把纪念卡节点导出成压缩过的 jpeg
 * dataURL，再一次性调用 enrollCompanion(companionId, { classId, teacherId, photo })，
 * 学籍 + 相册 + 日志在同一个事务里写入。
 * 如果导出图片失败（比如头像图片读取受限），不会卡住入学：照样入学，只是没有
 * 相册图片，界面上会提示一句。
 *
 * 入学成功后停留在纪念卡页：按钮变成"保存为图片"和"开始上学"。
 *
 * Props:
 *   companion   object   —— 当前小伙伴（用 id / name / avatarUrl）
 *   onEnrolled  function({ record, album }) —— 入学成功的瞬间调用，调用方据此刷新学校状态
 *   onClose     function —— 关闭弹窗
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toJpeg } from 'html-to-image';

import './school.css';
import {
  SCHOOL_CLASSES,
  SCHOOL_TEACHERS,
  SCHOOL_STAGE,
  SCHOOL_STAGE_LABELS,
  findSchoolClass,
  findSchoolTeacher,
} from './companionSchoolData';
import { enrollCompanion } from './companionSchoolService';
import {
  BackGlyph,
  CheckGlyph,
  CloseGlyph,
  StarGlyph,
  PetFace,
  TeacherAvatar,
  ClassArt,
} from './SchoolArt';

/* ---------------- 可调参数 ---------------- */
const FRAMES = ['pink', 'mint', 'butter']; // 纪念卡边框，"重拍"时依次轮换
const PHOTO_QUALITY = 0.86; // 导出 jpeg 的质量
const PHOTO_PIXEL_RATIO = 1.6; // 导出清晰度，越大图越大（相册里存的是 dataURL）
const MAX_TILT = 6; // 重拍时小伙伴贴纸最大倾斜角度

const STEPS = ['class', 'teacher', 'photo'];

const pad2 = (n) => String(n).padStart(2, '0');
const formatDate = (timestamp) => {
  const d = new Date(timestamp);
  return `${d.getFullYear()} . ${pad2(d.getMonth() + 1)} . ${pad2(d.getDate())}`;
};

const exportCardImage = (node) => toJpeg(node, {
  quality: PHOTO_QUALITY,
  pixelRatio: PHOTO_PIXEL_RATIO,
  backgroundColor: '#ffffff',
  cacheBust: true,
});

const SchoolEnrollFlow = ({ companion, onEnrolled, onClose }) => {
  const [step, setStep] = useState('class');
  const [classId, setClassId] = useState(null);
  const [teacherId, setTeacherId] = useState(null);
  const [frameIdx, setFrameIdx] = useState(0);
  const [tilt, setTilt] = useState(0);
  const [flashKey, setFlashKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null); // 入学成功后：{ record, album, image }
  const [notice, setNotice] = useState('');
  const [photoDate] = useState(() => Date.now());
  const cardRef = useRef(null);

  const schoolClass = findSchoolClass(classId);
  const teacher = findSchoolTeacher(teacherId);
  const enrolled = Boolean(result);

  /* ---------------- 返回 / 关闭 ---------------- */
  const handleBack = useCallback(() => {
    if (saving) return;
    if (enrolled) { onClose?.(); return; }
    if (step === 'photo') { setStep('teacher'); setNotice(''); return; }
    if (step === 'teacher') { setStep('class'); return; }
    onClose?.();
  }, [saving, enrolled, step, onClose]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') handleBack(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleBack]);

  /* ---------------- 重拍 ---------------- */
  const handleRetake = () => {
    if (saving || enrolled) return;
    setFrameIdx((i) => (i + 1) % FRAMES.length);
    setTilt(Math.round((Math.random() * 2 - 1) * MAX_TILT));
    setFlashKey((k) => k + 1);
  };

  /* ---------------- 办理入学 ---------------- */
  const handleEnroll = async () => {
    if (saving || enrolled || !schoolClass || !teacher || !cardRef.current) return;
    setSaving(true);
    setNotice('');

    let image = null;
    try {
      image = await exportCardImage(cardRef.current);
    } catch (_) {
      image = null; // 导出失败不拦着入学，下面会提示
    }

    try {
      const { record, album } = await enrollCompanion(companion.id, {
        classId: schoolClass.id,
        teacherId: teacher.id,
        photo: image ? { image, title: `${companion.name}的入学纪念卡` } : null,
      });
      setResult({ record, album, image });
      if (!image) {
        setNotice('入学成功啦！只是纪念卡图片没能生成（可能是头像读取失败），这次没有存进相册。');
      }
      onEnrolled?.({ record, album });
    } catch (err) {
      setNotice(err?.message || '入学没有成功，再试一次吧');
    } finally {
      setSaving(false);
    }
  };

  /* ---------------- 保存为图片 ---------------- */
  const handleDownload = async () => {
    if (saving || !result) return;
    let { image } = result;
    if (!image && cardRef.current) {
      setSaving(true);
      try {
        image = await exportCardImage(cardRef.current);
      } catch (_) {
        image = null;
      }
      setSaving(false);
    }
    if (!image) {
      setNotice('图片生成失败了，可以先截屏保存哦');
      return;
    }
    const link = document.createElement('a');
    link.href = image;
    link.download = `${companion.name}-入学纪念卡.jpg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  /* ---------------- 顶栏文案 ---------------- */
  const titleText = enrolled ? '入学成功！' : step === 'photo' ? '咔嚓！入学啦' : '办理入学';
  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="cp-overlay center">
      <div className="cp-backdrop" onClick={handleBack} />

      <div className="sd-root" role="dialog" aria-label="办理入学">
        <div className="sd-head">
          <button type="button" className="sd-round" aria-label={step === 'class' || enrolled ? '关闭' : '上一步'} onClick={handleBack} disabled={saving}>
            {step === 'class' || enrolled ? <CloseGlyph /> : <BackGlyph />}
          </button>
          <div className="sd-title">
            <b>{titleText}</b>
            {!enrolled && (
              <div className="sd-dots" aria-hidden="true">
                {STEPS.map((id, i) => (
                  <i key={id} className={i === stepIndex ? 'is-on' : i < stepIndex ? 'is-done' : ''} />
                ))}
              </div>
            )}
          </div>
          <span className="sd-round is-ghost" aria-hidden="true" />
        </div>

        {/* ---------- 第 1 步：选班级 ---------- */}
        {step === 'class' && (
          <div className="sd-body">
            <p className="sd-hint">先给 {companion.name} 挑一个班级吧</p>
            <div className="sd-cls">
              {SCHOOL_CLASSES.map((c) => {
                const selected = c.id === classId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    className={`sd-ccard sd-tone-${c.tone}${selected ? ' is-sel' : ''}`}
                    aria-pressed={selected}
                    onClick={() => setClassId(c.id)}
                  >
                    {selected && <span className="sd-tick"><CheckGlyph /></span>}
                    <span className="sd-ccard-pic"><ClassArt schoolClass={c} size={58} /></span>
                    <span>
                      <h4>{c.name}</h4>
                      <p>{c.desc}</p>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ---------- 第 2 步：选老师 ---------- */}
        {step === 'teacher' && (
          <div className="sd-body">
            <p className="sd-hint">谁来当 {companion.name} 的班主任呢</p>
            <div className="sd-tch">
              {SCHOOL_TEACHERS.map((t) => {
                const selected = t.id === teacherId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`sd-tcard sd-tone-${t.tone}${selected ? ' is-sel' : ''}`}
                    aria-pressed={selected}
                    onClick={() => setTeacherId(t.id)}
                  >
                    {selected && <span className="sd-tick"><CheckGlyph /></span>}
                    <TeacherAvatar teacher={t} size={64} />
                    <span className="sd-tcard-main">
                      <h4>
                        {t.name}
                        <span className="sd-tag">{t.trait}</span>
                      </h4>
                      <div className="sd-say">“{t.catchphrase}”</div>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ---------- 第 3 步：入学纪念卡 ---------- */}
        {step === 'photo' && schoolClass && teacher && (
          <div className="sd-body is-center">
            <div className="sd-photo-wrap">
              {enrolled && (
                <>
                  <span className="sd-sparkle s1"><StarGlyph size={20} /></span>
                  <span className="sd-sparkle s2"><StarGlyph size={16} /></span>
                  <span className="sd-sparkle s3"><StarGlyph size={22} /></span>
                  <span className="sd-sparkle s4"><StarGlyph size={14} /></span>
                </>
              )}
              {/* 倾斜放在外层，导出图片的节点（cardRef）本身不倾斜，避免导出时边角被裁掉 */}
              <div className="sd-photo-tilt">
                <div className="sd-photo" ref={cardRef}>
                  <span className="sd-tape" />
                  <div className={`sd-frame sd-frame-${FRAMES[frameIdx]}`}>
                    <div className="sd-scene">
                      <span className="sd-sun" />
                      <span className="sd-cloud" style={{ left: 16, top: 26, width: 64, height: 22 }} />
                      <span className="sd-cloud" style={{ left: 120, top: 64, width: 48, height: 18 }} />
                      <span
                        className={`sd-pet-sticker${companion.avatarUrl ? '' : ' is-empty'}`}
                        style={{ transform: `rotate(${tilt}deg)` }}
                      >
                        {companion.avatarUrl ? (
                          <img src={companion.avatarUrl} alt={companion.name} draggable={false} />
                        ) : (
                          <PetFace size={120} />
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="sd-stamp">入学<br />纪念</div>
                  <div className="sd-photo-title">入学纪念卡</div>
                  <div className="sd-photo-name">{companion.name}</div>
                  <div className="sd-chips">
                    <span className={`sd-chip sd-tone-${schoolClass.tone}`}>{schoolClass.name}</span>
                    <span className={`sd-chip sd-tone-${teacher.tone}`}>{teacher.name}</span>
                    <span className="sd-chip sd-tone-sky">{SCHOOL_STAGE_LABELS[SCHOOL_STAGE.KINDERGARTEN]}</span>
                  </div>
                  <div className="sd-photo-date">{formatDate(photoDate)}</div>
                </div>
              </div>
            </div>
            {notice && <p className="sd-notice" role="status">{notice}</p>}
          </div>
        )}

        {/* ---------- 底栏按钮 ---------- */}
        <div className="sd-foot">
          {step === 'class' && (
            <button type="button" className="sd-btn main" disabled={!classId} onClick={() => setStep('teacher')}>
              下一步：选老师
            </button>
          )}
          {step === 'teacher' && (
            <button type="button" className="sd-btn main" disabled={!teacherId} onClick={() => setStep('photo')}>
              下一步：拍入学照片
            </button>
          )}
          {step === 'photo' && !enrolled && (
            <>
              <button type="button" className="sd-btn ghost" disabled={saving} onClick={handleRetake}>重拍</button>
              <button type="button" className="sd-btn heart" disabled={saving} onClick={handleEnroll}>
                {saving ? '正在办理入学…' : '收进学校相册'}
              </button>
            </>
          )}
          {step === 'photo' && enrolled && (
            <>
              <button type="button" className="sd-btn ghost" disabled={saving} onClick={handleDownload}>保存为图片</button>
              <button type="button" className="sd-btn main" disabled={saving} onClick={onClose}>开始上学</button>
            </>
          )}
        </div>

        <div key={flashKey} className={`sd-flash${flashKey > 0 ? ' is-on' : ''}`} aria-hidden="true" />
      </div>
    </div>
  );
};

export default SchoolEnrollFlow;