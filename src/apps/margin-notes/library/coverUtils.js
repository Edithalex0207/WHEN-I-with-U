// src/apps/margin-notes/library/coverUtils.js
//
// 封面图处理（只能在浏览器里跑，用到了 canvas）：把 epub 里取出的封面原图缩小成
// 一张体积很小的 data URL，存进 readerBooks.cover。任何一步失败都返回空字符串，
// 界面上就会用书名生成的封面代替，不影响导入。

const COVER_MAX_WIDTH = 360;
const COVER_QUALITY = 0.82;

const loadImage = (url) =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('封面图读取失败'));
    image.src = url;
  });

export const coverBytesToDataUrl = async (bytes, mime) => {
  if (!bytes || !bytes.length) return '';

  let objectUrl = '';
  try {
    const blob = new Blob([bytes], { type: mime || 'image/jpeg' });
    objectUrl = URL.createObjectURL(blob);
    const image = await loadImage(objectUrl);

    const sourceWidth = image.naturalWidth || image.width;
    const sourceHeight = image.naturalHeight || image.height;
    if (!sourceWidth || !sourceHeight) return '';

    const scale = Math.min(1, COVER_MAX_WIDTH / sourceWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));

    const context = canvas.getContext('2d');
    if (!context) return '';
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL('image/jpeg', COVER_QUALITY);
  } catch (error) {
    console.warn('[藏书] 封面处理失败，改用生成的封面：', error);
    return '';
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
};

// 没有封面图时，用书名挑一个封面色（和设计稿里三本书的色调一致的一组深浅搭配）。
const COVER_PALETTE = [
  { cover: '#23415A', fg: '#EEE8D8', tint: '#CFE0E8', fill: '#5E8AA8' },
  { cover: '#6E2B3A', fg: '#F2DDE0', tint: '#EBD3D8', fill: '#B5707D' },
  { cover: '#D9D5C9', fg: '#3A3A36', tint: '#E6E2D3', fill: '#A89F7E' },
  { cover: '#34503F', fg: '#E4EEDF', tint: '#D2E1D3', fill: '#6F9A7C' },
  { cover: '#4A3B5C', fg: '#E9E1F0', tint: '#DDD3E8', fill: '#8D77A8' },
  { cover: '#7A4E2D', fg: '#F4E6D3', tint: '#EBDCC4', fill: '#B98A5E' },
];

export const pickCoverStyle = (title) => {
  const text = String(title || '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return COVER_PALETTE[hash % COVER_PALETTE.length];
};

/**
 * 书名里有没有中日韩文字，决定生成封面时是竖排还是横排斜体。
 */
export const hasCjk = (title) => /[㐀-鿿぀-ヿ가-힯]/.test(String(title || ''));