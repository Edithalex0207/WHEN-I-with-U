/*
 * CompanionSchoolHomeworkModal.jsx —— 「老师的嘱托」的底部抽屉外壳。
 *
 * 从学校页的横幅（CompanionSchoolHomeworkEntry）点进来，带着
 * getHomeworkTask 读出来的那份未批作业。外壳照课间事件小窗的样子做：
 * 云朵波浪边、会飘的小装饰、黄色标题丝带、虚线旁白气泡加胶带、小伙伴和同学
 * 的贴图。这些外壳样式直接复用 schoolRecess.css 里的 rc- 类（抽屉、丝带、
 * 关闭键、气泡、角色），作业纸这部分的样式在 schoolHomework.css（前缀 hw-）。
 * 同学头像用 ClassmateSticker（贴图位：没填图就显示纯色占位）。
 *
 * 【这个外壳管什么】
 * - 标题丝带、关闭键、旁白气泡（task.scene）、小伙伴和同学的贴图。
 * - 题目类（切片 B，已做）：中间渲染 CompanionSchoolHomeworkQuiz 批改界面；
 *   它批完调 onDone，外壳负责落库（finishHomeworkTask：写生活记录、加心心
 *   和心情、删掉未批嘱托），然后显示"+N 心心 +N 心情"、同学的一句话和
 *   "收下"按钮。落库后批改界面仍留在界面上显示揭晓结果，同学的贴图换成
 *   对应的表情（mateMood）。落库失败就在原地提示一句，不关弹窗，批改界面
 *   可以再调一次 onDone（结果不重抽）。
 * - 小作文（切片 C，已做）：中间渲染 CompanionSchoolHomeworkEssay；流程跟题目类
 *   一样（批完调 onDone，外壳落库、显示结算贴纸）。小作文由 AI 现写的部分（会
 *   用到玩家配置的接口）、"换一篇"、蓝色说明条都在 Essay 组件里，外壳不管。
 *
 * 【关闭规则（已确认）】
 * 点背景不关，只能点右上角关闭键。中途关闭 = 没批，嘱托继续留着，不扣任何
 * 东西。已经落库之后，关闭键等同于"收下"。
 *
 * Props:
 *   companion  object    —— 当前小伙伴（用 id / name / avatarUrl）
 *   task       object    —— getHomeworkTask 读出来的未批嘱托（带 classmate）
 *   onClose    function  —— 关闭弹窗（调用方据此刷新学校页）
 */

import React, { useState } from 'react';

import './school.css';
import './schoolRecess.css';
import './schoolHomework.css';

import { HOMEWORK_BANNER, HOMEWORK_TYPE } from './companionSchoolHomeworkData';
import { finishHomeworkTask } from './companionSchoolHomeworkService';
import { CloseGlyph, PetFace } from './SchoolArt';
import { ClassmateSticker } from './CompanionSchoolRecessSticker';
import CompanionSchoolHomeworkQuiz from './CompanionSchoolHomeworkQuiz';
import CompanionSchoolHomeworkEssay from './CompanionSchoolHomeworkEssay';

/* 抽屉四周的小装饰，纯 SVG，颜色是写死的柔和色（跟课间事件小窗一样）。 */
const SparkleDeco = ({ size = 18, color = '#FFE27A', className = '' }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z" fill={color} />
  </svg>
);

const HeartDeco = ({ size = 18, color = '#FF86A0', className = '' }) => (
  <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 21s-8-5.2-8-11a4.6 4.6 0 0 1 8-3 4.6 4.6 0 0 1 8 3c0 5.8-8 11-8 11z" fill={color} />
  </svg>
);

const CloudDeco = ({ width = 46, className = '' }) => (
  <svg className={className} width={width} height={Math.round(width * 0.75)} viewBox="0 0 64 48" aria-hidden="true" focusable="false">
    <path d="M16 42a11 11 0 0 1-1-22 15 15 0 0 1 28 3 9.5 9.5 0 0 1 0 19z" fill="#fff" stroke="#9CCBF2" strokeWidth="3" strokeLinejoin="round" />
  </svg>
);

const CompanionSchoolHomeworkModal = ({ companion, task, onClose }) => {
  const [phase, setPhase] = useState('play'); // play | saving | done
  const [settled, setSettled] = useState(null);
  const [error, setError] = useState('');

  if (!task) return null;

  const mate = task.classmate;
  const petName = companion?.name || '小伙伴';
  const done = phase === 'done' && settled;

  /* 批改界面批完后调用：落库。失败就回到 play，让批改界面可以再调一次 */
  const handleDone = async ({ outcome = '', hearts = 1, text = '', meta = {}, mateMood = 'happy', reaction = null } = {}) => {
    if (phase !== 'play') return;
    setError('');
    setPhase('saving');
    try {
      const res = await finishHomeworkTask(companion.id, {
        task, outcome, hearts, text, meta, companionName: petName,
      });
      setSettled({ ...res, text, mateMood, reaction });
      setPhase('done');
    } catch (e) {
      setError(e?.message || '没有记下来，再试一次吧');
      setPhase('play');
    }
  };

  const handleClose = () => {
    if (phase === 'saving') return;
    onClose?.();
  };

  return (
    <div className="cp-overlay">
      <div className="cp-backdrop" />
      <div className="rc-sheet" role="dialog" aria-label={HOMEWORK_BANNER.title}>
        <SparkleDeco className="rc-deco rc-float" size={24} color="#FFE27A" />
        <CloudDeco className="rc-deco rc-float rc-b" width={46} />
        <HeartDeco className="rc-deco rc-twinkle" size={16} />

        <div className="rc-head">
          <div className="rc-ribbon">
            <SparkleDeco size={16} color="#D19A0A" />
            {HOMEWORK_BANNER.title}
          </div>
          <button type="button" className="rc-x" aria-label="关闭" onClick={handleClose} disabled={phase === 'saving'}>
            <CloseGlyph size={14} />
          </button>
        </div>

        <div className="rc-body">
          <div className="rc-bubble">
            <i className="rc-tape" />
            <i className="rc-tape is-r" />
            {task.scene}
          </div>

          <div className="rc-stage">
            <div className="rc-who rc-bob">
              <span className="rc-pet">
                {companion?.avatarUrl
                  ? <img src={companion.avatarUrl} alt={petName} draggable={false} />
                  : <PetFace size={64} />}
              </span>
              <span className="rc-name">{petName}</span>
            </div>
            <div className="rc-who rc-bob rc-b">
              <ClassmateSticker classmate={mate} mood={done ? (settled.mateMood || 'happy') : 'normal'} size={78} />
              <span className="rc-name">{mate?.name}</span>
            </div>
          </div>

          {task.type === HOMEWORK_TYPE.QUIZ && (
            <CompanionSchoolHomeworkQuiz
              task={task}
              companion={companion}
              disabled={phase === 'saving'}
              settled={done ? settled : null}
              onDone={handleDone}
            />
          )}

          {task.type === HOMEWORK_TYPE.ESSAY && (
            <CompanionSchoolHomeworkEssay
              task={task}
              companion={companion}
              disabled={phase === 'saving'}
              settled={done ? settled : null}
              onDone={handleDone}
            />
          )}

          {error && <p className="rc-notice" role="status">{error}</p>}

          {done && (
            <div className="rc-result hw-result sd-tone-mint">
              <span className="rc-gain">+{settled.hearts} 心心</span>
              <span className="rc-gain hw-gain-mood">+{settled.moodDelta} 心情</span>
              <p>
                {settled.reaction?.line
                  ? <><b className="hw-say">{mate?.name}：</b>{settled.reaction.line}</>
                  : settled.text}
              </p>
              <button type="button" className="rc-btn is-heart" onClick={handleClose}>
                <SparkleDeco size={16} color="#fff" />
                收下
                <SparkleDeco size={16} color="#fff" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompanionSchoolHomeworkModal;