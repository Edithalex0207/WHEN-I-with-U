// src/apps/imagestudio/ArtistTagPanel.jsx
//
// 生图室「画师串」页（现在是独立的一页，不再塞在底部弹窗里）。
// 每条是一串画师标签，像一张索引卡：编号、名称、备注、标签，可以存很多条，
// 勾选其中一条或几条启用，生图时按创建顺序拼进提示词（拼接逻辑在 imageGenRequest.js）。
//
// 三个视图在同一页里切换，都不用弹窗，所以小屏幕上也不会被裁掉：
//   list   列表（默认）
//   edit   新增 / 编辑一条
//   import 批量导入：粘贴多行文本，每行一条，识别预览确认后一次性写入（默认都未启用）
//
// 编辑和删除按钮始终可见，不做 hover 才出现——手机上没有 hover，
// 做成 hover 才显示的话点不到（RpApp 的会话删除按钮之前踩过这个坑）。

import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Plus } from 'lucide-react';

import ConfirmModal from '../../components/ConfirmModal';
import {
  createArtistTagPreset,
  deleteArtistTagPreset,
  getAllArtistTagPresets,
  importArtistTagPresets,
  parseArtistTagBulkText,
  setArtistTagPresetEnabled,
  updateArtistTagPreset,
} from './artistTagService';
import { joinPromptParts } from './imageGenRules';
import { Field, SectionCard, TextArea, TextInput } from './StudioFormParts';

const EMPTY_EDITOR = { id: null, name: '', remark: '', tags: '' };

const primaryStyle = { backgroundColor: 'var(--accent-color)', color: 'var(--accent-foreground)' };

const BackButton = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex items-center gap-1 py-1 text-[11px] opacity-70"
  >
    <ArrowLeft className="h-3.5 w-3.5" /> 返回画师串
  </button>
);

const ArtistTagPanel = () => {
  const [presets, setPresets] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState('list');
  const [editor, setEditor] = useState(EMPTY_EDITOR);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [errorText, setErrorText] = useState('');
  const [importText, setImportText] = useState('');

  const reload = useCallback(async () => {
    setPresets(await getAllArtistTagPresets());
    setLoaded(true);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const enabledPresets = presets.filter((item) => item.enabled);
  const enabledPreview = joinPromptParts(enabledPresets.map((item) => item.tags));
  const importPreview = parseArtistTagBulkText(importText, presets.length);

  const backToList = () => {
    setView('list');
    setEditor(EMPTY_EDITOR);
    setImportText('');
    setErrorText('');
  };

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

    const name = editor.name.trim();
    const tags = editor.tags.trim();
    const remark = editor.remark.trim();
    if (!name || !tags) return;

    try {
      if (editor.id) {
        await updateArtistTagPreset(editor.id, { name, tags, remark });
      } else {
        await createArtistTagPreset({ name, tags, remark });
      }

      await reload();
      backToList();
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

  const handleImport = async () => {
    if (importPreview.length === 0) return;

    try {
      await importArtistTagPresets(importPreview);
      await reload();
      backToList();
    } catch (error) {
      console.warn('[ImageStudio] 批量导入画师串失败：', error);
      setErrorText('导入失败，请重试。');
    }
  };

  // ---------- 新增 / 编辑 ----------
  if (view === 'edit') {
    return (
      <form onSubmit={handleSaveEditor} className="space-y-4">
        <BackButton onClick={backToList} />

        <SectionCard title={editor.id ? '编辑画师串' : '新增画师串'}>
          <Field label="名称">
            <TextInput
              value={editor.name}
              onChange={(value) => setEditor((prev) => ({ ...prev, name: value }))}
              placeholder="给这一串起个好认的名字"
            />
          </Field>

          <Field label="备注（可选）" hint="写给自己看的，比如这串适合什么角色或风格，不会进提示词。">
            <TextInput
              value={editor.remark}
              onChange={(value) => setEditor((prev) => ({ ...prev, remark: value }))}
              placeholder="例如：给林夏用的，偏水墨"
            />
          </Field>

          <Field label="画师标签" hint="原样保存，换行会在使用时变成逗号。">
            <TextArea
              value={editor.tags}
              onChange={(value) => setEditor((prev) => ({ ...prev, tags: value }))}
              placeholder="artist:xxx, artist:yyy"
              rows={7}
            />
          </Field>

          {errorText ? <p className="text-[11px] text-rose-500">{errorText}</p> : null}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={backToList} className="px-3 py-1.5 text-xs opacity-60">
              取消
            </button>
            <button
              type="submit"
              disabled={!editor.name.trim() || !editor.tags.trim()}
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

  // ---------- 批量导入 ----------
  if (view === 'import') {
    return (
      <div className="space-y-4">
        <BackButton onClick={backToList} />

        <SectionCard
          title="批量导入"
          subtitle="粘贴多行文本，每行一条。导入后默认都是「未启用」，不会突然把一堆陌生风格混进当前生成里。"
        >
          <Field
            label="粘贴文本"
            hint="某一行写了「名称：标签」就按冒号拆开（中文、英文冒号都行）；没写名称的会自动编号，导入后随时能改名、加备注。"
          >
            <TextArea
              value={importText}
              onChange={setImportText}
              placeholder={'水墨写意：artist:wlop, artist:sakimichan\nartist:guweiz, oil painting'}
              rows={8}
            />
          </Field>
        </SectionCard>

        {importPreview.length > 0 ? (
          <section className="space-y-2">
            <p className="text-[11px] opacity-70">识别预览 · {importPreview.length} 条</p>
            {importPreview.map((item, index) => (
              <div
                key={`${index}-${item.name}`}
                className="rounded-2xl border px-3.5 py-2.5"
                style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--card-bg)' }}
              >
                <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
                  {item.name}
                  {item.autoNamed ? (
                    <span className="rounded-full border border-amber-500 px-1.5 text-[8.5px] text-amber-500">
                      自动命名
                    </span>
                  ) : null}
                </p>
                <p className="mt-1 break-words font-mono text-[10.5px] leading-relaxed opacity-65">
                  {item.tags}
                </p>
              </div>
            ))}
          </section>
        ) : null}

        {errorText ? <p className="text-[11px] text-rose-500">{errorText}</p> : null}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={backToList} className="px-3 py-1.5 text-xs opacity-60">
            取消
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={importPreview.length === 0}
            className="rounded-full px-5 py-2 text-xs font-semibold disabled:opacity-40"
            style={primaryStyle}
          >
            确认导入{importPreview.length ? ` ${importPreview.length} 条` : ''}
          </button>
        </div>
      </div>
    );
  }

  // ---------- 列表 ----------
  return (
    <div className="space-y-5">
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
              className="break-words rounded-xl border p-2.5 font-mono text-[10.5px] leading-relaxed"
              style={{ backgroundColor: 'var(--bg-surface)', borderColor: 'var(--card-border)' }}
            >
              {enabledPreview}
            </p>
          ) : null}
        </Field>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setView('import')}
            className="rounded-full px-4 py-2 text-xs font-semibold shadow-sm"
            style={primaryStyle}
          >
            批量导入
          </button>
          <button
            type="button"
            onClick={() => {
              setEditor({ ...EMPTY_EDITOR });
              setView('edit');
            }}
            className="flex items-center gap-1 rounded-full border px-4 py-2 text-xs font-semibold"
            style={{ borderColor: 'var(--divider)' }}
          >
            <Plus className="h-3.5 w-3.5" /> 新增画师串
          </button>
        </div>

        {errorText ? <p className="text-[11px] text-rose-500">{errorText}</p> : null}
      </SectionCard>

      {loaded && presets.length === 0 ? (
        <div
          className="rounded-3xl border py-14 text-center text-xs leading-relaxed opacity-60"
          style={{ backgroundColor: 'var(--card-bg)', borderColor: 'var(--card-border)' }}
        >
          还没有画师串
          <br />
          点上面的「新增」，或者一次性「批量导入」
        </div>
      ) : null}

      <div className="space-y-4">
        {presets.map((preset, index) => (
          <article
            key={preset.id}
            className="space-y-2.5 rounded-3xl border p-4"
            style={{
              backgroundColor: 'var(--card-bg)',
              borderColor: preset.enabled ? 'var(--accent-color)' : 'var(--card-border)',
            }}
          >
            <div className="flex items-baseline gap-3">
              <span className="font-mono text-[10px] opacity-45">
                {String(index + 1).padStart(2, '0')}
              </span>
              <h3 className="min-w-0 flex-1 break-words font-serif text-base font-semibold leading-snug">
                {preset.name}
              </h3>
              <button
                type="button"
                role="switch"
                aria-checked={Boolean(preset.enabled)}
                onClick={() => handleToggle(preset)}
                className="shrink-0 rounded-full border px-3 py-1 text-[10.5px] font-semibold"
                style={
                  preset.enabled
                    ? { ...primaryStyle, borderColor: 'var(--accent-color)' }
                    : { borderColor: 'var(--divider)', color: 'var(--text-sub)' }
                }
              >
                {preset.enabled ? '已启用' : '未启用'}
              </button>
            </div>

            <p
              className={`break-words font-serif text-[13.5px] italic leading-relaxed ${
                preset.remark ? 'opacity-80' : 'opacity-40'
              }`}
            >
              {preset.remark || '还没有备注，点编辑可以补上。'}
            </p>

            <p
              className="break-words rounded-xl p-2.5 font-mono text-[10.5px] leading-relaxed opacity-80"
              style={{ backgroundColor: 'var(--bg-surface)' }}
            >
              {preset.tags}
            </p>

            <div className="flex justify-end gap-5 text-xs">
              <button
                type="button"
                onClick={() => {
                  setEditor({
                    id: preset.id,
                    name: preset.name,
                    remark: preset.remark || '',
                    tags: preset.tags,
                  });
                  setView('edit');
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
        title="删除画师串"
        message={`确定删除「${deleteTarget?.name || ''}」吗？删除后无法恢复。`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};

export default ArtistTagPanel;