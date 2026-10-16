/*
 * CompanionSchoolMeetingModal.jsx —— 「三方会谈」弹窗（第 4 轮）。
 *
 * 从 CompanionSchoolReportModal.jsx 评语卡 tab 的"老师想和你聊聊"提示点
 * 进来，带着那一条 companionSchoolReports（kind='meeting'）行。
 *
 * 【做到什么程度】
 * - 老师先说一句这周的真实情况（teacherText），小伙伴接一句自己的话
 *   （petText）——这两句都是第 3 轮生成评语时顺带已经写好的，这里只是
 *   展示，不会再调一次 AI。
 * - 下面给 4 个回应（MEETING_RESPONSES：表扬 / 鼓励 / 带TA去玩 / 认真听
 *   完），每个按钮标着会带来的心情变化和要花的心心；"带TA去玩"要花 3
 *   心心，心心不够时按钮是禁用状态，不是点了再报错。
 * - 选完调 respondToMeeting 落库（心情变化 + 心心变化 + 记一条日志），
 *   成功后换成一句"回应好了"的收尾状态，不能再选第二次；失败（比如手慢
 *   了、两个标签页同时点，心心被别处花掉了）就在原地提示一句，不关弹窗，
 *   让家长可以换一个回应再试。
 *
 * 【视觉说明】
 * 这一轮没有现成的、像课程表/评语卡那两屏一样已经定稿的高保真预览图可以
 * 照着做（之前对话里给过的 school-preview.html 第 8 屏，在这轮开始时已经
 * 不在手上了），所以这里是照着已经定稿的 school.css / sr- 体系里现成的
 * 颜色变量、圆角卡片、tone 配色（butter/sky/mint/lavender）延伸出来的，
 * 不是重新画了一套风格。如果跟你手上那张预览图对不上，告诉我差在哪，我
 * 再调。
 *
 * Props:
 *   companion  object    —— 当前小伙伴（用 id / name / avatarUrl / hearts）
 *   meeting    object    —— companionSchoolReports 的一行（kind='meeting'）
 *   onClose    function  —— 关闭弹窗
 *   onResponded function({ meeting, companion, response }) —— 回应成功后调用，
 *              让上一层（CompanionSchoolReportModal）知道这场会谈已经处理完，
 *              把"老师想和你聊聊"的提示收起来
 */

import React, { useState } from 'react';

import './school.css';
import './schoolMeeting.css';

import { MEETING_RESPONSES, findSchoolTeacher } from './companionSchoolData';
import { respondToMeeting } from './companionSchoolReportService';
import { CloseGlyph, TeacherAvatar, PetFace } from './SchoolArt';

const CompanionSchoolMeetingModal = ({ companion, meeting, onClose, onResponded }) => {
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const teacher = findSchoolTeacher(meeting?.teacherId);
  const hearts = result ? result.companion.hearts : (companion?.hearts || 0);
  const done = Boolean(result);

  const handlePick = async (response) => {
    if (picking || done) return;
    setError('');
    setPicking(true);
    try {
      const res = await respondToMeeting(meeting.id, response.id);
      setResult(res);
      onResponded?.(res);
    } catch (e) {
      setError(e?.message || '没弄好，再试一次吧。');
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="cp-overlay center">
      <div className="cp-backdrop" onClick={onClose} />
      <div className="sd-root" role="dialog" aria-label="三方会谈">
        <div className="sd-head">
          <button type="button" className="sd-round" aria-label="关闭" onClick={onClose}><CloseGlyph /></button>
          <div className="sd-title"><b>三方会谈</b></div>
          <span className="sd-round is-ghost" aria-hidden="true" />
        </div>

        <div className="sd-body">
          <div className="mt-bubble mt-teacher">
            <TeacherAvatar teacher={teacher} size={48} />
            <div className="mt-bubble-box">
              <span className="mt-who">{teacher?.name || '老师'}</span>
              <p>{meeting?.teacherText}</p>
            </div>
          </div>

          <div className="mt-bubble mt-pet">
            <div className="mt-bubble-box">
              <span className="mt-who">{companion?.name || '小伙伴'}</span>
              <p>{meeting?.petText}</p>
            </div>
            <span className="mt-pet-face">
              {companion?.avatarUrl
                ? <img src={companion.avatarUrl} alt={companion.name} draggable={false} />
                : <PetFace size={40} />}
            </span>
          </div>

          {!done && (
            <>
              <p className="mt-prompt">你想怎么回应？</p>
              <div className="mt-options">
                {MEETING_RESPONSES.map((r) => {
                  const canAfford = hearts >= r.heartsCost;
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className={`mt-opt sd-tone-${r.tone}`}
                      disabled={picking || !canAfford}
                      onClick={() => handlePick(r)}
                    >
                      <b>{r.label}</b>
                      <span>
                        心情 +{r.moodDelta}
                        {r.heartsCost > 0 ? ` · 花 ${r.heartsCost} 心心` : ''}
                      </span>
                      {!canAfford && <i className="mt-opt-lock">心心不够</i>}
                    </button>
                  );
                })}
              </div>
              {error && <p className="sd-notice" role="status">{error}</p>}
            </>
          )}

          {done && (
            <div className="mt-done">
              <p>回应好了，{companion?.name || 'TA'}的心情变化已经记下啦。</p>
              <button type="button" className="sd-btn main" onClick={onClose}>知道啦</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CompanionSchoolMeetingModal;