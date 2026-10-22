// src/apps/footprintMap/FootprintMapApp.jsx
//
// 足迹地图（第 1 轮，只读）。
//
// 页面流程照设计稿：隐私说明页（第一次打开才出现，同意之后才会去请求地图瓦片）
//   -> 选聊天窗（没开定位的灰色，不能点）
//   -> 地图（Leaflet + CARTO 浅色底图，图钉来自现有的 places 表）
//   -> 点图钉：底部提示卡收起，地点详情从下面升起（到访次数 / 常在时段 / 备注 / 这里发生过的事）
//
// 和「地点小册子」PlaceBooklet 互不影响，两个并存；这里不写任何数据，
// "写一条足迹"（照片 + 心情）留到第 2 轮。

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { ArrowLeft, ArrowRight } from 'lucide-react';

import {
  FOOTPRINT_FILTERS,
  formatRelativeTime,
  getFootprintConsent,
  getFootprintMapKey,
  getPinColor,
  isPlaceVisibleForFilter,
  loadFootprintChats,
  loadFootprintMemories,
  loadFootprintPlaces,
  saveFootprintConsent,
  saveFootprintMapKey,
} from './footprintMapService';
import { createPinIcon } from './placePinIcon';
import './footprintMap.css';

const TILE_URL = 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';
const buildTileUrl = (key) => `${TILE_URL}?key=${encodeURIComponent(key)}`;
const DEFAULT_CENTER = [35, 105];
const DEFAULT_ZOOM = 4;
const FOCUS_ZOOM = 15;

// 底部提示卡 / 半展开详情盖住了多少像素的地图，用来把选中的图钉推到剩下那块的正中间。
const PEEK_COVER_PX = 250;
const FULL_SHEET_RATIO = 0.72;

const pad2 = (value) => String(value).padStart(2, '0');

const FootprintMapApp = ({ onBackHub, onChatRoomStateChange }) => {
  const [screen, setScreen] = useState('loading'); // loading | gate | picker | map
  const [chats, setChats] = useState([]);
  const [chat, setChat] = useState(null);
  const [places, setPlaces] = useState([]);
  const [placesReady, setPlacesReady] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [filter, setFilter] = useState(FOOTPRINT_FILTERS.ALL);
  const [selectedId, setSelectedId] = useState(null);
  const [sheetState, setSheetState] = useState('closed'); // closed | peek | full
  const [memories, setMemories] = useState([]);
  const [toast, setToast] = useState('');
  const [mapKey, setMapKey] = useState('');
  const [keyDraft, setKeyDraft] = useState('');

  const mapElRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef(new Map());
  const toastTimerRef = useRef(null);
  const lastShownPlaceRef = useRef(null);

  // 地图上的图钉点击回调只在创建图钉时注册一次，这里用 ref 永远指向最新的处理函数。
  const onPickRef = useRef(() => {});

  // 这个页面需要整屏固定高度（地图不能跟着页面滚动），沿用聊天室类 app 的做法。
  useEffect(() => {
    onChatRoomStateChange?.(true);

    return () => onChatRoomStateChange?.(false);
  }, [onChatRoomStateChange]);

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  const showToast = useCallback((message) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);

    setToast(message);
    toastTimerRef.current = setTimeout(() => setToast(''), 2200);
  }, []);

  const refreshChats = useCallback(async () => {
    try {
      setChats(await loadFootprintChats());
    } catch (error) {
      console.warn('[FootprintMap] 读取聊天窗失败：', error);
      setChats([]);
    }
  }, []);

  // 第一次打开：已经同意过就直接进选聊天窗，否则先出隐私说明页。
  useEffect(() => {
    let cancelled = false;

    (async () => {
           const agreed = await getFootprintConsent();
      const savedKey = await getFootprintMapKey();

      if (!cancelled) {
        setMapKey(savedKey);
        setKeyDraft(savedKey);
      }

      if (cancelled) return;

      if (agreed) await refreshChats();

      if (cancelled) return;

      setScreen(agreed ? 'picker' : 'gate');
    })();

    return () => {
      cancelled = true;
    };
  }, [refreshChats]);

  const handleAgree = async () => {
    try {
      await saveFootprintConsent();
    } catch (error) {
      console.warn('[FootprintMap] 保存隐私同意状态失败：', error);
    }

    await refreshChats();
    setScreen('picker');
  };

   const handleSaveKey = async () => {
    try {
      const saved = await saveFootprintMapKey(keyDraft);

      setMapKey(saved);
      setKeyDraft(saved);
      showToast(saved ? '底图 key 已保存' : '已清除底图 key');
    } catch (error) {
      console.warn('[FootprintMap] 保存底图 key 失败：', error);
      showToast('保存失败，请再试一次');
    }
  };

  const resetMapState = () => {
    setSelectedId(null);
    setSheetState('closed');
    setFilter(FOOTPRINT_FILTERS.ALL);
    setPlaces([]);
    setPlacesReady(false);
    setMemories([]);
    lastShownPlaceRef.current = null;
  };

  const handlePickChat = (row) => {
    if (!row.enabled) return;

    resetMapState();
    setChat(row);
    setScreen('map');
  };

  const handleBackToPicker = () => {
    resetMapState();
    refreshChats();
    setScreen('picker');
  };

  // ---------- 进入地图：读这个聊天窗的图钉 ----------

  useEffect(() => {
    if (screen !== 'map' || !chat) return undefined;

    let cancelled = false;

    loadFootprintPlaces(chat.chatId)
      .then((list) => {
        if (cancelled) return;

        setPlaces(list);
        setPlacesReady(true);
      })
      .catch((error) => {
        console.warn('[FootprintMap] 读取地点失败：', error);

        if (cancelled) return;

        setPlaces([]);
        setPlacesReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [screen, chat]);

  // ---------- Leaflet 地图本体（只在地图页存在，同意之后才会走到这里请求瓦片） ----------

  useEffect(() => {
    if (screen !== 'map' || !mapElRef.current) return undefined;

    const map = L.map(mapElRef.current, {
      zoomControl: false,
      // 自带的版权条关掉，改用页面上常驻的一行署名（见 .fm-attribution）。
      attributionControl: false,
      minZoom: 2,
    });

    L.tileLayer(mapKey ? buildTileUrl(mapKey) : TILE_URL, {
    subdomains: 'abcd',
      maxZoom: 19,
      detectRetina: true,
    }).addTo(map);

    map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    map.on('click', () => {
      setSelectedId(null);
      setSheetState('closed');
    });

    mapRef.current = map;
    setMapReady(true);

    const frame = requestAnimationFrame(() => map.invalidateSize());

    return () => {
      cancelAnimationFrame(frame);
      map.remove();
      mapRef.current = null;
      markersRef.current = new Map();
      setMapReady(false);
    };
  }, [screen, mapKey]);

  // ---------- 图钉：地点列表变了才重建，选中 / 筛选只改 class，不重播落下动画 ----------

  onPickRef.current = (id) => {
    if (id === selectedId && sheetState === 'full') return;

    setSelectedId(id);
    setSheetState('peek');
  };

  useEffect(() => {
    const map = mapRef.current;

    if (!map || !mapReady || !placesReady) return undefined;

    const markers = new Map();

    places.forEach((place, index) => {
      const marker = L.marker([place.lat, place.lng], {
        icon: createPinIcon({
          color: getPinColor(place.kinds),
          both: place.kinds.length === 2,
          label: `No.${pad2(place.no)}  ${place.name}`,
          dropDelayMs: 550 + index * 120,
        }),
        title: place.name,
        keyboard: true,
        riseOnHover: false,
      }).addTo(map);

      marker.on('click', () => onPickRef.current(place.id));
      markers.set(place.id, marker);
    });

    markersRef.current = markers;

    if (places.length === 1) {
      map.setView([places[0].lat, places[0].lng], FOCUS_ZOOM, { animate: false });
    } else if (places.length > 1) {
      map.fitBounds(
        L.latLngBounds(places.map((place) => [place.lat, place.lng])),
        {
          paddingTopLeft: [40, 210],
          paddingBottomRight: [40, 170],
          maxZoom: 16,
          animate: false,
        },
      );
    }

    return () => {
      markers.forEach((marker) => marker.remove());
      markersRef.current = new Map();
    };
  }, [places, placesReady, mapReady]);

  useEffect(() => {
    const byId = new Map(places.map((place) => [place.id, place]));

    markersRef.current.forEach((marker, id) => {
      const element = marker.getElement();
      const place = byId.get(id);

      if (!element || !place) return;

      element.classList.toggle('is-selected', id === selectedId);
      element.classList.toggle('is-dim', !isPlaceVisibleForFilter(place, filter));
    });
  }, [selectedId, filter, places, placesReady, mapReady]);

  // 选中图钉：把它推到"没被详情盖住的那块地图"的正中间。
  useEffect(() => {
    const map = mapRef.current;

    if (!map || !mapReady || selectedId == null) return;

    const place = places.find((item) => item.id === selectedId);

    if (!place) return;

    const cover = sheetState === 'full'
      ? map.getSize().y * FULL_SHEET_RATIO
      : PEEK_COVER_PX;
    const zoom = Math.max(map.getZoom(), FOCUS_ZOOM);
    const target = map.project([place.lat, place.lng], zoom).add([0, cover / 2]);

    map.setView(map.unproject(target, zoom), zoom, { animate: true, duration: 1.1 });
  }, [selectedId, sheetState, places, mapReady]);

  // ---------- 详情里"这里发生过的事" ----------

  useEffect(() => {
    setMemories([]);

    if (selectedId == null) return undefined;

    let cancelled = false;

    loadFootprintMemories(selectedId)
      .then((list) => {
        if (!cancelled) setMemories(list);
      })
      .catch((error) => {
        console.warn('[FootprintMap] 读取这里发生过的事失败：', error);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  // ---------- 派生数据 ----------

  const chatName = chat?.name || '';

  const selectedPlace = useMemo(
    () => places.find((place) => place.id === selectedId) || null,
    [places, selectedId],
  );

  // 详情收起的过程中仍然显示上一个地点的内容，不会先变空再滑走。
  if (selectedPlace) lastShownPlaceRef.current = selectedPlace;

  const shownPlace = selectedPlace || lastShownPlaceRef.current;

  const latestVisit = useMemo(() => (
    places.reduce((max, place) => (
      new Date(place.lastVisitAt).getTime() > new Date(max || 0).getTime() ? place.lastVisitAt : max
    ), '')
  ), [places]);

  const filters = [
    { id: FOOTPRINT_FILTERS.ALL, label: '全部' },
    { id: FOOTPRINT_FILTERS.ME, label: '我留下的' },
    { id: FOOTPRINT_FILTERS.CHAR, label: `${chatName}留下的` },
  ];

  const peekText = places.length > 0
    ? `${places.length} 个地点${latestVisit ? ` · 最近一次 ${formatRelativeTime(latestVisit)}` : ''}`
    : '还没有足迹';

  const sheetClass = selectedPlace && sheetState !== 'closed'
    ? (sheetState === 'full' ? 'is-full' : 'is-peek')
    : '';

  const handleCloseSheet = () => {
    setSelectedId(null);
    setSheetState('closed');
  };

  const handleToggleSheet = () => {
    setSheetState((prev) => (prev === 'full' ? 'peek' : 'full'));
  };

  // ---------- 渲染 ----------

  return (
    <div className="fm-root">
      {screen === 'map' && (
        <div className="fm-mapscreen">
          <div ref={mapElRef} className="fm-map" />

          <div className="fm-attribution">
            Map data &copy; OpenStreetMap contributors &copy; CARTO
          </div>

                  {!mapKey && (
            <button
              type="button"
              className="fm-btn-reset fm-key-notice"
              onClick={handleBackToPicker}
            >
              还没填底图 key，地图上会盖着水印。点这里去填写
            </button>
          )}

          {placesReady && places.length === 0 && (
            <div className="fm-empty-note">
              这个聊天窗还没有留下地点。
              <br />
              开着定位聊一阵，地点会慢慢出现在这里。
            </div>
          )}

          <div className={`fm-mast ${sheetState === 'full' && selectedPlace ? 'is-hidden' : ''}`}>
            <div className="fm-mast-row">
              <button
                type="button"
                className="fm-btn-reset fm-round-btn fm-round-btn--glass"
                aria-label="返回选择聊天窗"
                onClick={handleBackToPicker}
              >
                <ArrowLeft size={18} strokeWidth={1.6} aria-hidden="true" />
              </button>
              <div className="fm-mast-vol">Vol. 01</div>
              <div className="fm-mast-count">{pad2(places.length)} places</div>
            </div>

            <div className="fm-mast-title">Footprints</div>
            <div className="fm-mast-sub">{chatName} 的足迹</div>

            <div className="fm-filters">
              {filters.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`fm-btn-reset fm-filter ${filter === item.id ? 'is-on' : ''}`}
                  onClick={() => setFilter(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className={`fm-peek ${selectedPlace ? 'is-hidden' : ''}`}>
            <div className="fm-grabber" />
            <div className="fm-peek-text">{peekText}</div>
            {places.length > 0 && (
              <div className="fm-peek-hint">点一枚图钉，翻开那一页</div>
            )}
          </div>

          <div className={`fm-sheet ${sheetClass}`} role="dialog" aria-label="地点详情">
            <button
              type="button"
              className="fm-btn-reset fm-sheet-grab"
              aria-label="展开或收起"
              onClick={handleToggleSheet}
            />

            {shownPlace && (
              <>
                <div className="fm-sheet-head">
                  <div className="fm-sheet-top">
                    <div className="fm-sheet-no">No. {pad2(shownPlace.no)}</div>
                    <button
                      type="button"
                      className="fm-btn-reset fm-sheet-close"
                      onClick={handleCloseSheet}
                    >
                      关闭
                    </button>
                  </div>

                  <div className="fm-sheet-name">{shownPlace.name}</div>

                  <div className="fm-stats">
                    <div>
                      <div className="fm-stat-num">{shownPlace.visitCount}</div>
                      <div className="fm-stat-label">次到访</div>
                    </div>
                    <div>
                      <div className="fm-stat-val">{shownPlace.tendency || '—'}</div>
                      <div className="fm-stat-label">常在这个时段</div>
                    </div>
                    <div>
                      <div className="fm-stat-note">{shownPlace.note || '—'}</div>
                      <div className="fm-stat-label">备注</div>
                    </div>
                  </div>

                  <div className="fm-mem-head">
                    <div className="fm-mem-title">这里发生过的事</div>
                    <div className="fm-mem-rule" />
                    <div className="fm-mem-count">{pad2(memories.length)}</div>
                  </div>
                </div>

                <div className="fm-scroll fm-mem-list">
                  {memories.length === 0 && (
                    <div className="fm-mem-empty">这里还没有留下什么。</div>
                  )}

                  {memories.map((memory) => {
                    const mine = memory.author === 'user';

                    return (
                      <div key={memory.id} className={`fm-mem ${mine ? '' : 'is-char'}`}>
                        <span
                          className="fm-mem-dot"
                          style={{ background: mine ? 'var(--fm-wine)' : 'var(--fm-blue)' }}
                        />
                        <div className="fm-mem-meta">
                          <span
                            className="fm-mem-who"
                            style={{ color: mine ? 'var(--fm-wine-text)' : 'var(--fm-blue-text)' }}
                          >
                            {mine ? '我' : chatName}
                          </span>
                          <span className="fm-mem-time">{formatRelativeTime(memory.createdAt)}</span>
                        </div>
                        <div className="fm-mem-text">{memory.text}</div>
                      </div>
                    );
                  })}
                </div>

                <div className="fm-sheet-foot">
                  <button
                    type="button"
                    className="fm-btn-reset fm-write-btn"
                    onClick={() => showToast('写足迹（照片和心情）下一轮开放')}
                  >
                    写一条足迹
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* 选聊天窗 */}
      <div className={`fm-layer fm-layer--picker ${screen === 'picker' ? 'is-on' : ''}`} aria-hidden={screen !== 'picker'}>
        <button
          type="button"
          className="fm-btn-reset fm-round-btn"
          aria-label="返回"
          onClick={onBackHub}
        >
          <ArrowLeft size={18} strokeWidth={1.6} aria-hidden="true" />
        </button>

        <div className="fm-eyebrow fm-picker-issue">Issue 01 / Index</div>
        <div className="fm-picker-title">
          Choose
          <br />
          a window
        </div>
        <div className="fm-picker-zh">选一个聊天窗</div>
        <div className="fm-picker-hint">每个聊天窗的足迹各看各的，不会合并到一起。</div>

        <div className="fm-picker-list">
          {chats.length === 0 && (
            <div className="fm-picker-note" style={{ marginTop: 18 }}>还没有聊天窗。</div>
          )}

          {chats.map((row, index) => (
            <button
              key={row.chatId}
              type="button"
              disabled={!row.enabled}
              className={`fm-btn-reset fm-picker-row ${row.enabled ? '' : 'is-disabled'}`}
              style={{ '--fm-i': index }}
              onClick={() => handlePickChat(row)}
            >
              <span className="fm-picker-no">{pad2(index + 1)}</span>
              <span className="fm-picker-main">
                <span className="fm-picker-name">{row.name}</span>
                <span className="fm-picker-meta">
                  {!row.enabled && '未开启定位'}
                  {row.enabled && row.placeCount === 0 && '还没有地点'}
                  {row.enabled && row.placeCount > 0 && (
                    `${row.placeCount} 个地点${row.lastVisitAt ? ` · 最近一次 ${formatRelativeTime(row.lastVisitAt)}` : ''}`
                  )}
                </span>
              </span>
              <ArrowRight size={22} strokeWidth={1.5} aria-hidden="true" />
            </button>
          ))}
        </div>

        <div className="fm-picker-note">在聊天窗设置里打开定位，它才会出现在这里。</div>

        <div className="fm-key-box">
          <div className="fm-key-title">底图 key</div>
          <div className="fm-key-help">
            地图底图来自 CARTO，需要你自己的免费 key。
            <a
              href="https://www.carto.com/basemaps/apikey/"
              target="_blank"
              rel="noopener noreferrer"
            >
              去申请
            </a>
            ，填邮箱就能收到。key 只保存在这台设备上。
          </div>
          <div className="fm-key-row">
            <input
              type="text"
              name="footprint-map-key"
              className="fm-key-input"
              value={keyDraft}
              maxLength={200}
              placeholder="粘贴你的 key"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              onChange={(event) => setKeyDraft(event.target.value)}
            />
            <button type="button" className="fm-btn-reset fm-key-save" onClick={handleSaveKey}>
              保存
            </button>
          </div>
        </div>
      </div>

      {/* 隐私说明页：第一次打开才出现，同意之后才会加载地图瓦片 */}
      <div className={`fm-layer fm-layer--gate ${screen === 'gate' ? 'is-on' : ''}`} aria-hidden={screen !== 'gate'}>
        <svg
          className="fm-gate-compass"
          viewBox="0 0 300 300"
          fill="none"
          stroke="currentColor"
          strokeWidth=".8"
          aria-hidden="true"
        >
          <circle cx="150" cy="150" r="140" />
          <circle cx="150" cy="150" r="112" />
          <circle cx="150" cy="150" r="64" />
          <path d="M150 6V294M6 150H294M48 48L252 252M252 48L48 252" />
          <path d="M150 20L162 150L150 280L138 150Z" fill="#8e1f2f" fillOpacity=".14" stroke="#8e1f2f" />
        </svg>

        <div className="fm-eyebrow fm-gate-top fm-rise-1">
          <span>Footprints</span>
          <span>No. 01</span>
        </div>

        <div className="fm-gate-body">
          <div className="fm-gate-title fm-rise-2">
            Before the
            <br />
            map opens
          </div>
          <div className="fm-gate-sub fm-rise-3">地图打开之前</div>
          <div className="fm-gate-lead fm-rise-4">
            地图画面由第三方地图服务提供。加载时，对方能知道你正在看哪一片大致的区域。
          </div>

          <div className="fm-gate-list fm-rise-5">
            <div className="fm-gate-item">
              <b>01</b>
              <span>你的地点名字、照片和聊天内容，不会发给地图服务。</span>
            </div>
            <div className="fm-gate-item">
              <b>02</b>
              <span>图钉是在你自己的设备上画出来的，数据一直留在本地。</span>
            </div>
            <div className="fm-gate-item">
              <b>03</b>
                 <span>不想用也没关系，原来的地点小册子完全不受影响。</span>
            </div>
            <div className="fm-gate-item">
              <b>04</b>
              <span>底图需要你自己的免费 key，下一页填写。key 只存在这台设备上，加载瓦片时会一起发给地图服务。</span>

            </div>
          </div>
        </div>

        <div className="fm-gate-foot fm-rise-6">
          <button type="button" className="fm-btn-reset fm-primary-btn" onClick={handleAgree}>
            同意并打开地图
          </button>
          <button type="button" className="fm-btn-reset fm-text-btn" onClick={onBackHub}>
            暂不打开
          </button>
          <div className="fm-credit">Map data &copy; OpenStreetMap contributors &copy; CARTO</div>
        </div>
      </div>

      {toast && <div className="fm-toast" role="status">{toast}</div>}
    </div>
  );
};

export default FootprintMapApp;