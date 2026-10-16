/*
 * CompanionSchoolReportModal.jsx —— 「家校练习册」弹窗。
 * 对应预览 school-preview.html 第 6、7、8 屏（已定稿）。
 *
 * 【做到什么程度】
 * - 顶部"课程表 / 评语卡"两个 tab 的切换壳子：真的能点、能切。
 * - 课程表 tab（第 2 轮）：真实数据（按小伙伴当前学段从
 *   companionSchoolData.js 的静态课程表里取），高亮"今天"是周几、"现在"
 *   是第几节（周末没有"今天"高亮，这是预期内的，不是 bug）；"今天在
 *   学校"卡片懒加载——今天做过题就调 AI 根据真实的做题统计写一句叙事，
 *   还没做过题就显示"还没有去上课"的提示，不会编一句假的出来。
 * - 评语卡 tab（第 3 轮）：切到这个 tab 时懒加载——这周还没生成过评语就
 *   调 AI 写一条，顺带按概率生成一条待处理的三方会谈；已经生成过就直接
 *   读，不重复调用。卡片下面能签字（只记时间戳，没有别的校验）。如果
 *   这周生成出了一条待处理的三方会谈，会露出"老师想和你聊聊"的提示——
 *   三方会谈本身的界面和回应逻辑下一轮才接，这一轮点上去只会弹一句
 *   "下一轮就能点开"，不是忘了接，是真的还没做。
 *
 * Props:
 *   companion  object    —— 当前小伙伴（用 id / name）
 *   chatId     number    —— 当前聊天窗 id，"今天在学校"的 AI 叙事要用
 *   character  object    —— 当前角色，同上
 *   onClose    function  —— 关闭弹窗
 */

import React, { useEffect, useState } from 'react';

import './school.css';
import './schoolReport.css';

import db from '../../../db';
import {
  SCHOOL_WEEKDAY_LABELS,
  SCHOOL_SLOTS,
  getDayLessons,
  findSchoolClass,
  findSchoolTeacher,
} from './companionSchoolData';
import { getSchoolStatus } from './companionSchoolService';
import {
  ensureTodayLifeNarrative,
  ensureWeeklyReport,
  signWeeklyReport,
} from './companionSchoolReportService';
import { CloseGlyph, BookGlyph, StarGlyph, TeacherAvatar } from './SchoolArt';
import CompanionSchoolMeetingModal from './CompanionSchoolMeetingModal';

const TABS = [
  { id: 'schedule', label: '课程表' },
  { id: 'comment', label: '评语卡' },
];

/* 现在大概是第几节，纯展示用的粗略映射，不影响任何数值 */
const currentSlotId = (now) => {
  const hour = new Date(now).getHours();
  if (hour < 9) return 'am1';
  if (hour < 12) return 'am2';
  if (hour < 18) return 'pm';
  return null; // 傍晚/夜里不高亮任何一节
};

/** weekKey（周一 'YYYY-MM-DD'）-> "10月12日那一周"，纯展示用 */
const formatWeekLabel = (weekKey) => {
  if (!weekKey) return '';
  const [, m, d] = weekKey.split('-').map(Number);
  return `${m}月${d}日那一周`;
};

const CompanionSchoolReportModal = ({ companion, chatId, character, onClose }) => {
  const [activeTab, setActiveTab] = useState('schedule');
  const [status, setStatus] = useState(null);
  const [todayLife, setTodayLife] = useState(null);
  const [lifeLoading, setLifeLoading] = useState(true);

  const [report, setReport] = useState(null);
  const [meeting, setMeeting] = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportLoaded, setReportLoaded] = useState(false);
  const [signing, setSigning] = useState(false);
  const [showMeeting, setShowMeeting] = useState(false);

  useEffect(() => {
    (async () => {
      setStatus(await getSchoolStatus(companion.id));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companion.id]);

  /* "今天在学校"：懒加载，只在这个弹窗打开时跑一次 */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLifeLoading(true);
      try {
        const chat = chatId ? await db.chats.get(chatId) : null;
        const row = await ensureTodayLifeNarrative(companion.id, {
          chatId, chat, character, companion,
        });
        if (!cancelled) setTodayLife(row);
      } finally {
        if (!cancelled) setLifeLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companion.id]);

  /* 评语卡：懒加载，切到这个 tab 时才跑，跑过一次这次打开就不会再跑 */
  useEffect(() => {
    if (activeTab !== 'comment' || reportLoaded) return;
    let cancelled = false;
    (async () => {
      setReportLoading(true);
      try {
        const chat = chatId ? await db.chats.get(chatId) : null;
        const { report: r, meeting: m } = await ensureWeeklyReport(companion.id, {
          chatId, chat, character, companion,
        });
        if (!cancelled) {
          setReport(r);
          setMeeting(m);
          setReportLoaded(true);
        }
      } finally {
        if (!cancelled) setReportLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, reportLoaded, companion.id]);

  const handleSign = async () => {
    if (!report || report.signedAt || signing) return;
    setSigning(true);
    try {
      await signWeeklyReport(report.id);
      setReport((prev) => (prev ? { ...prev, signedAt: Date.now() } : prev));
    } finally {
      setSigning(false);
    }
  };

  const now = Date.now();
  const todayJsDay = new Date(now).getDay(); // 0 周日 .. 6 周六
  const todayColIndex = todayJsDay >= 1 && todayJsDay <= 5 ? todayJsDay - 1 : -1;
  const nowSlotId = currentSlotId(now);

  const schoolClass = status ? findSchoolClass(status.classId) : null;

  /* 按学段取一整周的课（周一到周五，每天 3 格），拿不到学段时给空表 */
  const weekTable = status?.stage
    ? [1, 2, 3, 4, 5].map((jsDay) => getDayLessons(status.stage, jsDay))
    : [[], [], [], [], []];

  return (
    <>
      <div className="cp-overlay center">
        <div className="cp-backdrop" onClick={onClose} />
        <div className="sd-root" role="dialog" aria-label="家校练习册">
        <div className="sd-head">
          <button type="button" className="sd-round" aria-label="关闭" onClick={onClose}><CloseGlyph /></button>
          <div className="sd-title"><b>家校练习册</b></div>
          {schoolClass
            ? <span className="sd-chip sd-tone-sky">{schoolClass.name}</span>
            : <span className="sd-round is-ghost" aria-hidden="true" />}
        </div>

        <div className="sd-body">
          <div className="sr-tabs">
            <i
              className="sr-tabs-ind"
              style={{ transform: activeTab === 'comment' ? 'translateX(100%)' : 'translateX(0)' }}
            />
            {TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={activeTab === tab.id ? 'is-on' : ''}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'schedule' && (
            <>
              {!status?.enrolled && <p className="sd-hint">还没有办理入学，先去入学才有课程表哦。</p>}

              {status?.enrolled && (
                <>
                  <div className="sr-book">
                    <div className="sr-grid">
                      <div />
                      {SCHOOL_WEEKDAY_LABELS.map((label, i) => (
                        <div key={label} className={`sr-dh${i === todayColIndex ? ' is-today' : ''}`}>{label}</div>
                      ))}

                      {SCHOOL_SLOTS.map((slot, slotIndex) => (
                        <React.Fragment key={slot.id}>
                          <div className="sr-tm">{slot.label}</div>
                          {weekTable.map((dayLessons, dayIndex) => {
                            const lesson = dayLessons[slotIndex];
                            const isNow = dayIndex === todayColIndex && slot.id === nowSlotId;
                            return (
                              <div
                                key={`${slot.id}-${dayIndex}`}
                                className={`sr-cell sd-tone-${lesson?.tone || 'lavender'}${isNow ? ' is-now' : ''}`}
                              >
                                {lesson?.label || ''}
                              </div>
                            );
                          })}
                          {slotIndex === 1 && <div className="sr-lunch">午饭 · 午睡</div>}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  <div className="sr-today">
                    <h5><BookGlyph size={18} />今天在学校</h5>
                    {lifeLoading && <p className="sr-today-loading">正在看看今天上了什么课…</p>}
                    {!lifeLoading && todayLife && <p className="sr-li"><i><BookGlyph size={13} /></i>{todayLife.text}</p>}
                    {!lifeLoading && !todayLife && (
                      <p className="sr-today-empty">今天还没有去上课，去小课堂做几道题吧。</p>
                    )}
                  </div>
                </>
              )}
            </>
          )}

          {activeTab === 'comment' && (
            <>
              {!status?.enrolled && <p className="sd-hint">还没有办理入学，还没有评语可看哦。</p>}

              {status?.enrolled && reportLoading && <p className="sr-today-loading">正在看老师写评语…</p>}

              {status?.enrolled && !reportLoading && report && (() => {
                const teacher = findSchoolTeacher(report.teacherId);
                return (
                  <>
                    <div className="sr-cmt">
                      <div className="sr-cmt-top">
                        <TeacherAvatar teacher={teacher} size={44} />
                        <div>
                          <h4>{teacher?.name || '老师'}的小评语</h4>
                          <span>{formatWeekLabel(report.weekKey)}</span>
                        </div>
                      </div>
                      <div className="sr-paper">{report.text}</div>
                      <div className="sr-sign">
                        <div className="sr-sign-who">家长签字</div>
                        {report.signedAt
                          ? <span className="sr-sign-ok">已阅</span>
                          : (
                            <button type="button" className="sd-btn heart" style={{ flex: 'none', height: 40, padding: '0 20px' }} onClick={handleSign} disabled={signing}>
                              {signing ? '签字中…' : '签字'}
                            </button>
                          )}
                      </div>
                    </div>

                    <div className="sr-mini">
                      <div>
                        <h6>本周上学</h6>
                        <p>{report.stats?.daysAttended ?? 0} 天</p>
                      </div>
                      <div>
                        <h6>本周做题</h6>
                        <p>{report.stats?.setCount ?? 0} 组</p>
                      </div>
                    </div>

                    {meeting && (
                      <button type="button" className="sr-meeting-tile" onClick={() => setShowMeeting(true)}>
                        <span className="sr-meeting-ic"><StarGlyph size={18} /></span>
                        <div>
                          <h6>老师想和你聊聊</h6>
                          <p>三方会谈 · 待参加</p>
                        </div>
                      </button>
                    )}
                  </>
                );
              })()}
            </>
          )}
        </div>
      </div>
      </div>

      {showMeeting && meeting && (
        <CompanionSchoolMeetingModal
          companion={companion}
          meeting={meeting}
          onClose={() => setShowMeeting(false)}
          onResponded={() => {
            setMeeting(null);
            setShowMeeting(false);
          }}
        />
      )}
    </>
  );
};

export default CompanionSchoolReportModal;