// src/apps/imagestudio/AppearancePanel.jsx
//
// 生图室「外貌」页：锁定角色和用户的外貌文字，生图时自动拼进提示词（拼接在切片B）。
//   - 角色外貌：存在角色记录上，所有聊天共用。
//   - 用户外貌：每个聊天可以单独填；没填的聊天回退到"全局默认用户外貌"。
// 读写都在 appearanceService.js，这里不碰 CharacterEditor.jsx / ChatSettingsModal.jsx。
//
// 所有文本框都是"输入时只改本地草稿，失焦才存库"。

import React, { useCallback, useEffect, useRef, useState } from 'react';

import db from '../../db';
import {
  getDefaultUserAppearance,
  setCharacterAppearance,
  setChatUserAppearance,
  setDefaultUserAppearance,
} from './appearanceService';
import { Field, SectionCard, SelectInput, TextArea } from './StudioFormParts';

const PLACEHOLDER_OPTION = { value: '', label: '请选择...' };

const AppearancePanel = () => {
  const [loaded, setLoaded] = useState(false);
  const [statusText, setStatusText] = useState('');
  const statusTimerRef = useRef(null);

  const [defaultUser, setDefaultUser] = useState('');
  const [savedDefaultUser, setSavedDefaultUser] = useState('');

  const [characters, setCharacters] = useState([]);
  const [selectedCharId, setSelectedCharId] = useState('');
  const [charDraft, setCharDraft] = useState('');

  const [chats, setChats] = useState([]);
  const [selectedChatId, setSelectedChatId] = useState('');
  const [chatDraft, setChatDraft] = useState('');

  const flash = useCallback((text) => {
    setStatusText(text);
    if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
    statusTimerRef.current = window.setTimeout(() => setStatusText(''), 1600);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const [characterList, chatList, defaultText] = await Promise.all([
          db.characters.toArray(),
          db.chats.toArray(),
          getDefaultUserAppearance(),
        ]);

        if (cancelled) return;

        setCharacters(characterList);
        setChats(chatList);
        setDefaultUser(defaultText);
        setSavedDefaultUser(defaultText);
      } catch (error) {
        console.warn('[ImageStudio] 读取外貌数据失败：', error);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    };

    void load();

    return () => {
      cancelled = true;
      if (statusTimerRef.current) window.clearTimeout(statusTimerRef.current);
    };
  }, []);

  const findCharacter = (idText) =>
    characters.find((item) => String(item.id) === idText) || null;

  const findChat = (idText) => chats.find((item) => String(item.id) === idText) || null;

  const characterNameById = (characterId) =>
    characters.find((item) => item.id === characterId)?.name || '未知角色';

  const handleSelectCharacter = (idText) => {
    setSelectedCharId(idText);
    setCharDraft(findCharacter(idText)?.imageAppearance || '');
  };

  const handleSelectChat = (idText) => {
    setSelectedChatId(idText);
    setChatDraft(findChat(idText)?.userImageAppearance || '');
  };

  const commitDefaultUser = async () => {
    if (defaultUser.trim() === savedDefaultUser.trim()) return;

    try {
      await setDefaultUserAppearance(defaultUser);
      setSavedDefaultUser(defaultUser.trim());
      flash('已保存');
    } catch (error) {
      console.warn('[ImageStudio] 保存全局用户外貌失败：', error);
      flash('保存失败，请重试');
    }
  };

  const commitCharacter = async () => {
    const character = findCharacter(selectedCharId);
    if (!character) return;
    if (charDraft.trim() === String(character.imageAppearance || '').trim()) return;

    try {
      await setCharacterAppearance(character.id, charDraft);
      setCharacters((prev) =>
        prev.map((item) =>
          item.id === character.id ? { ...item, imageAppearance: charDraft.trim() } : item
        )
      );
      flash('已保存');
    } catch (error) {
      console.warn('[ImageStudio] 保存角色外貌失败：', error);
      flash('保存失败，请重试');
    }
  };

  const commitChat = async () => {
    const chat = findChat(selectedChatId);
    if (!chat) return;
    if (chatDraft.trim() === String(chat.userImageAppearance || '').trim()) return;

    try {
      await setChatUserAppearance(chat.id, chatDraft);
      setChats((prev) =>
        prev.map((item) =>
          item.id === chat.id ? { ...item, userImageAppearance: chatDraft.trim() } : item
        )
      );
      flash('已保存');
    } catch (error) {
      console.warn('[ImageStudio] 保存聊天里的用户外貌失败：', error);
      flash('保存失败，请重试');
    }
  };

  if (!loaded) {
    return <p className="py-10 text-center text-xs opacity-50">读取中...</p>;
  }

  const characterOptions = [
    PLACEHOLDER_OPTION,
    ...characters.map((item) => ({ value: String(item.id), label: item.name || `角色 ${item.id}` })),
  ];

  const chatOptions = [
    PLACEHOLDER_OPTION,
    ...chats.map((item) => ({
      value: String(item.id),
      label: `${characterNameById(item.characterId)}${item.title ? ` / ${item.title}` : ''} (#${item.id})`,
    })),
  ];

  return (
    <div className="space-y-4">
      <div className="h-4 text-right text-[10px] opacity-60" aria-live="polite">
        {statusText}
      </div>

      <SectionCard
        title="角色外貌"
        subtitle="写在这里的文字会在生图时自动加进提示词，所有和这个角色的聊天共用。用 NovelAI 的话建议写成英文标签，用第三方接口可以写自然语言。"
      >
        <Field label="选择角色">
          <SelectInput
            value={selectedCharId}
            onChange={handleSelectCharacter}
            options={characterOptions}
          />
        </Field>

        {selectedCharId ? (
          <Field label="外貌描述" hint="失焦后自动保存。留空表示不锁定。">
            <TextArea
              value={charDraft}
              onChange={setCharDraft}
              onBlur={commitCharacter}
              placeholder="例如：1girl, long black hair, blue eyes, school uniform"
              rows={4}
            />
          </Field>
        ) : null}
      </SectionCard>

      <SectionCard
        title="全局默认用户外貌"
        subtitle="某个聊天里没有单独填用户外貌时，用这一份。"
      >
        <Field hint="失焦后自动保存。">
          <TextArea
            value={defaultUser}
            onChange={setDefaultUser}
            onBlur={commitDefaultUser}
            placeholder="例如：1boy, short brown hair, glasses"
            rows={3}
          />
        </Field>
      </SectionCard>

      <SectionCard
        title="聊天里的用户外貌"
        subtitle="给某一个聊天单独指定用户的外貌，优先级高于全局默认。"
      >
        <Field label="选择聊天">
          <SelectInput
            value={selectedChatId}
            onChange={handleSelectChat}
            options={chatOptions}
          />
        </Field>

        {selectedChatId ? (
          <Field label="用户外貌" hint="失焦后自动保存。留空表示这个聊天使用全局默认。">
            <TextArea
              value={chatDraft}
              onChange={setChatDraft}
              onBlur={commitChat}
              placeholder="留空则使用全局默认用户外貌"
              rows={3}
            />
          </Field>
        ) : null}
      </SectionCard>
    </div>
  );
};

export default AppearancePanel;