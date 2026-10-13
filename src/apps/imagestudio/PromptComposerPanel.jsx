// src/apps/imagestudio/PromptComposerPanel.jsx
//
// 生图室「AI拼词」页（主导航第4个标签）。
//   - 用户选一个（可选的）聊天带上角色/用户外貌，写一句大白话想要的画面，
//     选一条（可选的）「给AI预设」指导词，点「开始拼词」。
//   - AI 会读整个画师串库（不管有没有勾"启用"），自己挑合适的搭配，
//     或者判断库里都不合适时另外想一组新的（会存进画师串库），同时把
//     自然语言翻译成场景提示词，最后用跟「展厅」生成时完全一样的口径
//     （固定前缀 / 画师串 / 角色外貌 / 用户外貌 / 场景）拼出最终提示词。
//   - 结果只负责展示 + 一键复制，不会自己去调生图接口——复制去哪里用
//     （这个app的「展厅」页，或者站外的NovelAI网页）由用户自己决定。
//
// 「给AI预设」是单独一个小库（imagePromptPresets，管理视图在这个文件里，
// 跟画师串页一样用 list/edit 视图切换，不做弹窗，手机上也不会被裁掉），
// 跟画师串库是两件事：画师串库存的是"标签"，这里存的是写给AI的"指导词"
// （人设/风格要求），两者都会被喂给AI，但职责不一样。

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Copy, Plus, Sparkles } from 'lucide-react';

import db from '../../db';
import ConfirmModal from '../../components/ConfirmModal';
import { getCharacterAppearance, resolveUserAppearance } from './appearanceService';
import { patchImageGenConfig } from './imageGenConfigService';
import { composeImagePrompt } from './promptComposerAiService';
import {
  createPromptComposerPreset,
  deletePromptComposerPreset,
  getAllPromptComposerPresets,
  updatePromptComposerPreset,
} from './promptComposerPresetService';
import { useImageGenConfig } from './useImageGenConfig';
import { Field, SectionCard, SelectInput, TextArea, TextInput, ToggleRow } from './StudioFormParts';

const NO_CHAT = '';
const EMPTY_PRESET_EDITOR = { id: null, name: '', instruction: '' };

const primaryStyle = { backgroundColor: 'var(--accent-color)', color: 'var(--accent-foreground)' };

const softBoxStyle = { backgroundColor: 'var(--bg-surface)' };

const BackButton = ({ onClick, label }) => (
  <button type="button" onClick={onClick} className="flex items-center gap-1 py-1 text-[11px] opacity-70">
    <ArrowLeft className="h-3.5 w-3.5" /> {label}
  </button>
);

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (error) {
    console.warn('[ImageStudio] 复制失败：', error);
    return false;
  }
};

const CopyBlock = ({ label, text, hint, copiedKey, activeKey, onCopy, muted = false }) => (
  <Field label={label} hint={hint}>
    <p
      className={`break-words rounded-xl border p-2.5 font-mono text-[10.5px] leading-relaxed ${muted ? 'opacity-70' : ''}`}
      style={{ ...softBoxStyle, borderColor: 'var(--card-border)' }}
    >
      {text}
    </p>
    <button
      type="button"
      onClick={() => onCopy(activeKey, text)}
      className="mt-2 flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-[11px] font-semibold"
      style={{ borderColor: 'var(--divider)' }}
    >
      <Copy className="h-3 w-3" /> {copiedKey === activeKey ? '已复制' : '复制'}
    </button>
  </Field>
);

const PromptComposerPanel = () => {
  const config = useImageGenConfig();

  const [view, setView] = useState('compose');
  const [presetSubView, setPresetSubView] = useState('list');
  const [presets, setPresets] = useState([]);
  const [presetEditor, setPresetEditor] = useState(EMPTY_PRESET_EDITOR);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const [characters, setCharacters] = useState([]);
  const [chats, setChats] = useState([]);
  const [chatIdText, setChatIdText] = useState(NO_CHAT);
  const [includeCharacter, setIncludeCharacter] = useState(true);
  const [includeUser, setIncludeUser] = useState(true);

  const [description, setDescription] = useState('');
  const [presetId, setPresetId] = useState('');
  const [presetIdInitialized, setPresetIdInitialized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [result, setResult] = useState(null);
  const [copiedKey, setCopiedKey] = useState('');

  const reloadPresets = useCallback(async () => {
    setPresets(await getAllPromptComposerPresets());
  }, []);

  useEffect(() => {
    void reloadPresets();
  }, [reloadPresets]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [characterList, chatList] = await Promise.all([
          db.characters.toArray(),
          db.chats.toArray(),
        ]);
        if (!cancelled) {
          setCharacters(characterList);
          setChats(chatList);
        }
      } catch (error) {
        console.warn('[ImageStudio] 读取AI拼词页关联数据失败：', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // 配置读完之后套用一次上次用的预设 id，只做这一次，之后由用户自己切换。
  useEffect(() => {
    if (config && !presetIdInitialized) {
      setPresetId(config.promptComposerPresetId || '');
      setPresetIdInitialized(true);
    }
  }, [config, presetIdInitialized]);

  const characterNameById = (id) => characters.find((item) => item.id === id)?.name || '未知角色';

  const chatOptions = useMemo(
    () => [
      { value: NO_CHAT, label: '不关联聊天' },
      ...chats.map((item) => ({
        value: String(item.id),
        label: `${characterNameById(item.characterId)}${item.title ? ` / ${item.title}` : ''} (#${item.id})`,
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chats, characters]
  );

  const presetOptions = useMemo(
    () => [
      { value: '', label: '不用预设（内置通用指导词）' },
      ...presets.map((item) => ({ value: String(item.id), label: item.name })),
    ],
    [presets]
  );

  const selectedChat = chats.find((item) => String(item.id) === chatIdText) || null;
  const characterId = selectedChat ? selectedChat.characterId : null;
  const chatId = selectedChat ? selectedChat.id : null;

  const handlePresetChange = async (value) => {
    setPresetId(value);
    try {
      await patchImageGenConfig({ promptComposerPresetId: value });
    } catch (error) {
      console.warn('[ImageStudio] 记住上次用的AI预设失败：', error);
    }
  };

  const handleCompose = async () => {
    if (!config || !description.trim() || loading) return;

    setLoading(true);
    setErrorText('');
    setResult(null);

    try {
      const [characterAppearance, userAppearance] = await Promise.all([
        includeCharacter && characterId ? getCharacterAppearance(characterId) : '',
        includeUser && chatId ? resolveUserAppearance(chatId) : '',
      ]);

      const activePreset = presets.find((item) => String(item.id) === presetId);

      const outcome = await composeImagePrompt({
        config,
        description,
        personaInstruction: activePreset?.instruction || '',
        characterAppearance,
        userAppearance,
      });

      setResult(outcome);
    } catch (error) {
      console.warn('[ImageStudio] AI拼词失败：', error);
      setErrorText(error?.message || '拼词失败，请重试。');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async (key, text) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      window.setTimeout(() => setCopiedKey((current) => (current === key ? '' : current)), 1500);
    } else {
      setErrorText('复制失败，长按文字手动选取复制吧。');
    }
  };

  const backToPresetList = () => {
    setPresetSubView('list');
    setPresetEditor(EMPTY_PRESET_EDITOR);
    setErrorText('');
  };

  const handleSavePresetEditor = async (event) => {
    event.preventDefault();

    const name = presetEditor.name.trim();
    const instruction = presetEditor.instruction.trim();
    if (!name || !instruction) return;

    try {
      if (presetEditor.id) {
        await updatePromptComposerPreset(presetEditor.id, { name, instruction });
      } else {
        await createPromptComposerPreset({ name, instruction });
      }

      await reloadPresets();
      backToPresetList();
    } catch (error) {
      console.warn('[ImageStudio] 保存AI预设失败：', error);
      setErrorText('保存失败，请重试。');
    }
  };

  const handleDeletePreset = async () => {
    if (!deleteTarget) return;

    try {
      await deletePromptComposerPreset(deleteTarget.id);

      if (String(deleteTarget.id) === presetId) {
        setPresetId('');
        void patchImageGenConfig({ promptComposerPresetId: '' });
      }
    } catch (error) {
      console.warn('[ImageStudio] 删除AI预设失败：', error);
      setErrorText('删除失败，请重试。');
    }

    setDeleteTarget(null);
    await reloadPresets();
  };

  if (!config) {
    return <p className="py-10 text-center text-xs opacity-50">读取中...</p>;
  }

  // ---------- 「给AI预设」管理：新增 / 编辑 ----------
  if (view === 'presets' && presetSubView === 'edit') {
    return (
      <form onSubmit={handleSavePresetEditor} className="space-y-4">
        <BackButton onClick={backToPresetList} label="返回预设列表" />

        <SectionCard title={presetEditor.id ? '编辑AI预设' : '新增AI预设'}>
          <Field label="名称">
            <TextInput
              value={presetEditor.name}
              onChange={(value) => setPresetEditor((prev) => ({ ...prev, name: value }))}
              placeholder="给这条指导词起个名字"
            />
          </Field>

          <Field
            label="指导词"
            hint="写给AI的人设/风格要求，比如：你是一位顶级插画师，擅长写MJ风格的提示词，偏好干净简洁的构图描述。"
          >
            <TextArea
              value={presetEditor.instruction}
              onChange={(value) => setPresetEditor((prev) => ({ ...prev, instruction: value }))}
              placeholder="你是一位……"
              rows={6}
            />
          </Field>

          {errorText ? <p className="text-[11px] text-rose-500">{errorText}</p> : null}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={backToPresetList} className="px-3 py-1.5 text-xs opacity-60">
              取消
            </button>
            <button
              type="submit"
              disabled={!presetEditor.name.trim() || !presetEditor.instruction.trim()}
              className="rounded-full px-5 py-2 text-xs font-semibold disabled:opacity-40"
              style={primaryStyle}
            >
              保存
            </button>
          </div>
        </SectionCard>
      </form>
    );
  }

  // ---------- 「给AI预设」管理：列表 ----------
  if (view === 'presets') {
    return (
      <div className="space-y-4">
        <BackButton onClick={() => setView('compose')} label="返回AI拼词" />

        <SectionCard
          title="给AI预设"
          subtitle="写给AI的指导词（人设/风格偏好），拼词时选一条用，也可以不选——不选就走内置的通用指导词。"
        >
          <button
            type="button"
            onClick={() => {
              setPresetEditor(EMPTY_PRESET_EDITOR);
              setPresetSubView('edit');
            }}
            className="flex items-center gap-1 rounded-full border px-4 py-2 text-xs font-semibold"
            style={{ borderColor: 'var(--divider)' }}
          >
            <Plus className="h-3.5 w-3.5" /> 新增预设
          </button>

          {errorText ? <p className="text-[11px] text-rose-500">{errorText}</p> : null}
        </SectionCard>

        {presets.length === 0 ? (
          <div
            className="rounded-3xl border py-14 text-center text-xs leading-relaxed opacity-60"
            style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
          >
            还没有AI预设
            <br />
            点上面的「新增」存一条，或者先不用预设直接拼词
          </div>
        ) : null}

        <div className="space-y-4">
          {presets.map((preset) => (
            <article
              key={preset.id}
              className="space-y-2.5 rounded-3xl border p-4"
              style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
            >
              <h3 className="break-words font-serif text-base font-semibold leading-snug">{preset.name}</h3>
              <p
                className="break-words rounded-xl p-2.5 text-[11.5px] leading-relaxed opacity-80"
                style={softBoxStyle}
              >
                {preset.instruction}
              </p>
              <div className="flex justify-end gap-5 text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setPresetEditor({ id: preset.id, name: preset.name, instruction: preset.instruction });
                    setPresetSubView('edit');
                  }}
                  className="py-1.5 font-semibold opacity-75"
                >
                  编辑
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(preset)}
                  className="py-1.5 font-semibold text-rose-500 opacity-85"
                >
                  删除
                </button>
              </div>
            </article>
          ))}
        </div>

        <ConfirmModal
          isOpen={Boolean(deleteTarget)}
          title="删除AI预设"
          message={`确定删除「${deleteTarget?.name || ''}」吗？删除后无法恢复。`}
          onConfirm={handleDeletePreset}
          onCancel={() => setDeleteTarget(null)}
        />
      </div>
    );
  }

  // ---------- 主视图：拼词 ----------
  return (
    <div className="space-y-5">
      <SectionCard
        title="AI 拼词"
        subtitle="说一句你想要的画面，AI 会从画师串库里挑合适的搭配，或者自己想一组新的，拼成一份可以直接复制去生图的提示词。"
      >
        <Field label="关联的聊天（可选）" hint="选一个聊天才能带上对应的角色外貌 / 用户外貌。">
          <SelectInput value={chatIdText} onChange={setChatIdText} options={chatOptions} />
        </Field>

        {chatIdText ? (
          <>
            <ToggleRow label="带上角色外貌" checked={includeCharacter} onChange={setIncludeCharacter} />
            <ToggleRow label="带上用户外貌" checked={includeUser} onChange={setIncludeUser} />
          </>
        ) : null}

        <Field label="给AI预设" hint="写给AI的指导词，点下面「管理AI预设」可以新增、编辑、删除。">
          <SelectInput value={presetId} onChange={handlePresetChange} options={presetOptions} />
        </Field>

        <button
          type="button"
          onClick={() => setView('presets')}
          className="self-start text-[11px] font-semibold opacity-70"
        >
          管理AI预设 →
        </button>

        <Field label="想要什么画面" hint="大白话描述就行，AI 会把它翻译成提示词。">
          <TextArea
            value={description}
            onChange={setDescription}
            placeholder="例如：雨天，女孩撑着伞站在巷口回头看，水墨风格，略带忧郁"
            rows={4}
          />
        </Field>

        {errorText ? <p className="text-[11px] text-rose-500">{errorText}</p> : null}

        <div className="flex justify-end">
          <button
            type="button"
            onClick={handleCompose}
            disabled={!description.trim() || loading}
            className="flex items-center gap-1.5 rounded-full px-5 py-2 text-xs font-semibold disabled:opacity-40"
            style={primaryStyle}
          >
            <Sparkles className="h-3.5 w-3.5" /> {loading ? '拼词中…' : '开始拼词'}
          </button>
        </div>
      </SectionCard>

      {result ? (
        <SectionCard title="拼好的提示词">
          {result.usedExistingPresets.length > 0 ? (
            <Field label="用到的画师串">
              <p className="text-[11px] opacity-70">
                {result.usedExistingPresets.map((item) => item.name).join('、')}
              </p>
            </Field>
          ) : null}

          {result.newPreset ? (
            <Field
              label="AI 新想的画师串"
              hint={
                result.newPreset.id
                  ? '已经存进画师串库了，可以去那边编辑或启用。'
                  : '想出来了，但存库失败，这次先凑合用，没留在库里。'
              }
            >
              <p className="text-[11px] font-semibold">{result.newPreset.name}</p>
              <p
                className="mt-1.5 break-words rounded-xl p-2.5 font-mono text-[10.5px] leading-relaxed opacity-80"
                style={softBoxStyle}
              >
                {result.newPreset.tags}
              </p>
            </Field>
          ) : null}

          <CopyBlock
            label="场景提示词（AI 写的）"
            text={result.sceneTags}
            copiedKey={copiedKey}
            activeKey="scene"
            onCopy={handleCopy}
            muted
          />

          <CopyBlock
            label="最终提示词"
            text={result.positive}
            hint="已经包含固定前缀 / 画师串 / 外貌 / 场景，可以直接拿去用。"
            copiedKey={copiedKey}
            activeKey="positive"
            onCopy={handleCopy}
          />

          {result.negative ? (
            <CopyBlock
              label="负面提示词"
              text={result.negative}
              copiedKey={copiedKey}
              activeKey="negative"
              onCopy={handleCopy}
              muted
            />
          ) : null}
        </SectionCard>
      ) : null}
    </div>
  );
};

export default PromptComposerPanel;