/*
 * CompanionSchoolEventFlow.jsx —— 「春游 / 秋游」特别活动弹窗。
 *
 * 【这一轮（切片③的①+②）做到什么程度】
 * 通知签字 -> 准备零食 -> 活动当天三轮事件选择，这三段都是真的——能点、
 * 能走完。走完三轮之后进到一个占位的"结束页"：合影 + 结语 + 落库（相册/
 * 在校生活）+ 发奖励是下一个子切片的事，这一轮故意不做，免得在真正的
 * 结算逻辑定下来之前先画一个假的结算画面，回头还要为了接真数据返工。
 * 占位页只有一个"先回到小伙伴"按钮，点了就关闭，什么都不会落库——
 * 这意味着这一轮里，这个活动可以反复开着玩，不会因为"今年做过了"而被
 * 挡住（hasDoneEventThisYear 现在永远读到 false，因为还没有代码会写
 * 那条记录）。下个子切片接上结算之后，这个"可以反复玩"的状态会自然
 * 消失，不用回来改这个文件。
 *
 * 中途点右上角关闭：因为这一轮什么都不写库，所以直接关掉就行，不用弹
 * "确定要放弃吗"——没有任何进度会因为关闭而丢失得"可惜"。
 *
 * Props:
 *   companion     object   —— 当前小伙伴（用 id / name）
 *   event         object   —— companionSchoolEventService.getOpenEventForCompanion
 *                             返回的那个活动定义（SEASON_EVENTS 里的一条）
 *   schoolRecord  object   —— 当前学籍（取 classId，通知信头要用班级名）
 *   onClose       function —— 关闭弹窗
 */

import React, { useState } from 'react';

import './school.css';
import './schoolEvent.css';

import { findSchoolClass } from './companionSchoolData';
import {
  SNACK_POOL,
  SNACK_PICK_MIN,
  SNACK_PICK_MAX,
  getEventRounds,
} from './companionSchoolEventData';
import { CloseGlyph, BackGlyph, FoodArt } from './SchoolArt';

const fillName = (text, name) => text.split('{name}').join(name);

const STEPS = ['notice', 'snacks', 'event', 'end'];

const CompanionSchoolEventFlow = ({ companion, event, schoolRecord, onClose }) => {
  const [step, setStep] = useState('notice');
  const [roundIndex, setRoundIndex] = useState(0);
  const [pickedIdx, setPickedIdx] = useState(null); // 当前这一轮点了第几个选项，还没按"继续"
  const [snacks, setSnacks] = useState(new Set());
  const [choices, setChoices] = useState([]); // [{roundIndex, tag}]，三轮选完会有 3 条

  const schoolClass = findSchoolClass(schoolRecord?.classId);
  const rounds = getEventRounds(event.id);
  const round = rounds[roundIndex] || null;

  /* ---------------- 零食：选 / 取消 ---------------- */
  const toggleSnack = (id) => {
    setSnacks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else if (next.size < SNACK_PICK_MAX) {
        next.add(id);
      }
      return next;
    });
  };

  /* ---------------- 事件选择：点选项 -> 按继续才真正进入下一轮 ---------------- */
  const handlePick = (idx) => setPickedIdx(idx);

  const handleRoundContinue = () => {
    if (pickedIdx === null || !round) return;
    const tag = round.choices[pickedIdx].tag;
    const nextChoices = [...choices, { roundIndex, tag }];
    setChoices(nextChoices);
    setPickedIdx(null);
    if (roundIndex + 1 < rounds.length) {
      setRoundIndex((i) => i + 1);
    } else {
      setStep('end');
    }
  };

  /* ---------------- 返回 / 关闭 ---------------- */
  const handleBack = () => {
    if (step === 'notice') { onClose?.(); return; }
    if (step === 'snacks') { setStep('notice'); return; }
    onClose?.(); // event / end 这两步没有"上一步"，右上角就是直接关闭
  };
  const showBackArrow = step === 'notice' || step === 'snacks';

  const titleText = step === 'notice' ? `${event.name}通知`
    : step === 'snacks' ? '准备零食'
      : step === 'event' ? `${event.name}进行中`
        : `${event.name}结束啦`;
  const stepIndex = STEPS.indexOf(step);

  return (
    <div className="cp-overlay center">
      <div className="cp-backdrop" onClick={handleBack} />
      <div className="sd-root" role="dialog" aria-label={`${event.name}活动`}>
        <div className="sd-head">
          <button type="button" className="sd-round" aria-label={showBackArrow ? '上一步' : '关闭'} onClick={handleBack}>
            {showBackArrow ? <BackGlyph /> : <CloseGlyph />}
          </button>
          <div className="sd-title">
            <b>{titleText}</b>
            <div className="sd-dots" aria-hidden="true">
              {STEPS.map((id, i) => (
                <i key={id} className={i === stepIndex ? 'is-on' : i < stepIndex ? 'is-done' : ''} />
              ))}
            </div>
          </div>
          <span className="sd-round is-ghost" aria-hidden="true" />
        </div>

        {/* ---------- 第 1 步：家长通知 · 签字同意 ---------- */}
        {step === 'notice' && (
          <>
            <div className="sd-body">
              <div className="ev-letter">
                <div className="ev-letter-head">
                  <b>{schoolClass?.name || '班级'} · 家长通知</b>
                </div>
                <p>{fillName(event.noticeText, companion.name)}</p>
                <div className="ev-sign-row">
                  <span>家长签字</span>
                  <div className="ev-stamp-ghost">签字处</div>
                </div>
              </div>
              <p className="sd-hint">点"签字同意"，开始为{event.name}做准备吧</p>
            </div>
            <div className="sd-foot">
              <button type="button" className="sd-btn heart" onClick={() => setStep('snacks')}>签字同意</button>
            </div>
          </>
        )}

        {/* ---------- 第 2 步：准备零食 ---------- */}
        {step === 'snacks' && (
          <>
            <div className="sd-body">
              <p className="sd-hint">给{companion.name}的背包里，装 {SNACK_PICK_MIN}~{SNACK_PICK_MAX} 样喜欢的零食吧</p>
              <div className="ev-shop-grid">
                {SNACK_POOL.map((food) => {
                  const on = snacks.has(food.id);
                  const disabled = !on && snacks.size >= SNACK_PICK_MAX;
                  return (
                    <button
                      key={food.id}
                      type="button"
                      className={`ev-shop-item${on ? ' is-on' : ''}${disabled ? ' is-disabled' : ''}`}
                      disabled={disabled}
                      onClick={() => toggleSnack(food.id)}
                    >
                      {on && <span className="ev-shop-tick">✓</span>}
                      <FoodArt food={food} size={52} />
                      <b>{food.name}</b>
                      <small>{food.desc}</small>
                    </button>
                  );
                })}
              </div>
              <div className="ev-cart">
                <div className="ev-cart-thumbs">
                  {[...snacks].map((id) => <FoodArt key={id} food={SNACK_POOL.find((s) => s.id === id)} size={30} />)}
                </div>
                <span className="ev-cart-text">
                  背包里已经装了 <b>{snacks.size}</b> / {SNACK_PICK_MAX} 样
                </span>
              </div>
            </div>
            <div className="sd-foot">
              <button type="button" className="sd-btn main" disabled={snacks.size < SNACK_PICK_MIN} onClick={() => setStep('event')}>
                装好啦，出发吧
              </button>
            </div>
          </>
        )}

        {/* ---------- 第 3 步：活动当天，三轮事件选择 ---------- */}
        {step === 'event' && round && (
          <>
            <div className="sd-body">
              <div className="ev-scene-card">
                <div className={`ev-scene-pic${round.sceneUrl ? '' : ` is-${event.tone}`}`}>
                  {round.sceneUrl && <img src={round.sceneUrl} alt="" />}
                </div>
                <div className="ev-scene-text">
                  <p>{fillName(round.scene, companion.name)}</p>
                </div>
              </div>
              <div className="ev-choices">
                {round.choices.map((choice, i) => (
                  <button
                    key={i}
                    type="button"
                    className={`ev-choice${pickedIdx === i ? ' is-picked' : ''}`}
                    onClick={() => handlePick(i)}
                  >
                    <span className="ev-mark">{i === 0 ? 'A' : 'B'}</span>
                    {choice.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="sd-foot">
              <button type="button" className="sd-btn main" disabled={pickedIdx === null} onClick={handleRoundContinue}>
                {roundIndex + 1 < rounds.length ? '选一个继续' : '选一个，看看结果'}
              </button>
            </div>
          </>
        )}

        {/* ---------- 占位结束页：合影/结语留给下个子切片 ---------- */}
        {step === 'end' && (
          <>
            <div className="ev-end-placeholder">
              <h4>{event.name}结束啦</h4>
              <p>合影和结语下个版本就能看到啦，这一次先记下了{companion.name}做的每一个选择。</p>
            </div>
            <div className="sd-foot">
              <button type="button" className="sd-btn main" onClick={onClose}>先回到小伙伴</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CompanionSchoolEventFlow;