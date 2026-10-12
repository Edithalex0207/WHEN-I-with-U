// src/apps/imagestudio/ArtistTagPanel.jsx
//
// 生图室「画师串」页：存储站。每条是一串画师标签，可以存很多条，
// 勾选其中一条或几条启用，生图时按创建顺序拼进提示词（拼接逻辑在切片B）。
//
// 编辑和删除按钮始终可见，不做 hover 才出现——手机上没有 hover，
// 做成 hover 才显示的话点不到（RpApp 的会话删除按钮之前踩过这个坑）。

import React, { useCallback, useEffect, useState } from 'react';
import { Plus } from 'lucide-react';

import ConfirmModal from '../../components/ConfirmModal';
import {
  createArtistTagPreset,
  deleteArtistTagPreset,
  getAllArtistTagPresets,
  setArtistTagPresetEnabled,
  updateArtistTagPreset,
} from './artistTagService';
import { joinPromptParts } from './imageGenRules';
import { Field, SectionCard, TextArea, TextInput, ToggleRow } from './StudioFormParts';

const EMPTY_EDITOR = { id: null, name: '', tags: '' };

const ArtistTagPanel = () => {
  const [presets, setPresets] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [editor, setEditor] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [errorText, setErrorText] = useState('');

  const reload = useCallback(async () => {
    setPresets(await getAllArtistTagPresets());
    setLoaded(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const enabledPresets = presets.filter((item) => item.enabled);
  const enabledPreview = joinPromptParts(enabledPresets.map((item) => item.tags));

  const handleToggle = async (preset) => {
    try {
      await setArtistTagPresetEnabled(preset.id, !preset.enabled);
      await reload();
    } catch (error) {
      console.warn('[ImageStudio] 切换画师串启用状态失败：', error);
      setErrorText('操作失败，请重试。');
    }
  };

  const handleSaveEditor = async (event) => {
    event.preventDefault();
    if (!editor) return;

    const name = editor.name.trim();
    const tags = editor.tags.trim();
    if (!name || !tags) return;

    try {
      if (editor.id) {
        await updateArtistTagPreset(editor.id, { name, tags });
      } else {
        await createArtistTagPreset({ name, tags });
      }

      setEditor(null);
      setErrorText('');
      await reload();
    } catch (error) {
      console.warn('[ImageStudio] 保存画师串失败：', error);
      setErrorText('保存失败，请重试。');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      await deleteArtistTagPreset(deleteTarget.id);
    } catch (error) {
      console.warn('[ImageStudio] 删除画师串失败：', error);
      setErrorText('删除失败，请重试。');
    }

    setDeleteTarget(null);
    await reload();
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="画师串存储站"
        subtitle="把常用的画师标签串存在这里，勾选启用的会在生成时按创建顺序拼进提示词。目前只有 NovelAI 后端会用到。"
      >
        <Field
          label={`已启用 ${enabledPresets.length} 条，合并后的样子`}
          hint={enabledPreview ? undefined : '还没有启用任何一条。'}
        >
          {enabledPreview ? (
            <p
              className="break-words rounded-xl border p-2 text-[11px] leading-relaxed"
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderColor: 'var(--card-border)',
              }}
            >
              {enabledPreview}
            </p>
          ) : null}
        </Field>

        <button
          type="button"
          onClick={() => setEditor({ ...EMPTY_EDITOR })}
          className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold shadow-sm"
          style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-foreground)' }}
        >
          <Plus className="h-3.5 w-3.5" /> 新增画师串
        </button>

        {errorText ? <p className="text-[11px] text-rose-500">{errorText}</p> : null}
      </SectionCard>

      {loaded && presets.length === 0 ? (
        <div
          className="rounded-3xl border py-12 text-center text-xs opacity-60"
          style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
        >
          还没有画师串，点上面的按钮新增一条
        </div>
      ) : null}

      {presets.map((preset) => (
        <SectionCard key={preset.id} title={preset.name}>
          <ToggleRow
            label={preset.enabled ? '已启用' : '未启用'}
            hint={preset.tags}
            checked={Boolean(preset.enabled)}
            onChange={() => handleToggle(preset)}
          />

          <div className="flex justify-end gap-3 pt-1 text-xs">
            <button
              type="button"
              onClick={() =>
                setEditor({ id: preset.id, name: preset.name, tags: preset.tags })
              }
              className="font-semibold opacity-70 hover:opacity-100"
            >
              编辑
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(preset)}
              className="font-semibold text-rose-500 opacity-80 hover:opacity-100"
            >
              删除
            </button>
          </div>
        </SectionCard>
      ))}

      {editor ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleSaveEditor}
            className="max-h-[80vh] w-full max-w-sm space-y-3 overflow-y-auto rounded-3xl p-5 shadow-2xl"
            style={{
              backgroundColor: 'var(--modal-bg)',
              border: '1px solid var(--modal-border)',
              color: 'var(--text-main)',
            }}
          >
            <h3
              className="border-b pb-2 text-xs font-semibold"
              style={{ borderColor: 'var(--divider)' }}
            >
              {editor.id ? '编辑画师串' : '新增画师串'}
            </h3>

            <Field label="名称">
              <TextInput
                value={editor.name}
                onChange={(value) => setEditor((prev) => ({ ...prev, name: value }))}
                placeholder="给这一串起个好认的名字"
              />
            </Field>

            <Field label="画师标签" hint="原样保存，换行会在使用时变成逗号。">
              <TextArea
                value={editor.tags}
                onChange={(value) => setEditor((prev) => ({ ...prev, tags: value }))}
                placeholder="artist:xxx, artist:yyy"
                rows={5}
              />
            </Field>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditor(null)}
                className="px-3 py-1 text-xs opacity-60"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={!editor.name.trim() || !editor.tags.trim()}
                className="rounded-xl px-4 py-1 text-xs font-semibold disabled:opacity-40"
                style={{ backgroundColor: 'var(--accent-color)', color: 'var(--accent-foreground)' }}
              >
                保存
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        title="删除画师串"
        message={`确定删除「${deleteTarget?.name || ''}」吗？删除后无法恢复。`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default ArtistTagPanel;