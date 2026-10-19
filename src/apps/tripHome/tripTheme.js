// src/apps/tripHome/tripTheme.js
//
// 旅行小屋的"主题色跟随房间图"：从房间背景图里取一个主色相（0 到 360），
// 交给 TripApp 写进 --trip-h，整个应用的底色、卡片、主按钮都从这个色相
// 派生（见 tripHome.css 开头），所以换一张房间图整页就跟着换色。
//
// 取不到的情况（图太淡、图跨域被浏览器拦截、加载失败）一律返回 null，
// 调用方退回默认色相，不报错。用户自己上传的图是 data URL，不会有跨域问题；
// 目录里填的外链图有的图床不允许，取不到就用默认色。

export const DEFAULT_THEME_HUE = 345;

const SAMPLE = 48;

export const extractThemeHue = (src) =>
  new Promise((resolve) => {
    if (!src) {
      resolve(null);
      return;
    }

    const img = new Image();
    if (!/^data:|^blob:/i.test(src)) img.crossOrigin = 'anonymous';

    img.onerror = () => resolve(null);
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = SAMPLE;
        canvas.height = SAMPLE;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
        const data = ctx.getImageData(0, 0, SAMPLE, SAMPLE).data;

        // 色相是圆环，不能直接求平均：用向量相加。按"饱和度 x 亮度适中程度"
        // 加权，灰白黑和过暗过亮的像素基本不参与，避免一张米白墙把主题拉成灰。
        let sumX = 0;
        let sumY = 0;
        let weight = 0;

        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] < 200) continue;
          const r = data[i] / 255;
          const g = data[i + 1] / 255;
          const b = data[i + 2] / 255;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          const l = (max + min) / 2;
          const delta = max - min;
          if (delta === 0) continue;
          const s = delta / (1 - Math.abs(2 * l - 1));
          if (s < 0.18 || l < 0.15 || l > 0.95) continue;

          let h;
          if (max === r) h = ((g - b) / delta) % 6;
          else if (max === g) h = (b - r) / delta + 2;
          else h = (r - g) / delta + 4;
          h *= 60;
          if (h < 0) h += 360;

          const w = s * (1 - Math.abs(2 * l - 1));
          sumX += Math.cos((h * Math.PI) / 180) * w;
          sumY += Math.sin((h * Math.PI) / 180) * w;
          weight += w;
        }

        if (weight < 1) {
          resolve(null);
          return;
        }

        let hue = (Math.atan2(sumY, sumX) * 180) / Math.PI;
        if (hue < 0) hue += 360;
        resolve(Math.round(hue));
      } catch (error) {
        resolve(null);
      }
    };

    img.src = src;
  });
