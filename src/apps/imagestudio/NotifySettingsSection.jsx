// src/apps/imagestudio/NotifySettingsSection.jsx
//
// 设置弹窗顶部的「完成提醒」：通知开关、提示音开关、音色选择 + 试听。
// 偏好存在 localStorage（见 imageGenNotify.js），改完立刻生效。

import React, { useState } from 'react';

import {
  SOUND_PRESETS,
  canSystemNotify,
  ensureNotifyPermission,
  getNotifySettings,
  previewSound,
  setNotifyEnabled,
  setSoundEnabled,
  setSoundPreset,
} from './imageGenNotify';
import { Field, SectionCard, SelectInput, ToggleRow } from './StudioFormParts';

const NotifySettingsSection = () => {
  const [settings, setSettings] = useState(getNotifySettings);
  const [permissionNote, setPermissionNote] = useState('');

  const handleNotify = async (enabled) => {
    setNotifyEnabled(enabled);
    setSettings(getNotifySettings());
    setPermissionNote('');

    if (!enabled) return;

    const result = await ensureNotifyPermission();
    if (result === 'denied') {
      setPermissionNote('系统通知权限被拒绝了，只会有应用内提示；可以在浏览器/系统设置里重新允许。');
    } else if (result === 'unsupported') {
      setPermissionNote('当前环境不支持系统通知，只会有应用内提示。iOS 需要先添加到主屏幕再打开。');
    }
  };

  const handleSound = (enabled) => {
    setSoundEnabled(enabled);
    setSettings(getNotifySettings());
    if (enabled) previewSound(settings.preset);
  };

  const handlePreset = (presetId) => {
    setSoundPreset(presetId);
    setSettings(getNotifySettings());
    previewSound(presetId);
  };

  return (
    <SectionCard title="完成提醒" subtitle="生成在后台完成时，用提示和声音告诉你。">
      <ToggleRow
        label="生成完成后通知我"
        hint={
          canSystemNotify()
            ? '应用内弹出提示；离开页面时再发系统通知'
            : '应用内弹出提示（当前环境不支持系统通知）'
        }
        checked={settings.notify}
        onChange={handleNotify}
      />
      {permissionNote ? <p className="text-[10px] leading-relaxed text-amber-500">{permissionNote}</p> : null}

      <ToggleRow
        label="提示音"
        hint="与伴侣消息提示音分开设置"
        checked={settings.sound}
        onChange={handleSound}
      />

      {settings.sound ? (
        <Field label="音色（选中即试听）">
          <SelectInput
            value={settings.preset}
            onChange={handlePreset}
            options={SOUND_PRESETS.map((item) => ({ value: item.id, label: item.label }))}
          />
        </Field>
      ) : null}
    </SectionCard>
  );
};

export default NotifySettingsSection;