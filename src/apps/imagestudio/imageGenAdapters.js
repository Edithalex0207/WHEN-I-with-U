// src/apps/imagestudio/imageGenAdapters.js
//
// 两个生图后端的"真正发请求"部分。请求体和地址怎么拼见 imageGenRequest.js，
// 这里只负责：发请求、处理超时和各种失败、把返回内容变成图片 Blob。
//
// 重要约定：任何失败都只报错，不自动重试。NovelAI 要求生图必须由人发起，
// 收到 429 也不能自动重试，所以统一不做重试，让用户自己决定要不要再点一次。
// 唯一的例外是第三方接口因为不认识 response_format 参数而返回 400 时，
// 去掉这个参数再发一次——那是请求格式的适配，不是失败重试。

import {
  base64ToBlob,
  decodeImageResponse,
} from './imageGenMedia';
import {
  buildNovelAiAccountUrl,
  buildNovelAiRequestBody,
  buildNovelAiUrl,
  extractAnlas,
  buildThirdPartyRequestBody,
  buildThirdPartyUrl,
} from './imageGenRequest';

const REQUEST_TIMEOUT_MS = 120000;

export class ImageGenError extends Error {
  constructor(message, { status = 0, kind = 'unknown' } = {}) {
    super(message);
    this.name = 'ImageGenError';
    this.status = status;
    this.kind = kind;
  }
}

const NOVELAI_NETWORK_HINT =
  '请求没有发出去或被浏览器拦截了，常见原因是跨域限制、网络不通或地址写错。可以在「设置」里填写跨域代理 Worker 地址后再试。';
const THIRD_PARTY_NETWORK_HINT =
  '请求没有发出去或被浏览器拦截了，常见原因是服务不允许浏览器直接访问（跨域）、网络不通或接口地址写错。';

const fetchWithTimeout = async (url, init, networkHint) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new ImageGenError(
        `请求超过 ${REQUEST_TIMEOUT_MS / 1000} 秒没有响应，已放弃。需要的话请手动再试一次。`,
        { kind: 'timeout' }
      );
    }

    throw new ImageGenError(networkHint, { kind: 'network' });
  } finally {
    window.clearTimeout(timer);
  }
};

const readServerMessage = async (response) => {
  try {
    const text = await response.text();
    if (!text) return '';

    try {
      const parsed = JSON.parse(text);
      return String(
        parsed?.message || parsed?.error?.message || parsed?.error || parsed?.detail || ''
      ).slice(0, 300);
    } catch {
      return text.replace(/\s+/g, ' ').slice(0, 200);
    }
  } catch {
    return '';
  }
};

const describeHttpError = (status, serverMessage, backendLabel) => {
  let text;

  if (status === 401 || status === 403) {
    text = `${backendLabel} 拒绝了请求（${status}），Token 或 Key 无效、已过期，或没有权限。服务端对各种鉴权问题返回的状态相同，看不出具体原因。`;
  } else if (status === 429) {
    text = `${backendLabel} 提示请求太频繁或有并发限制（429）。不会自动重试，请稍等一会儿再手动试一次。`;
  } else if (status >= 500) {
    text = `${backendLabel} 服务端出错了（${status}）。`;
  } else {
    text = `${backendLabel} 返回了错误（${status}）。`;
  }

  return serverMessage ? `${text}服务端说：${serverMessage}` : text;
};

/**
 * 发一次 NovelAI 生图请求，返回图片 Blob。
 */
export const requestNovelAiImage = async ({ config, positive, negative, params, seed }) => {
  const body = buildNovelAiRequestBody({
    novelai: config.novelai,
    positive,
    negative,
    params,
    seed,
  });

  const response = await fetchWithTimeout(
    buildNovelAiUrl(config.corsProxyUrl),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.novelai.token}`,
      },
      body: JSON.stringify(body),
    },
    NOVELAI_NETWORK_HINT
  );

  if (!response.ok) {
    const serverMessage = await readServerMessage(response);
    const extra =
      response.status === 500
        ? ' 如果用的是自定义模型，也可能是请求格式和该模型不匹配。'
        : '';

    throw new ImageGenError(
      `${describeHttpError(response.status, serverMessage, 'NovelAI')}${extra}`,
      { status: response.status, kind: 'http' }
    );
  }

  try {
    const blob = await decodeImageResponse(await response.arrayBuffer());
    return { blob, remoteUrl: '' };
  } catch (error) {
    throw new ImageGenError(`NovelAI 返回了内容，但无法解析成图片：${error.message}`, {
      kind: 'decode',
    });
  }
};

/**
 * 查询 NovelAI 账户的 Anlas 余额。只读一次，不重试。
 * 返回 { fixed, purchased, total }。
 */
export const requestNovelAiBalance = async ({ config }) => {
  const response = await fetchWithTimeout(
    buildNovelAiAccountUrl(config.corsProxyUrl),
    { method: 'GET', headers: { Authorization: `Bearer ${config.novelai.token}` } },
    '余额接口在 api.novelai.net，和出图不是同一个地址。浏览器直连通常会被跨域拦住；如果用了跨域代理 Worker，需要让它也把 /user/ 开头的请求转发到 api.novelai.net。'
  );

  if (!response.ok) {
    const serverMessage = await readServerMessage(response);
    throw new ImageGenError(describeHttpError(response.status, serverMessage, 'NovelAI 账户接口'), {
      status: response.status,
      kind: 'http',
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ImageGenError('账户接口返回的内容不是有效的 JSON。', { kind: 'decode' });
  }

  const anlas = extractAnlas(payload);
  if (!anlas) {
    throw new ImageGenError('账户接口返回了内容，但里面没有找到 Anlas 字段。', { kind: 'decode' });
  }

  return anlas;
};

/**
 * 发一次第三方（OpenAI images/generations 格式）生图请求。
 * 返回 { blob, remoteUrl }：接口给 base64 就是 blob；只给链接就先尝试下载成 blob，
 * 下载失败（多半是对方图床不允许跨域）就只留 remoteUrl，blob 为 null。
 */
export const requestThirdPartyImage = async ({ config, positive }) => {
  const url = buildThirdPartyUrl(config.thirdParty.baseUrl);

  const send = (withResponseFormat) =>
    fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.thirdParty.apiKey}`,
        },
        body: JSON.stringify(
          buildThirdPartyRequestBody({
            thirdParty: config.thirdParty,
            positive,
            withResponseFormat,
          })
        ),
      },
      THIRD_PARTY_NETWORK_HINT
    );

  let response = await send(true);

  if (response.status === 400) {
    const message = await readServerMessage(response.clone());
    if (/response_format/i.test(message)) {
      response = await send(false);
    }
  }

  if (!response.ok) {
    const serverMessage = await readServerMessage(response);
    throw new ImageGenError(describeHttpError(response.status, serverMessage, '第三方接口'), {
      status: response.status,
      kind: 'http',
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new ImageGenError('第三方接口返回的内容不是有效的 JSON。', { kind: 'decode' });
  }

  const item = Array.isArray(payload?.data) ? payload.data[0] : null;

  if (item?.b64_json) {
    try {
      return { blob: base64ToBlob(item.b64_json), remoteUrl: '' };
    } catch (error) {
      throw new ImageGenError(`第三方接口返回的图片数据无法解析：${error.message}`, {
        kind: 'decode',
      });
    }
  }

  if (item?.url) {
    try {
      const imageResponse = await fetch(item.url);
      if (!imageResponse.ok) throw new Error(`状态 ${imageResponse.status}`);
      const blob = await decodeImageResponse(await imageResponse.arrayBuffer());
      return { blob, remoteUrl: '' };
    } catch (error) {
      console.warn('[ImageStudio] 下载第三方返回的图片链接失败，只保存外链：', error);
      return { blob: null, remoteUrl: item.url };
    }
  }

  throw new ImageGenError('第三方接口的返回里既没有 b64_json 也没有图片链接。', {
    kind: 'decode',
  });
};