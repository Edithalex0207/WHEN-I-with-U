// src/apps/fiction/fictionWizardService.js
//
// 新建向导的数据层：默认表单、文风预设、校验、草稿的读写。
// 草稿就是 fictionSaves 里一条 isDraft: true 的记录，草稿和正式存档用同一张表，
// 向导里填的字段名和存档字段名一一对应，保存时不用转换。
//
// 第二批（第 2、3 步）会在这里补：主角色必填的校验、角色副本的生成。

import {
  FICTION_IMAGE_MODES,
  FICTION_MODES,
  createSave,
  getSave,
  updateSave,
} from './fictionService';

export const WIZARD_STEP_COUNT = 3;
export const DRAFT_FALLBACK_TITLE = '未命名草稿';
export const STYLE_CUSTOM_MAX = 4000;
export const TEXT_FIELD_MAX = 4000;

export const WIZARD_STEPS = [
  { id: 'premise', kicker: 'New Story', en: 'Premise', zh: '故事基础' },
  { id: 'cast', kicker: 'Dramatis Personae', en: 'Cast', zh: '角色编排' },
  { id: 'rules', kicker: 'House Rules', en: 'Rules', zh: '规则与数值' },
];

// prompt 是写给 AI 的文风描述，第 3 轮组装提示词时直接用。
export const FICTION_STYLE_PRESETS = [
  {
    id: 'light-novel',
    label: '轻小说',
    prompt: '轻小说风格：节奏明快，对白较多，穿插吐槽和内心独白，句子偏短、画面感强，情绪表达直接。',
  },
  {
    id: 'ancient',
    label: '古风',
    prompt: '古风白话：用词典雅，意境为先，多用白描和简练的短句，避免现代口语和网络用语。',
  },
  {
    id: 'suspense',
    label: '悬疑冷峻',
    prompt: '悬疑冷峻：叙述克制冷静，以细节取胜，多写环境和线索，不直接点破真相，情绪压在文字之下。',
  },
  {
    id: 'healing',
    label: '日常治愈',
    prompt: '日常治愈：温和细腻，聚焦生活小事和人物之间的细微情感，节奏舒缓，结尾留有暖意。',
  },
];

export const getStylePreset = (presetId) => (
  FICTION_STYLE_PRESETS.find((preset) => preset.id === presetId) || null
);

export const buildDefaultWizardForm = () => ({
  title: '',
  mode: FICTION_MODES.CHOICE,
  background: '',
  outline: '',
  style: { presetId: '', custom: '' },
  persona: { name: '', avatar: '', identity: '', extra: '' },
  mainCharacter: null,
  importedCharacters: [],
  npcs: [],
  worldBookIds: [],
  localEntries: [],
  wordMin: 2000,
  optionMin: 3,
  allowFreeInput: true,
  showDeltas: false,
  stats: [],
  imageMode: FICTION_IMAGE_MODES.OFF,
});

const str = (value) => String(value ?? '').trim();

const clampInt = (value, min, max, fallback) => {
  const number = Math.round(Number(value));

  if (!Number.isFinite(number)) return fallback;

  return Math.min(max, Math.max(min, number));
};

const asArray = (value) => (Array.isArray(value) ? value : []);

// 把向导表单整理成可以写进 fictionSaves 的字段，所有字段都在这里兜底。
const pickFormFields = (form) => {
  const persona = form.persona || {};
  const personaClean = {
    name: str(persona.name),
    avatar: typeof persona.avatar === 'string' ? persona.avatar : '',
    identity: str(persona.identity),
    extra: str(persona.extra),
  };
  const personaEmpty = !personaClean.name
    && !personaClean.avatar
    && !personaClean.identity
    && !personaClean.extra;

  const style = form.style || {};
  const presetId = getStylePreset(style.presetId) ? style.presetId : '';

  return {
    title: str(form.title),
    mode: form.mode === FICTION_MODES.NOVEL ? FICTION_MODES.NOVEL : FICTION_MODES.CHOICE,
    background: str(form.background),
    outline: str(form.outline),
    style: { presetId, custom: str(style.custom) },
    persona: personaEmpty ? null : personaClean,
    mainCharacter: form.mainCharacter || null,
    importedCharacters: asArray(form.importedCharacters),
    npcs: asArray(form.npcs),
    worldBookIds: asArray(form.worldBookIds),
    localEntries: asArray(form.localEntries),
    wordMin: clampInt(form.wordMin, 500, 4000, 2000),
    optionMin: clampInt(form.optionMin, 2, 6, 3),
    allowFreeInput: form.allowFreeInput !== false,
    showDeltas: Boolean(form.showDeltas),
    stats: asArray(form.stats),
    imageMode: Object.values(FICTION_IMAGE_MODES).includes(form.imageMode)
      ? form.imageMode
      : FICTION_IMAGE_MODES.OFF,
  };
};

// 返回错误提示文字；空字符串表示通过。
export const validateWizardStep = (stepIndex, form) => {
  if (stepIndex === 0) {
    if (!str(form.title)) return '先给存档起个名字';
    if (!str(form.background)) return '背景是必填的，写几句就行';
  }

  // 第二批：stepIndex === 1 时检查主角色是否已设置。

  return '';
};

// 打开草稿：把存档记录还原成向导表单。
export const loadWizardForm = async (saveId) => {
  const save = await getSave(saveId);

  if (!save) return null;

  const base = buildDefaultWizardForm();
  const form = { ...base };

  Object.keys(base).forEach((key) => {
    if (save[key] !== undefined && save[key] !== null) form[key] = save[key];
  });

  form.style = { ...base.style, ...(save.style || {}) };
  form.persona = { ...base.persona, ...(save.persona || {}) };

  if (form.title === DRAFT_FALLBACK_TITLE) form.title = '';

  return {
    form,
    step: Number(save.draftStep) || 0,
    isDraft: Boolean(save.isDraft),
  };
};

// 保存草稿（finish = false）或正式创建（finish = true），返回存档 id。
// 正式创建时会把三步的校验全跑一遍，失败时抛出带 step 字段的错误，
// 让向导跳回出问题的那一步。
export const saveWizardForm = async ({
  saveId = null,
  form,
  step = 0,
  finish = false,
}) => {
  if (finish) {
    for (let index = 0; index < WIZARD_STEP_COUNT; index += 1) {
      const message = validateWizardStep(index, form);

      if (message) {
        const error = new Error(message);

        error.step = index;
        throw error;
      }
    }
  }

  const fields = pickFormFields(form);
  const patch = {
    ...fields,
    title: fields.title || DRAFT_FALLBACK_TITLE,
    isDraft: !finish,
    draftStep: finish ? 0 : step,
  };

  if (saveId) {
    await updateSave(saveId, patch);
    return saveId;
  }

  return createSave(patch);
};

export default {
  WIZARD_STEPS,
  WIZARD_STEP_COUNT,
  FICTION_STYLE_PRESETS,
  getStylePreset,
  buildDefaultWizardForm,
  validateWizardStep,
  loadWizardForm,
  saveWizardForm,
};