/*
 * CompanionDiaryBook.jsx —— 小伙伴的日记本（可左右翻页的小本子）。
 *
 * 页面顺序：封面 → 日记（新的在前）→ 空白页。
 * 翻页：点箭头 / 点圆点 / 点折角 / 在书上左右滑动。
 * 日记内容是小伙伴第一人称写的；用户可以点"喜欢"、在便利贴上留一句话。
 * 生成逻辑不在这里（见 companionDiaryService.js / companionDiaryAiService.js）。
 *
 * Props:
 *   companionId        number   — 小伙伴 ID
 *   companionName      string   — 小伙伴名字
 *   companionAvatarUrl string   — 头像（封面上用，没有就用默认小脸）
 *   onClose            function — 合上日记本
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

import { getDiaries, toggleDiaryLike, commentOnDiary } from './companionDiaryService';
import './companionDiary.css';

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

const formatDate = (timestamp) => {
  const d = new Date(timestamp);
  if (!timestamp || Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEKDAYS[d.getDay()]}`;
};

const HEART_PATH =
  'M12,21.35l-1.45-1.32C5.4,15.36,2,12.28,2,8.5 C2,5.42,4.42,3,7.5,3c1.74,0,3.41,0.81,4.5,2.09 C13.09,3.81,14.76,3,16.5,3 C19.58,3,22,5.42,22,8.5 c0,3.78-3.4,6.86-8.55,11.54L12,21.35z';
const SPARKLE = 'M12 0L14.6 9.4 24 12 14.6 14.6 12 24 9.4 14.6 0 12 9.4 9.4z';

/* ---------- 角落小贴纸（按 id 轮换） ---------- */
const Doodle = ({ kind }) => {
  if (kind === 0) {
    return (
      <svg viewBox="0 0 64 64" width="62" height="62" aria-hidden="true">
        <path d="M40 7C25 9 14 21 14 35c0 14 11 24 25 24 7 0 13-3 17-8-15 0-27-10-27-24 0-8 3-15 11-20z" fill="#FFE08A" stroke="#F0B93A" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M45 14l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" fill="#FF9DB4" />
        <path d="M52 36l1.4 4 4 1.4-4 1.4-1.4 4-1.4-4-4-1.4 4-1.4z" fill="#8CC9FF" />
      </svg>
    );
  }
  if (kind === 1) {
    return (
      <svg viewBox="0 0 64 64" width="62" height="62" aria-hidden="true">
        <path d="M20 36L12 58l12-6 6 8 4-22z" fill="#FF86A0" stroke="#E9607F" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M44 36l8 22-12-6-6 8-4-22z" fill="#FF86A0" stroke="#E9607F" strokeWidth="2.2" strokeLinejoin="round" />
        <circle cx="32" cy="26" r="17" fill="#8FD9C0" stroke="#46B598" strokeWidth="2.5" />
        <circle cx="32" cy="26" r="11.5" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeDasharray="3 3" />
        <path d="M32 17.5l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6-4.4-4.2 6-.8z" fill="#FFFFFF" />
      </svg>
    );
  }
  if (kind === 2) {
    return (
      <svg viewBox="0 0 64 64" width="62" height="62" aria-hidden="true">
        <ellipse cx="32" cy="41" rx="14" ry="12" fill="#FFB0C2" stroke="#F0708F" strokeWidth="2.4" />
        <ellipse cx="14" cy="27" rx="6" ry="7.5" fill="#FFB0C2" stroke="#F0708F" strokeWidth="2.4" />
        <ellipse cx="26" cy="15" rx="6" ry="7.5" fill="#FFB0C2" stroke="#F0708F" strokeWidth="2.4" />
        <ellipse cx="40" cy="15" rx="6" ry="7.5" fill="#FFB0C2" stroke="#F0708F" strokeWidth="2.4" />
        <ellipse cx="52" cy="27" rx="6" ry="7.5" fill="#FFB0C2" stroke="#F0708F" strokeWidth="2.4" />
      </svg>
    );
  }
  if (kind === 3) {
    return (
      <svg viewBox="0 0 64 64" width="62" height="62" aria-hidden="true">
        <path d="M32 36v22" stroke="#46B598" strokeWidth="3" strokeLinecap="round" />
        <path d="M32 50q9-2 11-10-9 0-11 10z" fill="#8FD9C0" stroke="#46B598" strokeWidth="2" strokeLinejoin="round" />
        {[0, 72, 144, 216, 288].map((deg) => (
          <ellipse key={deg} cx="32" cy="14" rx="7" ry="10" fill="#FFC0CF" stroke="#F0708F" strokeWidth="2.2" transform={`rotate(${deg} 32 26)`} />
        ))}
        <circle cx="32" cy="26" r="6.5" fill="#FFE08A" stroke="#F0B93A" strokeWidth="2.2" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 64 64" width="62" height="62" aria-hidden="true">
      <path d="M18 46a11 11 0 0 1 1-22 14 14 0 0 1 27 3 9.5 9.5 0 0 1 0 19z" fill="#EAF4FD" stroke="#8CC9FF" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="26" cy="36" r="1.9" fill="#24415A" />
      <circle cx="38" cy="36" r="1.9" fill="#24415A" />
      <path d="M29.5 40q2.5 2.6 5 0" fill="none" stroke="#24415A" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
};

const PetFace = ({ sleepy = false }) => (
  <svg viewBox="0 0 100 100" width="84" height="84" aria-hidden="true">
    <path d="M45 24l5-10 5 10" fill="none" stroke="#3D9BEA" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    {sleepy ? (
      <>
        <path d="M28 56q7 6 14 0" fill="none" stroke="#24415A" strokeWidth="3.4" strokeLinecap="round" />
        <path d="M58 56q7 6 14 0" fill="none" stroke="#24415A" strokeWidth="3.4" strokeLinecap="round" />
        <ellipse cx="26" cy="66" rx="7" ry="4.5" fill="#FFB0C2" opacity="0.75" />
        <ellipse cx="74" cy="66" rx="7" ry="4.5" fill="#FFB0C2" opacity="0.75" />
        <path d="M45 67q5 4 10 0" fill="none" stroke="#24415A" strokeWidth="3" strokeLinecap="round" />
      </>
    ) : (
      <>
        <circle cx="35" cy="55" r="4.6" fill="#24415A" />
        <circle cx="65" cy="55" r="4.6" fill="#24415A" />
        <circle cx="36.6" cy="53.4" r="1.5" fill="#FFFFFF" />
        <circle cx="66.6" cy="53.4" r="1.5" fill="#FFFFFF" />
        <ellipse cx="26" cy="65" rx="7" ry="4.5" fill="#FFB0C2" opacity="0.75" />
        <ellipse cx="74" cy="65" rx="7" ry="4.5" fill="#FFB0C2" opacity="0.75" />
        <path d="M44 64q6 7 12 0" fill="none" stroke="#24415A" strokeWidth="3" strokeLinecap="round" />
      </>
    )}
  </svg>
);

const Sparkle = ({ size, color, left, top, delay = 0 }) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className="dk-star"
    aria-hidden="true"
    style={{ left, top, animationDelay: `${delay}s` }}
  >
    <path d={SPARKLE} fill={color} />
  </svg>
);

/* ---------- 封面 ---------- */
const CoverFace = ({ name, avatarUrl, count, onOpen }) => {
  const [imgOk, setImgOk] = useState(true);
  const titleSize = name.length > 8 ? 20 : name.length > 5 ? 24 : 30;
  return (
    <div className="dk-cover">
      <div className="dk-stitch" />
      <div className="dk-band" />
      <Sparkle size={22} color="#FFE08A" left={52} top={48} />
      <Sparkle size={14} color="#FFFFFF" left={214} top={70} delay={0.8} />
      <Sparkle size={16} color="#FFFFFF" left={44} top={330} delay={1.4} />

      <div className="dk-cover-body">
        <div className="dk-plate">
          {avatarUrl && imgOk ? (
            <img src={avatarUrl} alt="" onError={() => setImgOk(false)} />
          ) : (
            <PetFace />
          )}
        </div>
        <div className="dk-label">
          <div className="dk-label-title" style={{ fontSize: titleSize }}>{name}的日记</div>
          <div className="dk-label-sub">只写给你看的小秘密</div>
        </div>
        <div className="dk-count">{count > 0 ? `已经写了 ${count} 篇` : '还没有日记'}</div>
      </div>

      <button type="button" className="dk-open" onClick={onOpen} aria-label="翻开日记本">
        翻开看看
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="#3D9BEA" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
};

/* ---------- 一篇日记 ---------- */
const EntryFace = ({ entry, onNext, onToggleLike, onSubmitComment }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const hasComment = Boolean(entry.userComment);

  const startEdit = () => {
    setDraft(entry.userComment || '');
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSubmitComment(entry.id, draft.trim());
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dk-entry">
      <div className="dk-tape-row">
        <div className="dk-tape">{formatDate(entry.timestamp)}</div>
      </div>

      <div className="dk-doodle"><Doodle kind={Math.abs(Number(entry.id) || 0) % 5} /></div>

      <h2 className="dk-title"><span>{entry.triggerLabel || '今天的小事'}</span></h2>

      <div className="dk-body">{entry.content}</div>

      {(hasComment || editing) && (
        <div className={`dk-note ${editing ? 'editing' : ''}`}>
          <div className="dk-note-tape" />
          <div className="dk-note-who">你写的</div>
          {editing ? (
            <>
              <textarea
                value={draft}
                maxLength={100}
                autoFocus
                placeholder="给我留句话吧…"
                onChange={(event) => setDraft(event.target.value)}
              />
              <div className="dk-note-btns">
                <button type="button" onClick={() => setEditing(false)}>算了</button>
                <button type="button" className="ok" disabled={saving} onClick={save}>
                  {saving ? '…' : '贴上去'}
                </button>
              </div>
            </>
          ) : (
            <div className="dk-note-text">{entry.userComment}</div>
          )}
        </div>
      )}

      <div className="dk-actions">
        <button
          type="button"
          className={`dk-like ${entry.liked ? 'on' : ''}`}
          aria-pressed={entry.liked ? 'true' : 'false'}
          aria-label={entry.liked ? '取消喜欢这篇日记' : '喜欢这篇日记'}
          onClick={() => onToggleLike(entry.id)}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d={HEART_PATH} fill={entry.liked ? '#FFFFFF' : '#FFC0CF'} />
          </svg>
          {entry.liked ? '喜欢啦' : '喜欢'}
        </button>
        {!editing && (
          <button type="button" className="dk-cmt" onClick={startEdit} aria-label="给这篇日记留一句话">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z" fill="none" stroke="#A87A06" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {hasComment ? '改留言' : '留句话'}
          </button>
        )}
      </div>

      <button type="button" className="dk-corner" onClick={onNext} aria-label="翻到下一页" />
    </div>
  );
};

/* ---------- 最后的空白页 ---------- */
const EndFace = () => (
  <div className="dk-end">
    <div className="dk-end-pet">
      <PetFace sleepy />
      <div className="dk-z" style={{ right: -6, top: -4, fontSize: 22 }}>Z</div>
      <div className="dk-z" style={{ right: -22, top: -22, fontSize: 15, color: '#8CC9FF', animationDelay: '0.5s' }}>z</div>
    </div>
    <div className="dk-end-title"><span>这一页还空着呢</span></div>
    <div className="dk-end-line">等我遇到新鲜事，<br />就偷偷写下来。</div>
    <div className="dk-end-deco">
      <div className="dk-stamp">下一篇</div>
      <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true" style={{ transform: 'rotate(-32deg)' }}>
        <rect x="16" y="23" width="32" height="14" rx="2" fill="#FFD45C" stroke="#E8A92C" strokeWidth="2.2" />
        <path d="M16 23L4 30l12 7z" fill="#FFE9C2" stroke="#E8A92C" strokeWidth="2.2" strokeLinejoin="round" />
        <path d="M4 30l4-2.4v4.8z" fill="#24415A" />
        <rect x="46" y="23" width="3.5" height="14" fill="#D9E6F2" />
        <rect x="49.5" y="23" width="8" height="14" rx="2.5" fill="#FF9DB4" stroke="#E9607F" strokeWidth="2" />
      </svg>
    </div>
  </div>
);

/* ---------- 翻页背面（翻过去后看到的左页） ---------- */
const BackFace = ({ kind, name }) => {
  if (kind === 'cover') {
    return (
      <div className="dk-inside">
        <div className="dk-inside-s">这本日记是</div>
        <div className="dk-inside-name">{name}</div>
        <div className="dk-inside-s">的</div>
        <div className="dk-inside-tag">不许偷看哦</div>
      </div>
    );
  }
  return <div className="dk-paper-back" />;
};

const RING_TOPS = [0, 1, 2, 3, 4, 5, 6].map((k) => ((46 + 82 * k) / 608) * 100);

const CompanionDiaryBook = ({
  companionId,
  companionName = '小伙伴',
  companionAvatarUrl = '',
  onClose,
}) => {
  const [diaries, setDiaries] = useState(null); // null = 加载中
  const [page, setPage] = useState(0);
  const swipe = useRef(null);

  useEffect(() => {
    let cancelled = false;
    if (!companionId) return undefined;
    getDiaries(companionId).then((rows) => {
      if (!cancelled) setDiaries(rows || []);
    });
    return () => { cancelled = true; };
  }, [companionId]);

  const list = diaries || [];
  // 封面 + 日记 + 空白页
  const total = list.length + 2;
  const lastIndex = total - 1;

  const goTo = useCallback(
    (p) => setPage(Math.max(0, Math.min(lastIndex, p))),
    [lastIndex],
  );

  useEffect(() => {
    const onKey = (event) => {
      if (event.target && /^(TEXTAREA|INPUT)$/.test(event.target.tagName)) return;
      if (event.key === 'ArrowRight') setPage((p) => Math.min(lastIndex, p + 1));
      if (event.key === 'ArrowLeft') setPage((p) => Math.max(0, p - 1));
      if (event.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lastIndex, onClose]);

  const patchDiary = (updated) => {
    if (!updated) return;
    setDiaries((rows) => (rows || []).map((row) => (row.id === updated.id ? updated : row)));
  };

  const handleToggleLike = async (diaryId) => {
    patchDiary(await toggleDiaryLike(companionId, diaryId));
  };

  const handleSubmitComment = async (diaryId, text) => {
    patchDiary(await commentOnDiary(companionId, diaryId, text));
  };

  /* 左右滑动翻页 */
  const onPointerDown = (event) => {
    if (event.target.closest && event.target.closest('textarea, input')) {
      swipe.current = null;
      return;
    }
    swipe.current = { x: event.clientX, y: event.clientY };
  };
  const onPointerUp = (event) => {
    const start = swipe.current;
    swipe.current = null;
    if (!start) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      goTo(page + (dx < 0 ? 1 : -1));
    }
  };

  const pages = [{ kind: 'cover' }, ...list.map((entry) => ({ kind: 'entry', entry })), { kind: 'end' }];

  const caption = (() => {
    if (page === 0) return '封面';
    if (page === lastIndex) return '空白页';
    return `第 ${page} 篇 / 共 ${list.length} 篇`;
  })();

  const showDots = total <= 8;

  return (
    <div className="dk-overlay" role="dialog" aria-label={`${companionName}的日记本`}>
      <div className="dk-backdrop" onClick={onClose} />

      <button type="button" className="dk-close" onClick={onClose} aria-label="合上日记本">
        <X size={20} color="#5E819C" strokeWidth={2.8} />
      </button>

      <div className="dk-book">
        <div className="dk-back" />
        <div className="dk-edge" />

        <div
          className="dk-stage"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { swipe.current = null; }}
        >
          {pages.map((pg, i) => {
            // 只渲染当前页附近的页，日记很多时也不会卡
            if (Math.abs(i - page) > 2) return null;
            const flipped = i < page;
            const current = i === page;
            const style = {
              zIndex: flipped ? i : total - i,
              transform: flipped ? 'rotateY(-180deg)' : 'rotateY(0deg)',
              transition: `transform 0.9s cubic-bezier(0.45,0.05,0.25,1), z-index 0s ${flipped ? '0.45s' : '0s'}`,
            };
            const key = pg.kind === 'entry' ? `e${pg.entry.id}` : pg.kind;
            return (
              <div
                key={key}
                className="dk-page"
                style={style}
                aria-hidden={current ? undefined : 'true'}
                {...(current ? {} : { inert: '' })}
              >
                <div className="dk-face">
                  {pg.kind === 'cover' && (
                    <CoverFace
                      name={companionName}
                      avatarUrl={companionAvatarUrl}
                      count={list.length}
                      onOpen={() => goTo(1)}
                    />
                  )}
                  {pg.kind === 'entry' && (
                    <EntryFace
                      entry={pg.entry}
                      onNext={() => goTo(i + 1)}
                      onToggleLike={handleToggleLike}
                      onSubmitComment={handleSubmitComment}
                    />
                  )}
                  {pg.kind === 'end' && <EndFace />}
                </div>
                <div className="dk-face back">
                  <BackFace kind={pg.kind} name={companionName} />
                </div>
              </div>
            );
          })}
        </div>

        {RING_TOPS.map((top) => (
          <div key={top} className="dk-ring" style={{ top: `${top}%` }} />
        ))}
      </div>

      <div className="dk-nav">
        <button
          type="button"
          className="dk-arrow prev"
          aria-label="上一页"
          disabled={page === 0}
          onClick={() => goTo(page - 1)}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="#3D9BEA" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        <div className="dk-mid">
          {showDots && (
            <div className="dk-dots">
              {pages.map((pg, i) => (
                <button
                  key={`d${i}`}
                  type="button"
                  className="dk-dot-btn"
                  aria-label={i === 0 ? '回到封面' : i === lastIndex ? '翻到最后一页' : `翻到第 ${i} 篇`}
                  onClick={() => goTo(i)}
                >
                  <span className={`dk-dot ${i === page ? 'on' : ''}`} />
                </button>
              ))}
            </div>
          )}
          <div className="dk-caption">{diaries === null ? '翻开中…' : caption}</div>
        </div>

        <button
          type="button"
          className="dk-arrow next"
          aria-label="下一页"
          disabled={page === lastIndex}
          onClick={() => goTo(page + 1)}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default CompanionDiaryBook;