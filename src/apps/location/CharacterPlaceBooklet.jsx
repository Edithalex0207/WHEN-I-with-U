// src/apps/location/CharacterPlaceBooklet.jsx
//
// 角色地图：地点小册子里切出来的姊妹页（从 PlaceBooklet.jsx 顶部的
// 标签切换进来，不是独立的顶层 App）。数据完全独立于用户的真实 GPS
// 地点（db.places），读写都走 characterPlaceService.js。
//
// 视觉上刻意跟 PlaceBooklet.jsx 同一种"地点小册子"质感——同一张底图、
// 同款墨黑 Pin、同款呼吸光环/HUD 徽标——但这是一个独立文件，没有导入
// PlaceBooklet.jsx 的任何内部变量：PlaceBooklet.jsx 本身是一个很大、
// 已经在正常工作的手写页面，不值得为了共享十几行的散点坐标算法去改动
// 它的内部结构冒风险，所以这里只是把同一小段纯函数重新写了一遍。

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Compass, MapPin, Send } from 'lucide-react';

import {
  listCharacterPlaces,
  listCharacterPlaceMemories,
  addCharacterPlaceMemory,
  CHARACTER_PLACE_USER_COMMENT_MAX_CHARS,
} from './characterPlaceService';

// 跟 PlaceBooklet.jsx 同一张底图，保持两页视觉统一。
const MAP_IMAGE_URL = 'https://u2.fukit.cn/yYmWOHrYc';
const SVG_WIDTH = 1000;
const SVG_HEIGHT = 620;
const MAP_ZOOM_SCALE = 1.32;

const hashString = (value) => {
  let hash = 0;
  String(value || '').split('').forEach((char) => {
    hash = (hash << 5) - hash + char.charCodeAt(0);
    hash |= 0;
  });
  return Math.abs(hash);
};

// 没有真实坐标，按名字/id 算一个看起来随机、其实固定的散点位置——
// 跟 PlaceBooklet.jsx 的 getMapPoint 同一个思路（那边是"没有经纬度时"
// 的兜底分支，这边直接就是唯一的分支，因为角色地图从不追求地理真实）。
const getScatterPoint = (place, index) => {
  const seed = hashString(place?.id || place?.name || index);
  return {
    x: 130 + ((seed * 41 + index * 127) % 740),
    y: 90 + ((seed * 23 + index * 83) % 430),
  };
};

const describeAge = (value) => {
  if (!value) return '';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return '';

  const days = Math.floor((Date.now() - time) / (24 * 60 * 60 * 1000));

  if (days <= 0) return '今天';
  if (days === 1) return '昨天';
  if (days < 30) return `${days}天前`;

  const date = new Date(time);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};

const CharacterPlaceBooklet = ({ chatId, character, onBack }) => {
  const [places, setPlaces] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [memories, setMemories] = useState([]);
  const [commentDraft, setCommentDraft] = useState('');
  const [isSavingComment, setIsSavingComment] = useState(false);

  const reload = async () => {
    try {
      const list = await listCharacterPlaces(chatId);
      setPlaces(list);
      setActiveIndex((previous) => Math.min(previous, Math.max(list.length - 1, 0)));
    } catch (error) {
      console.warn('[CharacterPlace] Failed to load places:', error);
      setPlaces([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  const activePlace = places[activeIndex];

  useEffect(() => {
    if (!activePlace) {
      setMemories([]);
      return;
    }

    let cancelled = false;

    listCharacterPlaceMemories(activePlace.id).then((list) => {
      if (!cancelled) setMemories(list);
    }).catch((error) => {
      console.warn('[CharacterPlace] Failed to load memories:', error);
      if (!cancelled) setMemories([]);
    });

    return () => { cancelled = true; };
  }, [activePlace?.id]);

  const handleAddComment = async () => {
    if (!activePlace || isSavingComment) return;
    const trimmed = commentDraft.trim();
    if (!trimmed) return;

    setIsSavingComment(true);
    try {
      await addCharacterPlaceMemory({
        chatId,
        placeId: activePlace.id,
        author: 'user',
        text: trimmed,
      });
      setCommentDraft('');
      setMemories(await listCharacterPlaceMemories(activePlace.id));
    } catch (error) {
      console.warn('[CharacterPlace] Failed to add comment:', error);
    } finally {
      setIsSavingComment(false);
    }
  };

  const mapPlaces = places.map((place, index) => ({
    place,
    index,
    point: getScatterPoint(place, index),
  }));

  const activePoint = mapPlaces[activeIndex]?.point || {
    x: SVG_WIDTH / 2,
    y: SVG_HEIGHT / 2,
  };

  const rawOffsetX = SVG_WIDTH / 2 - activePoint.x * MAP_ZOOM_SCALE;
  const rawOffsetY = SVG_HEIGHT / 2 - activePoint.y * MAP_ZOOM_SCALE;
  const minOffsetX = SVG_WIDTH * (1 - MAP_ZOOM_SCALE);
  const minOffsetY = SVG_HEIGHT * (1 - MAP_ZOOM_SCALE);
  const mapOffsetX = Math.max(minOffsetX, Math.min(0, rawOffsetX));
  const mapOffsetY = Math.max(minOffsetY, Math.min(0, rawOffsetY));

  return (
    <div className="character-place-booklet">
      <style>{`
        .character-place-booklet {
          --cp-ink: #11110f;
          --cp-white: #ffffff;
          --cp-muted: #77766f;
          --cp-line: rgba(17,17,15,.11);
          position: relative;
          min-height: 100%;
          background: var(--bg-main, #f6f4ee);
          color: var(--cp-ink);
          padding: 24px 18px 40px;
        }
        .cp-back-float {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 999px;
          background: var(--cp-ink);
          color: var(--cp-white);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .04em;
          border: none;
        }
        .cp-content-wrap {
          max-width: 680px;
          margin: 0 auto;
        }
        .cp-intro {
          margin-top: 22px;
        }
        .cp-kicker {
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 2px;
          text-transform: uppercase;
          color: var(--cp-muted);
        }
        .cp-main-title {
          font-family: Georgia, 'Noto Serif SC', serif;
          font-size: clamp(30px, 9vw, 44px);
          line-height: 1.05;
          margin-top: 6px;
        }
        .cp-main-title em {
          font-style: italic;
        }
        .cp-intro-meta {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-top: 10px;
          font-size: 11px;
          color: var(--cp-muted);
        }
        .cp-meta-dot {
          width: 3px;
          height: 3px;
          border-radius: 999px;
          background: currentColor;
          opacity: .5;
        }
        .map-frame {
          position: relative;
          margin-top: 20px;
          border-radius: 20px;
          overflow: hidden;
          min-height: 320px;
          border: 1px solid var(--cp-line);
          background: #0c0c0b;
        }
        .map-svg {
          width: 100%;
          height: 100%;
          display: block;
        }
        .map-world {
          transition: transform .5s cubic-bezier(.22,.9,.3,1);
        }
        .map-marker {
          cursor: pointer;
        }
        .map-marker-pulse {
          animation: cpPulse 1.8s ease-out infinite;
          transform-origin: center;
        }
        @keyframes cpPulse {
          0% { transform: scale(.6); opacity: .6; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        .cp-detail {
          margin-top: 18px;
          border-radius: 18px;
          border: 1px solid var(--cp-line);
          background: var(--bg-surface, #fff);
          padding: 16px;
        }
        .cp-detail-name {
          font-family: Georgia, 'Noto Serif SC', serif;
          font-size: 18px;
          font-weight: 600;
        }
        .cp-detail-meta {
          margin-top: 2px;
          font-size: 11px;
          color: var(--cp-muted);
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .cp-memory-list {
          margin-top: 14px;
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 260px;
          overflow-y: auto;
        }
        .cp-memory-row {
          padding: 9px 11px;
          border-radius: 12px;
          background: var(--bg-main, #f6f4ee);
          font-size: 12px;
          line-height: 1.5;
        }
        .cp-memory-row.char {
          background: color-mix(in srgb, var(--accent-color, #11110f) 8%, var(--bg-main, #f6f4ee));
        }
        .cp-memory-tag {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: .04em;
          opacity: .55;
          margin-right: 6px;
        }
        .cp-memory-mood {
          display: inline-block;
          margin-left: 6px;
          padding: 1px 7px;
          border-radius: 999px;
          background: var(--cp-ink);
          color: var(--cp-white);
          font-size: 10px;
        }
        .cp-memory-age {
          float: right;
          font-size: 10px;
          opacity: .4;
        }
        .cp-comment-row {
          margin-top: 12px;
          display: flex;
          gap: 8px;
        }
        .cp-comment-input {
          flex: 1;
          border-radius: 12px;
          border: 1px solid var(--cp-line);
          padding: 9px 12px;
          font-size: 12px;
          background: var(--bg-main, #f6f4ee);
          outline: none;
        }
        .cp-comment-send {
          width: 38px;
          height: 38px;
          border-radius: 12px;
          background: var(--cp-ink);
          color: var(--cp-white);
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          flex-shrink: 0;
        }
        .cp-comment-send:disabled {
          opacity: .35;
        }
      `}</style>

      <button type="button" onClick={onBack} className="cp-back-float" aria-label="返回地点小册子">
        <ArrowLeft className="h-3.5 w-3.5 stroke-[2.2]" />
        <span>返回</span>
      </button>

      <div className="cp-content-wrap">
        <div className="cp-intro">
          <div className="cp-kicker">THEIR OWN PLACES</div>
          <h1 className="cp-main-title">
            <span>{character?.name || 'TA'}</span>
            <em>的地方。</em>
          </h1>
          <div className="cp-intro-meta">
            <Compass className="h-3.5 w-3.5" />
            <span>{places.length} 个 TA 提到过的地方</span>
            <span className="cp-meta-dot" />
            <span>仅角色自己判断要不要分享</span>
          </div>
        </div>

        {isLoading && (
          <p className="py-16 text-center text-xs opacity-40">正在翻看 TA 的地方...</p>
        )}

        {!isLoading && places.length === 0 && (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center text-[var(--cp-muted)]">
            <MapPin className="h-8 w-8 stroke-[1.3] opacity-60" />
            <p className="font-serif text-xs italic opacity-75">
              TA 还没主动分享过自己去的地方。
            </p>
          </div>
        )}

        {!isLoading && places.length > 0 && (
          <>
            <div className="map-frame">
              <svg
                className="map-svg"
                viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                preserveAspectRatio="xMidYMid slice"
                aria-label="角色地点地图"
                role="img"
              >
                <g
                  className="map-world"
                  style={{ transform: `translate(${mapOffsetX}px, ${mapOffsetY}px) scale(${MAP_ZOOM_SCALE})` }}
                >
                  <image
                    href={MAP_IMAGE_URL}
                    x="0"
                    y="0"
                    width={SVG_WIDTH}
                    height={SVG_HEIGHT}
                    preserveAspectRatio="xMidYMid slice"
                  />

                  {mapPlaces.map(({ place, index, point }) => {
                    const isActive = index === activeIndex;

                    return (
                      <g
                        key={place.id}
                        className="map-marker"
                        transform={`translate(${point.x} ${point.y})`}
                        onClick={() => setActiveIndex(index)}
                        role="button"
                        tabIndex={0}
                        aria-label={`选择地点：${place.name}`}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            setActiveIndex(index);
                          }
                        }}
                      >
                        {isActive && (
                          <circle className="map-marker-pulse" r="22" fill="#ffffff" opacity=".4" />
                        )}

                        <circle r={isActive ? 15 : 11} fill="#11110f" opacity=".22" />

                        <path
                          d="M0 -16 C-9 -16 -15 -9 -15 0 C-15 10 0 22 0 22 S15 10 15 0 C15 -9 9 -16 0 -16Z"
                          fill="#11110f"
                          stroke="#ffffff"
                          strokeWidth="2.2"
                        />

                        <circle cy="0" r="4" fill="#ffffff" />
                      </g>
                    );
                  })}
                </g>
              </svg>
            </div>

            {activePlace && (
              <div className="cp-detail">
                <div className="cp-detail-name">{activePlace.name}</div>
                <div className="cp-detail-meta">
                  <span>第 {activePlace.visitCount || 1} 次提到</span>
                  <span className="cp-meta-dot" />
                  <span>最近一次 {describeAge(activePlace.lastVisitAt)}</span>
                </div>

                <div className="cp-memory-list">
                  {memories.length === 0 && (
                    <p className="text-[11px] opacity-40">还没有留下评价或评论。</p>
                  )}

                  {memories.map((memory) => (
                    <div key={memory.id} className={`cp-memory-row ${memory.author === 'char' ? 'char' : ''}`}>
                      <span className="cp-memory-age">{describeAge(memory.createdAt)}</span>
                      <span className="cp-memory-tag">
                        {memory.author === 'char' ? (character?.name || 'TA') : '你'}
                      </span>
                      {memory.text}
                      {memory.mood && <span className="cp-memory-mood">{memory.mood}</span>}
                    </div>
                  ))}
                </div>

                <div className="cp-comment-row">
                  <input
                    type="text"
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value.slice(0, CHARACTER_PLACE_USER_COMMENT_MAX_CHARS))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void handleAddComment();
                    }}
                    placeholder="说说你对这个地方的想法..."
                    className="cp-comment-input"
                  />
                  <button
                    type="button"
                    onClick={handleAddComment}
                    disabled={!commentDraft.trim() || isSavingComment}
                    className="cp-comment-send"
                    aria-label="发送评论"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default CharacterPlaceBooklet;