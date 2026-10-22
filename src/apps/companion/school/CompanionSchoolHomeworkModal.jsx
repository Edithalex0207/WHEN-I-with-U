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
 * 【切片 A 做到什么程度】
 * 只显示作业，不批：题目类显示 4 道题和同学的答案；小作文显示题目和正文。
 * 批改界面（对错打勾、揭晓、分数、评语、结算、落库）是切片 B / C。
 * 小作文如果是 AI 现写的（task.essay.source === 'ai'，切片 C 才会出现），
 * 作业纸上方显示蓝色小条说明会用到玩家配置的接口；固定小作文不显示。
 *
 * 【关闭规则（已确认）】
 * 点背景不关，只能点右上角关闭键。中途关闭 = 没批，嘱托继续留着，
 * 不扣任何东西。
 *
 * Props:
 *   companion  object    —— 当前小伙伴（用 name / avatarUrl）
 *   task       object    —— getHomeworkTask 读出来的未批嘱托（带 classmate）
 *   onClose    function  —— 关闭弹窗
 */

import React from 'react';

import './school.css';
import './schoolRecess.css';
import './schoolHomework.css';

import { HOMEWORK_BANNER, HOMEWORK_TYPE, HOMEWORK_AI_NOTICE } from './companionSchoolHomeworkData';
import { describeHomework } from './companionSchoolHomeworkService';
import { CloseGlyph, PetFace } from './SchoolArt';
import { ClassmateSticker } from './CompanionSchoolRecessSticker';

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
  if (!task) return null;

  const mate = task.classmate;
  const petName = companion?.name || '小伙伴';
  const { title } = describeHomework(task);
  const isAiEssay = task.type === HOMEWORK_TYPE.ESSAY && task.essay?.source === 'ai';

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
          <button type="button" className="rc-x" aria-label="关闭" onClick={onClose}>
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
              <ClassmateSticker classmate={mate} mood="normal" size={78} />
              <span className="rc-name">{mate?.name}</span>
            </div>
          </div>

          {isAiEssay && <p className="hw-ainote">{HOMEWORK_AI_NOTICE}</p>}

          <div className="hw-paper">
            <i className="hw-paper-tape" />
            <div className="hw-paper-head">
              <b>{title}</b>
              <span>{mate?.name}</span>
            </div>

            {task.type === HOMEWORK_TYPE.QUIZ && (
              <ol className="hw-rows">
                {(task.quiz?.items || []).map((item, index) => (
                  <li className="hw-row" key={item.id}>
                    <span className="hw-no">{index + 1}</span>
                    <div className="hw-row-main">
                      <p className="hw-stem">{item.stem}</p>
                      <p className="hw-ans">
                        <span>{mate?.name}的答案</span>
                        <b>{item.mateAnswer}</b>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {task.type === HOMEWORK_TYPE.ESSAY && (
              <div className="hw-essay">{task.essay?.text}</div>
            )}
          </div>

          <p className="hw-soon">
            这一步先看看作业，批改下一步开放。关掉也没关系，嘱托会一直留着。
          </p>
        </div>
      </div>
    </div>
  );
};

export default CompanionSchoolHomeworkModal;