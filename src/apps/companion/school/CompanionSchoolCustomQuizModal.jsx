/*
 * CompanionSchoolCustomQuizModal.jsx —— 「我出的题」弹窗。
 *
 * 对应视觉预览 school-custom-quiz-preview.html（已确认）。三个画面，靠一个
 * view 状态切换，照抄 SchoolEnrollFlow.jsx 的"单弹窗内部切步骤"思路，
 * 避免再拆出一堆互相 import 的小弹窗：
 *   'list'  题目列表——默认画面，列出 companionSchoolQuestions 里这个
 *           小伙伴自己的题，能编辑、能删（删除两次确认，跟学校相册那个
 *           删除交互一致）。
 *   'form'  手动出一道题/编辑一道已有的题——选择题最多 4 个选项、最少
 *           2 个，点选项左边的圆点标正确答案；判断题是"对/错"两个按钮。
 *           保存时调 normalizeCustomQuestion 走的那套校验（这里不重复
 *           校验逻辑，错误信息直接用后端抛出的 SchoolError.message）。
 *   'ai'    AI 出题——给一段资料/主题，选科目、学段、要几道，调
 *           companionSchoolQuizAiService.generateQuizQuestions 拿到一批
 *           草稿，预览时还能把其中不想要的几道划掉，确认后一次性调
 *           addCustomQuestions 批量入库——这个函数本来就是"AI 出题预览
 *           确认后用"，每道题各自的校验失败原因会在 aiSaveErrors 里报
 *           出来，不会因为一道格式不对就让整批都存不进去。
 *
 * 【AI 出题失败不编假题】见 companionSchoolQuizAiService.js 顶部注释：
 * 这是用户主动点出来的动作，没有"真实数据"可以兜底编一道题，失败了就
 * 老实提示"没生成出来，再试一次"。
 *
 * Props:
 *   companion  object    —— 当前小伙伴（用 id / name）
 *   chatId     number    —— 当前聊天窗 id，AI 出题要用
 *   character  object    —— 当前角色，AI 出题要用
 *   onClose    function  —— 关闭弹窗
 */

import React, { useEffect, useState } from 'react';

import './school.css';
import './schoolCustomQuiz.css';

import db from '../../../db';
import {
  SCHOOL_SUBJECTS,
  CUSTOM_SUBJECT_ID,
  SCHOOL_STAGE,
  QUESTION_STAGE_BOTH,
  QUESTION_TYPE,
  QUESTION_SOURCE,
} from './companionSchoolData';
import {
  getCustomQuestions,
  addCustomQuestion,
  updateCustomQuestion,
  deleteCustomQuestion,
  addCustomQuestions,
  MAX_CUSTOM_QUESTIONS,
} from './companionSchoolQuizService';
import { hasApiConfig, generateQuizQuestions } from './companionSchoolQuizAiService';
import { CloseGlyph, BackGlyph, CheckGlyph, EditGlyph, TrashGlyph } from './SchoolArt';

/* 科目 / 学段选项：picker 栏的顺序和色调 */
const SUBJECT_PICKS = [...SCHOOL_SUBJECTS, { id: CUSTOM_SUBJECT_ID, label: '自定义', tone: 'lavender' }];
const STAGE_PICKS = [
  { id: SCHOOL_STAGE.KINDERGARTEN, label: '幼儿园', tone: 'butter' },
  { id: SCHOOL_STAGE.PRIMARY, label: '小学', tone: 'sky' },
  { id: QUESTION_STAGE_BOTH, label: '不限', tone: 'mint' },
];
const subjectMeta = (id) => SUBJECT_PICKS.find((s) => s.id === id) || SUBJECT_PICKS[0];
const stageLabel = (id) => STAGE_PICKS.find((s) => s.id === id)?.label || '不限';

const AI_COUNT_OPTIONS = [3, 5, 8];
const MATERIAL_MAX = 300;

const answerText = (q) => {
  if (q.type === QUESTION_TYPE.JUDGE) return q.answer ? '对' : '错';
  return q.options?.[q.answer] ?? '';
};

/* 新出一道题 / 编辑一道题，表单的初始状态 */
const blankForm = () => ({
  subject: SCHOOL_SUBJECTS[0].id,
  stage: QUESTION_STAGE_BOTH,
  type: QUESTION_TYPE.CHOICE,
  stem: '',
  options: ['', ''],
  correctIdx: 0,
  judgeAnswer: null,
  explain: '',
});

const formFromRow = (row) => ({
  subject: row.subject,
  stage: row.stage,
  type: row.type,
  stem: row.stem,
  options: row.type === QUESTION_TYPE.CHOICE ? row.options.slice() : ['', ''],
  correctIdx: row.type === QUESTION_TYPE.CHOICE ? row.answer : 0,
  judgeAnswer: row.type === QUESTION_TYPE.JUDGE ? row.answer : null,
  explain: row.explain || '',
});

const CompanionSchoolCustomQuizModal = ({ companion, chatId, character, onClose }) => {
  const [view, setView] = useState('list');

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(blankForm());
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [aiSubject, setAiSubject] = useState(SCHOOL_SUBJECTS[0].id);
  const [aiStage, setAiStage] = useState(QUESTION_STAGE_BOTH);
  const [aiMaterial, setAiMaterial] = useState('');
  const [aiCount, setAiCount] = useState(AI_COUNT_OPTIONS[0]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiDrafts, setAiDrafts] = useState(null); // null = 还没生成；数组 = 预览中
  const [aiSaveErrors, setAiSaveErrors] = useState([]);

  const refresh = async () => {
    const list = await getCustomQuestions(companion.id);
    setRows(list);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companion.id]);

  /* ---------------- 列表：删除 ---------------- */
  const handleDeleteClick = async (row) => {
    if (pendingDeleteId !== row.id) {
      setPendingDeleteId(row.id);
      return;
    }
    await deleteCustomQuestion(row.id);
    setPendingDeleteId(null);
    refresh();
  };

  /* ---------------- 表单：打开 / 关闭 ---------------- */
  const openNewForm = () => {
    setEditingId(null);
    setForm(blankForm());
    setFormError('');
    setView('form');
  };

  const openEditForm = (row) => {
    setEditingId(row.id);
    setForm(formFromRow(row));
    setFormError('');
    setView('form');
  };

  const setOption = (i, value) => {
    setForm((f) => {
      const options = f.options.slice();
      options[i] = value;
      return { ...f, options };
    });
  };
  const addOption = () => setForm((f) => (f.options.length >= 4 ? f : { ...f, options: [...f.options, ''] }));
  const removeOption = (i) => setForm((f) => {
    if (f.options.length <= 2) return f;
    const options = f.options.filter((_, idx) => idx !== i);
    let correctIdx = f.correctIdx;
    if (correctIdx >= options.length) correctIdx = options.length - 1;
    else if (correctIdx > i) correctIdx -= 1;
    return { ...f, options, correctIdx };
  });

  const handleSave = async () => {
    setFormError('');
    const payload = form.type === QUESTION_TYPE.CHOICE
      ? {
        subject: form.subject,
        stage: form.stage,
        type: QUESTION_TYPE.CHOICE,
        stem: form.stem,
        options: form.options,
        answer: form.correctIdx,
        explain: form.explain,
      }
      : {
        subject: form.subject,
        stage: form.stage,
        type: QUESTION_TYPE.JUDGE,
        stem: form.stem,
        answer: form.judgeAnswer,
        explain: form.explain,
      };

    if (form.type === QUESTION_TYPE.JUDGE && typeof form.judgeAnswer !== 'boolean') {
      setFormError('要选"对"还是"错"');
      return;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateCustomQuestion(editingId, payload);
      } else {
        await addCustomQuestion(companion.id, payload);
      }
      await refresh();
      setView('list');
    } catch (e) {
      setFormError(e?.message || '没保存上，再试一次吧');
    } finally {
      setSaving(false);
    }
  };

  /* ---------------- AI 出题 ---------------- */
  const openAiScreen = () => {
    setAiError('');
    setAiDrafts(null);
    setAiSaveErrors([]);
    setView('ai');
  };

  const handleGenerate = async () => {
    const material = aiMaterial.trim();
    if (!material) {
      setAiError('先写一点资料或者主题吧');
      return;
    }
    setAiError('');
    setAiBusy(true);
    setAiDrafts(null);
    setAiSaveErrors([]);
    try {
      const ok = await hasApiConfig();
      if (!ok) {
        setAiError('还没配置好 AI 接口，去设置里配置聊天接口后再来吧');
        return;
      }
      const chat = chatId ? await db.chats.get(chatId) : null;
      const drafts = await generateQuizQuestions({
        chatId, chat, character, companion,
        subjectId: aiSubject, stage: aiStage, material, count: aiCount,
      });
      if (!drafts) {
        setAiError('没生成出来，再试一次吧');
        return;
      }
      setAiDrafts(drafts.map((d, i) => ({ ...d, _key: `${Date.now()}-${i}` })));
    } finally {
      setAiBusy(false);
    }
  };

  const removeDraft = (key) => {
    setAiDrafts((list) => list.filter((d) => d._key !== key));
  };

  const handleConfirmDrafts = async () => {
    if (!aiDrafts || aiDrafts.length === 0) return;
    setAiBusy(true);
    setAiSaveErrors([]);
    try {
      const list = aiDrafts.map((d) => ({
        subject: d.subject,
        stage: d.stage,
        type: d.type,
        stem: d.stem,
        options: d.options,
        answer: d.answer,
        explain: d.explain,
        source: QUESTION_SOURCE.AI,
      }));
      const { errors } = await addCustomQuestions(companion.id, list);
      await refresh();
      if (errors.length > 0) {
        setAiSaveErrors(errors);
        // 把存失败的那几道留在预览里，其它已经存成功的从草稿里摘掉，
        // 省得用户手动对照哪几道没存上。
        const failedIdx = new Set(errors.map((e) => e.index));
        setAiDrafts((list2) => list2.filter((_, i) => failedIdx.has(i)));
      } else {
        setAiDrafts(null);
        setAiMaterial('');
        setView('list');
      }
    } finally {
      setAiBusy(false);
    }
  };

  const atLimit = rows.length >= MAX_CUSTOM_QUESTIONS;

  return (
    <div className="cp-overlay center">
      <div className="cp-backdrop" onClick={onClose} />
      <div className="sd-root" role="dialog" aria-label="我出的题">
        {/* ---------- 列表 ---------- */}
        {view === 'list' && (
          <>
            <div className="sd-head">
              <button type="button" className="sd-round" aria-label="关闭" onClick={onClose}><CloseGlyph /></button>
              <div className="sd-title"><b>我出的题</b></div>
              <span className="sd-round is-ghost" aria-hidden="true" />
            </div>
            <div className="sd-body">
              <div className="cq-head">
                <span className="cq-count">共 {rows.length} / {MAX_CUSTOM_QUESTIONS} 道</span>
                <div className="cq-head-btns">
                  <button type="button" className="cq-add is-ghost" onClick={openAiScreen} disabled={atLimit}>
                    AI 出题
                  </button>
                  <button type="button" className="cq-add" onClick={openNewForm} disabled={atLimit}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    出一道新题
                  </button>
                </div>
              </div>

              {atLimit && <p className="cq-limit-hint">自己出的题最多 {MAX_CUSTOM_QUESTIONS} 道，先删掉一些再加新的吧</p>}

              {!loading && rows.length === 0 && (
                <div className="cq-empty">
                  <div className="cq-empty-pic"><EditGlyph size={40} /></div>
                  <h4>还没有自己出的题</h4>
                  <p>想考考小伙伴什么，<br />自己出一道题吧</p>
                </div>
              )}

              {!loading && rows.length > 0 && (
                <div className="cq-list">
                  {rows.map((row) => {
                    const subj = subjectMeta(row.subject);
                    const delConfirm = pendingDeleteId === row.id;
                    return (
                      <div key={row.id} className="cq-card">
                        <div className="cq-top">
                          <span className={`cq-chip sd-tone-${subj.tone}`}>{subj.label}</span>
                          <span className="cq-type">
                            {row.type === QUESTION_TYPE.CHOICE ? '选择题' : '判断题'} · {stageLabel(row.stage)}
                            {row.source === QUESTION_SOURCE.AI && ' · AI'}
                          </span>
                          <span className="cq-ops">
                            <button type="button" className="cq-op-btn" aria-label="编辑" onClick={() => openEditForm(row)}>
                              <EditGlyph size={14} />
                            </button>
                            <button
                              type="button"
                              className={`cq-op-btn is-del${delConfirm ? ' is-confirm' : ''}`}
                              aria-label="删除"
                              onClick={() => handleDeleteClick(row)}
                            >
                              <TrashGlyph size={14} />
                            </button>
                          </span>
                        </div>
                        <p className="cq-stem">{row.stem}</p>
                        <span className="cq-answer">正确答案：{answerText(row)}</span>
                        {row.explain && <p className="cq-explain">{row.explain}</p>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* ---------- 手动表单 ---------- */}
        {view === 'form' && (
          <>
            <div className="sd-head">
              <button type="button" className="sd-round" aria-label="返回" onClick={() => setView('list')}><BackGlyph /></button>
              <div className="sd-title"><b>{editingId ? '编辑这道题' : '出一道新题'}</b></div>
              <span className="sd-round is-ghost" aria-hidden="true" />
            </div>
            <div className="sd-body">
              <div className="cq-field">
                <div className="cq-label">科目</div>
                <div className="cq-pickrow">
                  {SUBJECT_PICKS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`cq-pick sd-tone-${s.tone}${form.subject === s.id ? ' is-on' : ''}`}
                      onClick={() => setForm((f) => ({ ...f, subject: s.id }))}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="cq-field">
                <div className="cq-label">学段</div>
                <div className="cq-pickrow">
                  {STAGE_PICKS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className={`cq-pick sd-tone-${s.tone}${form.stage === s.id ? ' is-on' : ''}`}
                      onClick={() => setForm((f) => ({ ...f, stage: s.id }))}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="cq-field">
                <div className="cq-label">题型</div>
                <div className="cq-seg">
                  <button
                    type="button"
                    className={form.type === QUESTION_TYPE.CHOICE ? 'is-on' : ''}
                    onClick={() => setForm((f) => ({ ...f, type: QUESTION_TYPE.CHOICE }))}
                  >
                    选择题
                  </button>
                  <button
                    type="button"
                    className={form.type === QUESTION_TYPE.JUDGE ? 'is-on' : ''}
                    onClick={() => setForm((f) => ({ ...f, type: QUESTION_TYPE.JUDGE }))}
                  >
                    判断题
                  </button>
                </div>
              </div>

              <div className="cq-field">
                <div className="cq-label">
                  题干 <span className={`cq-counter${form.stem.length > 120 ? ' is-over' : ''}`}>{form.stem.length} / 120</span>
                </div>
                <textarea
                  className="cq-textarea"
                  rows={2}
                  maxLength={120}
                  placeholder="比如：下面哪个是水果？"
                  value={form.stem}
                  onChange={(e) => setForm((f) => ({ ...f, stem: e.target.value }))}
                />
              </div>

              {form.type === QUESTION_TYPE.CHOICE && (
                <div className="cq-field">
                  <div className="cq-label">选项（点左边圆点标为正确答案）</div>
                  <div className="cq-opts">
                    {form.options.map((val, i) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <div className="cq-opt-row" key={i}>
                        <button
                          type="button"
                          className={`cq-opt-mark${form.correctIdx === i ? ' is-correct' : ''}`}
                          aria-label={`标第 ${i + 1} 个选项为正确答案`}
                          onClick={() => setForm((f) => ({ ...f, correctIdx: i }))}
                        >
                          {form.correctIdx === i && <CheckGlyph size={14} />}
                        </button>
                        <input
                          className="cq-opt-input"
                          maxLength={40}
                          placeholder={`选项${i + 1}`}
                          value={val}
                          onChange={(e) => setOption(i, e.target.value)}
                        />
                        {form.options.length > 2 && (
                          <button type="button" className="cq-opt-del" aria-label="删除这个选项" onClick={() => removeOption(i)}>
                            <CloseGlyph size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {form.options.length < 4 && (
                    <button type="button" className="cq-opt-add" onClick={addOption}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                      加一个选项
                    </button>
                  )}
                </div>
              )}

              {form.type === QUESTION_TYPE.JUDGE && (
                <div className="cq-field">
                  <div className="cq-label">正确答案</div>
                  <div className="cq-judge">
                    <button
                      type="button"
                      className={`is-true${form.judgeAnswer === true ? ' is-on' : ''}`}
                      onClick={() => setForm((f) => ({ ...f, judgeAnswer: true }))}
                    >
                      对
                    </button>
                    <button
                      type="button"
                      className={`is-false${form.judgeAnswer === false ? ' is-on' : ''}`}
                      onClick={() => setForm((f) => ({ ...f, judgeAnswer: false }))}
                    >
                      错
                    </button>
                  </div>
                </div>
              )}

              <div className="cq-field">
                <div className="cq-label">
                  解析（选填） <span className={`cq-counter${form.explain.length > 200 ? ' is-over' : ''}`}>{form.explain.length} / 200</span>
                </div>
                <textarea
                  className="cq-textarea is-small"
                  rows={2}
                  maxLength={200}
                  placeholder="答错的时候会显示给小伙伴看"
                  value={form.explain}
                  onChange={(e) => setForm((f) => ({ ...f, explain: e.target.value }))}
                />
              </div>

              {formError && <p className="cq-err">{formError}</p>}
            </div>
            <div className="sd-foot">
              <button type="button" className="sd-btn ghost" onClick={() => setView('list')}>取消</button>
              <button type="button" className="sd-btn main" disabled={saving} onClick={handleSave}>保存</button>
            </div>
          </>
        )}

        {/* ---------- AI 出题 ---------- */}
        {view === 'ai' && (
          <>
            <div className="sd-head">
              <button
                type="button"
                className="sd-round"
                aria-label="返回"
                onClick={() => setView('list')}
              >
                <BackGlyph />
              </button>
              <div className="sd-title"><b>AI 出题</b></div>
              <span className="sd-round is-ghost" aria-hidden="true" />
            </div>
            <div className="sd-body">
              {aiDrafts === null && (
                <>
                  <div className="cq-field">
                    <div className="cq-label">科目</div>
                    <div className="cq-pickrow">
                      {SUBJECT_PICKS.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className={`cq-pick sd-tone-${s.tone}${aiSubject === s.id ? ' is-on' : ''}`}
                          onClick={() => setAiSubject(s.id)}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="cq-field">
                    <div className="cq-label">学段</div>
                    <div className="cq-pickrow">
                      {STAGE_PICKS.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          className={`cq-pick sd-tone-${s.tone}${aiStage === s.id ? ' is-on' : ''}`}
                          onClick={() => setAiStage(s.id)}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="cq-field">
                    <div className="cq-label">要几道 <span className="cq-counter">共 {MAX_CUSTOM_QUESTIONS - rows.length} 道空位</span></div>
                    <div className="cq-pickrow">
                      {AI_COUNT_OPTIONS.map((n) => (
                        <button
                          key={n}
                          type="button"
                          className={`cq-pick sd-tone-sky${aiCount === n ? ' is-on' : ''}`}
                          onClick={() => setAiCount(n)}
                        >
                          {n} 道
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="cq-field">
                    <div className="cq-label">
                      资料／主题 <span className={`cq-counter${aiMaterial.length > MATERIAL_MAX ? ' is-over' : ''}`}>{aiMaterial.length} / {MATERIAL_MAX}</span>
                    </div>
                    <textarea
                      className="cq-textarea"
                      rows={4}
                      maxLength={MATERIAL_MAX}
                      placeholder="比如：青蛙的生活习性；或者直接粘贴一段想考的课文"
                      value={aiMaterial}
                      onChange={(e) => setAiMaterial(e.target.value)}
                    />
                  </div>

                  {aiError && <p className="cq-err">{aiError}</p>}
                </>
              )}

              {aiBusy && aiDrafts === null && <p className="sd-hint">老师正在出题…</p>}

              {aiDrafts !== null && (
                <>
                  <p className="cq-ai-tip">
                    {aiDrafts.length > 0
                      ? `生成了 ${aiDrafts.length} 道，不想要的点右上角划掉，剩下的确认加入题库`
                      : '都划掉了，返回重新生成吧'}
                  </p>
                  {aiSaveErrors.length > 0 && (
                    <p className="cq-err">
                      有 {aiSaveErrors.length} 道没存上：{aiSaveErrors.map((e) => e.message).join('；')}
                    </p>
                  )}
                  <div className="cq-list">
                    {aiDrafts.map((d) => {
                      const subj = subjectMeta(d.subject);
                      return (
                        <div key={d._key} className="cq-card">
                          <div className="cq-top">
                            <span className={`cq-chip sd-tone-${subj.tone}`}>{subj.label}</span>
                            <span className="cq-type">{d.type === QUESTION_TYPE.CHOICE ? '选择题' : '判断题'} · {stageLabel(d.stage)}</span>
                            <span className="cq-ops">
                              <button type="button" className="cq-op-btn is-del" aria-label="不要这道" onClick={() => removeDraft(d._key)}>
                                <TrashGlyph size={14} />
                              </button>
                            </span>
                          </div>
                          <p className="cq-stem">{d.stem}</p>
                          <span className="cq-answer">正确答案：{answerText(d)}</span>
                          {d.explain && <p className="cq-explain">{d.explain}</p>}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
            <div className="sd-foot">
              {aiDrafts === null ? (
                <button type="button" className="sd-btn main" disabled={aiBusy} onClick={handleGenerate}>
                  {aiBusy ? '生成中…' : '开始生成'}
                </button>
              ) : (
                <>
                  <button type="button" className="sd-btn ghost" onClick={openAiScreen}>重新生成</button>
                  <button
                    type="button"
                    className="sd-btn main"
                    disabled={aiBusy || aiDrafts.length === 0}
                    onClick={handleConfirmDrafts}
                  >
                    {aiBusy ? '保存中…' : `加入题库 · ${aiDrafts.length} 道`}
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CompanionSchoolCustomQuizModal;