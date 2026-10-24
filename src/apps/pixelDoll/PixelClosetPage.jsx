/*
 * 像素衣橱页面（每个聊天一个，手动从"更多入口"打开）。
 *
 * 用法跟 CompanionPage 一样：整页盖在聊天上面，从 ChatRoom 里用 lazy() +
 * Suspense 打开，所以只有用户点开这一页时，整个 pixelDoll 文件夹才会被加载。
 *
 *   <PixelClosetPage chatId={chatId} character={character} onBack={...} />
 *
 * 数据：打开时先 ensurePixelDollProfile 建档案，再用 liveQuery 订阅
 * readPixelDollState，所以任何地方（调度器、挂件）改了小人，这里都会跟着变。
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { liveQuery } from 'dexie';

import PixelDollCanvas from './PixelDollCanvas';
import { COLOR_GROUPS } from './pixelDollParts';
import { applyGiftToLook, describeGift, getPartPool } from './pixelDollEngine';
import {
  deletePixelDollPart,
  ensurePixelDollProfile,
  giveGiftToUser,
  importPixelDollPart,
  logPixelDollEvent,
  readPixelDollState,
  resolveGiftByCharacter,
  saveDesignedBody,
  selectPixelDollBody,
  sendGiftToCharacter,
  setPixelDollLook,
  setPixelDollWidgetEnabled,
} from './pixelDollService';
import { chooseGiftForUser, decideGiftReaction, designPixelDollBody } from './pixelDollAiService';
import './pixelCloset.css';

const CATEGORY_TABS = [
  { id: 'hair', label: '发型' },
  { id: 'eyes', label: '眼睛' },
  { id: 'outfit', label: '衣着' },
  { id: 'color', label: '配色' },
];

const CATEGORY_LABEL = { hair: '发型', eyes: '眼睛', outfit: '衣着', body: '身形' };

const STATUS_TEXT = { pending: '等待中', worn: '已穿上', declined: '婉拒了' };

const IMPORT_EXAMPLE = `{
  "category": "hair",
  "id": "my-hair",
  "name": "我的发型",
  "front": { "y": 1, "rows": ["....oooooooo....", "...ohhhhhhhho..."] }
}`;

const GIFT_SVG = '<svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="13" rx="2"/><path d="M12 8v13M3 12h18M12 8c-2.5 0-4-1-4-2.5S9.2 3 10.6 3C12 3 12 5 12 8zm0 0c2.5 0 4-1 4-2.5S14.8 3 13.4 3C12 3 12 5 12 8z"/></svg>';

const formatTime = (iso) => {
  try {
    return new Date(iso).toLocaleString('zh-CN', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  } catch (e) {
    return '';
  }
};

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

const Icon = ({ name }) => {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (name === 'back') return <svg {...common}><path d="M15 5l-7 7 7 7" /></svg>;
  if (name === 'widget') return <svg {...common}><rect x="3" y="4" width="18" height="14" rx="3" /><circle cx="17" cy="14" r="2" /></svg>;
  if (name === 'gift') return <svg {...common}><rect x="3" y="8" width="18" height="13" rx="2" /><path d="M12 8v13M3 12h18M12 8c-2.5 0-4-1-4-2.5S9.2 3 10.6 3C12 3 12 5 12 8zm0 0c2.5 0 4-1 4-2.5S14.8 3 13.4 3C12 3 12 5 12 8z" /></svg>;
  if (name === 'trash') return <svg {...common}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>;
  return null;
};

export const PixelClosetPage = ({ chatId, character, onBack }) => {
  const [state, setState] = useState(null);
  const [tab, setTab] = useState('closet');
  const [cat, setCat] = useState('outfit');
  const [pick, setPick] = useState(null);
  const [busy, setBusy] = useState('');
  const [bubbles, setBubbles] = useState({ user: null, char: null });
  const [popOpen, setPopOpen] = useState(false);

  const [designWho, setDesignWho] = useState('char');
  const [wish, setWish] = useState('');
  const [design, setDesign] = useState(null);
  const [designMsg, setDesignMsg] = useState({ text: '', err: false });
  const [bodyWho, setBodyWho] = useState('user');
  const [giftMsg, setGiftMsg] = useState({ text: '', err: false });
  const [importText, setImportText] = useState('');
  const [importMsg, setImportMsg] = useState({ text: '', err: false });
  const [armedDelete, setArmedDelete] = useState(null);

  const stageRef = useRef(null);
  const spriteRefs = useRef({ user: null, char: null });
  const timers = useRef({});
  const mounted = useRef(true);
  const stateRef = useRef(null);

  stateRef.current = state;

  const charName = (character && character.name) || 'TA';

  /* ---------- 数据订阅 ---------- */

  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    let subscription = null;

    ensurePixelDollProfile(chatId)
      .then(() => {
        if (cancelled) return;
        subscription = liveQuery(() => readPixelDollState(chatId)).subscribe({
          next: (next) => { if (!cancelled) setState(next); },
          error: (error) => console.error('[PixelCloset] 读取失败', error),
        });
      })
      .catch((error) => console.error('[PixelCloset] 建档案失败', error));

    return () => {
      cancelled = true;
      mounted.current = false;
      if (subscription) subscription.unsubscribe();
      Object.values(timers.current).forEach((id) => clearTimeout(id));
    };
  }, [chatId]);

  const profile = state && state.profile;
  const customParts = state ? state.customParts : null;
  const userLook = profile && profile.userLook;
  const charLook = profile && profile.charLook;

  /* ---------- 气泡 / 动画 ---------- */

  const say = useCallback((who, text, ms = 4200) => {
    if (!mounted.current) return;
    clearTimeout(timers.current[who]);
    setBubbles((prev) => ({ ...prev, [who]: { text, typing: false } }));
    timers.current[who] = setTimeout(() => {
      if (mounted.current) setBubbles((prev) => ({ ...prev, [who]: null }));
    }, ms);
  }, []);

  const typing = useCallback((who) => {
    if (!mounted.current) return;
    clearTimeout(timers.current[who]);
    setBubbles((prev) => ({ ...prev, [who]: { text: '', typing: true } }));
  }, []);

  const land = useCallback((who) => {
    const el = spriteRefs.current[who];
    if (!el) return;
    el.classList.remove('landed');
    // 触发重排，让动画可以重复播放
    void el.offsetWidth; // eslint-disable-line no-void
    el.classList.add('landed');
  }, []);

  const fly = useCallback((fromWho, toWho) => new Promise((resolve) => {
    const stage = stageRef.current;
    const from = spriteRefs.current[fromWho];
    const to = spriteRefs.current[toWho];
    if (!stage || !from || !to || !stage.animate) {
      resolve();
      return;
    }

    const sr = stage.getBoundingClientRect();
    const a = from.getBoundingClientRect();
    const b = to.getBoundingClientRect();
    const x0 = a.left + a.width / 2 - sr.left - 13;
    const y0 = a.top + a.height * 0.25 - sr.top;
    const x1 = b.left + b.width / 2 - sr.left - 13;
    const y1 = b.top + b.height * 0.25 - sr.top;

    const el = document.createElement('div');
    el.className = 'pd-gift-fly';
    el.innerHTML = GIFT_SVG;
    stage.appendChild(el);

    const animation = el.animate([
      { transform: `translate(${x0}px, ${y0}px) scale(0.6) rotate(-12deg)`, opacity: 0.2 },
      { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - 64}px) scale(1.15) rotate(8deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${x1}px, ${y1}px) scale(0.9) rotate(0deg)`, opacity: 1 },
    ], { duration: 780, easing: 'cubic-bezier(0.4, 0, 0.3, 1)', fill: 'forwards' });

    animation.onfinish = () => {
      el.remove();
      for (let i = 0; i < 6; i += 1) {
        const spark = document.createElement('i');
        spark.className = 'pd-spark';
        const angle = (Math.PI * 2 * i) / 6;
        spark.style.left = `${x1 + 10}px`;
        spark.style.top = `${y1 + 10}px`;
        spark.style.setProperty('--dx', `${Math.cos(angle) * 30}px`);
        spark.style.setProperty('--dy', `${Math.sin(angle) * 30}px`);
        stage.appendChild(spark);
        setTimeout(() => spark.remove(), 720);
      }
      resolve();
    };
    animation.oncancel = () => { el.remove(); resolve(); };
  }), []);

  /* ---------- 送礼物给 TA ---------- */

  const handleSend = useCallback(async () => {
    const current = stateRef.current;
    if (!pick || busy || !current || !current.profile) return;

    setBusy('send');
    setGiftMsg({ text: '', err: false });
    const gift = pick;

    try {
      const record = await sendGiftToCharacter(chatId, gift);
      if (!record) throw new Error('礼物没能送出去');
      setPick(null);

      const flying = fly('user', 'char');
      typing('char');
      const [reaction] = await Promise.all([
        decideGiftReaction({
          chatId,
          character,
          giftLabel: record.label,
          charLook: current.profile.charLook,
          customParts: current.customParts,
        }),
        flying,
      ]);

      await resolveGiftByCharacter(record.id, {
        accepted: reaction.accepted,
        replyText: reaction.replyText,
      });

      say('char', reaction.replyText);
      if (reaction.accepted) land('char');
    } catch (error) {
      console.error('[PixelCloset] 送礼物失败', error);
      setBubbles((prev) => ({ ...prev, char: null }));
      setGiftMsg({ text: '礼物没送成功，请稍后再试', err: true });
    } finally {
      if (mounted.current) setBusy('');
    }
  }, [pick, busy, chatId, character, fly, typing, say, land]);

  /* ---------- 让 TA 挑一件送我 ---------- */

  const handleAskGift = useCallback(async () => {
    const current = stateRef.current;
    if (busy || !current || !current.profile) return;

    setBusy('ask');
    setGiftMsg({ text: '', err: false });
    typing('char');

    try {
      const result = await chooseGiftForUser({
        chatId,
        character,
        userLook: current.profile.userLook,
        customParts: current.customParts,
        force: true,
      });

      if (!result || !result.gift) {
        setBubbles((prev) => ({ ...prev, char: null }));
        setGiftMsg({ text: `${charName} 这次没想好送什么，等会儿再试试`, err: true });
        return;
      }

      await fly('char', 'user');
      const record = await giveGiftToUser(chatId, result.gift, { noteText: result.note });
      say('char', (record && record.replyText) || result.note);
      land('user');
    } catch (error) {
      console.error('[PixelCloset] 角色送礼失败', error);
      setBubbles((prev) => ({ ...prev, char: null }));
      setGiftMsg({ text: '没成功，请稍后再试', err: true });
    } finally {
      if (mounted.current) setBusy('');
    }
  }, [busy, chatId, character, charName, fly, typing, say, land]);

  /* ---------- AI 设计身体 ---------- */

  const discardDesign = useCallback(async (d) => {
    if (!d) return;
    await setPixelDollLook(chatId, d.who, d.prevLook);
    await deletePixelDollPart(d.rowId);
  }, [chatId]);

  const runDesign = useCallback(async (baseDesign) => {
    const current = stateRef.current;
    if (busy || !current || !current.profile) return;

    setBusy('design');
    setDesignMsg({ text: '', err: false });

    try {
      let prevLook;
      let who = designWho;
      if (baseDesign) {
        who = baseDesign.who;
        prevLook = baseDesign.prevLook;
        await discardDesign(baseDesign);
        setDesign(null);
      } else {
        prevLook = who === 'char' ? current.profile.charLook : current.profile.userLook;
      }

      if (who === 'char') typing('char');

      const result = await designPixelDollBody({ chatId, character, who, wish });
      if (!result.ok) {
        setBubbles((prev) => ({ ...prev, char: null }));
        // 还原失败前的外观（重来时已经还原过了）
        setDesignMsg({ text: result.error || '设计失败，请再试一次', err: true });
        return;
      }

      const saved = await saveDesignedBody(chatId, who, result.data);
      if (!saved.ok) {
        setBubbles((prev) => ({ ...prev, char: null }));
        setDesignMsg({ text: saved.error || '保存失败', err: true });
        return;
      }

      setBubbles((prev) => ({ ...prev, char: null }));
      setDesign({
        who,
        rowId: saved.rowId,
        prevLook,
        name: result.data.name || '新身体',
        data: result.data,
      });
      land(who);
      setDesignMsg({ text: '设计好了，已经穿在身上，满意就保留吧', err: false });
    } catch (error) {
      console.error('[PixelCloset] 设计失败', error);
      setBubbles((prev) => ({ ...prev, char: null }));
      setDesignMsg({ text: '设计失败，请稍后再试', err: true });
    } finally {
      if (mounted.current) setBusy('');
    }
  }, [busy, designWho, chatId, character, wish, discardDesign, typing, land]);

  const keepDesign = useCallback(async () => {
    if (!design) return;
    try {
      await logPixelDollEvent(chatId, {
        from: design.who === 'char' ? 'char' : 'user',
        label: `新身体 · ${design.name}`,
        status: 'worn',
      });
    } catch (error) {
      console.error('[PixelCloset] 记录失败', error);
    }
    setDesign(null);
    setDesignMsg({ text: '已保留，之后可以在下面的"身形"里随时切换', err: false });
  }, [design, chatId]);

  const dropDesign = useCallback(async () => {
    if (!design || busy) return;
    try {
      await discardDesign(design);
      setDesign(null);
      setDesignMsg({ text: '已放弃，恢复成之前的样子', err: false });
    } catch (error) {
      console.error('[PixelCloset] 放弃失败', error);
      setDesignMsg({ text: '操作失败，请稍后再试', err: true });
    }
  }, [design, busy, discardDesign]);

  /* ---------- 身形 / 导入 / 挂件 ---------- */

  const handleSelectBody = useCallback(async (bodyId) => {
    try {
      await selectPixelDollBody(chatId, bodyWho, bodyId, { applyHint: true });
      land(bodyWho);
    } catch (error) {
      console.error('[PixelCloset] 换身形失败', error);
    }
  }, [chatId, bodyWho, land]);

  const handleImport = useCallback(async () => {
    if (!importText.trim()) {
      setImportMsg({ text: '先把 JSON 粘贴进来', err: true });
      return;
    }
    try {
      const result = await importPixelDollPart(chatId, importText);
      if (result.ok) {
        setImportMsg({
          text: `${result.replaced ? '已覆盖' : '已导入'}：${CATEGORY_LABEL[result.category] || ''} · ${result.name}`,
          err: false,
        });
        setImportText('');
      } else {
        setImportMsg({ text: result.error || '导入失败', err: true });
      }
    } catch (error) {
      console.error('[PixelCloset] 导入失败', error);
      setImportMsg({ text: '导入失败，请检查 JSON 格式', err: true });
    }
  }, [chatId, importText]);

  const handleDeletePart = useCallback(async (rowId) => {
    if (armedDelete !== rowId) {
      setArmedDelete(rowId);
      clearTimeout(timers.current.armed);
      timers.current.armed = setTimeout(() => {
        if (mounted.current) setArmedDelete(null);
      }, 2600);
      return;
    }
    setArmedDelete(null);
    try {
      await deletePixelDollPart(rowId);
    } catch (error) {
      console.error('[PixelCloset] 删除失败', error);
    }
  }, [armedDelete]);

  const toggleWidget = useCallback(async () => {
    try {
      await setPixelDollWidgetEnabled(chatId, !(stateRef.current && stateRef.current.profile && stateRef.current.profile.widgetEnabled));
    } catch (error) {
      console.error('[PixelCloset] 切换挂件失败', error);
    }
  }, [chatId]);

  /* ---------- 衍生数据 ---------- */

  const partItems = useMemo(() => {
    if (!customParts || cat === 'color') return [];
    return Object.entries(getPartPool(cat, customParts)).map(([id, part]) => ({
      id,
      name: (part && part.name) || id,
    }));
  }, [customParts, cat]);

  const bodyOptions = useMemo(() => {
    if (!customParts) return [];
    return [
      { id: 'standard', name: '标准' },
      ...Object.entries(getPartPool('body', customParts)).map(([id, part]) => ({ id, name: (part && part.name) || id })),
    ];
  }, [customParts]);

  if (!profile || !customParts) {
    return (
      <div className="pd-root" role="dialog" aria-label="像素衣橱">
        <div className="pd-blobs" aria-hidden="true">
          <i className="pd-blob b1" /><i className="pd-blob b2" />
        </div>
        <div className="pd-app">
          <div className="pd-top">
            <button type="button" className="pd-round pd-glass" onClick={onBack} aria-label="返回"><Icon name="back" /></button>
          </div>
        </div>
      </div>
    );
  }

  const widgetOn = Boolean(profile.widgetEnabled);
  const pickLabel = pick ? describeGift(pick, customParts) : '';
  const bodyLook = bodyWho === 'char' ? charLook : userLook;
  const customRows = state.partRows || [];

  const renderDoll = (who, look) => {
    const bubble = bubbles[who];
    return (
      <div className={`pd-doll ${who}`} style={{ '--pd-halo': look.outfitMain }}>
        <div className={`pd-bubble ${bubble ? 'show' : ''}`} role="status">
          {bubble && bubble.typing
            ? <span className="pd-dots"><span /><span /><span /></span>
            : bubble && bubble.text}
        </div>
        <i className="pd-halo" />
        <div className="pd-sprite" ref={(el) => { spriteRefs.current[who] = el; }}>
          <PixelDollCanvas look={look} customParts={customParts} kind={who} label={who === 'user' ? '你的小人' : `${charName}的小人`} />
        </div>
        <div className="pd-floor-shadow" />
        <div className="pd-plate pd-glass"><i /><span>{who === 'user' ? '我' : charName}</span></div>
      </div>
    );
  };

  return (
    <div className="pd-root" role="dialog" aria-label="像素衣橱">
      <div className="pd-blobs" aria-hidden="true">
        <i className="pd-blob b1" /><i className="pd-blob b2" /><i className="pd-blob b3" />
      </div>
      <div className="pd-grain" aria-hidden="true" />

      <div className="pd-app">
        <div className="pd-top">
          <button type="button" className="pd-round pd-glass" onClick={onBack} aria-label="返回"><Icon name="back" /></button>
          <div className="pd-title">
            <b>像素衣橱</b>
            <small>我 &amp; {charName}</small>
          </div>
          <button
            type="button"
            className={`pd-round pd-glass ${widgetOn ? 'on' : ''}`}
            onClick={() => setPopOpen((v) => !v)}
            aria-label="聊天窗小挂件设置"
            aria-expanded={popOpen}
          >
            <Icon name="widget" />
          </button>
        </div>

        <div className={`pd-pop pd-glass ${popOpen ? 'on' : ''}`} aria-hidden={!popOpen}>
          <h3>聊天窗小挂件</h3>
          <p>开启后，聊天窗右下角会出现你们两个并排的小人。默认关闭，只有这里打开才会出现。</p>
          <div className="pd-mock" aria-hidden="true">
            <div className="pd-mb them">今天穿什么好呢</div>
            <div className="pd-mb me">你送我的那件</div>
            <div className={`pd-pill pd-glass ${widgetOn ? 'on' : ''}`}>
              <div><PixelDollCanvas look={userLook} customParts={customParts} kind="user" /></div>
              <div><PixelDollCanvas look={charLook} customParts={customParts} kind="char" /></div>
            </div>
          </div>
          <div className="pd-swrow">
            <span>在聊天窗显示</span>
            <button type="button" className="pd-switch" aria-pressed={widgetOn} onClick={toggleWidget} aria-label="切换聊天窗挂件" />
          </div>
        </div>

        <div className="pd-stage" ref={stageRef}>
          <div className="pd-dais" aria-hidden="true" />
          <div className="pd-dolls">
            {renderDoll('user', userLook)}
            {renderDoll('char', charLook)}
          </div>
        </div>

        <section className="pd-sheet pd-glass" aria-label="衣橱">
          <div className="pd-grab" aria-hidden="true" />
          <div className="pd-seg" role="tablist">
            {[
              { id: 'closet', label: '衣橱' },
              { id: 'log', label: '礼物记录' },
              { id: 'ai', label: 'AI 与导入' },
            ].map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>{t.label}</button>
            ))}
          </div>

          <div className="pd-body">
            {tab === 'closet' && (
              <>
                <div className="pd-catrow">
                  {CATEGORY_TABS.map((c) => (
                    <button key={c.id} type="button" className="pd-chip" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>{c.label}</button>
                  ))}
                </div>

                {cat !== 'color' && (
                  <div className="pd-items">
                    {partItems.map((item) => {
                      const gift = { category: cat, id: item.id };
                      const worn = charLook[cat] === item.id;
                      const selected = Boolean(pick && pick.category === cat && pick.id === item.id);
                      return (
                        <button key={item.id} type="button" className="pd-it" aria-pressed={selected} onClick={() => setPick(selected ? null : gift)}>
                          <div className="thumb">
                            <PixelDollCanvas look={applyGiftToLook(charLook, gift, customParts, 'char')} customParts={customParts} kind="char" label={item.name} />
                          </div>
                          <span>{item.name}</span>
                          {worn && <em>{charName}穿着</em>}
                        </button>
                      );
                    })}
                  </div>
                )}

                {cat === 'color' && Object.entries(COLOR_GROUPS).map(([key, group]) => (
                  <div key={key} className="pd-sw-group">
                    <span className="pd-label">{group.label}</span>
                    <div className="pd-sws">
                      {group.colors.map((color) => {
                        const selected = Boolean(pick && pick.category === 'color' && pick.key === key && pick.value === color);
                        return (
                          <button
                            key={color}
                            type="button"
                            className="pd-sw"
                            style={{ background: color }}
                            aria-pressed={selected}
                            aria-label={`${group.label} ${color}`}
                            onClick={() => setPick(selected ? null : { category: 'color', key, value: color })}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))}

                {giftMsg.text && <div className={`pd-status ${giftMsg.err ? 'err' : ''}`}>{giftMsg.text}</div>}

                <div className="pd-cta">
                  <div className="pd-pick">
                    <small>{pick ? `送给 ${charName}` : '选一件送给 TA'}</small>
                    <b>{pickLabel || '还没选'}</b>
                  </div>
                  <button type="button" className="pd-send" disabled={!pick || Boolean(busy)} onClick={handleSend}>
                    <Icon name="gift" />{busy === 'send' ? '送出中' : '送出'}
                  </button>
                </div>
              </>
            )}

            {tab === 'log' && (
              state.gifts.length === 0
                ? <div className="pd-empty">还没有礼物记录。<br />送 TA 一件衣服，或者让 TA 挑一件送你吧。</div>
                : (
                  <ul className="pd-log">
                    {state.gifts.map((g) => {
                      const fromUser = g.from === 'user';
                      const halo = (fromUser ? userLook : charLook).outfitMain;
                      return (
                        <li key={g.id}>
                          <span className="who" style={{ '--pd-halo': halo }}>{fromUser ? '我' : charName.slice(0, 1)}</span>
                          <span className="txt">
                            {fromUser ? `我送了 ${charName}` : `${charName} 送了我`}：{g.label}
                            <small>{g.replyText ? `“${g.replyText}” · ` : ''}{formatTime(g.createdAt)}</small>
                          </span>
                          <span className={`pd-badge ${g.status === 'worn' ? 'ok' : g.status === 'declined' ? 'no' : 'wait'}`}>
                            {STATUS_TEXT[g.status] || g.status}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )
            )}

            {tab === 'ai' && (
              <>
                <div className="pd-card">
                  <h3>让 {charName} 挑一件送我</h3>
                  <p>TA 会根据你们的聊天，从衣橱里选一件送给你。送出后直接穿在你的小人身上。</p>
                  <div className="pd-btnrow">
                    <button type="button" className="pd-btn primary" disabled={Boolean(busy)} onClick={handleAskGift}>
                      {busy === 'ask' ? 'TA 正在挑…' : '请 TA 挑一件'}
                    </button>
                  </div>
                  {giftMsg.text && <div className={`pd-status ${giftMsg.err ? 'err' : ''}`}>{giftMsg.text}</div>}
                </div>

                <div className="pd-card">
                  <h3>让 AI 设计身体</h3>
                  <p>可以让 {charName} 设计自己，也可以让 AI 帮你设计。想要什么样子可以写在下面，不写就由 AI 自由发挥。</p>
                  <div className="pd-minirow">
                    <button type="button" className="pd-chip" aria-pressed={designWho === 'char'} onClick={() => setDesignWho('char')}>{charName}</button>
                    <button type="button" className="pd-chip" aria-pressed={designWho === 'user'} onClick={() => setDesignWho('user')}>我</button>
                  </div>
                  <input
                    className="pd-input"
                    type="text"
                    maxLength={60}
                    value={wish}
                    onChange={(e) => setWish(e.target.value)}
                    placeholder="可选：比如 有一对大耳朵、圆滚滚的"
                    aria-label="想要的样子"
                  />
                  {!design && (
                    <div className="pd-btnrow">
                      <button type="button" className="pd-btn primary" disabled={Boolean(busy)} onClick={() => runDesign(null)}>
                        {busy === 'design' ? '设计中…' : '开始设计'}
                      </button>
                    </div>
                  )}
                  {design && (
                    <>
                      <div className="pd-btnrow">
                        <button type="button" className="pd-btn primary" disabled={Boolean(busy)} onClick={keepDesign}>保留</button>
                        <button type="button" className="pd-btn" disabled={Boolean(busy)} onClick={() => runDesign(design)}>
                          {busy === 'design' ? '设计中…' : '重来一个'}
                        </button>
                        <button type="button" className="pd-btn" disabled={Boolean(busy)} onClick={dropDesign}>放弃</button>
                      </div>
                      <details className="pd-details">
                        <summary>查看设计数据</summary>
                        <pre className="pd-pre">{JSON.stringify(design.data, null, 2)}</pre>
                      </details>
                    </>
                  )}
                  {designMsg.text && <div className={`pd-status ${designMsg.err ? 'err' : ''}`}>{designMsg.text}</div>}
                </div>

                <div className="pd-card">
                  <h3>身形</h3>
                  <p>切换身体，保存过的设计也在这里。选中后会顺带换成这个身体建议的配色。</p>
                  <div className="pd-minirow">
                    <button type="button" className="pd-chip" aria-pressed={bodyWho === 'user'} onClick={() => setBodyWho('user')}>我</button>
                    <button type="button" className="pd-chip" aria-pressed={bodyWho === 'char'} onClick={() => setBodyWho('char')}>{charName}</button>
                  </div>
                  <div className="pd-catrow" style={{ flexWrap: 'wrap', overflowX: 'visible' }}>
                    {bodyOptions.map((b) => (
                      <button key={b.id} type="button" className="pd-chip" style={{ background: 'var(--card-bg)' }} aria-pressed={bodyLook.body === b.id} onClick={() => handleSelectBody(b.id)}>{b.name}</button>
                    ))}
                  </div>
                </div>

                <div className="pd-card">
                  <h3>导入新部件</h3>
                  <p>粘贴一段 JSON，可以是发型、眼睛、衣着或身体。发型、眼睛、衣着所有聊天共用，身体只属于这个聊天。</p>
                  <textarea
                    className="pd-textarea"
                    value={importText}
                    onChange={(e) => setImportText(e.target.value)}
                    placeholder={IMPORT_EXAMPLE}
                    spellCheck={false}
                    aria-label="部件 JSON"
                  />
                  <div className="pd-btnrow" style={{ marginTop: 10 }}>
                    <button type="button" className="pd-btn primary" onClick={handleImport}>导入</button>
                  </div>
                  {importMsg.text && <div className={`pd-status ${importMsg.err ? 'err' : ''}`}>{importMsg.text}</div>}

                  {customRows.length > 0 && (
                    <ul className="pd-partlist">
                      {customRows.map((row) => (
                        <li key={row.id}>
                          <span>{row.name || row.partId}</span>
                          <small>{CATEGORY_LABEL[row.category] || row.category}{row.scopeChatId ? ' · 仅此聊天' : ''}</small>
                          <button
                            type="button"
                            className={`pd-del ${armedDelete === row.id ? 'armed' : ''}`}
                            onClick={() => handleDeletePart(row.id)}
                            aria-label={armedDelete === row.id ? '再点一次确认删除' : '删除'}
                          >
                            {armedDelete === row.id ? '确认' : <Icon name="trash" />}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default PixelClosetPage;