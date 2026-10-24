/*
 * 把一个像素小人画在 <canvas> 上的最小组件。
 *
 * 画布本身固定 16×20 像素，靠 CSS 放大（image-rendering: pixelated 保持
 * 像素边缘锐利），所以外面想放多大就给多大的 className / style 宽度，
 * 高度会按 4:5 自动跟上。
 *
 * look 每次渲染可能是新对象，这里用 JSON 字符串做依赖，避免父组件
 * 每次 render 都白白重画。customParts 一般来自 db 的 liveQuery，引用只在
 * 数据真的变了才会换，直接当依赖就行。
 */

import React, { useEffect, useRef } from 'react';

import { DOLL_H, DOLL_W, renderDollToCanvas } from './pixelDollEngine';

export const PixelDollCanvas = ({
  look,
  customParts,
  kind = 'user',
  className = '',
  style,
  label = '像素小人',
}) => {
  const canvasRef = useRef(null);
  const lookKey = JSON.stringify(look || {});

  useEffect(() => {
    renderDollToCanvas(canvasRef.current, look, customParts, kind);
    // look 的内容变化已经由 lookKey 反映，这里不直接依赖对象引用
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookKey, customParts, kind]);

  return (
    <canvas
      ref={canvasRef}
      width={DOLL_W}
      height={DOLL_H}
      role="img"
      aria-label={label}
      className={className}
      style={{
        display: 'block',
        width: '100%',
        height: 'auto',
        aspectRatio: `${DOLL_W} / ${DOLL_H}`,
        imageRendering: 'pixelated',
        ...style,
      }}
    />
  );
};

export default PixelDollCanvas;