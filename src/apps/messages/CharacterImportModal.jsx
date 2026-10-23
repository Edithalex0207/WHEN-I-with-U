import React, { useState } from 'react';
import { X, Upload, FileJson, FileText, AlertCircle } from 'lucide-react';
import { parseCharacterImportJson, parseCharacterImportTxt } from './characterImportService';

// 角色导入弹窗：用户粘贴 json 或 txt 模板内容，纯本地确定性解析（不调用 AI），
// 解析结果交给调用方（CharacterLibrary -> MessagesApp）直接当作 characterData
// 铺进 CharacterEditor 的新建表单——用户还能在编辑器里再检查/调整一遍，
// 确认没问题才会真正写库。
export const CharacterImportModal = ({ onClose, onImported }) => {
  const [rawText, setRawText] = useState('');
  const [error, setError] = useState('');

  const controlStyle = {
    background: 'var(--control-soft-bg)',
    color: 'var(--text-main)',
    border: '1px solid var(--divider)',
  };

  const accentButtonStyle = {
    background: 'var(--accent-color)',
    color: 'var(--accent-foreground)',
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setRawText(text);
    setError('');
  };

  const detectAndParse = (text) => {
    const trimmed = text.trim();
    if (!trimmed) {
      throw new Error('内容是空的，先粘贴或上传模板内容。');
    }
    // 以第一个非空字符是不是 { 来判断 json / txt，比判断文件后缀更稳妥
    // （用户可能直接粘贴内容而不是上传文件）。
    if (trimmed.startsWith('{')) {
      return parseCharacterImportJson(trimmed);
    }
    return parseCharacterImportTxt(trimmed);
  };

  const handleImport = () => {
    try {
      const parsed = detectAndParse(rawText);
      if (!parsed.name && !parsed.bio && parsed.worldBookEntries.length === 0 && parsed.knowledgeEntries.length === 0) {
        setError('没有解析出任何内容，检查一下格式是不是和模板对得上。');
        return;
      }
      setError('');
      onImported(parsed);
    } catch (err) {
      setError(err.message || '解析失败，请检查格式。');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in-up">
      <div
        className="w-full max-w-sm rounded-[2rem] p-6 space-y-4 text-left text-xs"
        style={{
          background: 'var(--card-bg-gradient)',
          border: '1px solid var(--card-border)',
          color: 'var(--text-main)',
          boxShadow: 'var(--card-shadow)',
        }}
      >
        <div
          className="flex items-center justify-between border-b pb-3"
          style={{ borderColor: 'var(--divider)' }}
        >
          <span className="font-bold text-sm">导入角色</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭导入窗口"
            className="p-1 rounded-full opacity-60 hover:opacity-100 transition-opacity"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p style={{ color: 'var(--text-sub)' }}>
          粘贴 json 或 txt 模板内容，也可以直接上传文件。解析后会先进入角色编辑页，你可以检查确认后再保存。
        </p>

        <div className="flex items-center gap-2">
          <label
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold cursor-pointer active:scale-95 transition-transform"
            style={controlStyle}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>上传文件</span>
            <input
              type="file"
              accept=".json,.txt"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
          <span className="opacity-50 flex items-center gap-1">
            <FileJson className="w-3 h-3" /> / <FileText className="w-3 h-3" />
          </span>
        </div>

        <textarea
          value={rawText}
          onChange={(e) => {
            setRawText(e.target.value);
            setError('');
          }}
          placeholder="在这里粘贴模板内容..."
          rows={8}
          className="w-full rounded-xl p-3 outline-none resize-none text-xs leading-relaxed"
          style={controlStyle}
        />

        {error && (
          <div className="flex items-start gap-1.5 text-[11px]" style={{ color: 'var(--accent-color)' }}>
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl font-semibold active:scale-95 transition-transform border"
            style={{ borderColor: 'var(--divider)', color: 'var(--text-main)' }}
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!rawText.trim()}
            className="px-4 py-2 rounded-xl font-semibold active:scale-95 transition-transform disabled:opacity-40"
            style={accentButtonStyle}
          >
            解析并继续
          </button>
        </div>
      </div>
    </div>
  );
};

export default CharacterImportModal;