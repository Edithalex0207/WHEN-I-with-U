import React, { useState, useRef, useEffect } from 'react';
import {
  ArrowLeft, Save, Trash2, Upload, Plus, BookOpen, Brain,
  List, User, X, Activity, Shield, ChevronDown, ChevronRight, FoldVertical, UnfoldVertical,
  Image as ImageIcon
} from 'lucide-react';
import GlassCard from '../../components/GlassCard';
import db from "../../db";
import VoiceProfilePanel from '../../features/real-voice/components/VoiceProfilePanel';
import RingtonePanel from '../../features/real-voice/components/RingtonePanel';
import VoicemailPanel from '../../features/real-voice/components/VoicemailPanel';
import { normalizeVoiceProfile } from '../../features/real-voice/realVoiceDefaults';

import AvatarHistoryModal from './components/AvatarHistoryModal';
import { recordAvatarHistory, deleteAvatarHistoryEntry } from './avatarHistoryService';
import FandomCharacterPanel from './components/FandomCharacterPanel';
import { normalizeFandomProfile } from './fandomCharacterPrompt';

// 随内容自动变长，且超出最大高度显示滚动条的自适应文本框组件
const AutoGrowingTextarea = ({
  value,
  onChange,
  placeholder,
  minHeight = '96px',
  maxHeight = '240px',
  className = '',
  ...props
}) => {
  const textareaRef = useRef(null);

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  const handleChange = (e) => {
    adjustHeight();
    onChange?.(e);
  };

  return (
    <textarea
      ref={textareaRef}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      style={{
        minHeight,
        maxHeight,
      }}
      className={`w-full bg-black/5 dark:bg-white/10 rounded-xl p-3 outline-none resize-none overflow-y-auto leading-relaxed transition-[height] duration-75 text-xs sm:text-sm custom-scrollbar ${className}`}
      {...props}
    />
  );
};

export const CharacterEditor = ({ characterData, onBack, onSaved }) => {
  const [character, setCharacter] = useState({
    id: characterData?.id || null,
    name: characterData?.name || '',
    avatar: characterData?.avatar || '',
    bio: characterData?.bio || '',
    extraNotes: characterData?.extraNotes || '',
    summaryFrequency: characterData?.summaryFrequency || 10,
    summaries: characterData?.summaries || [],
    worldBookEntries: characterData?.worldBookEntries || [],
    knowledgeEntries: characterData?.knowledgeEntries || [],
    linkTodo: characterData?.linkTodo ?? true,
    autoDiary: characterData?.autoDiary ?? true,
    userPersona: characterData?.userPersona || '',
    userAvatar: characterData?.userAvatar || '',
    statusList: characterData?.statusList || ['月色与你同在', '在咖啡馆看书', '静候你的回应', '心绪停留于此'],
    voiceProfile: normalizeVoiceProfile(characterData?.voiceProfile),
    ringtone: characterData?.ringtone || null,
    voicemail: characterData?.voicemail || null,
    fandom: normalizeFandomProfile(characterData?.fandom),
  });

  // 控制世界书与知识库手风琴折叠展开状态 (Key: entryId -> boolean)
  const [expandedWorldEntries, setExpandedWorldEntries] = useState({});
  const [expandedKnowledgeEntries, setExpandedKnowledgeEntries] = useState({});

  const [newStatus, setNewStatus] = useState('');
  const [newWorldTitle, setNewWorldTitle] = useState('');
  const [newWorldContent, setNewWorldContent] = useState('');
  const [newKnowledgeTitle, setNewKnowledgeTitle] = useState('');
  const [newKnowledgeContent, setNewKnowledgeContent] = useState('');
  const [newSummaryContent, setNewSummaryContent] = useState('');
  
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const avatarInputRef = useRef(null);
  const userAvatarInputRef = useRef(null);

  // 历史相册：mount 时的原始头像记一份快照，保存时用来判断"这次是不是
  // 真的换了头像"；选中一张历史图只是放进草稿（pendingAvatarHistoryId
  // 记下待消费的历史条目 id），要点顶部"保存"才真正生效。
  const originalAvatarRef = useRef(characterData?.avatar || '');
  const [showAvatarHistory, setShowAvatarHistory] = useState(false);
  const [pendingAvatarHistoryId, setPendingAvatarHistoryId] = useState(null);

  const handleImageUpload = (e, targetField) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCharacter((prev) => ({ ...prev, [targetField]: reader.result }));
    };
    reader.readAsDataURL(file);
  };

  const addStatus = () => {
    if (!newStatus.trim()) return;
    setCharacter((prev) => ({ ...prev, statusList: [...prev.statusList, newStatus.trim()] }));
    setNewStatus('');
  };

  const removeStatus = (idx) => {
    setCharacter((prev) => ({ ...prev, statusList: prev.statusList.filter((_, i) => i !== idx) }));
  };

  const addSummary = () => {
    if (!newSummaryContent.trim()) return;
    const item = { id: Date.now(), content: newSummaryContent.trim(), date: new Date().toLocaleDateString() };
    setCharacter((prev) => ({ ...prev, summaries: [item, ...prev.summaries] }));
    setNewSummaryContent('');
  };

  const removeSummary = (id) => {
    setCharacter((prev) => ({ ...prev, summaries: prev.summaries.filter((s) => s.id !== id) }));
  };

  // 世界书展开/折叠
  const toggleWorldEntry = (id) => {
    setExpandedWorldEntries(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAllWorldEntries = (expandAll) => {
    const nextState = {};
    character.worldBookEntries.forEach(w => { nextState[w.id] = expandAll; });
    setExpandedWorldEntries(nextState);
  };

  const addWorldEntry = () => {
    if (!newWorldTitle.trim() || !newWorldContent.trim()) return;
    const newId = Date.now();
    const entry = { id: newId, title: newWorldTitle.trim(), content: newWorldContent.trim(), isEnabled: true };
    setCharacter((prev) => ({ ...prev, worldBookEntries: [...prev.worldBookEntries, entry] }));
    setExpandedWorldEntries(prev => ({ ...prev, [newId]: true }));
    setNewWorldTitle('');
    setNewWorldContent('');
  };

  const removeWorldEntry = (id) => {
    setCharacter((prev) => ({ ...prev, worldBookEntries: prev.worldBookEntries.filter((w) => w.id !== id) }));
  };

  // 知识库展开/折叠
  const toggleKnowledgeEntry = (id) => {
    setExpandedKnowledgeEntries(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleAllKnowledgeEntries = (expandAll) => {
    const nextState = {};
    character.knowledgeEntries.forEach(k => { nextState[k.id] = expandAll; });
    setExpandedKnowledgeEntries(nextState);
  };

  const addKnowledgeEntry = () => {
    if (!newKnowledgeTitle.trim() || !newKnowledgeContent.trim()) return;
    const newId = Date.now();
    const entry = { id: newId, title: newKnowledgeTitle.trim(), content: newKnowledgeContent.trim(), isEnabled: true };
    setCharacter((prev) => ({ ...prev, knowledgeEntries: [...prev.knowledgeEntries, entry] }));
    setExpandedKnowledgeEntries(prev => ({ ...prev, [newId]: true }));
    setNewKnowledgeTitle('');
    setNewKnowledgeContent('');
  };

  const removeKnowledgeEntry = (id) => {
    setCharacter((prev) => ({ ...prev, knowledgeEntries: prev.knowledgeEntries.filter((k) => k.id !== id) }));
  };

  const handleSave = async () => {
    if (!character.name.trim()) return;

    try {
            // 2026-10 修复：character 这个 state 是按表单字段白名单初始化的，
      // 任何后续追加到 character 表记录上、但表单不认识的额外存储
      // 字段（比如情绪急救盒的 emotionKit、提问箱缓存等，这类功能普遍
      // 约定直接往现有表记录上加字段、不升级 Dexie 版本）都不在这个白
      // 名单里。`db.characters.put(payload)` 是整条记录覆盖写入，不是
      // 增量 patch，所以只要用户编辑并保存过一次角色，这些"表单不认识"
      // 的字段就会被整条覆盖掉——表现为"这个功能的缓存内容莫名其妙没了，
      // 又要重新生成一次"。
      // 这里先把 characterData（打开编辑器时拿到的完整原始记录）铺一层
      // 在底下，再叠上表单真正改过的字段，这样任何表单不认识的字段都会
      // 原样保留，不会被这次保存覆盖掉。
      const payload = { ...characterData, ...character };
      
      if (!payload.id) {
        delete payload.id;
        const newId = await db.characters.add({
          ...payload,
          createdAt: new Date().toISOString()
        });
        payload.id = newId;
      } else {
        await db.characters.put(payload);
      }

      // 头像历史相册：这次保存如果真的换了头像（跟 mount 时的原始头像
      // 不一样），把原始头像存进历史相册；如果这次换的是从历史相册里
      // 选回来的图，把那条记录从相册里消费掉（它现在是"在用"的头像了）。
      if (payload.id) {
        const originalAvatar = originalAvatarRef.current;
        if (originalAvatar && originalAvatar !== payload.avatar) {
          await recordAvatarHistory(payload.id, originalAvatar);
        }
        if (pendingAvatarHistoryId != null) {
          await deleteAvatarHistoryEntry(pendingAvatarHistoryId);
        }
      }

      if (onSaved) onSaved(payload);
      onBack();
    } catch (err) {
      console.error('Save character failed:', err);
    }
  };

  const handleDelete = async () => {
    if (!character.id) return;
    await db.characters.delete(character.id);
    if (onSaved) onSaved(null);
    onBack();
  };

  return (
    <div className="space-y-6 animate-fade-in-up pb-16 text-xs text-left">
      {/* 顶部 Navbar */}
      <div className="flex items-center justify-between">
        <button type="button" onClick={onBack} className="flex items-center gap-2 font-semibold opacity-70 hover:opacity-100">
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <span className="font-mono opacity-40 text-[10px] uppercase">CHARACTER BUILDER</span>
        <button
          type="button"
          onClick={handleSave}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black text-white dark:bg-white dark:text-black font-semibold active:scale-95 transition-all"
        >
          <Save className="w-3.5 h-3.5" />
          <span>保存</span>
        </button>
      </div>

      {/* 1. 基础形象与信息 */}
      <GlassCard className="space-y-4">
        <div className="flex items-center gap-2 font-bold text-sm">
          <User className="w-4 h-4" />
          <span>角色基础形象 (Profile Info)</span>
        </div>

        <div className="flex items-start gap-4 pt-1">
          <div className="space-y-2 shrink-0 text-center">
            <div
              onClick={() => avatarInputRef.current?.click()}
              className="w-16 h-16 rounded-full border border-white/20 bg-black/5 dark:bg-white/10 flex items-center justify-center cursor-pointer overflow-hidden relative group"
            >
              {character.avatar ? (
                <img src={character.avatar} alt="Avatar" className="w-full h-full object-cover" loading="lazy" decoding="async" />
              ) : (
                <Upload className="w-5 h-5 opacity-40" />
              )}
            </div>
            <input ref={avatarInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'avatar')} />
            <span className="text-[10px] opacity-50 block">角色头像</span>
            {character.id && (
              <button
                type="button"
                onClick={() => setShowAvatarHistory(true)}
                className="flex items-center gap-0.5 justify-center w-full text-[9px] opacity-50 hover:opacity-90"
              >
                <ImageIcon className="w-2.5 h-2.5" />
                <span>历史相册</span>
              </button>
            )}
          </div>

          <div className="flex-1 space-y-3">
            <div>
              <label className="block opacity-60 mb-1">角色姓名</label>
              <input
                type="text"
                placeholder="例如: Elena"
                value={character.name}
                onChange={(e) => setCharacter({ ...character, name: e.target.value })}
                className="w-full bg-black/5 dark:bg-white/10 rounded-lg p-2 outline-none font-medium"
              />
            </div>

            <div>
              <label className="block opacity-60 mb-1">角色简介 (Bio)</label>
              <AutoGrowingTextarea
                placeholder="一句话性格描述与主要特征..."
                value={character.bio}
                minHeight="90px"
                maxHeight="220px"
                onChange={(e) => setCharacter({ ...character, bio: e.target.value })}
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block opacity-60 mb-1">其它补充说明 (Extra Notes)</label>
          <AutoGrowingTextarea
            placeholder="关于角色的特殊补充偏好或人设限制..."
            value={character.extraNotes}
            minHeight="100px"
            maxHeight="260px"
            onChange={(e) => setCharacter({ ...character, extraNotes: e.target.value })}
          />
        </div>
            </GlassCard>

      <FandomCharacterPanel
        value={character.fandom}
        onChange={(fandom) => {
          setCharacter((previous) => ({
            ...previous,
            fandom,
          }));
        }}
      />

      <VoiceProfilePanel
        value={character.voiceProfile}
        onChange={(voiceProfile) => {
          setCharacter((previous) => ({
            ...previous,
            voiceProfile,
          }));
        }}
      />

      <RingtonePanel
        value={character.ringtone}
        onChange={(ringtone) => {
          setCharacter((previous) => ({
            ...previous,
            ringtone,
          }));
        }}
      />

      <VoicemailPanel
        value={character.voicemail}
        onChange={(voicemail) => {
          setCharacter((previous) => ({
            ...previous,
            voicemail,
          }));
        }}
      />

      {/* 2. 状态列表 (Status List) */}
      <GlassCard className="space-y-4">
        <div className="flex items-center gap-2 font-bold text-sm">
          <Activity className="w-4 h-4" />
          <span>待机状态与心境 (Custom Statuses)</span>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="新增一个状态，如：正在图书馆发呆..."
            value={newStatus}
            onChange={(e) => setNewStatus(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addStatus()}
            className="flex-1 bg-black/5 dark:bg-white/10 rounded-lg p-2 outline-none"
          />
          <button type="button" onClick={addStatus} className="px-3 py-2 rounded-lg bg-black/10 dark:bg-white/10 font-semibold">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {character.statusList.map((status, idx) => (
            <div key={idx} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-black/5 dark:bg-white/5 border border-white/10">
              <span>{status}</span>
              <button type="button" onClick={() => removeStatus(idx)} className="opacity-40 hover:opacity-100">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* 3. 记忆与阶段总结频率 */}
      <GlassCard className="space-y-4">
        <div className="flex items-center gap-2 font-bold text-sm">
          <List className="w-4 h-4" />
          <span>记忆整理与阶段总结 (Summaries)</span>
        </div>

        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="font-medium">自动总结频率 (轮次)</span>
            <p className="text-[10px] opacity-50">每对话指定轮数，将自动压缩提炼长期记忆</p>
          </div>
          <input
            type="number"
            min="5"
            max="50"
            value={character.summaryFrequency}
            onChange={(e) => setCharacter({ ...character, summaryFrequency: parseInt(e.target.value) || 10 })}
            className="w-20 bg-black/5 dark:bg-white/10 rounded-lg p-1.5 text-center outline-none"
          />
        </div>

        <div className="space-y-2 pt-2 border-t border-white/10">
          <label className="block opacity-60">历史总结条目 (Summaries)</label>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="新增一条阶段性总结..."
              value={newSummaryContent}
              onChange={(e) => setNewSummaryContent(e.target.value)}
              className="flex-1 bg-black/5 dark:bg-white/10 rounded-lg p-2 outline-none"
            />
            <button type="button" onClick={addSummary} className="px-3 py-2 rounded-lg bg-black/10 dark:bg-white/10 font-semibold">
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1.5 max-h-40 overflow-y-auto">
            {character.summaries.map((sum) => (
              <div key={sum.id} className="flex items-center justify-between p-2.5 rounded-xl bg-black/5 dark:bg-white/5">
                <div className="space-y-0.5">
                  <p className="opacity-90">{sum.content}</p>
                  <span className="text-[9px] opacity-40 font-mono">{sum.date}</span>
                </div>
                <button type="button" onClick={() => removeSummary(sum.id)} className="opacity-50 hover:opacity-100 p-1">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </GlassCard>

      {/* 4. 世界书 (World Book) */}
      <GlassCard className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm">
            <BookOpen className="w-4 h-4" />
            <span>世界书 (World Book - 场景与背景)</span>
          </div>

          {character.worldBookEntries.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => toggleAllWorldEntries(true)}
                className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded opacity-60 hover:opacity-100"
                title="全部展开"
              >
                <UnfoldVertical className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => toggleAllWorldEntries(false)}
                className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded opacity-60 hover:opacity-100"
                title="全部折叠"
              >
                <FoldVertical className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <input
            type="text"
            placeholder="条目标题 (例如: 设定背景)"
            value={newWorldTitle}
            onChange={(e) => setNewWorldTitle(e.target.value)}
            className="w-full bg-black/5 dark:bg-white/10 rounded-lg p-2 outline-none"
          />
          <AutoGrowingTextarea
            placeholder="详细世界观与条目正文..."
            value={newWorldContent}
            minHeight="96px"
            maxHeight="240px"
            onChange={(e) => setNewWorldContent(e.target.value)}
          />
          <button type="button" onClick={addWorldEntry} className="w-full py-2 rounded-xl bg-black/10 dark:bg-white/10 font-semibold">
            添加世界书条目
          </button>
        </div>

        <div className="space-y-2 pt-2">
          {character.worldBookEntries.map((w) => {
            const isExpanded = expandedWorldEntries[w.id] ?? false;
            return (
              <div key={w.id} className="rounded-xl bg-black/5 dark:bg-white/5 overflow-hidden transition-all">
                <div
                  onClick={() => toggleWorldEntry(w.id)}
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2 font-bold min-w-0 pr-2">
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />}
                    <span className="truncate">{w.title}</span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeWorldEntry(w.id);
                    }}
                    className="opacity-50 hover:opacity-100 p-1"
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  </button>
                </div>

                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-black/5 dark:border-white/5 text-[11px] opacity-80 leading-relaxed font-sans whitespace-pre-wrap">
                    {w.content}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* 5. 专属知识库 (Knowledge Base) */}
      <GlassCard className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-sm">
            <Brain className="w-4 h-4" />
            <span>专属知识库 (Knowledge Base)</span>
          </div>

          {character.knowledgeEntries.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => toggleAllKnowledgeEntries(true)}
                className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded opacity-60 hover:opacity-100"
                title="全部展开"
              >
                <UnfoldVertical className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => toggleAllKnowledgeEntries(false)}
                className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded opacity-60 hover:opacity-100"
                title="全部折叠"
              >
                <FoldVertical className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="space-y-2">
          <input
            type="text"
            placeholder="知识点标题 (例如: 喜爱的音乐)"
            value={newKnowledgeTitle}
            onChange={(e) => setNewKnowledgeTitle(e.target.value)}
            className="w-full bg-black/5 dark:bg-white/10 rounded-lg p-2 outline-none"
          />
          <AutoGrowingTextarea
            placeholder="知识库正文细节..."
            value={newKnowledgeContent}
            minHeight="96px"
            maxHeight="240px"
            onChange={(e) => setNewKnowledgeContent(e.target.value)}
          />
          <button type="button" onClick={addKnowledgeEntry} className="w-full py-2 rounded-xl bg-black/10 dark:bg-white/10 font-semibold">
            添加知识库条目
          </button>
        </div>

        <div className="space-y-2 pt-2">
          {character.knowledgeEntries.map((k) => {
            const isExpanded = expandedKnowledgeEntries[k.id] ?? false;
            return (
              <div key={k.id} className="rounded-xl bg-black/5 dark:bg-white/5 overflow-hidden transition-all">
                <div
                  onClick={() => toggleKnowledgeEntry(k.id)}
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                >
                  <div className="flex items-center gap-2 font-bold min-w-0 pr-2">
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0 opacity-60" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-60" />}
                    <span className="truncate">{k.title}</span>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeKnowledgeEntry(k.id);
                    }}
                    className="opacity-50 hover:opacity-100 p-1"
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  </button>
                </div>

                {isExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-black/5 dark:border-white/5 text-[11px] opacity-80 leading-relaxed font-sans whitespace-pre-wrap">
                    {k.content}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </GlassCard>

      {/* 6. 系统关联与 User 人设 */}
      <GlassCard className="space-y-4">
        <div className="flex items-center gap-2 font-bold text-sm">
          <Shield className="w-4 h-4" />
          <span>联动与用户人设 (System & User Persona)</span>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span>关联 TODO 与 日历</span>
            <input
              type="checkbox"
              checked={character.linkTodo}
              onChange={(e) => setCharacter({ ...character, linkTodo: e.target.checked })}
              className="w-4 h-4 accent-black dark:accent-white"
            />
          </div>

          <div className="flex items-center justify-between">
            <span>允许角色主动写日记</span>
            <input
              type="checkbox"
              checked={character.autoDiary}
              onChange={(e) => setCharacter({ ...character, autoDiary: e.target.checked })}
              className="w-4 h-4 accent-black dark:accent-white"
            />
          </div>
        </div>

        <div className="pt-2 border-t border-white/10 space-y-3">
          <div>
            <label className="block opacity-60 mb-1">我的人设 (User Persona - RP 模式生效)</label>
            <AutoGrowingTextarea
              placeholder="在此设定您的特定身份、称呼与背景..."
              value={character.userPersona}
              minHeight="100px"
              maxHeight="260px"
              onChange={(e) => setCharacter({ ...character, userPersona: e.target.value })}
            />
          </div>

          <div className="flex items-center gap-3">
            <div
              onClick={() => userAvatarInputRef.current?.click()}
              className="w-10 h-10 rounded-full border border-white/20 bg-black/5 dark:bg-white/10 flex items-center justify-center cursor-pointer overflow-hidden"
            >
              {character.userAvatar ? (
                <img src={character.userAvatar} alt="User Avatar" className="w-full h-full object-cover" loading="lazy" decoding="async" />
              ) : (
                <User className="w-4 h-4 opacity-40" />
              )}
            </div>
            <input ref={userAvatarInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleImageUpload(e, 'userAvatar')} />
            <span className="opacity-60 text-[11px]">点击自定义“我”在该对话中的专属头像</span>
          </div>
        </div>
      </GlassCard>

      {/* 删除按钮 */}
      {character.id && (
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setShowConfirmDelete(true)}
            className="w-full py-3 rounded-2xl bg-rose-500/10 text-rose-600 font-semibold flex items-center justify-center gap-2 active:scale-95 transition-all"
          >
            <Trash2 className="w-4 h-4" />
            <span>删除该角色</span>
          </button>
        </div>
      )}

      {/* 二次删除确认弹窗 */}
      {showConfirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
          <div className="w-full max-w-sm rounded-[2rem] bg-white dark:bg-neutral-900 border border-white/20 p-5 space-y-4 shadow-2xl">
            <h3 className="font-bold text-sm">强确认：是否彻底删除角色？</h3>
            <p className="opacity-70 text-[11px] leading-relaxed">此操作将移除该角色的全部设置与知识库数据，无法撤销。</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowConfirmDelete(false)} className="flex-1 py-2.5 rounded-xl bg-black/5 dark:bg-white/10 font-semibold">
                取消
              </button>
              <button type="button" onClick={handleDelete} className="flex-1 py-2.5 rounded-xl bg-rose-600 text-white font-semibold">
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 头像历史相册：选中一张只是放进草稿，要点顶部"保存"才真正生效 */}
      {showAvatarHistory && character.id && (
        <AvatarHistoryModal
          characterId={character.id}
          onClose={() => setShowAvatarHistory(false)}
          onRestore={(entry) => {
            setCharacter((prev) => ({ ...prev, avatar: entry.avatar }));
            setPendingAvatarHistoryId(entry.id);
            setShowAvatarHistory(false);
          }}
        />
      )}
    </div>
  );
};

export default CharacterEditor;