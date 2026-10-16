/*
 * CompanionSchoolModal.jsx —— 「上学」首页弹窗（学校首页 v2）。
 * 对应预览 school-home-preview2.html，布局照着预览来：
 *   场景区（校园小场景，小伙伴当主角）+ 卡片区（今天的小课堂 / 长大进度 /
 *   四个入口），没入学时场景区下面换成一张"还没上学"的卡。
 *
 * 外壳复用 .sd-root / .sd-head / .sd-body（school.css），场景区和卡片区用
 * 新前缀 sh-（school/schoolHome.css，下一轮加，这一轮先只搭结构 —— 在
 * schoolHome.css 落地之前，这个弹窗会能用但看起来没有样式，这是预期内的，
 * 不是 bug）。
 *
 * 【这一轮做到什么程度】
 * - 场景区、今天的小课堂、长大进度、四个入口：真实数据，真实交互（科目筛选、
 *   来源分段、点小伙伴换话、点老师徽章冒口头禅）。
 * - 没入学 -> 打开 SchoolEnrollFlow（mode="enroll"）；满 20 节 -> 打开同一个
 *   组件的 mode="promote"。
 * - "去上课" -> 打开 CompanionSchoolQuizModal（这一轮接上，之前一直是占位，
 *   没有真的接——同一批顺手修掉）；错题本 tile -> 打开
 *   CompanionSchoolWrongBookModal。这两个弹窗跟 enroll/promote 一样，由这个
 *   首页弹窗统一调度跳转（结算页点"错题本" -> 关做题开错题本；错题本点
 *   "只考错题" -> 关错题本、以 WRONG 模式重开做题），避免互相 import 出现
 *   循环依赖。
 * - 我出的题、家校练习册、学校相册：界面还没做，先弹一句"下一轮就做啦"占位，
 *   不是忘了接。
 * - 秋游横条（预览里"秋游开放中"那一条）：特别活动功能还没做，这一轮完全
 *   不画这块，等那一轮接上真实的开放判断再加。
 *
 * Props:
 *   companion  object    —— 当前小伙伴（用 id / name / avatarUrl / hearts）
 *   chatId     number    —— 当前聊天窗 id（家校练习册的评语/三方会谈要用来调
 *              AI，这一轮先收下，自己还不用）
 *   character  object    —— 当前角色（同上，先收下备用）
 *   onClose    function  —— 关闭弹窗
 */

import React, { useEffect, useRef, useState } from 'react';

import './school.css';
import './schoolHome.css';

import { SCHOOL_STAGE_LABELS, SCHOOL_SUBJECTS, findSchoolClass, findSchoolTeacher } from './companionSchoolData';
import { getSchoolStatus, getAlbum } from './companionSchoolService';
import { getWrongBook, getCustomQuestions, QUIZ_MODE } from './companionSchoolQuizService';
import { getPetLine, resolvePetStatus } from './companionSchoolPetLines';
import {
  CloseGlyph,
  HeartGlyph,
  StarGlyph,
  BookGlyph,
  NotebookGlyph,
  EditGlyph,
  PhotoGlyph,
  PetFace,
  TeacherAvatar,
  ClassArt,
} from './SchoolArt';
import CompanionSchoolIcon from './CompanionSchoolIcon';
import SchoolEnrollFlow from './SchoolEnrollFlow';
import CompanionSchoolQuizModal from './CompanionSchoolQuizModal';
import CompanionSchoolWrongBookModal from './CompanionSchoolWrongBookModal';

/** 「今天的小课堂」的题目来源分段，顺序跟预览一致 */
const SOURCE_OPTIONS = [
  { id: QUIZ_MODE.MIXED, label: '混着来' },
  { id: QUIZ_MODE.PRESET, label: '课本题' },
  { id: QUIZ_MODE.CUSTOM, label: '我出的' },
  { id: QUIZ_MODE.WRONG, label: '错题' },
];

/** 冷却倒计时格式化成 mm:ss */
const formatCountdown = (ms) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const CompanionSchoolModal = ({ companion, chatId, character, onClose }) => {
  const [status, setStatus] = useState(null);
  const [wrongCount, setWrongCount] = useState(0);
  const [customCount, setCustomCount] = useState(0);
  const [albumCount, setAlbumCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const [now, setNow] = useState(Date.now());
  const [petLine, setPetLine] = useState({ status: '', text: '' });
  const [showTeacherSay, setShowTeacherSay] = useState(false);
  const [selectedSubjectId, setSelectedSubjectId] = useState(null); // null = 什么都上
  const [selectedMode, setSelectedMode] = useState(QUIZ_MODE.MIXED);
  const [toast, setToast] = useState('');
  const [showEnroll, setShowEnroll] = useState(false);
  const [showPromote, setShowPromote] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [showWrongBook, setShowWrongBook] = useState(false);
  const toastTimer = useRef(null);

  /* ---------------- 拉取 / 刷新数据 ---------------- */
  const refresh = async () => {
    const [st, wrong, custom, album] = await Promise.all([
      getSchoolStatus(companion.id),
      getWrongBook(companion.id),
      getCustomQuestions(companion.id),
      getAlbum(companion.id),
    ]);
    setStatus(st);
    setWrongCount(wrong.length);
    setCustomCount(custom.length);
    setAlbumCount(album.length);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companion.id]);

  /* 每秒跳一下，给冷却倒计时用；冷却时间一到就重新拉状态（次数 / 冷却会变） */
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
      if (status?.reason === 'cooldown' && Date.now() >= (status.nextAvailableAt || 0)) {
        refresh();
      }
    }, 1000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.reason, status?.nextAvailableAt]);

  /* 状态分组变了（比如从"可以上课"变成"下课休息"）就换一句新的台词 */
  const petStatusKey = status ? resolvePetStatus(status) : '';
  useEffect(() => {
    if (!status) return;
    setPetLine(getPetLine(status, { now: Date.now() }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [petStatusKey, status?.stage]);

  const handlePetClick = () => {
    if (!status) return;
    setPetLine((prev) => getPetLine(status, { now: Date.now(), excludeText: prev.text }));
  };

  const notifyComingSoon = (label) => {
    clearTimeout(toastTimer.current);
    setToast(`${label}下一轮就做啦，这轮先占个位置～`);
    toastTimer.current = setTimeout(() => setToast(''), 2200);
  };

  /* ---------------- 还在加载 ---------------- */
  if (loading || !status) {
    return (
      <div className="cp-overlay center">
        <div className="cp-backdrop" onClick={onClose} />
        <div className="sd-root" role="dialog" aria-label="学校">
          <div className="sd-head">
            <button type="button" className="sd-round" aria-label="关闭" onClick={onClose}><CloseGlyph /></button>
            <div className="sd-title"><b>学校</b></div>
            <span className="sd-round is-ghost" aria-hidden="true" />
          </div>
          <div className="sd-body is-center"><p className="sd-hint">正在去学校的路上…</p></div>
        </div>
      </div>
    );
  }

  const schoolClass = findSchoolClass(status.classId);
  const teacher = findSchoolTeacher(status.teacherId);
  const dayCount = status.enrolled && status.record?.enrolledAt
    ? Math.floor((now - status.record.enrolledAt) / 86400000) + 1
    : 0;
  const cooldownRemain = status.reason === 'cooldown' ? Math.max(0, (status.nextAvailableAt || 0) - now) : 0;
  const progressPct = Math.min(100, (status.promote.done / status.promote.need) * 100);

  return (
    <>
      <div className="cp-overlay center">
        <div className="cp-backdrop" onClick={onClose} />
        <div className="sd-root" role="dialog" aria-label="学校">
          <div className="sd-head">
            <button type="button" className="sd-round" aria-label="关闭" onClick={onClose}><CloseGlyph /></button>
            <div className="sd-title"><b>学校</b></div>
            <span className="sh-hp">
              <HeartGlyph size={14} />
              {Number(companion.hearts ?? 0).toFixed(1)}
            </span>
          </div>

          <div className="sd-body">
            {/* ---------- 场景区 ---------- */}
            <div className="sh-yard">
              <span className="sh-sun" />
              <span className="sh-cloud" style={{ left: 70, top: 30, width: 56, height: 18 }} />
              <span className="sh-cloud" style={{ left: 190, top: 54, width: 40, height: 14 }} />
              <span className="sh-bld"><CompanionSchoolIcon size={92} /></span>
              <span className="sh-fence" />
              <span className="sh-path" />

              {status.enrolled && schoolClass && (
                <div className="sh-flagband">
                  <ClassArt schoolClass={schoolClass} size={22} />
                  {schoolClass.name}
                  <span className="sh-chip sd-tone-sky">{SCHOOL_STAGE_LABELS[status.stage]}</span>
                </div>
              )}

              {status.enrolled && teacher && (
                <button
                  type="button"
                  className="sh-tbadge"
                  onClick={() => setShowTeacherSay((v) => !v)}
                  aria-label={`${teacher.name}，点一下听听口头禅`}
                >
                  <TeacherAvatar teacher={teacher} size={44} />
                  <span>{teacher.name}</span>
                  {showTeacherSay && <span className="sh-tsay">“{teacher.catchphrase}”</span>}
                </button>
              )}

              {status.promote?.canPromote && (
                <>
                  <span className="sh-spark" style={{ left: 150, top: 70 }}><StarGlyph size={18} /></span>
                  <span className="sh-spark" style={{ left: 250, top: 100, color: 'var(--cp-heart)' }}><StarGlyph size={14} /></span>
                  <span className="sh-spark" style={{ left: 40, top: 76, color: 'var(--cp-accent)' }}><StarGlyph size={12} /></span>
                </>
              )}

              <button type="button" className="sh-petspot" onClick={handlePetClick} aria-label="点一下小伙伴，换一句话">
                {companion.avatarUrl ? (
                  <img src={companion.avatarUrl} alt={companion.name} draggable={false} />
                ) : (
                  <PetFace size={88} />
                )}
              </button>
              <button
                type="button"
                className={`sh-bubble${status.enrolled ? '' : ' is-top'}`}
                onClick={handlePetClick}
              >
                {petLine.text}
              </button>

              {status.enrolled && <span className="sh-daytag">入学第 {dayCount} 天</span>}
            </div>

            {/* ---------- 没入学 ---------- */}
            {!status.enrolled && (
              <>
                <div className="sh-card sh-hero">
                  <div className="sh-hero-title">{companion.name}还没有上学哦</div>
                  <p>入学以后可以认识老师、交朋友，还有纪念卡和春游秋游。</p>
                  <div className="sh-perks">
                    <span className="sh-chip sd-tone-mint">交朋友</span>
                    <span className="sh-chip sd-tone-sky">家校练习册</span>
                    <span className="sh-chip sd-tone-butter">春游秋游</span>
                  </div>
                  <button type="button" className="sd-btn heart" style={{ marginTop: 16 }} onClick={() => setShowEnroll(true)}>
                    办理入学
                  </button>
                </div>
                <p className="sd-hint">入学由你亲手办理，不会自动入学</p>
              </>
            )}

            {/* ---------- 已入学 ---------- */}
            {status.enrolled && (
              <>
                {/* 今天的小课堂 */}
                <div className="sh-card">
                  <div className="sh-cap">
                    今天的小课堂
                    <span className="sh-pen">
                      {[0, 1, 2].map((i) => (
                        <i key={i} className={i < status.setsToday ? 'is-used' : ''}><BookGlyph size={15} /></i>
                      ))}
                    </span>
                  </div>

                  <div className="sh-chips">
                    <button
                      type="button"
                      className={`sh-sc${!selectedSubjectId ? ' is-on' : ''}`}
                      onClick={() => setSelectedSubjectId(null)}
                    >
                      什么都上
                    </button>
                    {SCHOOL_SUBJECTS.map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        className={`sh-sc sd-tone-${s.tone}${selectedSubjectId === s.id ? ' is-on' : ''}`}
                        onClick={() => setSelectedSubjectId(s.id)}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>

                  <div className="sh-seg">
                    {SOURCE_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        className={selectedMode === opt.id ? 'is-on' : ''}
                        onClick={() => setSelectedMode(opt.id)}
                      >
                        {opt.label}
                        {opt.id === QUIZ_MODE.WRONG && wrongCount > 0 && <b className="sh-segbadge">{wrongCount}</b>}
                      </button>
                    ))}
                  </div>

                  {status.canPlay && (
                    <button type="button" className="sh-go" onClick={() => setShowQuiz(true)}>
                      去上课 <small>一节 5 个小问题</small>
                    </button>
                  )}
                  {!status.canPlay && status.reason === 'cooldown' && (
                    <button type="button" className="sh-go is-off" disabled>
                      下课休息 · {formatCountdown(cooldownRemain)} 后再上
                    </button>
                  )}
                  {!status.canPlay && status.reason === 'daily_limit' && (
                    <button type="button" className="sh-go is-off" disabled>今天的 3 节课都上完啦</button>
                  )}

                  <p className="sh-tip">
                    {status.canPlay && '答对一题 +1 心心，全对再 +1'}
                    {!status.canPlay && status.reason === 'cooldown' && `每节课后要休息 30 分钟，今天还有 ${status.setsLeft} 节`}
                    {!status.canPlay && status.reason === 'daily_limit' && '明天 0:00 又有 3 节新课'}
                  </p>
                </div>

                {/* 长大进度（小学是最后一个学段，不再显示） */}
                {!status.promote.isFinalStage && (
                  <div className="sh-card">
                    <div className="sh-cap">
                      长大进度
                      <small>{status.promote.done} / {status.promote.need} 节</small>
                    </div>
                    <div className={`sh-bar${status.promote.canPromote ? ' is-full' : ''}`}>
                      <i style={{ width: `${progressPct}%` }} />
                    </div>
                    <div className="sh-ends">
                      <span>幼儿园</span>
                      <span>小学</span>
                    </div>
                    {status.promote.canPromote && (
                      <div className="sh-promo">
                        <StarGlyph size={24} />
                        <p>满 {status.promote.need} 节啦，可以升班了！</p>
                        <button type="button" className="sh-pbtn" onClick={() => setShowPromote(true)}>办理升班</button>
                      </div>
                    )}
                  </div>
                )}

                {/* 四个入口 */}
                <div className="sh-tiles">
                  <button type="button" className="sh-tile sd-tone-heart" onClick={() => setShowWrongBook(true)}>
                    {wrongCount > 0 && <b className="sh-tilebadge">{wrongCount}</b>}
                    <span className="sh-ti"><NotebookGlyph size={20} /></span>
                    <span><b>错题本</b><small>{wrongCount} 道待复习</small></span>
                  </button>
                  <button type="button" className="sh-tile sd-tone-lavender" onClick={() => notifyComingSoon('我出的题')}>
                    <span className="sh-ti"><EditGlyph size={20} /></span>
                    <span><b>我出的题</b><small>共 {customCount} 道</small></span>
                  </button>
                  <button type="button" className="sh-tile sd-tone-sky" onClick={() => notifyComingSoon('家校练习册')}>
                    <span className="sh-ti"><BookGlyph size={20} /></span>
                    <span><b>家校练习册</b><small>课表 · 评语</small></span>
                  </button>
                  <button type="button" className="sh-tile sd-tone-butter" onClick={() => notifyComingSoon('学校相册')}>
                    <span className="sh-ti"><PhotoGlyph size={20} /></span>
                    <span><b>学校相册</b><small>{albumCount} 张纪念卡</small></span>
                  </button>
                </div>
              </>
            )}

            {toast && <p className="sd-notice" role="status">{toast}</p>}
          </div>
        </div>
      </div>

      {showEnroll && (
        <SchoolEnrollFlow
          companion={companion}
          mode="enroll"
          onDone={refresh}
          onClose={() => setShowEnroll(false)}
        />
      )}
      {showPromote && (
        <SchoolEnrollFlow
          companion={companion}
          mode="promote"
          schoolRecord={status.record}
          onDone={refresh}
          onClose={() => setShowPromote(false)}
        />
      )}
      {showQuiz && (
        <CompanionSchoolQuizModal
          companion={companion}
          mode={selectedMode}
          subjectIds={selectedSubjectId ? [selectedSubjectId] : []}
          onClose={() => setShowQuiz(false)}
          onFinished={() => refresh()}
          onReviewWrong={() => {
            setShowQuiz(false);
            setShowWrongBook(true);
          }}
        />
      )}
      {showWrongBook && (
        <CompanionSchoolWrongBookModal
          companion={companion}
          onClose={() => setShowWrongBook(false)}
          onStartReview={() => {
            setShowWrongBook(false);
            setSelectedMode(QUIZ_MODE.WRONG);
            setShowQuiz(true);
          }}
        />
      )}
    </>
  );
};

export default CompanionSchoolModal;