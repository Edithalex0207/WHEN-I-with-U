// src/apps/tripHome/tripRoomGeometry.js
//
// 房间地板的纯几何函数：点是否在地板范围内、是否被障碍物挡住、按 y 坐标
// 算景深缩放、在地板范围里随机挑一个点。不碰 React、不碰数据库，方便单
// 独测试。
//
// 坐标系统一用 STAGE_W x STAGE_H（400x440，跟房间舞台的 viewBox 一致）
// 这个像素坐标系做运算；只有在存进设置 / 从设置读出来的那一刻才换算成
// 百分比（toPercentPolygon / fromPercentPolygon），跟启动包里约定的
// "{floor: [[x,y]...], blocks: [[[x,y]...]]}，坐标是占 400x440 画布的
// 百分比" 格式对上。
//
// 默认地板/默认障碍物：这里不是复刻房间预览里那个手绘等距小屋的地板
// 形状（那是配合预览自己画的等距房间算出来的，跟真实背景图的透视完全
// 对不上）。真实应用的房间背景是用户自己跑的图，每张图的可走范围长什么
// 样没法预先知道，所以默认地板只给一个"舞台下半部分的梯形"这种朴素的
// 兜底形状，等用户用标定工具画出真正符合这张背景图的范围后，会被保存
// 的标定数据覆盖。

export const STAGE_W = 400;
export const STAGE_H = 440;

// 朴素兜底地板：一个底边宽、往后收窄一点的梯形，大致对应"镜头前方的
// 地面"这种直觉，不针对任何具体背景图。
export const DEFAULT_FLOOR = [
  [48, 414],
  [352, 414],
  [296, 210],
  [104, 210],
];

export const DEFAULT_BLOCKS = [];

export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

// 射线法判断点是否在多边形内。
export const pointInPolygon = (point, polygon) => {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects = yi > point[1] !== yj > point[1] &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
};

const ccw = (a, b, c) => (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]);

const segmentsIntersect = (a, b, c, d) =>
  ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d);

// 线段 a-b 是否跟多边形 polygon 相交，或 a/b 任一端点本身就在里面
// （用来判断"从这点走到那点会不会穿过障碍物"）。
export const segmentHitsPolygon = (a, b, polygon) => {
  if (!Array.isArray(polygon) || polygon.length < 3) return false;
  if (pointInPolygon(a, polygon) || pointInPolygon(b, polygon)) return true;
  for (let i = 0; i < polygon.length; i += 1) {
    const p1 = polygon[i];
    const p2 = polygon[(i + 1) % polygon.length];
    if (segmentsIntersect(a, b, p1, p2)) return true;
  }
  return false;
};

export const polygonBBox = (polygon) => {
  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

// 按 y 坐标（越靠下/越靠近镜头）算景深缩放比例，0.62 ~ 1.12 之间。
export const scaleAtY = (y, floor) => {
  const box = polygonBBox(floor);
  const span = Math.max(1, box.y1 - box.y0);
  const t = clamp((y - box.y0) / span, 0, 1);
  return 0.62 + 0.5 * t;
};

const isPointOk = (point, floor, blocks) =>
  pointInPolygon(point, floor) && !blocks.some((block) => pointInPolygon(point, block));

// 在地板范围内随机挑一个点，且不能是障碍物内部；如果给了 from，顺便保证
// from -> 新点这段路不会穿过障碍物。最多试 60 次，找不到就放弃（返回
// null，调用方原地等一轮）。
export const randomFloorPoint = (floor, blocks, from = null) => {
  const box = polygonBBox(floor);
  for (let i = 0; i < 60; i += 1) {
    const point = [
      box.x0 + Math.random() * (box.x1 - box.x0),
      box.y0 + Math.random() * (box.y1 - box.y0),
    ];
    if (!isPointOk(point, floor, blocks)) continue;
    if (from && blocks.some((block) => segmentHitsPolygon(from, point, block))) continue;
    return point;
  }
  return null;
};

// 存进设置时用百分比，跟背景图的具体像素尺寸无关，图片怎么缩放都不跑偏。
export const toPercentPolygon = (polygon) =>
  polygon.map(([x, y]) => [
    Number(((x / STAGE_W) * 100).toFixed(2)),
    Number(((y / STAGE_H) * 100).toFixed(2)),
  ]);

export const fromPercentPolygon = (polygon) =>
  polygon.map(([x, y]) => [(x / 100) * STAGE_W, (y / 100) * STAGE_H]);

const isValidPolygon = (polygon) =>
  Array.isArray(polygon) &&
  polygon.length >= 3 &&
  polygon.every((p) => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]));

// 把一份房间的标定配置（设置里存的百分比格式，可能是 null/坏数据）换算
// 成这个文件其余函数能直接用的像素坐标 { floor, blocks }，拿不到或格式
// 不对就退回默认地板。
export const resolveRoomFloor = (config) => {
  const floorPct = config?.floor;
  const blocksPct = config?.blocks;

  const floor = isValidPolygon(floorPct) ? fromPercentPolygon(floorPct) : DEFAULT_FLOOR;
  const blocks = Array.isArray(blocksPct)
    ? blocksPct.filter(isValidPolygon).map(fromPercentPolygon)
    : DEFAULT_BLOCKS;

  return { floor, blocks };
};