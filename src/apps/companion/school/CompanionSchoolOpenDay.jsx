/*
 * CompanionSchoolOpenDay.jsx —— 「家长开放日」玩法组件。
 *
 * 登记在 companionSchoolFestivalBodies.js 里，由 CompanionSchoolFestivalModal
 * 渲染在抽屉里（旁白气泡、舞台、按钮都由这里自己画，外壳只管标题丝带、
 * 关闭、落库和结算）。你（玩家）是以家长身份来学校分享职业，小伙伴是孩子。
 *
 * 【流程】
 *   pick     选职业：预设清单点一个，或者自己写一个（最多 8 个字）；
 *            点"就这个，开始介绍"
 *   loading  同学们在想：调一次 AI，一次写完三位同学的反应
 *   react    三位同学各一段反应 + 小伙伴的自豪（固定文案）；点"介绍完啦"
 *            调一次 onDone 交给外壳落库，外壳随后显示"+N 心情""+N 心心"和"收下"
 *   error    接口出问题：提示一句，可以"再试一次"或者"换一个职业"
 * 落库后（settled 非空）只保留三段反应的小版本，不再有任何按钮。
 * 外壳落库失败时（disabled 恢复、settled 仍为空），"介绍完啦"按钮还能再点一次。
 *
 * 【放弃规则】
 * 中途关闭小窗算放弃：组件卸载时会取消还没回来的 AI 请求，什么都不写。
 *
 * 【用到 AI 接口】
 * 选职业这一页底部有一条蓝色小条说明：同学们的反应会用玩家配置的接口来写。
 *
 * 职业清单、奖励、文案在 companionSchoolFestivalData.js；职业的清理和检查、
 * AI 返回内容的检查在 companionSchoolOpenDayRules.js；调接口在
 * companionSchoolOpenDayAiService.js。同学的贴图由 ClassmateSticker 负责，
 * 这里不画任何小动物。样式在 schoolFestival.css（前缀 od-）。
 *
 * Props（约定见 companionSchoolFestivalBodies.js）:
 *   event, companion, disabled, settled, onDone
 */

import React, { useEffect, useRef, useState } from 'react';

import './school.css';
import './schoolRecess.css';
import './schoolFestival.css';

import {
  OPEN_DAY_CUSTOM_MAX_LEN,
  OPEN_DAY_WAIT_SCENES,
  OPEN_DAY_REACT_SCENES,
  OPEN_DAY_PROUD_LINES,
  getOpenDayReward,
} from './companionSchoolFestivalData';
import {
  getOpenDayProfessions,
  cleanCustomProfessionInput,
  resolveProfession,
  buildOpenDayResultText,
} from './companionSchoolOpenDayRules';
import { generateOpenDayReactions, OPEN_DAY_AI_ERROR_TEXT } from './companionSchoolOpenDayAiService';
import { ClassmateSticker } from './CompanionSchoolRecessSticker';
import { PetFace } from './SchoolArt';

const JOB_TONES = ['heart', 'sky', 'butter', 'mint', 'lavender'];
const REACT_MOODS = ['happy', 'wink', 'happy'];

const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

/* ---------------- 小图形（纯 SVG，颜色沿用外壳那几个柔和色） ---------------- */

const SparkleGlyph = ({ size = 16, color = '#FFE27A', className = '' }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill={color} />
  </svg>
);

const TickBadge = () => (
  <svg className="od-tick" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="11" fill="#3D9BEA" stroke="#fff" strokeWidth="2" />
    <path d="M7 12.5l3.4 3.4L17 9" stroke="#fff" strokeWidth="2.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const InfoGlyph = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.4" />
    <path d="M12 11v6M12 7.2v.1" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
  </svg>
);

const Bubble = ({ children }) => (
  <div className="od-bubble">
    <i className="od-tape" />
    <i className="od-tape is-r" />
    {children}
  </div>
);

const CompanionSchoolOpenDay = ({ event, companion, disabled = false, settled = null, onDone }) => {
  const [phase, setPhase] = useState('pick'); // pick | loading | react | error
  const [picked, setPicked] = useState(null);
  const [custom, setCustom] = useState('');
  const [composing, setComposing] = useState(false);
  const [job, setJob] = useState(null); // 送去写反应的职业 { profession, isCustom }
  const [reactions, setReactions] = useState([]);
  const [waitScene] = useState(() => pickOne(OPEN_DAY_WAIT_SCENES));
  const [reactScene] = useState(() => pickOne(OPEN_DAY_REACT_SCENES));
  const [proudTemplate] = useState(() => pickOne(OPEN_DAY_PROUD_LINES));

  const mountedRef = useRef(true);
  const abortRef = useRef(null);
  const inputRef = useRef(null);

  const stage = event?.stage;
  const mates = event?.classmates || [];
  const petName = companion?.name || '小伙伴';
  const presets = getOpenDayProfessions(stage);
  const resolved = resolveProfession({ stage, picked, custom });

  /* 卸载（包括中途关闭小窗）时取消还没回来的请求 */
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const runReactions = async (target) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPhase('loading');
    try {
      const list = await generateOpenDayReactions({
        stage,
        profession: target.profession,
        classmates: mates,
        companionName: petName,
        signal: controller.signal,
      });
      if (!mountedRef.current || controller.signal.aborted) return;
      setReactions(list);
      setPhase('react');
    } catch (err) {
      if (!mountedRef.current || err?.code === 'aborted') return;
      setPhase('error');
    }
  };

  const handleStart = () => {
    if (phase !== 'pick' || disabled || !resolved.valid) return;
    const target = { profession: resolved.profession, isCustom: resolved.isCustom };
    setJob(target);
    runReactions(target);
  };

  const handleRetry = () => {
    if (phase !== 'error' || !job) return;
    runReactions(job);
  };

  const handleBackToPick = () => {
    if (phase !== 'error') return;
    setPhase('pick');
  };

  const handleFinish = () => {
    if (phase !== 'react' || disabled || settled || !job) return;
    const reward = getOpenDayReward(job.isCustom);
    onDone?.({
      outcome: job.isCustom ? 'custom' : 'preset',
      hearts: reward.hearts,
      moodDelta: reward.mood,
      text: buildOpenDayResultText({ job: job.profession, name: petName }),
      mateMood: 'happy',
      meta: {
        openDay: true,
        profession: job.profession,
        customProfession: job.isCustom,
        reactions,
      },
    });
  };

  /* ---------------- 输入 ---------------- */

  const handlePickPreset = (name) => {
    if (phase !== 'pick') return;
    setPicked((prev) => (prev === name ? null : name));
    setCustom('');
  };

  const handleCustomChange = (e) => {
    const value = e.target.value;
    if (composing) {
      // 拼音输入中间不清理，免得把还没选定的拼音吃掉
      setCustom(value);
    } else {
      setCustom(cleanCustomProfessionInput(value));
    }
    if (value) setPicked(null);
  };

  const handleCompositionEnd = (e) => {
    setComposing(false);
    setCustom(cleanCustomProfessionInput(e.target.value));
  };

  /* 键盘弹出后把输入框带回可视范围 */
  const handleFocus = () => {
    setTimeout(() => {
      inputRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 320);
  };

  /* ---------------- 共用的小块 ---------------- */

  const petAvatar = companion?.avatarUrl
    ? <img src={companion.avatarUrl} alt={petName} draggable={false} />
    : <PetFace size={66} />;

  const renderStage = (size) => (
    <div className="od-stage">
      <div className="od-who">
        <span className="od-pet">{petAvatar}</span>
        <span className="od-name">{petName}</span>
      </div>
      {mates.map((mate) => (
        <div key={mate.id} className="od-who">
          <ClassmateSticker classmate={mate} mood="normal" size={size} />
          <span className="od-name">{mate.name}</span>
        </div>
      ))}
    </div>
  );

  const renderSays = ({ size, mood, stamp = '' }) => (
    <div className="od-says">
      {stamp && <span className="od-stamp">{stamp}</span>}
      {mates.map((mate, i) => {
        const item = reactions.find((r) => r.id === mate.id);
        if (!item) return null;
        return (
          <div key={mate.id} className={`od-say sd-tone-${mate.tone || 'butter'}${i % 2 === 1 ? ' is-r' : ''}`}>
            <div className="od-who">
              <ClassmateSticker classmate={mate} mood={mood || REACT_MOODS[i % REACT_MOODS.length]} size={size} />
            </div>
            <div className="od-card">
              <span className="who">{mate.name}</span>
              <p>{item.text}</p>
            </div>
          </div>
        );
      })}
    </div>
  );

  /* ---------------- 落库后：只留小版本的反应 ---------------- */
  if (settled) {
    return (
      <div className="od-open is-settled">
        {renderSays({ size: 48, mood: 'happy' })}
      </div>
    );
  }

  /* ---------------- 等同学们的反应 ---------------- */
  if (phase === 'loading') {
    return (
      <div className="od-open">
        <Bubble>{waitScene}</Bubble>
        {renderStage(64)}
        <div className="od-waiting" role="status">
          <SparkleGlyph className="w" />
          <span>同学们正在想要说什么</span>
          <SparkleGlyph className="w" />
        </div>
        <button type="button" className="od-btn" disabled>写着呢，等一下下</button>
      </div>
    );
  }

  /* ---------------- 接口出问题 ---------------- */
  if (phase === 'error') {
    return (
      <div className="od-open">
        <Bubble>{waitScene}</Bubble>
        {renderStage(64)}
        <p className="od-notice" role="status">{OPEN_DAY_AI_ERROR_TEXT}</p>
        <button type="button" className="od-btn" onClick={handleRetry}>再试一次</button>
        <button type="button" className="od-link" onClick={handleBackToPick}>换一个职业</button>
      </div>
    );
  }

  /* ---------------- 看反应 ---------------- */
  if (phase === 'react') {
    return (
      <div className="od-open">
        <Bubble>{reactScene}</Bubble>
        {renderSays({ size: 62, stamp: job?.profession })}
        <div className="od-proud">
          <span className="od-pet">{companion?.avatarUrl ? <img src={companion.avatarUrl} alt={petName} draggable={false} /> : <PetFace size={44} />}</span>
          <p>{proudTemplate.split('{name}').join(petName)}</p>
        </div>
        <button type="button" className="od-btn" disabled={disabled} onClick={handleFinish}>介绍完啦</button>
      </div>
    );
  }

  /* ---------------- 选职业 ---------------- */
  const customLen = cleanCustomProfessionInput(custom).length;
  const startDisabled = disabled || !resolved.valid;

  return (
    <div className="od-open">
      <Bubble>{event?.scene}</Bubble>
      {renderStage(58)}

      <div className="od-ask">
        我的职业是
        <small>点一个，或者自己写</small>
      </div>
      <div className="od-jobs">
        {presets.map((name, i) => {
          const on = picked === name;
          return (
            <button
              key={name}
              type="button"
              className={`od-job sd-tone-${JOB_TONES[i % JOB_TONES.length]}${on ? ' is-on' : ''}`}
              aria-pressed={on}
              onClick={() => handlePickPreset(name)}
            >
              {name}
              {on && <TickBadge />}
            </button>
          );
        })}
      </div>

      <label className="od-own">
        <span className="lbl">或者写一个</span>
        <input
          ref={inputRef}
          type="text"
          value={custom}
          placeholder={`最多 ${OPEN_DAY_CUSTOM_MAX_LEN} 个字`}
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          onChange={handleCustomChange}
          onCompositionStart={() => setComposing(true)}
          onCompositionEnd={handleCompositionEnd}
          onFocus={handleFocus}
        />
        <span className="cnt">{Math.min(customLen, OPEN_DAY_CUSTOM_MAX_LEN)}/{OPEN_DAY_CUSTOM_MAX_LEN}</span>
      </label>
      {resolved.hint && <p className="od-hint" role="status">{resolved.hint}</p>}

      <div className="od-note">
        <InfoGlyph />
        <span>选好之后，同学们的反应会用你在设置里配置的接口来写。</span>
      </div>

      <button type="button" className="od-btn" disabled={startDisabled} onClick={handleStart}>
        就这个，开始介绍
      </button>
    </div>
  );
};

export default CompanionSchoolOpenDay;