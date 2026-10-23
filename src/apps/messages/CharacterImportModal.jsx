import React, { useState } from 'react';
import { X, Upload, FileJson, FileText, AlertCircle, Download } from 'lucide-react';
import { parseCharacterImportJson, parseCharacterImportTxt } from './characterImportService';

// 空白模板内容，内嵌在代码里，供"下载示例"按钮用——用户点一下就知道
// 导入功能认什么格式，不用凭空猜字段名怎么写。
const JSON_TEMPLATE = `{
  "format": "wiwu-character-v1",
  "name": "",
  "bio": "",
  "extraNotes": "",
  "userPersona": "",
  "statusList": [
    "",
    ""
  ],
  "worldBookEntries": [
    {
      "title": "",
      "content": ""
    }
  ],
  "knowledgeEntries": [
    {
      "title": "",
      "content": ""
    }
  ]
}
`;

const TXT_TEMPLATE = `【姓名】


【简介】


【补充说明】


【我的人设】


【待机状态】
（每行一条，可以增删行数）



【世界书】

【条目】
【内容】


【条目】
【内容】



【知识库】

【条目】
【内容】


【条目】
【内容】

`;

const downloadTemplate = (type) => {
  const content = type === 'json' ? JSON_TEMPLATE : TXT_TEMPLATE;
  const filename = type === 'json' ? 'character-import-template.json' : 'character-import-template.txt';
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// 角色导入弹窗：用户粘贴 json 或 txt 模板内容，纯本地确定性解析（不调用 AI），
// 解析结果交给调用方（CharacterLibrary -> MessagesApp）直接当作 characterData
// 铺进 CharacterEditor 的新建表单——用户还能在编辑器里再检查/调整一遍，
// 确认没问题才会真正写库。
//
// 布局说明（2026-10-23 修复手机端显示不全）：卡片本体用 flex flex-col +
// max-h-[85vh]，分成「头部 / 中间可滚动内容 / 底部按钮」三段，头尾
// shrink-0 固定不滚动，只有中间 overflow-y-auto——不用 sticky+负margin
// 这类定位技巧，避免在小屏上出现头部或按钮被裁掉的问题。
export const CharacterImportModal = ({ onClose, onImported }) => {
  const [rawText, setRawText] = useState('');
  const [error, setError] = useState('');

  const cardStyle = {
    background: 'var(--card-bg-gradient)',
    border: '1px solid var(--card-border)',
    color: 'var(--text-main)',
    boxShadow: 'var(--card-shadow)',
  };

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
        className="w-full max-w-sm max-h-[85vh] rounded-[2rem] flex flex-col text-left text-xs overflow-hidden"
        style={cardStyle}
      >
        {/* 头部：固定不滚动 */}
        <div
          className="flex items-center justify-between border-b px-6 pt-6 pb-3 shrink-0"
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

        {/* 中间：唯一会滚动的区域 */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <p style={{ color: 'var(--text-sub)' }}>
            粘贴 json 或 txt 模板内容，也可以直接上传文件。解析后会先进入角色编辑页，你可以检查确认后再保存。
          </p>

          <div className="space-y-1.5">
            <p className="opacity-50">不知道格式长什么样？先下载一份空白模板：</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => downloadTemplate('txt')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] active:scale-95 transition-transform"
                style={controlStyle}
              >
                <Download className="w-3 h-3" />
                <FileText className="w-3 h-3" />
                <span>txt 模板</span>
              </button>
              <button
                type="button"
                onClick={() => downloadTemplate('json')}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] active:scale-95 transition-transform"
                style={controlStyle}
              >
                <Download className="w-3 h-3" />
                <FileJson className="w-3 h-3" />
                <span>json 模板</span>
              </button>
            </div>
          </div>

          <label
            className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl font-semibold cursor-pointer active:scale-95 transition-transform w-fit"
            style={controlStyle}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>上传已填好的文件</span>
            <input
              type="file"
              accept=".json,.txt"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>

          <textarea
            value={rawText}
            onChange={(e) => {
              setRawText(e.target.value);
              setError('');
            }}
            placeholder="或者直接把填好的模板内容粘贴在这里..."
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
        </div>

        {/* 底部：固定不滚动，按钮始终可见 */}
        <div
          className="flex items-center justify-end gap-2 px-6 pt-3 pb-6 border-t shrink-0"
          style={{ borderColor: 'var(--divider)' }}
        >
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