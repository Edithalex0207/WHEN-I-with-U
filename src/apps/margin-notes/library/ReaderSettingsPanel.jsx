// src/apps/margin-notes/library/ReaderSettingsPanel.jsx
//
// 阅读页的「Aa」设置面板，两页：
//   排版：字号（七档）、行距、页边距、主题、对齐方式
//   字体与辅助：六种字体、段落聚焦、字距加宽、词首加粗
// 设置改动即时作用在后面的正文上；所有书共用一份设置。
// 设计稿里的「左右翻页」开关和「页边注」开关这一刀先不放，留到对应功能做好以后再加。

import React, { useState } from 'react';

import {
  ALIGN_OPTIONS,
  FONT_LEVELS,
  LINE_HEIGHT_OPTIONS,
  MARGIN_OPTIONS,
  READER_FONTS,
  READER_THEMES,
} from './readerTheme';

function Segmented({ options, value, onPick, label }) {
  return (
    <div className="mn-rd-seg" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={value === option.id}
          className={`mn-rd-seg__item${value === option.id ? ' is-active' : ''}`}
          onClick={() => onPick(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ToggleRow({ label, sub, on, onToggle }) {
  return (
    <div className="mn-rd-toggle">
      <div className="mn-rd-toggle__text">
        <span className="mn-rd-toggle__label">{label}</span>
        <span className="mn-rd-toggle__sub">{sub}</span>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        className={`mn-rd-switch${on ? ' is-on' : ''}`}
        onClick={onToggle}
      >
        <span className="mn-rd-switch__knob" />
      </button>
    </div>
  );
}

export default function ReaderSettingsPanel({ settings, onChange, onClose }) {
  const [tab, setTab] = useState('type');

  const level = settings.level;

  return (
    <div className="mn-rd-panel" role="dialog" aria-label="阅读设置">
      <div className="mn-rd-panel__top">
        <div className="mn-rd-panel__head">
          <span className="mn-rd-panel__title">阅读设置</span>
          <button
            type="button"
            className="mn-rd-panel__done"
            onClick={onClose}
          >
            完成
          </button>
        </div>

        <Segmented
          label="设置分页"
          options={[
            { id: 'type', label: '排版' },
            { id: 'assist', label: '字体与辅助' },
          ]}
          value={tab}
          onPick={setTab}
        />
      </div>

      <div className="mn-rd-panel__body">
        {tab === 'type' ? (
          <div className="mn-rd-panel__stack">
            <div className="mn-rd-size">
              <span className="mn-rd-size__label">字号</span>
              <button
                type="button"
                className="mn-rd-size__step mn-rd-size__step--small"
                aria-label="减小字号"
                disabled={level <= 0}
                onClick={() => onChange({ level: Math.max(0, level - 1) })}
              >
                A
              </button>
              <div className="mn-rd-size__ticks">
                {FONT_LEVELS.map((px, index) => (
                  <button
                    key={px}
                    type="button"
                    className="mn-rd-size__tick"
                    aria-label={`${px} 号`}
                    aria-pressed={index === level}
                    onClick={() => onChange({ level: index })}
                  >
                    <span
                      className={index === level ? 'is-active' : ''}
                      style={{ height: 8 + index * 3 }}
                    />
                  </button>
                ))}
              </div>
              <button
                type="button"
                className="mn-rd-size__step mn-rd-size__step--large"
                aria-label="增大字号"
                disabled={level >= FONT_LEVELS.length - 1}
                onClick={() =>
                  onChange({ level: Math.min(FONT_LEVELS.length - 1, level + 1) })
                }
              >
                A
              </button>
              <span className="mn-rd-size__value">{FONT_LEVELS[level]}</span>
            </div>

            <div className="mn-rd-pair">
              <div className="mn-rd-field">
                <span className="mn-rd-field__label">行距</span>
                <Segmented
                  label="行距"
                  options={LINE_HEIGHT_OPTIONS}
                  value={settings.lh}
                  onPick={(id) => onChange({ lh: id })}
                />
              </div>
              <div className="mn-rd-field">
                <span className="mn-rd-field__label">页边距</span>
                <Segmented
                  label="页边距"
                  options={MARGIN_OPTIONS}
                  value={settings.mg}
                  onPick={(id) => onChange({ mg: id })}
                />
              </div>
            </div>

            <div className="mn-rd-field">
              <span className="mn-rd-field__label">主题</span>
              <div className="mn-rd-themes">
                {Object.keys(READER_THEMES).map((id) => {
                  const theme = READER_THEMES[id];
                  const active = settings.theme === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className="mn-rd-theme"
                      aria-pressed={active}
                      onClick={() => onChange({ theme: id })}
                    >
                      <span
                        className="mn-rd-theme__swatch"
                        style={{
                          background: theme.bg,
                          color: theme.fg,
                          borderColor: active
                            ? 'var(--rd-accent)'
                            : 'var(--rd-line)',
                        }}
                      >
                        Aa
                      </span>
                      <span
                        className={`mn-rd-theme__label${active ? ' is-active' : ''}`}
                      >
                        {theme.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mn-rd-field">
              <span className="mn-rd-field__label">对齐</span>
              <Segmented
                label="对齐方式"
                options={ALIGN_OPTIONS}
                value={settings.align}
                onPick={(id) => onChange({ align: id })}
              />
            </div>
          </div>
        ) : (
          <div className="mn-rd-panel__stack">
            <div className="mn-rd-field">
              <span className="mn-rd-field__label">字体</span>
              <div className="mn-rd-fonts">
                {Object.keys(READER_FONTS).map((id) => {
                  const font = READER_FONTS[id];
                  const active = settings.font === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`mn-rd-font${active ? ' is-active' : ''}`}
                      aria-pressed={active}
                      onClick={() => onChange({ font: id })}
                    >
                      <span
                        className="mn-rd-font__sample"
                        style={{ fontFamily: font.stack }}
                      >
                        {font.sample}
                      </span>
                      <span className="mn-rd-font__label">{font.label}</span>
                    </button>
                  );
                })}
              </div>
              <span className="mn-rd-field__hint">
                Lexend 为减少字母拥挤设计，Atkinson 为区分易混字符设计。目前没有确凿研究证明它们能提高阅读速度，适合自己试哪个更顺眼。
              </span>
            </div>

            <div className="mn-rd-toggles">
              <ToggleRow
                label="段落聚焦"
                sub="只亮当前一段，其余变淡，用箭头换段"
                on={settings.focus}
                onToggle={() => onChange({ focus: !settings.focus })}
              />
              <ToggleRow
                label="字距加宽"
                sub="加大字距和词距，减少拥挤感"
                on={settings.spacing}
                onToggle={() => onChange({ spacing: !settings.spacing })}
              />
              <ToggleRow
                label="词首加粗"
                sub="只对英文有效。效果尚无定论，请自行试用"
                on={settings.bionic}
                onToggle={() => onChange({ bionic: !settings.bionic })}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}