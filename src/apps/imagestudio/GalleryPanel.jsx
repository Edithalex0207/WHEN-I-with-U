// src/apps/imagestudio/GalleryPanel.jsx
//
// 画廊：缩略图网格 + 点开看大图。支持重 roll（新增一条，旧的保留）、保存到相册、
// 打包下载、删除，可以多选后批量操作。
// 列表只读缩略图；原图只在打开详情或下载时按需读取。
// 备份恢复后原图会丢失（hasOriginal 为 true 但文件不在），这里会明确提示，
// 并且仍然允许重 roll 和删除。

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Download, Image as ImageIcon, RefreshCw, Trash2, X } from 'lucide-react';

import { getImageGenConfig } from './imageGenConfigService';
import { saveBlobToDevice } from './imageGenMedia';
import { getGenerationOriginal } from './imageGenerationService';
import {
  GALLERY_PAGE_SIZE,
  buildGenerationsZip,
  buildStudioFileName,
  deleteGenerations,
  listGenerations,
  loadOriginals,
  rerollGeneration,
} from './imageGalleryService';
import { SectionCard } from './StudioFormParts';

const pillStyle = { borderColor: 'var(--card-border)', backgroundColor: 'var(--bg-surface)' };
const accentStyle = { backgroundColor: 'var(--accent-color)', color: 'var(--accent-foreground)' };

const formatTime = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', { hour12: false });
};

const describeParams = (record) => {
  const params = record.params || {};
  if (record.backend === 'novelai') {
    return [
      record.model,
      params.width && params.height ? `${params.width}x${params.height}` : '',
      params.steps ? `${params.steps} 步` : '',
      params.scale !== undefined ? `scale ${params.scale}` : '',
      params.sampler,
      params.seed !== undefined ? `seed ${params.seed}` : '',
    ]
      .filter(Boolean)
      .join(' / ');
  }

  return [record.model, params.size].filter(Boolean).join(' / ');
};

const saveStatusText = (status) => {
  if (status === 'shared') return '已打开系统分享面板，选择"存储图像"即可存进相册。';
  if (status === 'downloaded') return '已下载到设备。';
  return '';
};

// 多张图一次性分享（手机上选"存储图像"会一起存进相册）。系统不支持就返回 'unsupported'。
const shareManyFiles = async (files) => {
  try {
    const list = files.map(
      ({ blob, fileName }) => new File([blob], fileName, { type: blob.type || 'image/png' })
    );

    if (navigator.share && navigator.canShare && navigator.canShare({ files: list })) {
      await navigator.share({ files: list });
      return 'shared';
    }
  } catch (error) {
    if (error?.name === 'AbortError') return 'cancelled';
  }

  return 'unsupported';
};

const GalleryPanel = ({ onGoSettings }) => {
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const [detail, setDetail] = useState(null);
  const [detailUrl, setDetailUrl] = useState('');
  const [detailMissing, setDetailMissing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rerollBusy, setRerollBusy] = useState(false);
  const [detailMessage, setDetailMessage] = useState('');

  const detailBlobRef = useRef(null);

  const loadFirstPage = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const page = await listGenerations({ offset: 0, limit: GALLERY_PAGE_SIZE });
      setItems(page.items);
      setHasMore(page.hasMore);
    } catch (error) {
      console.warn('[ImageStudio] 读取画廊失败：', error);
      setLoadError(`读取画廊失败：${error?.message || '未知原因'}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const handleLoadMore = async () => {
    try {
      const page = await listGenerations({ offset: items.length, limit: GALLERY_PAGE_SIZE });
      setItems((previous) => [...previous, ...page.items]);
      setHasMore(page.hasMore);
    } catch (error) {
      setLoadError(`读取更多失败：${error?.message || '未知原因'}`);
    }
  };

  // 打开详情时读原图；关闭或换图时释放临时地址。
  useEffect(() => {
    if (!detail) return undefined;

    let cancelled = false;
    let objectUrl = '';
    detailBlobRef.current = null;
    setDetailUrl('');
    setDetailMissing(false);

    const run = async () => {
      if (!detail.hasOriginal) {
        setDetailMissing(!detail.remoteUrl);
        return;
      }

      const blob = await getGenerationOriginal(detail.id);
      if (cancelled) return;

      if (!blob) {
        setDetailMissing(true);
        return;
      }

      detailBlobRef.current = blob;
      objectUrl = URL.createObjectURL(blob);
      setDetailUrl(objectUrl);
    };

    void run();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [detail]);

  const closeDetail = () => {
    setDetail(null);
    setConfirmDelete(false);
    setDetailMessage('');
  };

  const openDetail = (record) => {
    setConfirmDelete(false);
    setDetailMessage('');
    setDetail(record);
  };

  const toggleSelected = (id) => {
    setSelectedIds((previous) =>
      previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]
    );
  };

  const selectedRecords = useMemo(
    () => items.filter((item) => selectedIds.includes(item.id)),
    [items, selectedIds]
  );

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds([]);
  };

  const handleTileClick = (record) => {
    if (selectMode) {
      toggleSelected(record.id);
    } else {
      openDetail(record);
    }
  };

  // ---- 详情里的操作 ----

  const handleDetailSave = async () => {
    const blob = detailBlobRef.current;
    if (!blob) return;
    const status = await saveBlobToDevice(blob, buildStudioFileName(detail, blob));
    setDetailMessage(saveStatusText(status));
  };

  const handleReroll = async () => {
    if (!detail) return;
    setRerollBusy(true);
    setDetailMessage('');

    try {
      const config = await getImageGenConfig();
      const outcome = await rerollGeneration({ record: detail, config });

      if (outcome.record) {
        setItems((previous) => [outcome.record, ...previous]);
        setDetail(outcome.record);
        setDetailMessage(
          outcome.adjustments?.length
            ? `已重 roll，新图已存进画廊。注意：${outcome.adjustments.join('；')}`
            : '已重 roll，新图已存进画廊（旧的还在）。'
        );
      } else {
        setDetailMessage(outcome.saveError || '重 roll 成功但没有存进画廊。');
        if (outcome.blob) {
          await saveBlobToDevice(
            outcome.blob,
            buildStudioFileName({ ...detail, id: 'reroll', createdAt: new Date().toISOString() }, outcome.blob)
          );
        }
      }
    } catch (error) {
      setDetailMessage(error?.message || '重 roll 失败。');
    } finally {
      setRerollBusy(false);
    }
  };

  const handleDetailDelete = async () => {
    if (!detail) return;
    try {
      await deleteGenerations([detail.id]);
      setItems((previous) => previous.filter((item) => item.id !== detail.id));
      closeDetail();
    } catch (error) {
      setDetailMessage(`删除失败：${error?.message || '未知原因'}`);
    }
  };

  // ---- 批量操作 ----

  const handleBulkZip = async () => {
    if (selectedRecords.length === 0) return;
    setBusy(true);
    setMessage('正在打包...');

    try {
      const { blob, count, missing } = await buildGenerationsZip(selectedRecords);
      if (!blob) {
        setMessage('选中的图片原图都不在本机，没有可打包的内容。');
        return;
      }

      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      await saveBlobToDevice(blob, `studio-${stamp}.zip`);
      setMessage(
        missing > 0 ? `已打包 ${count} 张，另有 ${missing} 张原图不在本机，已跳过。` : `已打包 ${count} 张。`
      );
    } catch (error) {
      setMessage(`打包失败：${error?.message || '未知原因'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleBulkAlbum = async () => {
    if (selectedRecords.length === 0) return;
    setBusy(true);
    setMessage('正在读取原图...');

    try {
      const { files, missing } = await loadOriginals(selectedRecords);
      if (files.length === 0) {
        setMessage('选中的图片原图都不在本机，没有可保存的内容。');
        return;
      }

      const status = await shareManyFiles(files);
      const skipped = missing > 0 ? `另有 ${missing} 张原图不在本机，已跳过。` : '';

      if (status === 'shared') {
        setMessage(`已打开系统分享面板（${files.length} 张），选择"存储图像"即可存进相册。${skipped}`);
      } else if (status === 'cancelled') {
        setMessage('已取消。');
      } else {
        // 当前环境不支持一次分享多张：退回打包下载。
        const { blob } = await buildGenerationsZip(selectedRecords);
        if (blob) {
          await saveBlobToDevice(blob, `studio-${Date.now()}.zip`);
          setMessage(`当前环境不支持直接存相册，已改为打包下载 ${files.length} 张。${skipped}`);
        }
      }
    } catch (error) {
      setMessage(`保存失败：${error?.message || '未知原因'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedRecords.length === 0) return;
    if (!window.confirm(`确定删除选中的 ${selectedRecords.length} 张图吗？删除后无法恢复。`)) return;

    setBusy(true);
    try {
      await deleteGenerations(selectedRecords.map((item) => item.id));
      setItems((previous) => previous.filter((item) => !selectedIds.includes(item.id)));
      setMessage(`已删除 ${selectedRecords.length} 张。`);
      setSelectedIds([]);
    } catch (error) {
      setMessage(`删除失败：${error?.message || '未知原因'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionCard
        title="画廊"
        subtitle="按时间从新到旧。点缩略图看大图，可重 roll、保存到相册、删除；也可以多选后批量打包。"
      >
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            className="rounded-full border px-3 py-1.5 text-xs font-semibold"
            style={selectMode ? { ...pillStyle, borderColor: 'var(--accent-color)' } : pillStyle}
          >
            {selectMode ? '退出多选' : '多选'}
          </button>
          {selectMode ? (
            <>
              <button
                type="button"
                onClick={() => setSelectedIds(items.map((item) => item.id))}
                className="rounded-full border px-3 py-1.5 text-xs font-semibold"
                style={pillStyle}
              >
                全选已加载
              </button>
              <span className="text-[11px] opacity-60">已选 {selectedIds.length} 张</span>
            </>
          ) : null}
        </div>

        {selectMode ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy || selectedIds.length === 0}
              onClick={handleBulkAlbum}
              className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
              style={accentStyle}
            >
              <Download className="h-3.5 w-3.5" /> 保存到相册
            </button>
            <button
              type="button"
              disabled={busy || selectedIds.length === 0}
              onClick={handleBulkZip}
              className="rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
              style={pillStyle}
            >
              打包下载 zip
            </button>
            <button
              type="button"
              disabled={busy || selectedIds.length === 0}
              onClick={handleBulkDelete}
              className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold text-rose-500 disabled:opacity-40"
              style={pillStyle}
            >
              <Trash2 className="h-3.5 w-3.5" /> 删除
            </button>
          </div>
        ) : null}

        {message ? <p className="text-[11px] leading-relaxed opacity-70">{message}</p> : null}
        {loadError ? <p className="text-[11px] leading-relaxed text-rose-500">{loadError}</p> : null}
      </SectionCard>

      {loading ? (
        <p className="py-8 text-center text-xs opacity-50">读取中...</p>
      ) : items.length === 0 ? (
        <div
          className="rounded-3xl border px-6 py-14 text-center"
          style={{
            backgroundColor: 'var(--card-bg)',
            borderColor: 'var(--card-border)',
            color: 'var(--text-main)',
          }}
        >
          <ImageIcon className="mx-auto mb-3 h-8 w-8 opacity-40" />
          <p className="text-xs leading-relaxed opacity-60">还没有生成过图片。到「生成」页画第一张吧。</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-1.5">
            {items.map((record) => {
              const selected = selectedIds.includes(record.id);
              return (
                <button
                  key={record.id}
                  type="button"
                  onClick={() => handleTileClick(record)}
                  className="relative aspect-square overflow-hidden rounded-xl border"
                  style={{
                    borderColor: selected ? 'var(--accent-color)' : 'var(--card-border)',
                    backgroundColor: 'var(--card-bg)',
                  }}
                >
                  {record.thumbnail ? (
                    <img
                      src={record.thumbnail}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center">
                      <ImageIcon className="h-6 w-6 opacity-30" />
                    </span>
                  )}
                  {record.hasOriginal ? null : (
                    <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[9px] text-white">
                      {record.remoteUrl ? '仅外链' : '无原图'}
                    </span>
                  )}
                  {selectMode ? (
                    <span
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full border"
                      style={
                        selected
                          ? { ...accentStyle, borderColor: 'var(--accent-color)' }
                          : { backgroundColor: 'rgba(0,0,0,0.35)', borderColor: 'rgba(255,255,255,0.8)' }
                      }
                    >
                      {selected ? <Check className="h-3 w-3" /> : null}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {hasMore ? (
            <button
              type="button"
              onClick={handleLoadMore}
              className="w-full rounded-xl border py-2 text-xs font-semibold"
              style={pillStyle}
            >
              加载更多
            </button>
          ) : null}
        </>
      )}

      {detail ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-3"
          onClick={closeDetail}
          role="presentation"
        >
          <div
            className="mx-auto my-4 max-w-md space-y-3 rounded-3xl border p-4"
            style={{
              backgroundColor: 'var(--card-bg)',
              borderColor: 'var(--card-border)',
              color: 'var(--text-main)',
            }}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] opacity-60">{formatTime(detail.createdAt)}</span>
              <button
                type="button"
                onClick={closeDetail}
                className="rounded-full p-1 opacity-70 hover:opacity-100"
                aria-label="关闭"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {detailUrl ? (
              <img
                src={detailUrl}
                alt="生成的图片"
                className="w-full rounded-2xl border"
                style={{ borderColor: 'var(--card-border)' }}
              />
            ) : detail.remoteUrl ? (
              <img
                src={detail.remoteUrl}
                alt="外链图片"
                className="w-full rounded-2xl border"
                style={{ borderColor: 'var(--card-border)' }}
              />
            ) : detailMissing ? (
              <div className="space-y-2">
                {detail.thumbnail ? (
                  <img
                    src={detail.thumbnail}
                    alt="缩略图"
                    className="w-full rounded-2xl border opacity-70"
                    style={{ borderColor: 'var(--card-border)' }}
                  />
                ) : null}
                <p className="text-[11px] leading-relaxed text-amber-600">
                  这张图的原图不在本机了（常见原因：从备份恢复过，备份不包含原图）。上面只是缩略图。
                  仍然可以用它的提示词重 roll 出一张新的。
                </p>
              </div>
            ) : (
              <p className="py-10 text-center text-xs opacity-50">读取原图中...</p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={rerollBusy}
                onClick={handleReroll}
                className="flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold disabled:opacity-40"
                style={accentStyle}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${rerollBusy ? 'animate-spin' : ''}`} />
                {rerollBusy ? '重 roll 中...' : '重 roll'}
              </button>

              {detailUrl ? (
                <button
                  type="button"
                  onClick={handleDetailSave}
                  className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold"
                  style={pillStyle}
                >
                  <Download className="h-3.5 w-3.5" /> 保存到相册
                </button>
              ) : null}

              {detail.remoteUrl ? (
                <a
                  href={detail.remoteUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border px-3 py-1.5 text-xs font-semibold"
                  style={pillStyle}
                >
                  打开原链接
                </a>
              ) : null}

              {confirmDelete ? (
                <button
                  type="button"
                  onClick={handleDetailDelete}
                  className="flex items-center gap-1 rounded-full bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white"
                >
                  <Trash2 className="h-3.5 w-3.5" /> 确认删除
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold text-rose-500"
                  style={pillStyle}
                >
                  <Trash2 className="h-3.5 w-3.5" /> 删除
                </button>
              )}
            </div>

            {detailMessage ? (
              <p className="text-[11px] leading-relaxed opacity-70">{detailMessage}</p>
            ) : null}
            {onGoSettings && /设置/.test(detailMessage) ? (
              <button
                type="button"
                onClick={() => {
                  closeDetail();
                  onGoSettings();
                }}
                className="rounded-full border px-3 py-1.5 text-xs font-semibold"
                style={pillStyle}
              >
                去设置
              </button>
            ) : null}

            <details className="text-[11px]">
              <summary className="cursor-pointer opacity-70">提示词与参数</summary>
              <div className="mt-2 space-y-2 leading-relaxed opacity-80">
                <p>{describeParams(detail)}</p>
                <p className="break-words">
                  <span className="opacity-60">正面：</span>
                  {detail.prompt}
                </p>
                {detail.negativePrompt ? (
                  <p className="break-words">
                    <span className="opacity-60">负面：</span>
                    {detail.negativePrompt}
                  </p>
                ) : null}
              </div>
            </details>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default GalleryPanel;