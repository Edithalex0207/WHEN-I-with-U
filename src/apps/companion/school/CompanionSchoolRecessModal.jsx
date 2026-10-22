/*
 * CompanionSchoolRecessModal.jsx —— 「可互动课间事件」的小窗外壳。
 *
 * 从结算页的"课间有小事"横幅（CompanionSchoolRecessEntry）点进来，带着
 * rollCampusBreak 造的那个待玩事件。底部抽屉，云朵波浪边，会飘的小星星、
 * 爱心、云朵，黄色标题丝带，虚线旁白气泡。配色全部沿用学校页的变量，
 * 不引入新色系，也没有点阵底纹。
 *
 * 【这个外壳管什么】
 * - 标题丝带、关闭键、旁白气泡（event.scene）、小伙伴和同学的贴图。
 * - 按 event.kind 到 companionSchoolRecessBodies.js 取玩法组件渲染在中间；
 *   玩法组件玩完调 onDone，外壳负责落库（finishRecessEvent）、显示
 *   "+N 心情"的结果贴纸和"收下"按钮；落库后玩法组件仍保留在界面上
 *   （比如猜拳揭晓的画面），只是通过 settled 属性知道已经结束。
 * - 落库失败就在原地提示一句，不关弹窗，让玩法组件可以再调一次 onDone。
 *
 * 【放弃规则（已确认）】
 * 还在玩的时候点关闭，算放弃：不写记录、不加心情，这件事当没发生。
 * 为了不被手滑点掉，点背景不会关闭，只有右上角关闭键和"收下"能关。
 * 已经落库之后，关闭键等同于"收下"。
 *
 * Props:
 *   companion   object    —— 当前小伙伴（用 id / name / avatarUrl）
 *   event       object    —— buildRecessEvent 造的待玩事件
 *   onClose     function  —— 关闭弹窗
 *   onSettled   function({ row, moodDelta, text }) —— 玩完并落库后，用户点
 *               "收下"（或关闭）时调用一次，让上一层把结果显示出来
 */

import React, { useState } from 'react';

import './school.css';
import './schoolRecess.css';

import { RECESS_KIND_META } from './companionSchoolRecessData';
import { RECESS_BODIES } from './companionSchoolRecessBodies';
import { finishRecessEvent } from './companionSchoolRecessService';
import { CloseGlyph, PetFace } from './SchoolArt';
import { ClassmateSticker } from './CompanionSchoolRecessSticker';

/* 抽屉四周的小装饰，纯 SVG，颜色是写死的柔和色。 */
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

const CompanionSchoolRecessModal = ({ companion, event, onClose, onSettled }) => {
  const [phase, setPhase] = useState('play'); // play | saving | done
  const [settled, setSettled] = useState(null);
  const [error, setError] = useState('');

  const meta = RECESS_KIND_META[event?.kind] || {};
  const Body = RECESS_BODIES[event?.kind] || null;
  const mate = event?.classmate;
  const petName = companion?.name || '小伙伴';

  const handleDone = async ({ outcome = '', moodDelta = 1, text = '', mateMood = 'happy' } = {}) => {
    if (phase !== 'play') return;
    setError('');
    setPhase('saving');
    try {
      const res = await finishRecessEvent(companion.id, {
        event, outcome, moodDelta, text, companionName: petName,
      });
      setSettled({ ...res, text: text || res.row?.text || '', mateMood });
      setPhase('done');
    } catch (e) {
      setError(e?.message || '没有记下来，再试一次吧');
      setPhase('play');
    }
  };

  const handleClose = () => {
    if (phase === 'saving') return;
    if (phase === 'done' && settled) onSettled?.(settled);
    onClose?.();
  };

  const done = phase === 'done' && settled;

  return (
    <div className="cp-overlay">
      <div className="cp-backdrop" />
      <div className="rc-sheet" role="dialog" aria-label={meta.title || '课间小事'}>
        <SparkleDeco className="rc-deco rc-float" size={24} color="#FFE27A" />
        <CloudDeco className="rc-deco rc-float rc-b" width={46} />
        <HeartDeco className="rc-deco rc-twinkle" size={16} />

        <div className="rc-head">
          <div className="rc-ribbon">
            <SparkleDeco size={16} color="#D19A0A" />
            {meta.title || '课间小事'}
          </div>
          <button type="button" className="rc-x" aria-label="关闭" onClick={handleClose} disabled={phase === 'saving'}>
            <CloseGlyph size={14} />
          </button>
        </div>

        <div className="rc-body">
          <div className="rc-bubble">
            <i className="rc-tape" />
            <i className="rc-tape is-r" />
            {event?.scene}
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

          {Body && (
            <Body
              event={event}
              companion={companion}
              disabled={phase === 'saving'}
              settled={done ? settled : null}
              onDone={handleDone}
            />
          )}

          {!done && !Body && (
            <div className="rc-empty">
              <p>这个玩法还在路上，下次课间再来玩吧。</p>
              <button type="button" className="rc-btn" onClick={handleClose}>知道啦</button>
            </div>
          )}

          {error && <p className="rc-notice" role="status">{error}</p>}

          {done && (
            <div className="rc-result sd-tone-mint">
              <span className="rc-gain">+{settled.moodDelta} 心情</span>
              <p>{settled.text}</p>
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

export default CompanionSchoolRecessModal;