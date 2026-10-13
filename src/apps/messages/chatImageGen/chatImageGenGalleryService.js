// src/apps/messages/chatImageGen/chatImageGenGalleryService.js
//
// "本聊天的生图"面板用到的数据查询：按 chatId 取这个聊天产生过的全部
// 生图记录（不管是AI自动触发的，还是之前在「生图室」里手动选了这个
// 聊天生成的——imageGenerations.chatId 不区分 source，两种都算）。
//
// 打包下载 / 删除本身不重新实现，直接复用 imageGalleryService.js 已有的
// buildGenerationsZip / deleteGenerations / loadOriginals——这里只负责
// "按聊天筛出这一份列表"。

import db from '../../../db';

/**
 * 这个聊天产生过的全部生图记录，按时间从新到旧。
 * 聊天维度的张数一般不会很多，这里不分页，一次读完（只读缩略图记录，
 * 不读原图，体积很小）。
 */
export const listChatGenerations = async (chatId) => {
  if (!chatId) return [];

  const rows = await db.imageGenerations.where('chatId').equals(chatId).toArray();

  return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
};

export default { listChatGenerations };