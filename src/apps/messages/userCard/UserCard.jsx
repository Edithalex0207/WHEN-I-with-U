import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, Pencil, X } from 'lucide-react';

import { compressImageFile } from '../../snapshots/services/snapshotMediaService';
import {
  STATUS_PRESETS,
  AWAY_PRESET_ID,
  getPreset,
  loadUserCard,
  saveUserCard,
} from './userCardService';
import { UserCardIcon, USER_CARD_ICON_KEYS } from './userCardIcons';
import './userCard.css';

const SAVE_DELAY_MS = 500;

const firstChar = (text, fallback) => (String(text || '').trim().charAt(0) || fallback);

/**
 * 会话列表顶部的用户名片（个人主页式）。
 * 平时只展示；点"编辑"才展开编辑区。状态可以直接在名片上点开切换。
 * 所有修改都是边改边存（防抖），不需要单独的保存按钮。
 */
export const UserCard = ({ characters = [] }) => {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [errorText, setErrorText] = useState('');

  const dataRef = useRef(null);
  const dirtyRef = useRef(false);
  const timerRef = useRef(null);
  const fileRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const loaded = await loadUserCard();
        if (!cancelled) setData(loaded);
      } catch (error) {
        console.error('[UserCard] 读取名片失败：', error);
        if (!cancelled) setErrorText('名片读取失败，请稍后重试。');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const flushSave = useCallback(async () => {
    if (!dirtyRef.current || !dataRef.current) return;

    dirtyRef.current = false;

    try {
      await saveUserCard(dataRef.current);
      setErrorText('');
    } catch (error) {
      console.error('[UserCard] 保存名片失败：', error);
      dirtyRef.current = true;
      setErrorText('名片保存失败，可能是图片过大或存储空间不足。');
    }
  }, []);

  useEffect(() => {
    dataRef.current = data;

    if (!dirtyRef.current) return undefined;

    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void flushSave();
    }, SAVE_DELAY_MS);

    return () => clearTimeout(timerRef.current);
  }, [data, flushSave]);

  // 关掉名片或离开页面时，把还没写入的修改立刻存掉。
  useEffect(() => () => {
    clearTimeout(timerRef.current);
    void flushSave();
  }, [flushSave]);

  const updateBase = (patch) => {
    dirtyRef.current = true;
    setData((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const updateCard = (patch) => {
    dirtyRef.current = true;
    setData((prev) => (prev ? { ...prev, card: { ...prev.card, ...patch } } : prev));
  };

  const applyPreset = (presetId) => {
    const preset = getPreset(presetId);

    updateCard({
      statusPreset: preset.id,
      statusIcon: preset.icon,
           statusText: preset.text || data?.card?.statusText || '',
      statusSince: preset.id === data?.card?.statusPreset
        ? data?.card?.statusSince || ''
        : new Date().toISOString(),
    });
  };

  const handleQuickPick = (presetId) => {
    setQuickOpen(false);
    applyPreset(presetId);

    if (presetId === 'custom') setEditing(true);
  };

  const handlePresetPick = (presetId) => {
    setPresetOpen(false);
    applyPreset(presetId);
  };

  const handleAvatarFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) return;

    try {
      const compressed = await compressImageFile(file, 600, 600, 0.85);
      updateBase({ avatar: compressed });
      setErrorText('');
    } catch (error) {
      setErrorText(error?.message || '头像处理失败，请换一张图片。');
    }
  };

  const toggleHidden = (characterId) => {
    const hidden = data?.card?.hiddenCharacterIds || [];

    updateCard({
      hiddenCharacterIds: hidden.includes(characterId)
        ? hidden.filter((id) => id !== characterId)
        : [...hidden, characterId],
    });
  };

  const toggleAllVisible = () => {
    const hidden = data?.card?.hiddenCharacterIds || [];
    const allVisible = characters.every((item) => !hidden.includes(item.id));

    updateCard({ hiddenCharacterIds: allVisible ? characters.map((item) => item.id) : [] });
  };

  const handleEditToggle = () => {
    if (editing) void flushSave();
    setEditing((value) => !value);
  };

  if (!data) {
    return errorText ? <div className="uc-error">{errorText}</div> : null;
  }

  const { card } = data;
  const preset = getPreset(card.statusPreset);
  const tone = `uc-tone-${preset.tone}`;
  const isAway = card.statusPreset === AWAY_PRESET_ID;
  const hidden = card.hiddenCharacterIds || [];
  const visibleCharacters = characters.filter((item) => !hidden.includes(item.id));
  const visibleCount = visibleCharacters.length;
  const initial = firstChar(data.name, '我');

  let visibleSummary = `共 ${visibleCount} 位`;
  if (characters.length === 0) visibleSummary = '还没有角色';
  else if (visibleCount === 0) visibleSummary = '所有角色都看不到';
  else if (visibleCount === characters.length) visibleSummary = '全部角色';

  let autoLabel = '自动回复（暂时不在线时启用）';
  if (isAway) autoLabel = card.autoReplyOn ? '自动回复' : '自动回复（已关闭）';

  return (
    <section className="uc-root" aria-label="我的名片">
      <div className="uc-site">
        <div className="uc-tabrow">
          <div className="uc-tab">
            <span>{data.name || '我'}的小站</span>
            <i>. . ✧</i>
          </div>
          <button
            type="button"
            className="uc-edit-pill"
            aria-expanded={editing}
            onClick={handleEditToggle}
          >
            <Pencil size={11} strokeWidth={2.4} />
            <span>{editing ? '完成' : '编辑'}</span>
          </button>
        </div>

        <div className="uc-banner uc-gingham">
          <div className="uc-banner-text">{card.bannerText || ' '}</div>
        </div>

        <div className="uc-addr">
          <div className="uc-round"><UserCardIcon name="star" size={11} /></div>
          <div className="uc-url">{data.handle || '@username'} . ✧</div>
          <div className="uc-round"><X size={11} strokeWidth={2.6} /></div>
        </div>

        <div className="uc-cols">
          <div className="uc-col">
            <div className="uc-panel uc-panel-fill">
              <div
                className="uc-avatar"
                style={data.avatar ? { backgroundImage: `url(${data.avatar})` } : undefined}
              >
                {!data.avatar && initial}
                <div className={`uc-avatar-ico ${tone}`}>
                  <UserCardIcon name={card.statusIcon} size={15} />
                </div>
              </div>
              <div className="uc-kv">
                <div className="uc-kv-row"><span className="uc-kv-k">心情</span><span className="uc-kv-v">{card.mood || '-'}</span></div>
                <div className="uc-kv-row"><span className="uc-kv-k">在做</span><span className="uc-kv-v">{card.doing || '-'}</span></div>
                <div className="uc-kv-row"><span className="uc-kv-k">在听</span><span className="uc-kv-v">{card.listen || '-'}</span></div>
              </div>
            </div>
          </div>

          <div className="uc-col">
            <div className="uc-panel">
              <div className="uc-welcome">
                <div className="uc-welcome-title">{card.title || ' '}</div>
                <div className="uc-welcome-bio">{data.bio}</div>
                <div className="uc-sep">﹏﹏୨୧﹏﹏</div>
              </div>
            </div>

            <div className="uc-panel uc-panel-fill">
              <div className="uc-pill-head">状态</div>
              <div className="uc-status-body">
                <button
                  type="button"
                  className="uc-status-cur"
                  aria-expanded={quickOpen}
                  aria-haspopup="listbox"
                  onClick={() => setQuickOpen((value) => !value)}
                >
                  <span className={`uc-status-ico ${tone}`}>
                    <UserCardIcon name={card.statusIcon} size={12} />
                  </span>
                  <span className={`uc-status-txt ${tone}`}>{card.statusText || preset.name}</span>
                  <ChevronDown className={`uc-chev ${quickOpen ? 'is-open' : ''}`} size={10} strokeWidth={2.5} />
                </button>

                {quickOpen && (
                  <div className="uc-status-list" role="listbox">
                    {STATUS_PRESETS.filter((item) => item.id !== 'custom').map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={item.id === card.statusPreset}
                        className={`uc-status-item ${item.id === card.statusPreset ? 'is-sel' : ''}`}
                        onClick={() => handleQuickPick(item.id)}
                      >
                        <UserCardIcon name={item.icon} size={13} />
                        <span>{item.name}</span>
                      </button>
                    ))}
                    <button
                      type="button"
                      role="option"
                      aria-selected={card.statusPreset === 'custom'}
                      className="uc-status-item is-add"
                      onClick={() => handleQuickPick('custom')}
                    >
                      <UserCardIcon name="star" size={13} />
                      <span>添加自己的状态</span>
                    </button>
                  </div>
                )}

                <div className={`uc-auto ${isAway && card.autoReplyOn ? '' : 'is-off'}`}>
                  <span className="uc-auto-lab">{autoLabel}</span>
                  <span className="uc-auto-txt">{card.autoReplyText || '（还没写自动回复）'}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="uc-panel">
          <div className="uc-pill-head">谁看得到</div>
          <div className="uc-who">
            {visibleCharacters.map((item) => (
              <div key={item.id} className="uc-who-item">
                {item.avatar ? (
                  <img className="uc-who-av" src={item.avatar} alt={item.name} loading="lazy" decoding="async" />
                ) : (
                  <div className="uc-who-av uc-who-fallback">{firstChar(item.name, '?')}</div>
                )}
                <span className="uc-who-name">{item.name}</span>
              </div>
            ))}
            <span className="uc-who-more">{visibleSummary}</span>
          </div>
        </div>
      </div>

      {errorText && <div className="uc-error">{errorText}</div>}

      <div className={`uc-drawer ${editing ? 'is-open' : ''}`}>
        <div className="uc-drawer-in">
          <div className="uc-site uc-editor">
            <div className="uc-panel">
              <div className="uc-pill-head">头像与名字</div>
              <div className="uc-ed-body">
                <div className="uc-av-row">
                  <div
                    className="uc-mini-av"
                    style={data.avatar ? { backgroundImage: `url(${data.avatar})` } : undefined}
                  >
                    {!data.avatar && initial}
                  </div>
                  <div className="uc-av-actions">
                    <button type="button" className="uc-pill-btn" onClick={() => fileRef.current?.click()}>
                      更换头像
                    </button>
                    <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatarFile} />
                    <span className="uc-hint">和首页资料卡共用同一张头像</span>
                  </div>
                </div>
                <div className="uc-row2">
                  <label className="uc-field">
                    <span>名字</span>
                    <input type="text" maxLength={14} value={data.name} onChange={(e) => updateBase({ name: e.target.value })} />
                  </label>
                  <label className="uc-field">
                    <span>@ 标识</span>
                    <input type="text" maxLength={20} value={data.handle} onChange={(e) => updateBase({ handle: e.target.value })} />
                  </label>
                </div>
                <label className="uc-field">
                  <span>个性签名</span>
                  <textarea maxLength={60} value={data.bio} onChange={(e) => updateBase({ bio: e.target.value })} />
                </label>
              </div>
            </div>

            <div className="uc-panel">
              <div className="uc-pill-head">装饰文字</div>
              <div className="uc-ed-body">
                <div className="uc-row2">
                  <label className="uc-field">
                    <span>大标题</span>
                    <input type="text" maxLength={12} value={card.title} onChange={(e) => updateCard({ title: e.target.value })} />
                  </label>
                  <label className="uc-field">
                    <span>横幅小字</span>
                    <input type="text" maxLength={16} value={card.bannerText} onChange={(e) => updateCard({ bannerText: e.target.value })} />
                  </label>
                </div>
              </div>
            </div>

            <div className="uc-panel">
              <div className="uc-pill-head">我的状态</div>
              <div className="uc-ed-body">
                <div className="uc-dd">
                  <button
                    type="button"
                    className="uc-dd-btn"
                    aria-haspopup="listbox"
                    aria-expanded={presetOpen}
                    onClick={() => setPresetOpen((value) => !value)}
                  >
                    <UserCardIcon name={card.statusIcon} size={16} />
                    <span className="uc-dd-label">{preset.name}</span>
                    <ChevronDown className={`uc-chev ${presetOpen ? 'is-open' : ''}`} size={11} strokeWidth={2.5} />
                  </button>
                  {presetOpen && (
                    <div className="uc-dd-list" role="listbox">
                      {STATUS_PRESETS.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          role="option"
                          aria-selected={item.id === card.statusPreset}
                          className={`uc-dd-item ${item.id === card.statusPreset ? 'is-sel' : ''}`}
                          onClick={() => handlePresetPick(item.id)}
                        >
                          <UserCardIcon name={item.icon} size={15} />
                          <span>
                            <span className="uc-dd-name">{item.name}</span>
                            <span className="uc-dd-desc">{item.desc}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <label className="uc-field">
                  <span>状态文字（可自己写）</span>
                  <input type="text" maxLength={20} value={card.statusText} onChange={(e) => updateCard({ statusText: e.target.value })} />
                </label>

                <div className="uc-field">
                  <span>状态图标</span>
                  <div className="uc-icon-grid">
                    {USER_CARD_ICON_KEYS.map((key) => (
                      <button
                        key={key}
                        type="button"
                        className={`uc-icon-opt ${key === card.statusIcon ? 'is-sel' : ''}`}
                        aria-label={`图标 ${key}`}
                        aria-pressed={key === card.statusIcon}
                        onClick={() => updateCard({ statusIcon: key })}
                      >
                        <UserCardIcon name={key} size={16} />
                      </button>
                    ))}
                  </div>
                </div>

                <div className="uc-row2">
                  <label className="uc-field">
                    <span>心情</span>
                    <input type="text" maxLength={10} value={card.mood} onChange={(e) => updateCard({ mood: e.target.value })} />
                  </label>
                  <label className="uc-field">
                    <span>在做</span>
                    <input type="text" maxLength={12} value={card.doing} onChange={(e) => updateCard({ doing: e.target.value })} />
                  </label>
                </div>
                <label className="uc-field">
                  <span>在听</span>
                  <input type="text" maxLength={16} value={card.listen} onChange={(e) => updateCard({ listen: e.target.value })} />
                </label>
              </div>
            </div>

            <div className="uc-panel">
              <div className="uc-pill-head">哪些角色能看到</div>
              <div className="uc-ed-body">
                <div className="uc-sec-line">
                  <span className="uc-hint">没勾选的角色看不到这条状态</span>
                  <button type="button" className="uc-link-btn" onClick={toggleAllVisible}>
                    {characters.every((item) => !hidden.includes(item.id)) ? '取消全选' : '全选'}
                  </button>
                </div>
                {characters.length === 0 ? (
                  <span className="uc-hint">还没有角色，创建角色后可以在这里选择。</span>
                ) : (
                  <div className="uc-vis-row">
                    {characters.map((item) => {
                      const on = !hidden.includes(item.id);

                      return (
                        <button
                          key={item.id}
                          type="button"
                          className={`uc-vchip ${on ? 'is-on' : ''}`}
                          aria-pressed={on}
                          onClick={() => toggleHidden(item.id)}
                        >
                          {item.avatar ? (
                            <img className="uc-vchip-av" src={item.avatar} alt="" loading="lazy" decoding="async" />
                          ) : (
                            <span className="uc-vchip-av uc-who-fallback">{firstChar(item.name, '?')}</span>
                          )}
                          <span className="uc-vchip-name">{item.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="uc-panel">
              <div className="uc-pill-head">暂时不在线自动回复</div>
              <div className="uc-ed-body">
                <div className="uc-sec-line">
                  <span className="uc-sec-title">开启自动回复</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={card.autoReplyOn}
                    aria-label="开启自动回复"
                    className="uc-switch"
                    onClick={() => updateCard({ autoReplyOn: !card.autoReplyOn })}
                  />
                </div>
                <label className="uc-field">
                  <textarea
                    maxLength={40}
                    aria-label="自动回复内容"
                    value={card.autoReplyText}
                    onChange={(e) => updateCard({ autoReplyText: e.target.value })}
                  />
                </label>
                <span className="uc-hint">
                  状态为"暂时不在线"时，角色主动来找你，会先收到这句话。只对勾选的角色生效。
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default UserCard;