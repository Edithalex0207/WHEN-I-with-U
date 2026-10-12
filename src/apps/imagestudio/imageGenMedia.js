// src/apps/imagestudio/imageGenMedia.js
//
// 生图结果的图片处理工具：识别图片格式、base64 转 Blob、从 NovelAI 返回的
// zip 里取出图片、读尺寸、做缩略图、保存到设备。
// 除 zip 解包、缩略图、保存这几个要用浏览器 API 的函数外，其余是纯函数。

const THUMBNAIL_MAX_SIDE = 384;

/**
 * 看文件头判断图片格式。认不出来返回空字符串。
 */
export const sniffImageMime = (bytes) => {
  if (!bytes || bytes.length < 12) return '';

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png';
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }

  const isRiff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
  const isWebp = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  if (isRiff && isWebp) return 'image/webp';

  return '';
};

export const isZipBytes = (bytes) =>
  Boolean(bytes) && bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;

/**
 * base64（可带 data:xxx;base64, 前缀）转 Blob。格式以文件头为准，认不出就用 fallbackMime。
 */
export const base64ToBlob = (base64Text, fallbackMime = 'image/png') => {
  const raw = String(base64Text || '').replace(/^data:[^,]*,/, '').replace(/\s+/g, '');

  if (!raw) throw new Error('返回的图片数据是空的。');

  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new Blob([bytes], { type: sniffImageMime(bytes) || fallbackMime });
};

const mimeFromFileName = (name) => {
  if (/\.jpe?g$/i.test(name)) return 'image/jpeg';
  if (/\.webp$/i.test(name)) return 'image/webp';
  return 'image/png';
};

/**
 * NovelAI 的生图接口返回 zip，里面是 image_0.png 之类。取名字排序后的第一张图。
 * JSZip 是项目已有依赖，跟 callHistoryService.js 一样用动态导入，需要时才加载。
 */
export const extractImageFromZip = async (arrayBuffer) => {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(arrayBuffer);

  const entries = Object.values(zip.files)
    .filter((entry) => !entry.dir && /\.(png|jpe?g|webp)$/i.test(entry.name))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (entries.length === 0) {
    throw new Error('返回的压缩包里没有找到图片。');
  }

  const bytes = await entries[0].async('uint8array');
  return new Blob([bytes], {
    type: sniffImageMime(bytes) || mimeFromFileName(entries[0].name),
  });
};

/**
 * 把接口返回的二进制内容变成图片 Blob：zip 就解包，直接是图片就原样用，
 * 都不是就报错（通常是服务端返回了一段错误文字）。
 */
export const decodeImageResponse = async (arrayBuffer) => {
  const bytes = new Uint8Array(arrayBuffer);

  if (isZipBytes(bytes)) return extractImageFromZip(arrayBuffer);

  const mime = sniffImageMime(bytes);
  if (mime) return new Blob([bytes], { type: mime });

  throw new Error('返回的内容不是图片，也不是压缩包。');
};

const loadBitmapLike = async (blob) => {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
  }

  const url = URL.createObjectURL(blob);

  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('图片无法解码。'));
      element.src = url;
    });

    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => {},
    };
  } finally {
    URL.revokeObjectURL(url);
  }
};

/**
 * 读图片的实际宽高，并生成一张小缩略图（data URL，优先 webp）。
 * 缩略图是画廊列表用的，原图不在这里处理。
 */
export const readSizeAndMakeThumbnail = async (blob, maxSide = THUMBNAIL_MAX_SIDE) => {
  const loaded = await loadBitmapLike(blob);

  try {
    const scale = Math.min(1, maxSide / Math.max(loaded.width, loaded.height));
    const targetWidth = Math.max(1, Math.round(loaded.width * scale));
    const targetHeight = Math.max(1, Math.round(loaded.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    canvas.getContext('2d').drawImage(loaded.source, 0, 0, targetWidth, targetHeight);

    let thumbnail = canvas.toDataURL('image/webp', 0.8);
    if (!thumbnail.startsWith('data:image/webp')) {
      thumbnail = canvas.toDataURL('image/jpeg', 0.82);
    }

    return { width: loaded.width, height: loaded.height, thumbnail };
  } finally {
    loaded.close();
  }
};

const extensionFromMime = (mime) => {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  return 'png';
};

export const buildImageFileName = (blob, prefix = 'studio') => {
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `${prefix}-${stamp}.${extensionFromMime(blob?.type)}`;
};

/**
 * 保存图片到设备。
 * 网页没法直接写进系统相册，能做的是：支持系统分享面板的环境（大多数手机浏览器）
 * 调起分享面板，用户在里面选"存储图像"；不支持就退回普通下载。
 * 返回 'shared' | 'downloaded' | 'cancelled'。
 */
export const saveBlobToDevice = async (blob, fileName) => {
  try {
    const file = new File([blob], fileName, { type: blob.type || 'image/png' });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file] });
      return 'shared';
    }
  } catch (error) {
    if (error?.name === 'AbortError') return 'cancelled';
    // 分享失败（权限、环境限制等）时退回下载，不让用户白点一次。
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);

  return 'downloaded';
};