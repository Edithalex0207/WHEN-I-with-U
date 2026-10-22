/*
 * CompanionSchoolRecessChoice.jsx —— 「文字选项」玩法组件（课间事件切片 D）。
 *
 * 登记在 companionSchoolRecessBodies.js 里，由 CompanionSchoolRecessModal
 * 渲染在旁白和角色下面。流程：
 *   pick   一张场景小卡片 + 3 个选项（左边是同学表情小头像，右边是性格标签），
 *          点一个选中（打勾），再点"就这样"
 *   done   选项锁定，选中的留着勾，其余变淡；同时调一次 onDone 交给外壳落库，
 *          外壳随后显示结尾那句、"+N 心情"和"收下"，同学换成对应的表情
 * 外壳落库失败时（disabled 恢复、settled 仍为空），这里会出现一个"记下来"
 * 按钮，让玩家能再试一次，选择不会重来。
 *
 * 事件、选项、结尾、心情都在 companionSchoolRecessChoiceEvents.js（固定文案，
 * 不调 AI）。外壳开场气泡是通用的一句话，具体场景由这里的小卡片说。
 * 同学的表情头像来自贴图位（ClassmateSticker），这里不画任何脸。
 *
 * Props（约定见 companionSchoolRecessBodies.js）:
 *   event, companion, disabled, settled, onDone
 */

import React, { useState } from 'react';

import './school.css';
import './schoolRecess.css';
import './schoolRecessChoice.css';

import { RECESS_KIND, RECESS_MOOD_CAP } from './companionSchoolRecessData';
import { getRecessMoodBonus } from './companionSchoolRecessService';
import {
  pickChoiceEvent,
  shuffleChoiceOptions,
  fillChoiceText,
} from './companionSchoolRecessChoiceEvents';
import { ClassmateSticker } from './CompanionSchoolRecessSticker';

const CompanionSchoolRecessChoice = ({ event, companion, disabled = false, settled = null, onDone }) => {
  /* 事件和选项顺序只在打开时抽一次 */
  const [picked] = useState(() => {
    const item = pickChoiceEvent({});
    return { item, options: shuffleChoiceOptions(item.options) };
  });
  const [selectedId, setSelectedId] = useState(null);
  const [sent, setSent] = useState(0);

  const mate = event?.classmate;
  const vars = { name: companion?.name, mate: mate?.name };
  const { item, options } = picked;

  const chosen = options.find((opt) => opt.id === selectedId) || null;
  const locked = sent > 0 || Boolean(settled);

  const submit = () => {
    if (!chosen) return;
    setSent((n) => n + 1);
    /* 心情事先写在选项里；万一数据里写漏了，退回 RECESS_MOOD.choice 的随机值 */
    const preset = Number(chosen.mood);
    const moodDelta = Number.isFinite(preset) && preset > 0
      ? Math.min(preset, RECESS_MOOD_CAP)
      : getRecessMoodBonus(RECESS_KIND.CHOICE);
    onDone?.({
      outcome: `${item.id}:${chosen.id}`,
      moodDelta,
      text: fillChoiceText(chosen.ending, vars),
      mateMood: chosen.mateMood || 'happy',
    });
  };

  const canRetry = sent > 0 && !disabled && !settled;

  return (
    <div className="rc-choice">
      <div className="rc-choice-card">
        <i className="rc-tape" />
        <p>{fillChoiceText(item.situation, vars)}</p>
      </div>

      <p className="rc-choice-hint">{locked ? '你选了这个' : `替${companion?.name || '小伙伴'}选一个`}</p>

      <ul className="rc-choice-list">
        {options.map((opt) => {
          const isSel = opt.id === selectedId;
          const dim = locked && !isSel;
          return (
            <li key={opt.id}>
              <button
                type="button"
                className={`rc-choice-opt${isSel ? ' is-sel' : ''}${dim ? ' is-dim' : ''}`}
                aria-pressed={isSel}
                disabled={disabled || locked}
                onClick={() => setSelectedId(opt.id)}
              >
                {isSel && (
                  <span className="rc-choice-ok" aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24">
                      <path d="M6 12.5l4 4 8-9" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                )}
                <ClassmateSticker classmate={mate} mood={opt.face || 'normal'} size={46} />
                <span className="rc-choice-body">
                  <span className={`rc-choice-tag sd-tone-${opt.tone || 'butter'}`}>{opt.tag}</span>
                  <span className="rc-choice-text">{fillChoiceText(opt.text, vars)}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {!locked && (
        <button type="button" className="rc-btn" disabled={!chosen || disabled} onClick={submit}>
          就这样
        </button>
      )}

      {canRetry && (
        <button type="button" className="rc-btn" onClick={submit}>
          记下来
        </button>
      )}
    </div>
  );
};

export default CompanionSchoolRecessChoice;