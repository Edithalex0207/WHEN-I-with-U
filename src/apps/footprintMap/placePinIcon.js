// src/apps/footprintMap/placePinIcon.js
//
// 把设计稿里那枚水滴形图钉做成 Leaflet 的 divIcon。
// 图钉本身是内联 SVG，外面套几层 span 分别负责：落下动画、选中光环、
// "两者都有"的小蓝点、选中时才显示的名字标签。
// 选中 / 变淡这些状态不重建图标，由 FootprintMapApp 直接给图钉元素加减 class，
// 这样落下动画不会因为点一下就重播。

import L from 'leaflet';

import { PIN_COLOR_CHAR } from './footprintMapService';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const PIN_WIDTH = 32;
export const PIN_HEIGHT = 40;

export const createPinIcon = ({ color, both, label, dropDelayMs = 0 }) => L.divIcon({
  className: 'fm-pin',
  iconSize: [PIN_WIDTH, PIN_HEIGHT],
  iconAnchor: [PIN_WIDTH / 2, PIN_HEIGHT],
  html: `
    <span class="fm-pin__ring" style="border-color:${color}"></span>
    <span class="fm-pin__body" style="animation-delay:${dropDelayMs}ms">
      <svg width="${PIN_WIDTH}" height="${PIN_HEIGHT}" viewBox="0 0 32 40" aria-hidden="true">
        <path d="M16 39C16 39 3 25 3 15a13 13 0 0 1 26 0c0 10-13 24-13 24Z" fill="${color}"/>
        <circle cx="16" cy="15" r="5.5" fill="#f8f4ea"/>
      </svg>
      ${both ? `<span class="fm-pin__dot" style="background:${PIN_COLOR_CHAR}"></span>` : ''}
    </span>
    <span class="fm-pin__label">${escapeHtml(label)}</span>
  `,
});

export default { createPinIcon, PIN_WIDTH, PIN_HEIGHT };