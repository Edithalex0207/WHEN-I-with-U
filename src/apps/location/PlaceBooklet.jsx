import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Compass,
  Crosshair,
  Edit3,
  MapPin,
  Trash2,
  X,
} from 'lucide-react';

import {
  deletePlace,
  listPlaces,
  renamePlace,
  updatePlaceNote,
} from './placeService';
import PlaceMemorySection from './PlaceMemorySection';
import { formatChatPatternText } from './placePatternService';
import CharacterPlaceBooklet from './CharacterPlaceBooklet'; // [改动1] 新增入口组件

const MAP_IMAGE_URL = 'https://u2.fukit.cn/yYmWOHrYc';
const SVG_WIDTH = 1000;
const SVG_HEIGHT = 620;
const MAP_ZOOM_SCALE = 1.38; // 电影镜头聚焦倍率

const hashString = (value) => {
  let hash = 0;
  String(value || '').split('').forEach((char) => {
    hash = (hash << 5) - hash + char.charCodeAt(0);
    hash |= 0;
  });
  return Math.abs(hash);
};

// 坐标映射
const getMapPoint = (place, index) => {
  const latitude = Number(place?.latitude ?? place?.lat);
  const longitude = Number(place?.longitude ?? place?.lng ?? place?.lon);

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return {
      x: 120 + ((longitude + 180) / 360) * 760,
      y: 80 + ((90 - latitude) / 180) * 460,
    };
  }

  const seed = hashString(place?.id || place?.name || index);
  return {
    x: 130 + ((seed * 41 + index * 127) % 740),
    y: 90 + ((seed * 23 + index * 83) % 430),
  };
};

// 经纬度文本美化（大地测量 HUD 格式）
const formatCoordinates = (place, index) => {
  const latitude = Number(place?.latitude ?? place?.lat);
  const longitude = Number(place?.longitude ?? place?.lng ?? place?.lon);

  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    const latDir = latitude >= 0 ? 'N' : 'S';
    const lonDir = longitude >= 0 ? 'E' : 'W';
    return `${Math.abs(latitude).toFixed(2)}° ${latDir} · ${Math.abs(longitude).toFixed(2)}° ${lonDir}`;
  }

  const seed = hashString(place?.id || place?.name || index);
  const pseudoLat = (24 + (seed % 280) / 10).toFixed(2);
  const pseudoLon = (108 + ((seed * 7) % 200) / 10).toFixed(2);
  return `${pseudoLat}° N · ${pseudoLon}° E`;
};

const formatDate = (value) => {
  if (!value) return '未知日期';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未知日期';
  return date.toLocaleDateString('zh-CN');
};

const PlaceBooklet = ({ chatId, character, onBack }) => {
  const [viewMode, setViewMode] = useState('user'); // [改动2] 视图切换状态
  const [places, setPlaces] = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftNote, setDraftNote] = useState('');

  const reload = async () => {
    try {
      const list = await listPlaces(chatId);
      setPlaces(list);
      setActiveIndex((previous) => (
        Math.min(previous, Math.max(list.length - 1, 0))
      ));
    } catch (error) {
      console.warn('[Location] Failed to load places:', error);
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
      setDraftName('');
      setDraftNote('');
      setIsEditing(false);
      return;
    }

    setDraftName(activePlace.name || '');
    setDraftNote(activePlace.note || '');
    setIsEditing(false);
  }, [activePlace?.id]);

  const selectPlace = (index) => {
    const place = places[index];
    if (!place) return;

    setActiveIndex(index);
    setDraftName(place.name || '');
    setDraftNote(place.note || '');
  };

  const handleStartEditing = () => {
    if (!activePlace) return;
    setDraftName(activePlace.name || '');
    setDraftNote(activePlace.note || '');
    setIsEditing(true);
  };

  const handleCancelEditing = () => {
    if (!activePlace) return;
    setDraftName(activePlace.name || '');
    setDraftNote(activePlace.note || '');
    setIsEditing(false);
  };

  const handleSave = async () => {
    if (!activePlace || isSaving) return;
    const trimmedName = String(draftName || '').trim();
    if (!trimmedName) return;

    setIsSaving(true);
    try {
      await renamePlace(activePlace.id, trimmedName);
      await updatePlaceNote(activePlace.id, draftNote);
      await reload();
      setIsEditing(false);
    } catch (error) {
      console.warn('[Location] Failed to save place:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (placeId) => {
    try {
      await deletePlace(chatId, placeId);
      setIsEditing(false);
      await reload();
    } catch (error) {
      console.warn('[Location] Failed to delete place:', error);
    }
  };

  const handleRowKeyDown = (event, index) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      selectPlace(index);
    }
  };

  const mapPlaces = places.map((place, index) => ({
    place,
    index,
    point: getMapPoint(place, index),
    coordsText: formatCoordinates(place, index),
  }));

  const activePoint = mapPlaces[activeIndex]?.point || {
    x: SVG_WIDTH / 2,
    y: SVG_HEIGHT / 2,
  };

  // 镜头视口边界计算：确保图片放大平移时 100% 充满画框，永不留出黑边/只显示一半
  const rawOffsetX = SVG_WIDTH / 2 - activePoint.x * MAP_ZOOM_SCALE;
  const rawOffsetY = SVG_HEIGHT / 2 - activePoint.y * MAP_ZOOM_SCALE;
  const minOffsetX = SVG_WIDTH * (1 - MAP_ZOOM_SCALE);
  const maxOffsetX = 0;
  const minOffsetY = SVG_HEIGHT * (1 - MAP_ZOOM_SCALE);
  const maxOffsetY = 0;

  const mapOffsetX = Math.max(minOffsetX, Math.min(maxOffsetX, rawOffsetX));
  const mapOffsetY = Math.max(minOffsetY, Math.min(maxOffsetY, rawOffsetY));

  const routePoints = mapPlaces
    .map(({ point }) => `${point.x},${point.y}`)
    .join(' ');

  const canSave = Boolean(String(draftName || '').trim()) && !isSaving;

  // [改动3] 整页切换分支（放在所有 Hook 之后，符合 Hooks 规则）
  if (viewMode === 'character') {
    return (
      <CharacterPlaceBooklet
        chatId={chatId}
        character={character}
        onBack={() => setViewMode('user')}
      />
    );
  }

  return (
    <div className="place-booklet">
      <style>{`
        .place-booklet {
          --place-ink: #11110f;
          --place-black: #0c0c0b;
          --place-white: #ffffff;
          --place-muted: #77766f;
          --place-soft: #aaa8a0;
          --place-line: rgba(17,17,15,.11);
          --place-wash: rgba(17,17,15,.045);
          --place-ease: cubic-bezier(.16,1,.3,1);
          --place-bounce: cubic-bezier(.34,1.4,.64,1);
          position: fixed;
          inset: 0;
          z-index: 999;
          display: flex;
          height: 100dvh;
          width: 100vw;
          flex-direction: column;
          overflow: hidden;
          background: #fbfbf8;
          color: #11110f;
          isolation: isolate;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", Roboto, "Noto Sans SC", sans-serif;
          -webkit-font-smoothing: antialiased;
        }

        /* 顶部柔和日光晕 */
        .place-booklet::before {
          content: "";
          position: absolute;
          z-index: -2;
          top: -160px;
          right: -100px;
          width: 480px;
          height: 480px;
          border-radius: 50%;
          background: rgba(255,255,255,.9);
          filter: blur(45px);
          pointer-events: none;
        }

        /* 真实纸质微粒噪点滤镜 */
        .place-booklet::after {
          content: "";
          position: absolute;
          z-index: 30;
          inset: 0;
          pointer-events: none;
          opacity: .05;
          mix-blend-mode: multiply;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='placeNoise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23placeNoise)' opacity='.22'/%3E%3C/svg%3E");
        }

        .place-booklet * {
          box-sizing: border-box;
        }

        /* 强隔离返回胶囊按钮，锁定字号并赋予高阶悬浮弹簧动效 */
        .place-back-float {
          position: absolute;
          z-index: 25;
          top: max(18px, env(safe-area-inset-top));
          left: 20px;
          display: inline-flex;
          min-height: 38px;
          align-items: center;
          gap: 7px;
          padding: 0 15px 0 11px;
          border: 0;
          border-radius: 999px;
          color: #ffffff !important;
          background: #0c0c0b;
          box-shadow: 0 12px 28px rgba(0,0,0,.15), 0 3px 8px rgba(0,0,0,.08);
          cursor: pointer;
          transition: transform .5s var(--place-ease), background .3s ease, box-shadow .5s var(--place-ease);
        }

        .place-back-float span {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          line-height: 1 !important;
          letter-spacing: .2px !important;
        }

        .place-back-float:hover {
          background: #252522;
          box-shadow: 0 16px 32px rgba(0,0,0,.22), 0 5px 12px rgba(0,0,0,.1);
          transform: translateX(-3px) translateY(-2px);
        }

        .place-back-float:active {
          transform: translateX(-1px) scale(.95);
        }

        /* 主视口滚动容器 */
        .place-scroll {
          min-height: 0;
          flex: 1;
          overflow-y: auto;
          overflow-x: hidden;
          padding: 0 20px 110px;
          scrollbar-width: none;
          overscroll-behavior: contain;
          scroll-behavior: smooth;
        }

        .place-scroll::-webkit-scrollbar {
          display: none;
        }

        .place-content-wrap {
          max-width: 680px;
          margin: 0 auto;
          width: 100%;
        }

        /* 抬头与印章入场 */
        .place-intro {
          position: relative;
          padding: 95px 2px 34px;
          animation: placeIntroIn .85s var(--place-ease) both;
        }

        @keyframes placeIntroIn {
          from {
            opacity: 0;
            transform: translateY(22px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .place-intro::before {
          content: "";
          position: absolute;
          top: 70px;
          right: -30px;
          width: 160px;
          height: 160px;
          border: 1px solid rgba(17,17,15,.09);
          border-radius: 50%;
          pointer-events: none;
        }

        .place-kicker {
          display: flex;
          align-items: center;
          gap: 9px;
          color: var(--place-muted);
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 2px;
          text-transform: uppercase;
        }

        .place-kicker::before {
          content: "";
          width: 24px;
          height: 1px;
          background: var(--place-ink);
          opacity: .7;
        }

        .place-main-title {
          margin-top: 16px;
          color: var(--place-ink);
          font-family: Georgia, "Times New Roman", serif;
          font-size: clamp(40px, 11vw, 70px);
          font-weight: 400;
          letter-spacing: -3px;
          line-height: .94;
        }

        .place-main-title em {
          display: inline-block;
          padding-left: 18px;
          font-style: italic;
        }

        .place-intro-meta {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 9px 14px;
          margin-top: 24px;
          color: var(--place-muted);
          font-size: 10px;
        }

        .place-intro-meta strong {
          color: var(--place-ink);
          font-size: 12px;
          font-weight: 700;
        }

        .place-meta-dot {
          width: 3.5px;
          height: 3.5px;
          border-radius: 50%;
          background: var(--place-ink);
          opacity: .35;
        }

        /* [改动5] 切换到 TA 的地方：胶囊按钮样式（纯新增） */
        .place-switch-pill {
          display: inline-flex;
          margin-top: 18px;
          align-items: center;
          gap: 6px;
          padding: 7px 14px 7px 15px;
          border: 1px solid rgba(17,17,15,.16);
          border-radius: 999px;
          background: transparent;
          color: var(--place-ink);
          cursor: pointer;
          transition: background .3s ease, transform .35s var(--place-ease);
        }

        .place-switch-pill span {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif !important;
          font-size: 11px !important;
          font-weight: 600 !important;
          line-height: 1 !important;
        }

        .place-switch-pill:hover {
          background: rgba(17,17,15,.06);
          transform: translateX(2px);
        }

        .place-stamp {
          position: absolute;
          right: 2px;
          bottom: 28px;
          display: flex;
          width: 62px;
          height: 62px;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(17,17,15,.32);
          border-radius: 50%;
          color: var(--place-muted);
          font-family: Georgia, serif;
          font-size: 8px;
          letter-spacing: 1px;
          line-height: 1.4;
          text-align: center;
          transform: rotate(11deg);
          opacity: .75;
          animation: stampFloat 4s ease-in-out infinite alternate;
        }

        @keyframes stampFloat {
          from { transform: rotate(10deg); }
          to { transform: rotate(13deg) translateY(-2px); }
        }

        .place-stamp::before {
          content: "";
          position: absolute;
          inset: 4px;
          border: 1px dashed rgba(17,17,15,.25);
          border-radius: 50%;
        }

        /* 地图外框：手账倾斜切角 + 胶带质感 + 深度投影 */
        .map-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 12px;
          margin: 0 2px 10px;
          animation: sectionIn .8s .1s var(--place-ease) both;
        }

        @keyframes sectionIn {
          from {
            opacity: 0;
            transform: translateY(14px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .map-frame {
          position: relative;
          height: min(60vw, 410px);
          min-height: 290px;
          overflow: hidden;
          isolation: isolate;
          background: #dcdfd8;
          border-radius: 6px;
          clip-path: polygon(0 1.2%, 99.5% 0, 100% 98.8%, .5% 100%);
          box-shadow:
            0 28px 50px -26px rgba(0,0,0,.55),
            inset 0 1px 0 rgba(255,255,255,.65);
          animation: mapReveal 1.05s .15s var(--place-ease) both;
        }

        @keyframes mapReveal {
          from {
            opacity: 0;
            transform: translateY(22px) scale(.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        /* 顶部米黄色纸胶带贴纸质感 */
        .map-frame::before {
          content: "";
          position: absolute;
          z-index: 12;
          top: -12px;
          left: 50%;
          width: 110px;
          height: 28px;
          background: rgba(246, 242, 226, .75);
          box-shadow: 0 2px 5px rgba(0,0,0,.08);
          transform: translateX(-50%) rotate(-2deg);
          pointer-events: none;
        }

        /* 地图视口光影遮罩 */
        .map-frame::after {
          content: "";
          position: absolute;
          z-index: 10;
          inset: 0;
          background:
            radial-gradient(ellipse at center, transparent 46%, rgba(9,9,8,.25)),
            linear-gradient(180deg, transparent 60%, rgba(9,9,8,.38));
          pointer-events: none;
        }

        .map-svg {
          display: block;
          width: 100%;
          height: 100%;
        }

        /* 电影级推镜头丝滑平移层 */
        .map-world {
          transform-origin: 0 0;
          transform: translate(var(--map-offset-x), var(--map-offset-y)) scale(1.38);
          transition: transform 1.15s var(--place-ease);
          will-change: transform;
        }

        /* 保证图片填满地图区域，灰度微对比处理 */
        .map-image {
          display: block;
          width: 1000px;
          height: 620px;
          opacity: .94;
          filter: grayscale(1) contrast(.92) brightness(1.05);
          transition: filter .7s ease;
        }

        .map-frame:hover .map-image {
          filter: grayscale(1) contrast(1) brightness(1.02);
        }

        /* 路线虚线流动光效 */
        .map-route-line {
          stroke: #11110f;
          stroke-width: 4;
          stroke-linecap: round;
          stroke-linejoin: round;
          stroke-dasharray: 9 8;
          opacity: .75;
          animation: mapRouteMove 20s linear infinite;
        }

        @keyframes mapRouteMove {
          from { stroke-dashoffset: 340; }
          to { stroke-dashoffset: 0; }
        }

        /* 标记点微交互与脉冲 */
        .map-marker {
          cursor: pointer;
          transform-box: fill-box;
          transform-origin: center;
          transition: transform .6s var(--place-ease);
        }

        .map-marker:hover {
          transform: scale(1.18);
        }

        .map-marker.active {
          transform: scale(1.4);
        }

        .map-marker-pulse {
          animation: mapPulse 2.6s cubic-bezier(0.18, 0, 0.25, 1) infinite;
          transform-box: fill-box;
          transform-origin: center;
        }

        @keyframes mapPulse {
          0% {
            opacity: .75;
            transform: scale(.5);
          }
          70%, 100% {
            opacity: 0;
            transform: scale(2.2);
          }
        }

        /* 罗盘与标尺小组件 */
        .map-compass {
          position: absolute;
          top: 15px;
          right: 15px;
          z-index: 11;
          display: flex;
          width: 32px;
          height: 32px;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          color: #fff;
          background: rgba(12,12,11,.65);
          backdrop-filter: blur(4px);
          box-shadow: 0 4px 12px rgba(0,0,0,.2);
          font-family: Georgia, serif;
          font-size: 10px;
          font-weight: 700;
        }

        .map-compass::after {
          content: "";
          position: absolute;
          width: 1px;
          height: 12px;
          background: #fff;
          transform: rotate(45deg);
        }

        .map-scale {
          position: absolute;
          right: 15px;
          bottom: 15px;
          z-index: 11;
          display: flex;
          align-items: center;
          gap: 6px;
          color: #fff;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 1px;
          opacity: .8;
          text-shadow: 0 1px 4px rgba(0,0,0,.6);
        }

        .map-scale::before {
          content: "";
          display: block;
          width: 30px;
          height: 4px;
          border-top: 1px solid currentColor;
          border-right: 1px solid currentColor;
          border-left: 1px solid currentColor;
        }

        /* 地图底部悬浮信息条 */
        .place-map-caption {
          position: absolute;
          z-index: 11;
          right: 16px;
          bottom: 14px;
          left: 16px;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
          color: #fff;
          pointer-events: none;
        }

        .place-map-caption strong {
          display: block;
          max-width: 250px;
          overflow: hidden;
          font-family: Georgia, serif;
          font-size: 20px;
          font-style: italic;
          font-weight: 400;
          text-overflow: ellipsis;
          text-shadow: 0 2px 10px rgba(0,0,0,.5);
          white-space: nowrap;
        }

        /* 列表部分 */
        .place-list-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin: 44px 2px 8px;
          animation: sectionIn .8s .25s var(--place-ease) both;
        }

        .place-list {
          position: relative;
          padding-bottom: 8px;
          animation: sectionIn .8s .35s var(--place-ease) both;
        }

        .place-list::before {
          content: "";
          position: absolute;
          top: 12px;
          bottom: 16px;
          left: 16px;
          width: 1px;
          background: linear-gradient(var(--place-ink), rgba(17,17,15,.06));
          opacity: .25;
        }

        /* 列表项微交互：悬浮位移与左侧激活指示条 */
        .place-row {
          position: relative;
          display: grid;
          width: 100%;
          grid-template-columns: 34px minmax(0,1fr) 28px;
          align-items: center;
          gap: 13px;
          padding: 16px 2px;
          border-bottom: 1px solid var(--place-line);
          color: var(--place-ink);
          text-align: left;
          cursor: pointer;
          transition: padding .55s var(--place-ease), transform .4s var(--place-ease), background .4s ease;
        }

        .place-row::before {
          content: "";
          position: absolute;
          top: 8px;
          bottom: 8px;
          left: -18px;
          width: 3px;
          border-radius: 0 3px 3px 0;
          background: var(--place-black);
          opacity: 0;
          transform: scaleY(.3);
          transition: opacity .35s ease, transform .55s var(--place-ease);
        }

        .place-row:hover {
          transform: translateX(4px);
        }

        .place-row.active {
          padding-top: 22px;
          padding-bottom: 22px;
          background: linear-gradient(90deg, rgba(17,17,15,.045), transparent 70%);
        }

        .place-row.active::before {
          opacity: 1;
          transform: scaleY(1);
        }

        .place-row-marker {
          position: relative;
          z-index: 2;
          display: flex;
          width: 32px;
          height: 32px;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          color: var(--place-muted);
          background: #fbfbf8;
          box-shadow: 0 0 0 4px #fbfbf8;
          transition: color .35s ease, background .35s ease, transform .5s var(--place-ease);
        }

        .place-row.active .place-row-marker {
          color: #ffffff;
          background: #0c0c0b;
          box-shadow: 0 0 0 4px #fbfbf8, 0 8px 18px -8px rgba(0,0,0,.6);
          transform: scale(1.15) rotate(-8deg);
        }

        .place-delete {
          display: inline-flex;
          width: 28px;
          height: 28px;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          border: 0;
          color: var(--place-muted);
          background: rgba(17,17,15,.05);
          opacity: .4;
          cursor: pointer;
          transition: opacity .3s ease, color .3s ease, background .3s ease, transform .4s var(--place-bounce);
        }

        .place-delete:hover {
          color: #fff;
          background: #9d3232;
          opacity: 1;
          transform: scale(1.12) rotate(8deg);
        }

        /* 底部固定操作栏 */
        .place-footer {
          position: relative;
          z-index: 20;
          flex-shrink: 0;
          padding: 16px 20px calc(20px + env(safe-area-inset-bottom));
          background: linear-gradient(180deg, rgba(251,251,248,0), rgba(251,251,248,.96) 24%, #fbfbf8 55%);
        }

        .place-footer-inner {
          max-width: 680px;
          margin: 0 auto;
          width: 100%;
        }

        .place-footer-inner::before {
          content: "";
          display: block;
          width: 32px;
          height: 2px;
          margin-bottom: 12px;
          border-radius: 999px;
          background: #0c0c0b;
          opacity: .75;
        }

        /* 强隔离编辑按钮，小巧紧凑并带有呼吸升起交互 */
        .place-edit-button {
          display: inline-flex;
          min-height: 38px;
          align-items: center;
          gap: 6px;
          flex-shrink: 0;
          padding: 0 16px;
          border: 0;
          border-radius: 999px;
          color: #ffffff !important;
          background: #0c0c0b;
          box-shadow: 0 10px 22px -10px rgba(0,0,0,.65);
          cursor: pointer;
          transition: background .3s ease, box-shadow .4s var(--place-ease), transform .4s var(--place-ease);
        }

        .place-edit-button span {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
          font-size: 12px !important;
          font-weight: 600 !important;
          line-height: 1 !important;
          letter-spacing: .2px !important;
        }

        .place-edit-button:hover {
          background: #252522;
          box-shadow: 0 14px 26px -10px rgba(0,0,0,.75);
          transform: translateY(-2px);
        }

        .place-edit-button:active {
          transform: scale(.95);
        }

        /* 浮起式暗黑编辑面板 */
        .place-edit-panel {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 16px 18px 16px;
          border-radius: 20px;
          color: #ffffff;
          background: #0c0c0b;
          box-shadow: 0 20px 45px -20px rgba(0,0,0,.7);
          animation: editPanelIn .6s var(--place-ease) both;
        }

        @keyframes editPanelIn {
          from {
            opacity: 0;
            transform: translateY(16px) scale(.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .place-edit-input,
        .place-edit-textarea {
          width: 100%;
          border: 0;
          border-bottom: 1px solid rgba(255,255,255,.2);
          outline: 0;
          color: #ffffff;
          background: transparent;
          font-family: inherit;
          font-size: 13px;
          line-height: 1.4;
          transition: border-color .3s ease;
        }

        .place-edit-input:focus,
        .place-edit-textarea:focus {
          border-bottom-color: rgba(255,255,255,.85);
        }

        .place-edit-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          padding-top: 2px;
        }

        .place-edit-action {
          display: inline-flex;
          min-height: 34px;
          align-items: center;
          gap: 5px;
          padding: 0 12px;
          border: 0;
          border-radius: 999px;
          color: rgba(255,255,255,.75);
          background: rgba(255,255,255,.1);
          cursor: pointer;
          transition: color .3s ease, background .3s ease, transform .35s var(--place-ease);
        }

        .place-edit-action span {
          font-size: 11px !important;
          font-weight: 600 !important;
          line-height: 1 !important;
        }

        .place-edit-action.save {
          color: #0c0c0b;
          background: #ffffff;
          font-weight: 700;
        }

        .place-edit-action.save:disabled {
          opacity: .35;
          cursor: not-allowed;
        }

        @media (max-width: 420px) {
          .place-intro {
            padding-top: 88px;
            padding-bottom: 28px;
          }
          .place-main-title {
            font-size: clamp(38px, 12vw, 56px);
          }
          .map-frame {
            min-height: 280px;
          }
        }
      `}</style>

      {/* 顶部返回胶囊按钮 */}
      <button
        type="button"
        onClick={onBack}
        className="place-back-float"
        aria-label="返回上一页"
      >
        <ArrowLeft className="h-3.5 w-3.5 stroke-[2.2]" />
        <span>返回</span>
      </button>

      {/* 滚动视口主容器（全屏填满，内部 max-w-680 居中） */}
      <section className="place-scroll">
        <div className="place-content-wrap">
          {/* 抬头小节 */}
          <div className="place-intro">
            <div className="place-kicker">
              FIELD NOTES · MEMORY ATLAS
            </div>

            <h1 className="place-main-title">
              <span>走过的</span>
              <em>地方。</em>
            </h1>

            <div className="place-intro-meta">
              <strong>和 {character?.name || '伴侣'}</strong>
              <span className="place-meta-dot" />
              <span>{places.length} 个足迹</span>
              <span className="place-meta-dot" />
              <span>PLACES WE KEPT</span>
            </div>

            {/* [改动4] 切换到 TA 的地方 */}
            <button
              type="button"
              className="place-switch-pill"
              onClick={() => setViewMode('character')}
            >
              <span>看看 {character?.name || 'TA'} 的地方</span>
              <span aria-hidden="true">→</span>
            </button>

            <div className="place-stamp">
              WANDER
              <br />
              TOGETHER
            </div>
          </div>

          {isLoading && (
            <p className="py-16 text-center text-xs opacity-40">
              正在翻找记忆里的地点...
            </p>
          )}

          {!isLoading && places.length === 0 && (
            <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 text-center text-[#77766f]">
              <MapPin className="h-8 w-8 stroke-[1.3] opacity-60" />
              <p className="font-serif text-xs italic opacity-75">
                还没有留下足迹，等你们一起走过更多地方吧。
              </p>
            </div>
          )}

          {!isLoading && places.length > 0 && (
            <>
              {/* 地图标题与坐标指示栏 */}
              <div className="map-heading">
                <span className="text-[9px] font-extrabold tracking-[1.8px] uppercase text-[#77766f]">
                  Places / Map
                </span>
                <span className="max-w-[60%] truncate text-right font-serif text-xs italic text-[#11110f]/70">
                  {activePlace?.name || '记忆地图'}
                </span>
              </div>

              {/* 地图画框：严格充满整个区域，并保持丝滑电影镜头平移 */}
              <div className="map-frame">
                <svg
                  className="map-svg"
                  viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                  preserveAspectRatio="xMidYMid slice"
                  style={{
                    '--map-offset-x': `${mapOffsetX}px`,
                    '--map-offset-y': `${mapOffsetY}px`,
                  }}
                  aria-label="地点记忆地图"
                  role="img"
                >
                  <defs>
                    <pattern
                      id="mapGrid"
                      width="48"
                      height="48"
                      patternUnits="userSpaceOnUse"
                    >
                      <path
                        d="M 48 0 L 0 0 0 48"
                        fill="none"
                        stroke="#6f746d"
                        strokeWidth="1"
                      />
                    </pattern>

                    <filter id="markerShadow">
                      <feDropShadow
                        dx="0"
                        dy="4"
                        stdDeviation="5"
                        floodColor="#11110f"
                        floodOpacity=".35"
                      />
                    </filter>
                  </defs>

                  {/* 电影级平移跟随镜头 */}
                  <g className="map-world">
                    <image
                      className="map-image"
                      href={MAP_IMAGE_URL}
                      x="0"
                      y="0"
                      width={SVG_WIDTH}
                      height={SVG_HEIGHT}
                      preserveAspectRatio="xMidYMid slice"
                    />

                    <rect
                      x="0"
                      y="0"
                      width={SVG_WIDTH}
                      height={SVG_HEIGHT}
                      fill="url(#mapGrid)"
                      opacity=".1"
                    />

                    {/* 流光航线虚线 */}
                    {routePoints && (
                      <polyline
                        className="map-route-line"
                        points={routePoints}
                        fill="none"
                      />
                    )}

                    {/* 地点图钉与大地测量坐标美化 */}
                    {mapPlaces.map(({ place, index, point, coordsText }) => {
                      const isActive = index === activeIndex;

                      return (
                        <g
                          key={place.id}
                          className={`map-marker ${isActive ? 'active' : ''}`}
                          transform={`translate(${point.x} ${point.y})`}
                          onClick={() => selectPlace(index)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              selectPlace(index);
                            }
                          }}
                          role="button"
                          tabIndex={0}
                          aria-label={`选择地点：${place.name}`}
                        >
                          {isActive && (
                            <>
                              {/* 激活双层呼吸扩散环 */}
                              <circle
                                className="map-marker-pulse"
                                r="28"
                                fill="#ffffff"
                                opacity=".45"
                              />
                              {/* 瞄准准星刻度 */}
                              <circle
                                r="16"
                                fill="none"
                                stroke="#ffffff"
                                strokeWidth="1.2"
                                strokeDasharray="3 3"
                                opacity=".7"
                              />
                            </>
                          )}

                          {/* 基础外阴影圈 */}
                          <circle
                            r={isActive ? 16 : 12}
                            fill="#11110f"
                            opacity=".22"
                          />

                          {/* 墨黑精雕定位 Pin */}
                          <path
                            d="M0 -18 C-10 -18 -17 -10 -17 0 C-17 11 0 25 0 25 S17 11 17 0 C17 -10 10 -18 0 -18Z"
                            fill="#11110f"
                            stroke="#ffffff"
                            strokeWidth="2.5"
                            filter="url(#markerShadow)"
                          />

                          <circle
                            cy="0"
                            r="4.5"
                            fill="#ffffff"
                          />

                          {/* 激活状态浮动 HUD 坐标卡片 */}
                          {isActive && (
                            <g transform="translate(0, -28)">
                              <rect
                                x="-56"
                                y="-24"
                                width="112"
                                height="22"
                                rx="11"
                                fill="#0c0c0b"
                                fillOpacity=".92"
                              />
                              <text
                                x="0"
                                y="-13"
                                textAnchor="middle"
                                fill="#ffffff"
                                fontSize="8.5"
                                fontWeight="700"
                              >
                                {place.name?.slice(0, 8) || '足迹点'}
                              </text>
                              <text
                                x="0"
                                y="-5"
                                textAnchor="middle"
                                fill="#a8a69d"
                                fontSize="6.5"
                                fontFamily="monospace"
                              >
                                {coordsText}
                              </text>
                              <polygon
                                points="0,0 -3,-3 3,-3"
                                fill="#0c0c0b"
                                fillOpacity=".92"
                              />
                            </g>
                          )}
                        </g>
                      );
                    })}
                  </g>
                </svg>

                {/* 罗盘仪 */}
                <div className="map-compass">
                  N
                </div>

                {/* 比例尺 */}
                <div className="map-scale">
                  500 M
                </div>

                {/* 底部信息条 */}
                <div className="place-map-caption">
                  <div>
                    <small className="block mb-1 text-[8px] font-extrabold tracking-[1.5px] text-white/70">
                      LAST TRACE / 最近一次足迹
                    </small>
                    <strong>
                      {activePlace?.name || '记忆地图'}
                    </strong>
                  </div>

                  <span className="font-serif text-xs text-white/85">
                    {String(activeIndex + 1).padStart(2, '0')}
                    {' / '}
                    {String(places.length).padStart(2, '0')}
                  </span>
                </div>
              </div>

              {/* 地图心语 */}
              <div className="flex items-center gap-3 py-3 text-[10px] font-serif italic text-[#77766f]">
                <span className="h-[1px] w-7 bg-[#11110f]/40" />
                <span>地图不会记得所有路，但会记得我们停留过的地方。</span>
                <span>↗</span>
              </div>

              {/* 足迹地点列表小节 */}
              <div className="place-list-heading">
                <span className="font-serif text-[26px] tracking-tight text-[#11110f]">
                  足迹地点
                </span>
                <span className="text-[9px] font-extrabold tracking-[1.3px] text-[#77766f]/80">
                  {String(places.length).padStart(2, '0')} LOCATIONS
                </span>
              </div>

              <div className="place-list">
                {places.map((place, index) => (
                  <div
                    key={place.id}
                    className={`place-row ${index === activeIndex ? 'active' : ''}`}
                    onClick={() => selectPlace(index)}
                    onKeyDown={(event) => handleRowKeyDown(event, index)}
                    role="button"
                    tabIndex={0}
                    aria-pressed={index === activeIndex}
                  >
                    <div className="place-row-marker">
                      <MapPin className="h-4 w-4 stroke-[1.8]" />
                    </div>

                    <div className="min-w-0">
                      <p className="truncate font-serif text-[17px] text-[#11110f]">
                        {place.name || '未命名地点'}
                      </p>
                      <p className="mt-0.5 truncate text-[9px] font-bold tracking-wide text-[#77766f]">
                        到访 {place.visitCount || 1} 次 · 最近一次 {formatDate(place.lastVisitAt)}
                      </p>
                      {formatChatPatternText(place, character?.name) && (
                        <p className="mt-0.5 truncate text-[9px] font-bold tracking-wide text-[#77766f]">
                          {formatChatPatternText(place, character?.name)}
                        </p>
                      )}
                      {place.note && (
                        <p className="mt-1 truncate font-serif text-[11px] italic text-[#68665f]">
                          {place.note}
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleDelete(place.id);
                      }}
                      className="place-delete"
                      title="忘记这个地方"
                      aria-label={`删除地点：${place.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* 这个地方发生过的事 */}
              <PlaceMemorySection
                key={activePlace?.id}
                place={activePlace}
                chatId={chatId}
                characterName={character?.name}
              />
            </>
          )}
        </div>
      </section>

      {/* 底部固定信息与编辑面板 */}
      {activePlace && (
        <footer className="place-footer">
          <div className="place-footer-inner">
            {isEditing ? (
              <div className="place-edit-panel">
                <label className="text-[9px] font-extrabold tracking-wider text-white/50 uppercase">
                  地点名称
                </label>
                <input
                  className="place-edit-input"
                  type="text"
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  placeholder="给这个地方取个名字"
                  maxLength={100}
                  autoFocus
                />

                <label className="text-[9px] font-extrabold tracking-wider text-white/50 uppercase">
                  共同备注
                </label>
                <textarea
                  className="place-edit-textarea"
                  value={draftNote}
                  onChange={(event) => setDraftNote(event.target.value)}
                  placeholder="留一句只有你们知道的话..."
                  maxLength={1000}
                  rows={2}
                />

                <div className="place-edit-actions">
                  <button
                    type="button"
                    className="place-edit-action"
                    onClick={handleCancelEditing}
                    disabled={isSaving}
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>取消</span>
                  </button>

                  <button
                    type="button"
                    className="place-edit-action save"
                    onClick={() => void handleSave()}
                    disabled={!canSave}
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>{isSaving ? '保存中...' : '保存'}</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-end justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-bold tracking-wider text-[#77766f]">
                    初次到访：{formatDate(activePlace.firstVisitAt)}
                  </p>
                  {activePlace.note && (
                    <div className="mt-1 truncate font-serif text-[13px] italic text-[#11110f]">
                      {activePlace.note}
                    </div>
                  )}
                </div>

                {/* 小巧圆润的高阶编辑胶囊按钮 */}
                <button
                  type="button"
                  className="place-edit-button"
                  onClick={handleStartEditing}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>编辑</span>
                </button>
              </div>
            )}
          </div>
        </footer>
      )}
    </div>
  );
};

export default PlaceBooklet;