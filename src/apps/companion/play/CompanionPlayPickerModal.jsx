/**
 * CompanionPlayPickerModal.jsx
 *
 * dock 上「小游戏」按钮点开后的选择弹窗：接住掉落物 / 小伙伴弹珠，
 * 选一个之后把对应的游戏模态框交给 CompanionPage.jsx 去开。
 * 这个文件本身不含任何游戏逻辑，纯粹是个两选一的入口。
 *
 * Props:
 *   onPickCatch   function — 选了「接住掉落物」
 *   onPickMarbles function — 选了「小伙伴弹珠」
 *   onClose       function — 关闭选择弹窗（不进任何游戏）
 */

import React from 'react';
import './playPicker.css';
import CompanionGameIcon from './CompanionGameIcon';

const MarblesIcon = () => (
  <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true" focusable="false">
    <circle cx="11" cy="13" r="6.5" fill="#FF8FA6" opacity="0.92" />
    <circle cx="20" cy="11" r="5.5" fill="#6CBDF2" opacity="0.92" />
    <circle cx="19" cy="21" r="6" fill="#B398F5" opacity="0.92" />
    <circle cx="9" cy="12" r="2" fill="#fff" opacity="0.6" />
    <circle cx="18.3" cy="9.3" r="1.7" fill="#fff" opacity="0.6" />
    <circle cx="17" cy="19" r="1.9" fill="#fff" opacity="0.6" />
  </svg>
);

const CompanionPlayPickerModal = ({ onPickCatch, onPickMarbles, onClose }) => (
  <div className="cp-overlay center">
    <div className="cp-backdrop" onClick={onClose} />
    <div className="cp-panel pp-card">
      <h4>玩点什么呢？</h4>
      <div className="pp-options">
        <button type="button" className="pp-option" onClick={onPickCatch}>
          <span className="pp-option-ico"><CompanionGameIcon size={30} /></span>
          <span className="pp-option-text">
            <b>接住掉落物</b>
            <small>限时接零食，躲开捣乱的石头</small>
          </span>
        </button>
        <button type="button" className="pp-option" onClick={onPickMarbles}>
          <span className="pp-option-ico"><MarblesIcon /></span>
          <span className="pp-option-text">
            <b>小伙伴弹珠</b>
            <small>三关祖玛式弹珠，消除同色珠子过关</small>
          </span>
        </button>
      </div>
      <button type="button" className="pp-close" onClick={onClose}>先不玩了</button>
    </div>
  </div>
);

export default CompanionPlayPickerModal;