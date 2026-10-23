/*
 * CompanionSchoolFestivalModal.jsx —— 「校园节日事件」的小窗外壳。
 *
 * 从结算页的节日横幅（CompanionSchoolFestivalEntry）点进来，带着
 * rollSchoolFestival 造的那个待玩事件。底部抽屉，云朵波浪边，会飘的小星星、
 * 爱心、云朵，黄色标题丝带。配色全部沿用学校页的变量，不引入新色系，也没有
 * 点阵底纹。视觉跟课间事件的外壳是一家人，但样式是自己的一份（前缀 od-）。
 *
 * 【这个外壳管什么】
 * - 标题丝带、关闭键、四周的小装饰。
 * - 按 event.festivalId 到 companionSchoolFestivalBodies.js 取玩法组件渲染在
 *   中间（旁白气泡、舞台、按钮都由玩法组件自己画）；玩法组件玩完调 onDone，
 *   外壳负责落库（finishSchoolFestival）、显示"+N 心情""+N 心心"的结果贴纸和
 *   "收下"按钮；落库后玩法组件仍然保留在界面上，只是通过 settled 属性知道已经结束。
 * - 落库失败就在原地提示一句，不关弹窗，让玩法组件可以再调一次 onDone。
 *
 * 【放弃规则（已确认）】
 * 还在玩的时候点关闭，算放弃：不写记录、不加心情和心心，这件事当没发生。
 * 为了不被手滑点掉，点背景不会关闭，只有右上角关闭键和"收下"能关。
 * 已经落库之后，关闭键等同于"收下"。
 *
 * Props:
 *   companion   object    —— 当前小伙伴（用 id / name / avatarUrl）
 *   event       object    —— buildFestivalEvent 造的待玩事件
 *   onClose     function  —— 关闭弹窗
 *   onSettled   function({ row, hearts, moodDelta, text }) —— 玩完并落库后，用户点
 *               "收下"（或关闭）时调用一次，让上一层把结果显示出来
 */

import React, { useState } from 'react';

import './school.css';
import './schoolFestival.css';

import { FESTIVAL_BODIES } from './companionSchoolFestivalBodies';
import { finishSchoolFestival, getFestival } from './companionSchoolFestivalService';
import { CloseGlyph } from './SchoolArt';

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

/** 心心可能带一位小数（比如 1.4），整数就不显示小数点。 */
const formatHearts = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

const CompanionSchoolFestivalModal = ({ companion, event, onClose, onSettled }) => {
  const [phase, setPhase] = useState('play'); // play | saving | done
  const [settled, setSettled] = useState(null);
  const [error, setError] = useState('');

  const festival = getFestival(event?.festivalId);
  const title = festival?.title || '校园节日';
  const Body = FESTIVAL_BODIES[event?.festivalId] || null;
  const petName = companion?.name || '小伙伴';

  const handleDone = async ({
    outcome = '', hearts = 0, moodDelta = 0, text = '', meta = {}, mateMood = 'happy',
  } = {}) => {
    if (phase !== 'play') return;
    setError('');
    setPhase('saving');
    try {
      const res = await finishSchoolFestival(companion.id, {
        event, outcome, hearts, moodDelta, text, meta, companionName: petName,
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
      <div className="od-sheet" role="dialog" aria-label={title}>
        <SparkleDeco className="od-deco d1 od-float" size={24} color="#FFE27A" />
        <CloudDeco className="od-deco d2 od-float b" width={46} />
        <HeartDeco className="od-deco d3 od-twinkle" size={16} />

        <div className="od-head">
          <div className="od-ribbon">
            <SparkleDeco size={16} color="#D19A0A" />
            {title}
          </div>
          <button type="button" className="od-x" aria-label="关闭" onClick={handleClose} disabled={phase === 'saving'}>
            <CloseGlyph size={14} />
          </button>
        </div>

        <div className="od-body">
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
            <div className="od-empty">
              <p>这个节日还在路上，下次再来玩吧。</p>
              <button type="button" className="od-btn" onClick={handleClose}>知道啦</button>
            </div>
          )}

          {error && <p className="od-notice" role="status">{error}</p>}

          {done && (
            <div className="od-result sd-tone-mint">
              <div className="od-gains">
                {settled.moodDelta > 0 && <span className="od-gain is-mood">+{settled.moodDelta} 心情</span>}
                {settled.hearts > 0 && (
                  <span className="od-gain">
                    <HeartDeco size={13} color="#fff" />
                    +{formatHearts(settled.hearts)} 心心
                  </span>
                )}
              </div>
              <p>{settled.text}</p>
              <button type="button" className="od-btn is-heart" onClick={handleClose}>
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

export default CompanionSchoolFestivalModal;