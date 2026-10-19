// src/apps/tripHome/TripCropSheet.jsx
//
// 通用的图片裁剪弹层，旅行小屋里两处共用：
// - 房间背景图：取景框比例 400:440（跟房间舞台一致），输出 JPEG；
// - 居民贴图：正方形取景框，输出带透明背景的 PNG，并把白色贴纸描边直接
//   "烤"进图里（outlinePx > 0）。描边烤进图片而不是用 SVG 滤镜，是因为
//   居民每帧都在移动，SVG 滤镜每帧重算在手机上不划算。
//
// 操作：拖动移动位置；滑块、鼠标滚轮或双指捏合缩放。图片不会被拖出取景框
// （始终铺满取景框，不会露出空白）。
//
// shape：
//   'rect'   直接按取景框裁成矩形；
//   'circle' 裁成圆形（圆外透明）；
//   'auto'   图片本身带透明背景就保留它的形状，不带透明背景（比如照片）
//            就裁成圆形，这样加了白边也像一张圆贴纸，而不是一块方形的图。
//
// 只导出 readImageFile 和默认组件。

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

const MAX_ZOOM = 4;

// 把用户选的文件读成 Image。返回的 url 用完要 URL.revokeObjectURL 释放。
export const readImageFile = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, url });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('decode_failed'));
    };
    image.src = url;
  });

// 图片是不是带透明像素（采样缩小后的图，足够判断"抠好图的 PNG"）。
const detectAlpha = (image) => {
  try {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(image, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;
    let clear = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 250) clear += 1;
    }
    return clear > size * size * 0.02;
  } catch (error) {
    return false;
  }
};

// 给一张带透明背景的画布加一圈白色描边（贴纸效果）：先把图染成纯白，
// 向四周 16 个方向各偏移 px 像素画一遍，再把原图盖在上面。
const bakeOutline = (source, px) => {
  const tint = document.createElement('canvas');
  tint.width = source.width;
  tint.height = source.height;
  const tctx = tint.getContext('2d');
  tctx.drawImage(source, 0, 0);
  tctx.globalCompositeOperation = 'source-in';
  tctx.fillStyle = '#ffffff';
  tctx.fillRect(0, 0, tint.width, tint.height);

  const out = document.createElement('canvas');
  out.width = source.width;
  out.height = source.height;
  const octx = out.getContext('2d');
  const steps = 16;
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2;
    octx.drawImage(tint, Math.cos(angle) * px, Math.sin(angle) * px);
  }
  octx.drawImage(source, 0, 0);
  return out;
};

const TripCropSheet = ({
  image,
  aspect = 1,
  outWidth = 512,
  shape = 'rect',
  mime = 'image/jpeg',
  quality = 0.85,
  outlinePx = 0,
  title = '裁剪图片',
  hint = '',
  confirmLabel = '用这张',
  onCancel,
  onConfirm,
}) => {
  const frameRef = useRef(null);
  const minRef = useRef(1);
  const sizeRef = useRef({ w: 0, h: 0 });
  const pointersRef = useRef(new Map());
  const pinchRef = useRef(0);
  const [view, setView] = useState({ x: 0, y: 0, s: 1 });
  const [ready, setReady] = useState(false);

  const hasAlpha = useMemo(() => (shape === 'auto' ? detectAlpha(image) : false), [image, shape]);
  const circle = shape === 'circle' || (shape === 'auto' && !hasAlpha);

  const clampView = useCallback(
    (next) => {
      const { w, h } = sizeRef.current;
      const iw = image.width * next.s;
      const ih = image.height * next.s;
      return {
        s: next.s,
        x: Math.min(0, Math.max(w - iw, next.x)),
        y: Math.min(0, Math.max(h - ih, next.y)),
      };
    },
    [image]
  );

  const fitView = useCallback(() => {
    const { w, h } = sizeRef.current;
    if (!w || !h) return;
    const min = Math.max(w / image.width, h / image.height);
    minRef.current = min;
    setView(
      clampView({
        s: min,
        x: (w - image.width * min) / 2,
        y: (h - image.height * min) / 2,
      })
    );
  }, [clampView, image]);

  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    sizeRef.current = { w: frame.clientWidth, h: frame.clientHeight };
    fitView();
    setReady(true);
  }, [fitView]);

  // 以 (cx, cy)（取景框内坐标）为不动点缩放。
  const zoomTo = useCallback(
    (nextScale, cx, cy) => {
      setView((prev) => {
        const s = Math.min(minRef.current * MAX_ZOOM, Math.max(minRef.current, nextScale));
        const ratio = s / prev.s;
        return clampView({ s, x: cx - (cx - prev.x) * ratio, y: cy - (cy - prev.y) * ratio });
      });
    },
    [clampView]
  );

  // 滚轮缩放：需要 passive: false 才能 preventDefault，不能用 React 的 onWheel。
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      const rect = frame.getBoundingClientRect();
      setView((prev) => {
        const s = Math.min(minRef.current * MAX_ZOOM, Math.max(minRef.current, prev.s * (event.deltaY < 0 ? 1.08 : 0.93)));
        const cx = event.clientX - rect.left;
        const cy = event.clientY - rect.top;
        const ratio = s / prev.s;
        return clampView({ s, x: cx - (cx - prev.x) * ratio, y: cy - (cy - prev.y) * ratio });
      });
    };
    frame.addEventListener('wheel', onWheel, { passive: false });
    return () => frame.removeEventListener('wheel', onWheel);
  }, [clampView]);

  const onPointerDown = (event) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, [event.clientX, event.clientY]);
    pinchRef.current = 0;
  };

  const onPointerMove = (event) => {
    const pointers = pointersRef.current;
    if (!pointers.has(event.pointerId)) return;
    const previous = pointers.get(event.pointerId);
    pointers.set(event.pointerId, [event.clientX, event.clientY]);

    if (pointers.size === 1) {
      const dx = event.clientX - previous[0];
      const dy = event.clientY - previous[1];
      setView((prev) => clampView({ ...prev, x: prev.x + dx, y: prev.y + dy }));
    } else if (pointers.size === 2) {
      const [a, b] = Array.from(pointers.values());
      const dist = Math.hypot(a[0] - b[0], a[1] - b[1]);
      const rect = frameRef.current.getBoundingClientRect();
      if (pinchRef.current > 0) {
        const cx = (a[0] + b[0]) / 2 - rect.left;
        const cy = (a[1] + b[1]) / 2 - rect.top;
        setView((prev) => {
          const s = Math.min(minRef.current * MAX_ZOOM, Math.max(minRef.current, prev.s * (dist / pinchRef.current)));
          const ratio = s / prev.s;
          return clampView({ s, x: cx - (cx - prev.x) * ratio, y: cy - (cy - prev.y) * ratio });
        });
      }
      pinchRef.current = dist;
    }
  };

  const onPointerEnd = (event) => {
    pointersRef.current.delete(event.pointerId);
    pinchRef.current = 0;
  };

  const handleConfirm = () => {
    const { w, h } = sizeRef.current;
    if (!w || !h) return;

    const outW = Math.round(outWidth);
    const outH = Math.round(outWidth / aspect);
    const inset = outlinePx;

    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, -view.x / view.s, -view.y / view.s, w / view.s, h / view.s, inset, inset, outW - inset * 2, outH - inset * 2);

    if (circle) {
      ctx.globalCompositeOperation = 'destination-in';
      ctx.beginPath();
      ctx.ellipse(outW / 2, outH / 2, (outW - inset * 2) / 2, (outH - inset * 2) / 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const finalCanvas = outlinePx > 0 ? bakeOutline(canvas, outlinePx) : canvas;
    onConfirm(finalCanvas.toDataURL(mime, quality));
  };

  const zoomValue = minRef.current > 0 ? view.s / minRef.current : 1;

  return (
    <div className="trip-scrim" onClick={onCancel}>
      <div className="trip-sheet" onClick={(event) => event.stopPropagation()}>
        <h2 className="trip-sheet-title trip-sheet-title--center">{title}</h2>
        {hint && <p className="trip-hint trip-hint--center">{hint}</p>}

        <div
          ref={frameRef}
          className={`trip-crop-frame${circle ? ' is-circle' : ''}`}
          style={{ aspectRatio: String(aspect) }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          {ready && (
            <img
              src={image.src}
              alt=""
              draggable={false}
              style={{
                width: image.width,
                height: image.height,
                transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`,
              }}
            />
          )}
        </div>

        <label className="trip-zoom">
          <span>小</span>
          <input
            type="range"
            min="1"
            max={MAX_ZOOM}
            step="0.01"
            value={zoomValue}
            aria-label="缩放"
            onChange={(event) => {
              const { w, h } = sizeRef.current;
              zoomTo(minRef.current * Number(event.target.value), w / 2, h / 2);
            }}
          />
          <span>大</span>
        </label>

        <div className="trip-sheet-actions">
          <button type="button" className="trip-btn trip-btn--ghost" onClick={onCancel}>
            取消
          </button>
          <button type="button" className="trip-btn trip-btn--ghost" onClick={fitView}>
            重置
          </button>
          <button type="button" className="trip-btn" onClick={handleConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TripCropSheet;
