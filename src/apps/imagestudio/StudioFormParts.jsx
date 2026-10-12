// src/apps/imagestudio/StudioFormParts.jsx
//
// 生图室各个面板共用的小表单组件：分区卡片、带标签的字段、文本框、下拉、
// 数字框、开关行。样式全部走全局主题变量（--card-bg / --bg-surface 等），
// 跟着用户选的主题变色。
//
// 文本类输入框遵循项目里"输入时只改本地状态，失焦时才存库"的惯例：
// 这里的组件本身不管存库，只把 onChange / onBlur 抛给调用方。

import React, { useEffect, useState } from 'react';

const INPUT_STYLE = {
  backgroundColor: 'var(--bg-surface)',
  borderColor: 'var(--card-border)',
  color: 'var(--text-main)',
};

const INPUT_CLASS = 'w-full p-2 rounded-xl text-xs border outline-none';

export const SectionCard = ({ title, subtitle, dimmed = false, children }) => (
  <section
    className="space-y-3 rounded-[26px] border p-4 shadow-md"
    style={{
      backgroundColor: 'color-mix(in srgb, var(--card-bg) 62%, transparent)',
      backdropFilter: 'blur(18px) saturate(1.3)',
      WebkitBackdropFilter: 'blur(18px) saturate(1.3)',
      borderColor: 'var(--card-border)',
      color: 'var(--text-main)',
      opacity: dimmed ? 0.65 : 1,
    }}
  >
    {title ? (
      <div>
        <h3 className="font-serif text-[15px] font-semibold tracking-wide">{title}</h3>
        {subtitle ? (
          <p className="mt-0.5 text-[10px] leading-relaxed opacity-60">{subtitle}</p>
        ) : null}
      </div>
    ) : null}
    {children}
  </section>
);

/** 杂志式章节标题：编号 + 衬线标题 + 右侧小注。 */
export const StudioSectionHead = ({ no, title, note }) => (
  <div className="mb-3 flex items-baseline gap-2.5">
    {no ? (
      <span className="text-[10px] uppercase tracking-[0.18em] opacity-50">{no}</span>
    ) : null}
    <h2 className="font-serif text-[15px] font-semibold">{title}</h2>
    {note ? (
      <span className="ml-auto text-[9px] uppercase tracking-[0.14em] opacity-50">{note}</span>
    ) : null}
  </div>
);

export const Field = ({ label, hint, children }) => (
  <div className="space-y-1">
    {label ? <span className="block text-[11px] opacity-70">{label}</span> : null}
    {children}
    {hint ? (
      <span className="block text-[10px] leading-relaxed opacity-50">{hint}</span>
    ) : null}
  </div>
);

export const TextInput = ({
  value,
  onChange,
  onBlur,
  placeholder,
  type = 'text',
  list,
}) => (
  <input
    type={type}
    value={value}
    list={list}
    placeholder={placeholder}
    autoComplete="off"
    autoCapitalize="off"
    spellCheck={false}
    onChange={(event) => onChange(event.target.value)}
    onBlur={onBlur}
    className={INPUT_CLASS}
    style={INPUT_STYLE}
  />
);

export const TextArea = ({ value, onChange, onBlur, placeholder, rows = 3 }) => (
  <textarea
    value={value}
    rows={rows}
    placeholder={placeholder}
    spellCheck={false}
    onChange={(event) => onChange(event.target.value)}
    onBlur={onBlur}
    className={`${INPUT_CLASS} resize-y leading-relaxed`}
    style={INPUT_STYLE}
  />
);

export const SelectInput = ({ value, onChange, options }) => (
  <select
    value={value}
    onChange={(event) => onChange(event.target.value)}
    className={INPUT_CLASS}
    style={INPUT_STYLE}
  >
    {options.map((option) => (
      <option key={String(option.value)} value={option.value}>
        {option.label}
      </option>
    ))}
  </select>
);

/**
 * 数字输入框：输入过程中保留用户敲的原样字符串，失焦时才解析、限幅、
 * 再通过 onCommit 抛出数字；解析失败就还原成原值。
 */
export const NumberField = ({ value, onCommit, min, max, integer = false }) => {
  const [draft, setDraft] = useState(String(value ?? ''));

  useEffect(() => {
    setDraft(String(value ?? ''));
  }, [value]);

  const commit = () => {
    const parsed = Number(draft);

    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      setDraft(String(value ?? ''));
      return;
    }

    let next = integer ? Math.round(parsed) : parsed;
    if (typeof min === 'number') next = Math.max(min, next);
    if (typeof max === 'number') next = Math.min(max, next);

    setDraft(String(next));
    if (next !== value) onCommit(next);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      className={INPUT_CLASS}
      style={INPUT_STYLE}
    />
  );
};

export const ToggleRow = ({ label, hint, checked, onChange }) => (
  <div className="flex items-start justify-between gap-3">
    <div className="space-y-0.5">
      <span className="block text-[11px] opacity-80">{label}</span>
      {hint ? (
        <span className="block text-[10px] leading-relaxed opacity-50">{hint}</span>
      ) : null}
    </div>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full border transition-colors"
      style={{
        backgroundColor: checked ? 'var(--accent-color)' : 'var(--control-soft-bg)',
        borderColor: 'var(--card-border)',
      }}
    >
      <span
        className="absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all"
        style={{
          left: checked ? '1.15rem' : '0.15rem',
          backgroundColor: checked ? 'var(--accent-foreground)' : 'var(--text-main)',
          opacity: checked ? 1 : 0.5,
        }}
      />
    </button>
  </div>
);

export const SegmentedButtons = ({ value, onChange, options }) => (
  <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
    {options.map((option) => {
      const active = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className="rounded-xl border px-2 py-2 text-xs font-semibold transition-all"
          style={{
            backgroundColor: active ? 'var(--accent-color)' : 'var(--bg-surface)',
            color: active ? 'var(--accent-foreground)' : 'var(--text-main)',
            borderColor: 'var(--card-border)',
          }}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);