// src/apps/imagestudio/imageGenNotify.js
//
// 生图完成后的提醒：应用内 toast + 提示音 + （页面不在前台时的）系统通知。
// 开关存在 localStorage（跟 soundService 的偏好同一种做法），默认全开。
// 提示音复用 soundService 的合成音色，不依赖外部音频文件。

import { triggerGlobalToast } from '../../components/NotificationToast';
import soundService from '../../services/soundService';

const KEY_NOTIFY = 'imagestudio_notify_enabled';
const KEY_SOUND = 'imagestudio_sound_enabled';
const KEY_PRESET = 'imagestudio_sound_preset';

const readBool = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? true : raw === 'true';
  } catch {
    return true;
  }
};

const writeValue = (key, value) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // 隐私模式等写不进去时忽略，本次会话内仍按默认值工作。
  }
};

export const getNotifySettings = () => ({
  notify: readBool(KEY_NOTIFY),
  sound: readBool(KEY_SOUND),
  preset: (() => {
    try {
      return localStorage.getItem(KEY_PRESET) || 'dewdrop';
    } catch {
      return 'dewdrop';
    }
  })(),
});

export const setNotifyEnabled = (enabled) => writeValue(KEY_NOTIFY, Boolean(enabled));
export const setSoundEnabled = (enabled) => writeValue(KEY_SOUND, Boolean(enabled));
export const setSoundPreset = (presetId) => writeValue(KEY_PRESET, presetId);

export const SOUND_PRESETS = [
  { id: 'dewdrop', label: '晨露水滴' },
  { id: 'crystal', label: '水晶风铃' },
  { id: 'soft_chime', label: '柔和双音' },
  { id: 'pulse', label: '微光脉冲' },
];

export const canSystemNotify = () => typeof window !== 'undefined' && 'Notification' in window;

/** 在用户点击时调用（浏览器要求权限请求必须由手势触发）。 */
export const ensureNotifyPermission = async () => {
  if (!canSystemNotify()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;

  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
};

export const previewSound = (presetId) => {
  try {
    soundService.playSynthesizedTone(presetId || getNotifySettings().preset, soundService.getVolume());
  } catch (error) {
    console.warn('[ImageStudio] 试听提示音失败：', error);
  }
};

const showSystemNotification = (title, body) => {
  if (!canSystemNotify() || Notification.permission !== 'granted') return;
  // 人正在看着页面时，应用内 toast 已经够了，不再重复弹系统通知。
  if (typeof document !== 'undefined' && document.visibilityState === 'visible') return;

  try {
    new Notification(title, {
      body,
      tag: 'when-i-with-u-imagestudio',
      renotify: true,
    });
  } catch (error) {
    console.warn('[ImageStudio] 系统通知失败：', error);
  }
};

const preview = (text, max = 28) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
};

/** 生图成功后调用。 */
export const notifyGenerationDone = ({ sceneText = '', saved = true } = {}) => {
  const settings = getNotifySettings();

  if (settings.notify) {
    const content = preview(sceneText) || (saved ? '已存进画廊' : '图已生成');
    triggerGlobalToast({ title: '生图完成', content, iconType: 'bell', duration: 4500 });
    showSystemNotification('生图完成', content);
  }

  if (settings.sound) previewSound(settings.preset);
};

/** 生图失败后调用（只弹提示，不响铃，免得把失败也当成喜讯）。 */
export const notifyGenerationFailed = ({ message = '' } = {}) => {
  const settings = getNotifySettings();
  if (!settings.notify) return;

  const content = preview(message, 40) || '请回到生图室查看原因';
  triggerGlobalToast({ title: '生图失败', content, iconType: 'bell', duration: 5000 });
  showSystemNotification('生图失败', content);
};