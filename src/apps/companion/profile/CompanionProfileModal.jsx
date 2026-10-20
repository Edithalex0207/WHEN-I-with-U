/*
 * CompanionProfileModal.jsx —— 设置小伙伴的「物种」和「性格」。
 *
 * 两项都是自由文本，可以留空。这是给以后"跟小伙伴直接聊天接 AI"做的
 * 准备，目前只负责存，不影响收藏卡、日记等已有内容的文字（见
 * companionProfileService.js 文件头）。
 *
 * 【提示】
 *   - 弹窗里一直有一行说明文字（PROFILE_SCOPE_NOTE）；
 *   - 第一次打开时，再额外弹一个小提示窗说同样的话，点"知道啦"之后记在
 *     companion.profileTipSeen，之后不再自动弹。
 *
 * 外层弹窗壳沿用项目里其它 companion 弹窗的 .cp-overlay / .cp-backdrop /
 * .cp-panel.bottom 约定（照抄 CompanionMoodCalendar.jsx 的结构）。
 *
 * Props:
 *   companion  object    —— 当前小伙伴（用 id / species / personality / profileTipSeen）
 *   onSaved    function  —— 保存成功（或记下"已看过提示"）后调用，参数是更新后的 companion
 *   onClose    function  —— 关闭弹窗
 */

import React, { useState } from 'react';

import {
  PROFILE_LIMITS,
  markCompanionProfileTipSeen,
  updateCompanionProfile,
} from './companionProfileService';
import './companionProfile.css';

export const PROFILE_SCOPE_NOTE = '小伙伴的物种和性格只影响之后与小伙伴的对话，不会影响收藏卡等内容的文字。';

const CompanionProfileModal = ({ companion, onSaved, onClose }) => {
  const [species, setSpecies] = useState(companion.species || '');
  const [personality, setPersonality] = useState(companion.personality || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showTip, setShowTip] = useState(!companion.profileTipSeen);

  const handleCloseTip = async () => {
    setShowTip(false);
    try {
      const updated = await markCompanionProfileTipSeen(companion.id);
      if (updated) onSaved?.(updated);
    } catch (err) {
      // 没记住"已看过"不影响使用，下次打开再提示一次就是了
      console.warn('[companion] 记录设置提示已读失败', err);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      const updated = await updateCompanionProfile(companion.id, { species, personality });
      onSaved?.(updated);
      onClose();
    } catch (err) {
      setError(err?.message || '保存失败，再试一次吧');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="cp-overlay">
      <div className="cp-backdrop" onClick={onClose} />

      <div className="cp-panel bottom">
        <i className="cp-handle" />

        <h3 className="cp-panel-title">
          <span>{companion.name}的档案</span>
        </h3>

        <div className="cp-panel-scroll cpf-body">
          <p className="cpf-note">{PROFILE_SCOPE_NOTE}</p>

          <div className="cpf-field">
            <label htmlFor="cpf-species">物种</label>
            <div className="cpf-input-wrap">
              <input
                id="cpf-species"
                type="text"
                value={species}
                maxLength={PROFILE_LIMITS.species}
                placeholder="比如：小狐狸、云朵猫、会说话的向日葵"
                onChange={(event) => setSpecies(event.target.value.slice(0, PROFILE_LIMITS.species))}
              />
              <small>{species.length}/{PROFILE_LIMITS.species}</small>
            </div>
          </div>

          <div className="cpf-field">
            <label htmlFor="cpf-personality">性格</label>
            <div className="cpf-input-wrap">
              <textarea
                id="cpf-personality"
                rows={4}
                value={personality}
                maxLength={PROFILE_LIMITS.personality}
                placeholder="比如：有点害羞，爱撒娇，嘴硬心软，一高兴就转圈"
                onChange={(event) => setPersonality(event.target.value.slice(0, PROFILE_LIMITS.personality))}
              />
              <small>{personality.length}/{PROFILE_LIMITS.personality}</small>
            </div>
          </div>

          {error && <p className="cp-err">{error}</p>}
        </div>

        <div className="cp-btn-row cpf-actions">
          <button type="button" className="cp-btn" onClick={onClose}>取消</button>
          <button type="button" className="cp-btn main" onClick={handleSave} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>

      {showTip && (
        <div className="cp-overlay center cpf-tip-layer">
          <div className="cp-backdrop" onClick={handleCloseTip} />
          <div className="cp-panel cpf-tip" role="dialog" aria-label="温馨提示">
            <h4>先说一件事</h4>
            <p>{PROFILE_SCOPE_NOTE}</p>
            <button type="button" className="cp-btn main" onClick={handleCloseTip}>知道啦</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanionProfileModal;