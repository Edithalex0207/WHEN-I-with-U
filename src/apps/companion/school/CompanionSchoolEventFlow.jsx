/*
 * CompanionSchoolEventFlow.jsx —— 「春游 / 秋游」特别活动弹窗。
 *
 * 【这一轮（子切片③）做到什么程度】
 * 通知签字 -> 准备零食 -> 三轮事件选择 -> 合影+结语+落库+发奖励，五段全部
 * 是真的了。到达"end"步骤时自动生成一张合影（html-to-image 截一个 DOM
 * 节点，模式照抄 SchoolEnrollFlow.jsx 的 exportCardImage 写法），再调
 * companionSchoolEventService.finishEvent 把结果一次性落库：今年完成的
 * 记录、心心奖励、合影纪念卡（生成失败就不存图，照样完成，跟入学/升班
 * 一样"图片失败不卡流程"）。
 *
 * 合影里的"全班合照"是 SEASON_EVENTS[eventId].groupPhotoUrl 占位框
 * （留空 = 虚线占位框），不是另外单独做了一套合影素材。
 *
 * 中途点右上角关闭：在"end"步骤落库完成之前关闭，相当于放弃这次结算
 * （不会写入任何记录，下次进来还能重新选）；落库完成之后关闭就是正常
 * 退出。两种情况都不用弹"确定要放弃吗"。
 *
 * Props:
 *   companion     object   —— 当前小伙伴（用 id / name / avatarUrl / hearts）
 *   event         object   —— companionSchoolEventService.getOpenEventForCompanion
 *                             返回的那个活动定义（SEASON_EVENTS 里的一条）
 *   schoolRecord  object   —— 当前学籍（取 classId，通知信头要用班级名）
 *   onClose       function —— 关闭弹窗（落库成功后调用方应该据此刷新学校状态）
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { toJpeg } from 'html-to-image';

import './school.css';
import './schoolEvent.css';

import { findSchoolClass } from './companionSchoolData';
import {
  SNACK_POOL,
  SNACK_PICK_MIN,
  SNACK_PICK_MAX,
  getEventRounds,
} from './companionSchoolEventData';
import { finishEvent } from './companionSchoolEventService';
import { CloseGlyph, BackGlyph, HeartGlyph, FoodArt, PetFace } from './SchoolArt';

const fillName = (text, name) => text.split('{name}').join(name);

const PHOTO_QUALITY = 0.86;
const PHOTO_PIXEL_RATIO = 1.6;

const pad2 = (n) => String(n).padStart(2, '0');
const formatDate = (timestamp) => {
  const d = new Date(timestamp);
  return `${d.getFullYear()} . ${pad2(d.getMonth() + 1)} . ${pad2(d.getDate())}`;
};

const exportCollageImage = (node) => toJpeg(node, {
  quality: PHOTO_QUALITY,
  pixelRatio: PHOTO_PIXEL_RATIO,
  backgroundColor: '#ffffff',
  cacheBust: true,
});

const STEPS = ['notice', 'snacks', 'event', 'end'];

const CompanionSchoolEventFlow = ({ companion, event, schoolRecord, onClose }) => {
  const [step, setStep] = useState('notice');
  const [roundIndex, setRoundIndex] = useState(0);
  const [pickedIdx, setPickedIdx] = useState(null); // 当前这一轮点了第几个选项，还没按"继续"
  const [snacks, setSnacks] = useState(new Set());
  const [choices, setChoices] = useState([]); // [{roundIndex, tag}]，三轮选完会有 3 条
  const [settling, setSettling] = useState(false); // 正在生成合影/落库
  const [settled, setSettled] = useState(null); // finishEvent 的结果
  const [settleError, setSettleError] = useState('');
  const [photoDate] = useState(() => Date.now());
  const collageRef = useRef(null);

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

  /* ---------------- 结算：生成合影 + 落库 ---------------- */
  const handleSettle = useCallback(async () => {
    setSettling(true);
    setSettleError('');

    let image = null;
    if (collageRef.current) {
      try {
        image = await exportCollageImage(collageRef.current);
      } catch (_) {
        image = null; // 导出失败不拦着结算，只是没有合影存进相册
      }
    }

    try {
      const photo = image ? { image, title: `${companion.name}的${event.name}纪念卡` } : null;
      const result = await finishEvent(companion.id, {
        eventId: event.id,
        choices,
        snackIds: [...snacks],
        photo,
        now: Date.now(),
      });
      setSettled({ ...result, image });
    } catch (err) {
      setSettleError(err?.message || '结算没有成功，再试一次吧');
    } finally {
      setSettling(false);
    }
  }, [companion, event, choices, snacks]);

  useEffect(() => {
    if (step === 'end' && !settled && !settling && !settleError) {
      handleSettle();
    }
  }, [step, settled, settling, settleError, handleSettle]);

  /* ---------------- 返回 / 关闭 ---------------- */
  const handleBack = () => {
    if (settling) return; // 正在生成合影/落库时不让关，避免半路打断
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

        {/* ---------- 异常兜底：这一轮没有配到事件数据 ---------- */}
        {step === 'event' && !round && (
          <>
            <div className="ev-end-placeholder">
              <h4>咦，这次活动好像出错了</h4>
              <p>先关掉重新试试吧，{companion.name}的选择还没有被记下来。</p>
            </div>
            <div className="sd-foot">
              <button type="button" className="sd-btn main" onClick={onClose}>先关掉</button>
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

        {/* ---------- 第 4 步：合影 + 结语 + 奖励 ---------- */}
        {step === 'end' && (
          <>
            <div className="sd-body is-center">
              <div className="ev-collage" ref={collageRef}>
                <div className="ev-collage-pics">
                  <div className={`ev-collage-pet is-${event.tone}`}>
                    {companion.avatarUrl ? (
                      <img src={companion.avatarUrl} alt={companion.name} draggable={false} />
                    ) : (
                      <PetFace size={64} />
                    )}
                  </div>
                  <div className="ev-collage-group">
                    {event.groupPhotoUrl ? (
                      <img src={event.groupPhotoUrl} alt="全班合照" />
                    ) : (
                      <span>全班合照</span>
                    )}
                  </div>
                </div>
                <div className="ev-collage-title">{event.name}纪念</div>
                <div className="ev-collage-name">{companion.name}</div>
                <div className="ev-collage-date">{formatDate(photoDate)}</div>
              </div>

              {settling && <p className="sd-hint">正在整理{event.name}的合影和故事…</p>}

              {settleError && (
                <>
                  <p className="sd-notice" role="status">{settleError}</p>
                </>
              )}

              {settled && (
                <div className="ev-ending">
                  <p>{settled.endingText}</p>
                  <span className="ev-reward-chip"><HeartGlyph size={13} />+{settled.heartsGained} 心心</span>
                  {!settled.image && <p className="sd-hint">合影图片没能生成，这次没有存进相册，故事和奖励都正常拿到了</p>}
                </div>
              )}
            </div>
            <div className="sd-foot">
              {settleError && (
                <button type="button" className="sd-btn main" onClick={handleSettle}>再试一次</button>
              )}
              {settled && (
                <button type="button" className="sd-btn main" onClick={onClose}>回到小伙伴</button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CompanionSchoolEventFlow;