// src/apps/fiction/FictionWizard.jsx
//
// 新建向导的容器：三步、进度条、保存草稿、退出确认。
// 这一批只有第 1 步是真内容，第 2、3 步是占位，下一批接上。
// 不用 position: fixed，返回按钮、底栏、抽屉都相对 .fic-col 定位。

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';

import WizardStepPremise from './WizardStepPremise';
import {
  WIZARD_STEPS,
  WIZARD_STEP_COUNT,
  buildDefaultWizardForm,
  loadWizardForm,
  saveWizardForm,
  validateWizardStep,
} from './fictionWizardService';
import './fictionWizard.css';

const StepPlaceholder = ({ zh }) => (
  <div className="fic-w-placeholder">
    <div className="fic-w-placeholder-hand">「{zh}」下一批开放。</div>
    <p className="fic-w-placeholder-text">
      这一步的内容还在路上，现在可以先点「下一步」走完流程，或者保存为草稿。
    </p>
  </div>
);

const FictionWizard = ({ draftId = null, onExit }) => {
  const [form, setForm] = useState(buildDefaultWizardForm);
  const [step, setStep] = useState(0);
  const [saveId, setSaveId] = useState(draftId);
  const [loading, setLoading] = useState(Boolean(draftId));
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [toast, setToast] = useState('');

  const toastTimerRef = useRef(null);
  const scrollRef = useRef(null);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const showToast = useCallback((message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);

    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(''), 2200);
  }, []);

  // 打开已有草稿
  useEffect(() => {
    if (!draftId) return undefined;

    let cancelled = false;

    (async () => {
      try {
        const loaded = await loadWizardForm(draftId);

        if (cancelled) return;

        if (!loaded) {
          onExit?.({ message: '这份草稿找不到了' });
          return;
        }

        setForm(loaded.form);
        setStep(Math.min(loaded.step, WIZARD_STEP_COUNT - 1));
      } catch (error) {
        console.warn('[Fiction] 读取草稿失败：', error);
        if (!cancelled) onExit?.({ message: '读取草稿失败' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // onExit 来自父组件，换引用不应该重新读草稿
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId]);

  // 换步骤时回到顶部
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTo({ top: 0 });
  }, [step]);

  const patchForm = useCallback((patch) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  }, []);

  const persistDraft = async () => {
    const id = await saveWizardForm({ saveId, form, step, finish: false });

    setSaveId(id);
    setDirty(false);

    return id;
  };

  const handleSaveDraft = async () => {
    if (busy) return;

    setBusy(true);

    try {
      await persistDraft();
      showToast('草稿已保存');
    } catch (error) {
      console.warn('[Fiction] 保存草稿失败：', error);
      showToast('保存失败，请再试一次');
    } finally {
      setBusy(false);
    }
  };

  const handleNext = async () => {
    if (busy || loading) return;

    const message = validateWizardStep(step, form);

    if (message) {
      showToast(message);
      return;
    }

    if (step < WIZARD_STEP_COUNT - 1) {
      setStep(step + 1);
      return;
    }

    setBusy(true);

    try {
      await saveWizardForm({ saveId, form, step, finish: true });
      onExit?.({ created: true, message: '存档已创建' });
    } catch (error) {
      if (error && typeof error.step === 'number') {
        setStep(error.step);
        showToast(error.message);
      } else {
        console.warn('[Fiction] 创建存档失败：', error);
        showToast('创建失败，请再试一次');
      }

      setBusy(false);
    }
  };

  const handleBack = () => {
    if (busy) return;

    if (loading || !dirty) {
      onExit?.({});
      return;
    }

    setLeaveOpen(true);
  };

  const handleSaveAndLeave = async () => {
    if (busy) return;

    setBusy(true);

    try {
      await persistDraft();
      onExit?.({ message: '草稿已保存' });
    } catch (error) {
      console.warn('[Fiction] 保存草稿失败：', error);
      setLeaveOpen(false);
      showToast('保存失败，请再试一次');
      setBusy(false);
    }
  };

  const current = WIZARD_STEPS[step];
  const isLast = step === WIZARD_STEP_COUNT - 1;
  const nextLabel = isLast ? '完成 · 创建存档' : `下一步 · ${WIZARD_STEPS[step + 1].zh}`;

  const renderStep = () => {
    if (step === 0) {
      return <WizardStepPremise form={form} onChange={patchForm} onToast={showToast} />;
    }

    return <StepPlaceholder zh={current.zh} />;
  };

  return (
    <div className="fic-col fic-w">
      <button
        type="button"
        className="fic-btn-reset fic-round-btn fic-back"
        aria-label="退出新建"
        onClick={handleBack}
      >
        <ArrowLeft size={18} strokeWidth={1.6} aria-hidden="true" />
      </button>

      <div className="fic-scroll fic-w-scroll" ref={scrollRef}>
        <div className="fic-vol-row">
          <span className="fic-vol">STEP {step + 1} / {WIZARD_STEP_COUNT}</span>
        </div>

        <header className="fic-head">
          <div className="fic-eyebrow">{current.kicker}</div>
          <h1 className="fic-title">{current.en}</h1>
          <div className="fic-title-zh">{current.zh}</div>
        </header>

        <div className="fic-w-progress" aria-hidden="true">
          {WIZARD_STEPS.map((item, index) => (
            <span key={item.id} className={`fic-w-seg ${index <= step ? 'is-on' : ''}`} />
          ))}
        </div>
        <div className="fic-w-progress-label">新建 {step + 1}/{WIZARD_STEP_COUNT} · {current.zh}</div>

        {loading ? <div className="fic-w-loading">正在读取草稿…</div> : renderStep()}
      </div>

      <div className="fic-foot">
        <div className="fic-w-foot-inner">
          <button
            type="button"
            className="fic-btn-reset fic-w-next"
            disabled={busy || loading}
            onClick={handleNext}
          >
            {busy ? '正在保存' : nextLabel}
          </button>
          <div className="fic-w-sub-row">
            {step > 0 && (
              <button
                type="button"
                className="fic-btn-reset fic-w-sub-btn"
                disabled={busy || loading}
                onClick={() => setStep(step - 1)}
              >
                上一步
              </button>
            )}
            <button
              type="button"
              className="fic-btn-reset fic-w-sub-btn"
              disabled={busy || loading}
              onClick={handleSaveDraft}
            >
              保存为草稿
            </button>
          </div>
        </div>
      </div>

      {leaveOpen && (
        <>
          <button
            type="button"
            className="fic-btn-reset fic-mask"
            aria-label="关闭"
            onClick={() => !busy && setLeaveOpen(false)}
          />
          <div className="fic-sheet" role="dialog" aria-label="退出新建">
            <div className="fic-sheet-grab" />
            <div className="fic-sheet-name">要退出新建吗？</div>
            <div className="fic-sheet-meta">已填写的内容还没有保存</div>
            <div className="fic-sheet-actions">
              <button
                type="button"
                className="fic-btn-reset fic-sheet-btn"
                disabled={busy}
                onClick={handleSaveAndLeave}
              >
                {busy ? '正在保存' : '保存草稿并退出'}
              </button>
              <button
                type="button"
                className="fic-btn-reset fic-sheet-btn is-danger"
                disabled={busy}
                onClick={() => onExit?.({})}
              >
                不保存，直接退出
              </button>
              <button
                type="button"
                className="fic-btn-reset fic-sheet-btn"
                disabled={busy}
                onClick={() => setLeaveOpen(false)}
              >
                继续编辑
              </button>
            </div>
          </div>
        </>
      )}

      {toast && <div className="fic-toast fic-w-toast" role="status">{toast}</div>}
    </div>
  );
};

export default FictionWizard;