// src/apps/margin-notes/library/bookImport.js
//
// 导入入口：给一个用户选的文件（File），按扩展名交给 epub 或 txt 解析，
// 返回统一格式 { format, title, author, chapters, cover }。
// 这里是 jszip 唯一出现的地方，用动态 import，只有真的导入 epub 时才会加载它。

import { parseEpubArchive } from './epubParser.js';
import { decodeTextBytes, parseTxtText } from './txtParser.js';
import { coverBytesToDataUrl } from './coverUtils.js';

const MAX_FILE_BYTES = 50 * 1024 * 1024;

const fileExtension = (name) => {
  const match = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? match[1] : '';
};

const fileStem = (name) =>
  String(name || '').replace(/\.[^.]+$/, '').trim() || '未命名';

/**
 * 用 jszip 把 epub 包成 epubParser 需要的 archive 接口。
 * 压缩包里的路径大小写、斜杠有些 epub 不规范，所以 has/read 都先做一次宽松匹配。
 */
const createZipArchive = async (buffer) => {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buffer);

  const lowerIndex = new Map();
  Object.keys(zip.files).forEach((path) => {
    lowerIndex.set(path.toLowerCase(), path);
  });

  const locate = (path) => {
    if (zip.files[path] && !zip.files[path].dir) return path;
    const alt = lowerIndex.get(String(path).toLowerCase());
    return alt && !zip.files[alt].dir ? alt : null;
  };

  return {
    has: async (path) => Boolean(locate(path)),
    readText: async (path) => {
      const real = locate(path);
      if (!real) throw new Error(`压缩包里没有 ${path}`);
      return zip.files[real].async('string');
    },
    readBytes: async (path) => {
      const real = locate(path);
      if (!real) throw new Error(`压缩包里没有 ${path}`);
      return zip.files[real].async('uint8array');
    },
  };
};

/**
 * 解析用户选的书籍文件。失败会抛出带中文说明的 Error，界面直接显示 error.message。
 */
export const parseBookFile = async (file) => {
  if (!file) throw new Error('没有选择文件。');

  if (file.size > MAX_FILE_BYTES) {
    throw new Error('这个文件超过 50 MB，先不支持导入。');
  }

  const extension = fileExtension(file.name);

  if (extension === 'txt') {
    const buffer = await file.arrayBuffer();
    const text = decodeTextBytes(new Uint8Array(buffer));
    const parsed = parseTxtText(text, fileStem(file.name));
    return { format: 'txt', ...parsed, cover: '' };
  }

  if (extension === 'epub') {
    const buffer = await file.arrayBuffer();

    let archive;
    try {
      archive = await createZipArchive(buffer);
    } catch (error) {
      throw new Error('这个文件打不开，可能不是有效的 epub。');
    }

    const parsed = await parseEpubArchive(archive);
    const cover = parsed.cover
      ? await coverBytesToDataUrl(parsed.cover.bytes, parsed.cover.mime)
      : '';

    return {
      format: 'epub',
      title: parsed.title || fileStem(file.name),
      author: parsed.author,
      chapters: parsed.chapters,
      cover,
    };
  }

  throw new Error('目前只支持 .epub 和 .txt 文件。');
};