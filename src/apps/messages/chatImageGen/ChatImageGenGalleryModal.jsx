// src/apps/messages/chatImageGen/ChatImageGenGalleryModal.jsx
//
// "本聊天的生图"面板：缩略图网格，支持多选后打包下载，或一键清空这个
// 聊天产生过的全部生图记录。从 ChatImageGenSettingsSection.jsx 的按钮
// 打开。列表查询用 chatImageGenGalleryService.js 按 chatId 筛；打包/删除
// 直接复用生图室画廊已有的 buildGenerationsZip / deleteGenerations /
// saveBlobToDevice，不重新实现一遍。
//
// 外壳照抄 ChatSettingsModal.jsx 的弹窗结构（fixed inset-0 + 模糊背景 +
// 居中卡片），保持跟这个聊天设置里其它弹窗一样的观感。
import React, { useCallback, useEffect, useState } from 'react';
import { Check, Download, ImageOff, Trash2, X } from 'lucide-react';
import { listChatGenerations } from './chatImageGenGalleryService';
import {
  buildGenerationsZip,
  deleteGenerations,
} from '../../imagestudio/imageGalleryService';
import { saveBlobToDevice } from '../../imagestudio/imageGenMedia';

const formatTime = (iso) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('zh-CN', { hour12: false });
};

export const ChatImageGenGalleryModal = ({ chatId, onClose }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listChatGenerations(chatId);
      setItems(rows);
    } finally {
      setLoading(false);
    }
  }, [chatId]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const toggleSelected = (id) => {
    setSelectedIds((previous) => (
      previous.includes(id)
        ? previous.filter((item) => item !== id)
        : [...previous, id]
    ));
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds([]);
  };

  const handleSelectAll = () => {
    setSelectedIds(items.map((item) => item.id));
  };

  const selectedRecords = items.filter((item) => selectedIds.includes(item.id));

  const handleDownload = async () => {
    const targets = selectedRecords.length > 0 ? selectedRecords : items;
    if (targets.length === 0) return;

    setBusy(true);
    setMessage('正在打包...');

    try {
      const { blob, count, missing } = await buildGenerationsZip(targets);
      if (!blob) {
        setMessage('这些图的原图都不在本机，没有可打包的内容。');
        return;
      }

      const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      await saveBlobToDevice(blob, `chat-${chatId}-${stamp}.zip`);
      setMessage(
        missing > 0
          ? `已打包 ${count} 张，另有 ${missing} 张原图不在本机，已跳过。`
          : `已打包 ${count} 张。`
      );
    } catch (error) {
      setMessage(`打包失败：${error?.message || '未知原因'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedRecords.length === 0) return;
    if (!window.confirm(`确定删除选中的 ${selectedRecords.length} 张图吗？删除后无法恢复，已经发在聊天里的那条消息卡片也会跟着看不到图。`)) {
      return;
    }

    setBusy(true);
    try {
      await deleteGenerations(selectedRecords.map((item) => item.id));
      setItems((previous) => previous.filter((item) => !selectedIds.includes(item.id)));
      setSelectedIds([]);
      setMessage(`已删除 ${selectedRecords.length} 张。`);
    } catch (error) {
      setMessage(`删除失败：${error?.message || '未知原因'}`);
    } finally {
      setBusy(false);
    }
  };

  const handleClearAll = async () => {
    if (items.length === 0) return;
    if (!window.confirm(`确定清空这个聊天的全部 ${items.length} 张生图吗？删除后无法恢复，已经发在聊天里的那些消息卡片也会跟着看不到图。`)) {
      return;
    }

    setBusy(true);
    try {
      await deleteGenerations(items.map((item) => item.id));
      setItems([]);
      setSelectedIds([]);
      setMessage('已清空。');
    } catch (error) {
      setMessage(`清空失败：${error?.message || '未知原因'}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in-up">
      <div
        className="fixed inset-0 backdrop-blur-md"
        style={{
          background: 'var(--modal-backdrop, color-mix(in srgb, var(--bg-main) 72%, transparent))',
        }}
        onClick={onClose}
      />

      <div
        className="relative w-full max-w-sm rounded-[2rem] p-5 space-y-3 shadow-2xl text-xs text-left z-10 overflow-y-auto max-h-[90vh] no-scrollbar"
        style={{
          background: 'var(--card-bg-gradient)',
          border: '1px solid var(--card-border)',
          color: 'var(--text-main)',
        }}
      >
        <div
          className="flex items-center justify-between pb-2 border-b"
          style={{ borderColor: 'var(--divider)' }}
        >
          <span className="font-bold text-sm">
            本聊天的生图{items.length > 0 ? `（${items.length}）` : ''}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full opacity-60 hover:opacity-100"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
            disabled={busy || items.length === 0}
            className="rounded-full border px-2.5 py-1 text-[11px] font-medium disabled:opacity-30"
            style={{
              borderColor: selectMode ? 'var(--accent-color)' : 'var(--divider)',
              color: selectMode ? 'var(--accent-color)' : 'var(--text-main)',
            }}
          >
            {selectMode ? '取消选择' : '选择'}
          </button>

          {selectMode && (
            <button
              type="button"
              onClick={handleSelectAll}
              disabled={busy}
              className="rounded-full border px-2.5 py-1 text-[11px] font-medium"
              style={{ borderColor: 'var(--divider)' }}
            >
              全选
            </button>
          )}

          <button
            type="button"
            onClick={handleDownload}
            disabled={busy || items.length === 0}
            className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium disabled:opacity-30"
            style={{ borderColor: 'var(--divider)' }}
          >
            <Download className="h-3 w-3" />
            {selectedRecords.length > 0 ? `打包下载（${selectedRecords.length}）` : '打包下载全部'}
          </button>

          {selectMode && selectedRecords.length > 0 ? (
            <button
              type="button"
              onClick={handleDeleteSelected}
              disabled={busy}
              className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium"
              style={{ borderColor: 'var(--divider)', color: 'var(--text-sub)' }}
            >
              <Trash2 className="h-3 w-3" />
              删除选中
            </button>
          ) : (
            <button
              type="button"
              onClick={handleClearAll}
              disabled={busy || items.length === 0}
              className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium disabled:opacity-30"
              style={{ borderColor: 'var(--divider)', color: 'var(--text-sub)' }}
            >
              <Trash2 className="h-3 w-3" />
              清空
            </button>
          )}
        </div>

        {message && (
          <p className="text-[10px] opacity-60">{message}</p>
        )}

        {loading ? (
          <p className="py-8 text-center text-[11px] opacity-50">加载中...</p>
        ) : items.length === 0 ? (
          <p className="py-8 text-center text-[11px] opacity-50">
            这个聊天还没有生成过图片。
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {items.map((record) => {
              const isSelected = selectedIds.includes(record.id);

              return (
                <button
                  type="button"
                  key={record.id}
                  onClick={() => (selectMode ? toggleSelected(record.id) : undefined)}
                  className="relative aspect-square overflow-hidden rounded-xl border"
                  style={{ borderColor: 'var(--card-border)' }}
                  title={formatTime(record.createdAt)}
                >
                  {record.thumbnail ? (
                    <img
                      src={record.thumbnail}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center opacity-40"
                      style={{ background: 'var(--control-soft-bg)' }}
                    >
                      <ImageOff className="h-4 w-4" />
                    </div>
                  )}

                  {selectMode && (
                    <div
                      className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full border"
                      style={{
                        background: isSelected ? 'var(--accent-color)' : 'rgba(0,0,0,0.35)',
                        borderColor: isSelected ? 'var(--accent-color)' : 'rgba(255,255,255,0.6)',
                      }}
                    >
                      {isSelected && <Check className="h-2.5 w-2.5" style={{ color: 'var(--accent-foreground)' }} />}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatImageGenGalleryModal;