// src/apps/footprintMap/mapProviders.js
//
// 足迹地图的「地图服务商注册表」。
//
// 以后想加一个新的底图服务商，只需要在 MAP_PROVIDERS 里加一项数据，
// 不用改 FootprintMapApp.jsx。每一项的字段：
//
//   id              内部标识，存进 db.settings，一旦发布就不要改
//   label           页面上显示的名字
//   needsKey        是否需要用户自己的 key
//   keySettingName  这家的 key 存在 db.settings 的哪个键里（只有 needsKey 为 true 才有）。
//                   每家各用各的键，这样不会把 A 家的 key 误发给 B 家
//   keyHelpUrl      去哪里申请 key（只有 needsKey 为 true 才有）
//   keyHelp         选聊天窗页里，key 输入框上面那段说明
//   keyNotice       地图页里「还没填 key」的提示条文案
//   note            选服务商那一栏下面的一行小字（使用条件之类）
//   buildTileUrl    (key) => 瓦片地址模板，保留 {z}/{x}/{y}
//   attribution     地图页上常驻的署名文字，换服务商时必须跟着换
//   maxZoom         这家底图最大缩放级别
//   detectRetina    这家有没有高清（@2x）瓦片。没有的不要开，
//                   不然 Leaflet 会把同一张图多请求好几倍
//
// 重要：本应用不提供任何服务商的 key。需要 key 的服务商，每个用户都要
// 自己去申请，key 只保存在本机的 db.settings 里。

export const DEFAULT_PROVIDER_ID = 'carto';
export const FOOTPRINT_MAP_PROVIDER_SETTING = 'footprintMapProvider';

export const MAP_PROVIDERS = [
  {
    id: 'carto',
    label: 'CARTO（浅色）',
    needsKey: true,
    // 沿用第 1 轮已经在用的键名，已经填过 key 的人升级后不用重填。
    keySettingName: 'footprintMapKey',
    keyHelpUrl: 'https://www.carto.com/basemaps/apikey/',
    keyHelp:
      '这个底图需要你自己的免费 key，本应用不提供 key，需要你自己去申请，用邮箱就能收到。key 只保存在这台设备上，加载地图时会发给 CARTO。',
    keyNotice: '还没填底图 key，地图上会盖着水印。点这里去填写，或者换成不需要 key 的底图',
    note: '',
    buildTileUrl: (key) => {
      const base = 'https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png';

      return key ? `${base}?key=${encodeURIComponent(key)}` : base;
    },
    attribution: 'Map data \u00a9 OpenStreetMap contributors \u00a9 CARTO',
    maxZoom: 20,
    detectRetina: true,
  },
  {
    id: 'osm',
    label: 'OpenStreetMap 官方',
    needsKey: false,
    keySettingName: '',
    keyHelpUrl: '',
    keyHelp: '',
    keyNotice: '',
    note: '不需要 key，彩色底图。这是志愿者运营的公共服务，适合个人轻量使用。',
    buildTileUrl: () => 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: 'Map data \u00a9 OpenStreetMap contributors',
    maxZoom: 19,
    // 官方瓦片没有 @2x 版本，开了只会白白多请求。
    detectRetina: false,
  },
];

export const getProviderById = (id) => (
  MAP_PROVIDERS.find((provider) => provider.id === id)
  || MAP_PROVIDERS.find((provider) => provider.id === DEFAULT_PROVIDER_ID)
);

// 这家底图现在能不能正常用：不需要 key 的随时可用，需要 key 的要填了才算。
export const isProviderReady = (provider, key) => (
  !provider.needsKey || Boolean(key)
);

export default {
  DEFAULT_PROVIDER_ID,
  FOOTPRINT_MAP_PROVIDER_SETTING,
  MAP_PROVIDERS,
  getProviderById,
  isProviderReady,
};