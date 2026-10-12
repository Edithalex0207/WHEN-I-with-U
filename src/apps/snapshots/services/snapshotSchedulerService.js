// src/apps/snapshots/services/snapshotSchedulerService.js
//
// 【整体替换说明】
// 相对旧版的改动：NPC 来源从全局 `db.snapshotSettings.get('npcs')`
// 改为按 chatId 专属的 `getNpcsByChatId(chatId)`；
// generateNpcPost 调用同步适配新签名 (npc, chatId, charName, userName)。
//
// 【2026-09 频率调整说明】
// 旧版：NPC 冷却 8 小时 + 全局只随机抽 1 个 NPC + 30% 概率命中一次。
// 新版：NPC 冷却缩到 4 小时（与 char 对齐），冷却按【每个 NPC 各自】的最后一次
// 发帖时间计算（不再是"该 chat 下任意 NPC 最后一次发帖"），且每个已过冷却的
// NPC 各自独立 roll 一次 70% 概率——判定资格各自独立。
// 和 snapshotGlobalScheduler.js 保持同一套规则，两处重复实现属于本项目里
// 已有的"调度器各自独立成文件"惯例，不合并。
//
// 【2026-09 发烫/卡顿修复说明，见下方 MAX_POSTS_PER_ROUND】
// "判定资格独立"不等于"执行也不设上限"——之前只要命中，本轮里所有符合
// 条件的char/npc会连续触发发帖（每条还级联1-3条评论），引发发烫卡顿。
// 现在给这个调度器（只管当前打开的这一个chat）加了本轮预算上限，见下方。
//
import db from '../../../db';
import { generateCharacterPost, generateNpcPost, generateNewsPost, NEWS_ACCOUNT } from './snapshotAiService';
import {
  getNpcsByChatId,
  ensureAutoNpcPool,
  ensureNpcPersona,
  isNpcAutoPostEnabled,
  isCharacterAutoPostEnabled,
} from './snapshotNpcService';
import { autoGenerateNpcComments } from './snapshotAutoCommentService';

// 2026-09 频率调整：NPC命中概率 60% -> 70%（冷却时间不变），跟
// snapshotGlobalScheduler.js 保持一致；同时补上新闻速报的冷却/概率常量。
const NPC_TRIGGER_PROBABILITY = 0.7;
const NEWS_POST_COOLDOWN_MS = 6 * 60 * 60 * 1000;
const NEWS_TRIGGER_PROBABILITY = 0.5;

// 2026-09 发烫/卡顿修复：之前每轮巡检里，只要char和多个NPC同时满足
// 冷却+概率，会在同一次 checkAndTrigger 调用里全部连续触发（每条帖子
// 还各自级联1-3条NPC评论的AI调用），叠加起来一轮就可能是大量连续AI请求。
// 这里给"这一轮实际触发的发帖数"设一个预算上限——到达上限后，本轮
// 后续原本也符合条件的实体直接跳过（不消耗它们的冷却，下一轮2分钟后
// 还会正常重新判定），把原本堆在一轮里的量错开到多轮里。这个调度器只
// 管当前打开的这一个chat，所以预算给得比全局调度器（snapshotGlobalScheduler.js，
// 一轮要扫所有chat）更宽松一些。
const MAX_POSTS_PER_ROUND = 2;

class SnapshotScheduler {
  constructor() {
    this.timer = null;
    this.activeChatId = null;
    this.listeners = new Set();
    this.isRunningCheck = false;
  }

  start(chatId) {
    const nextChatId = chatId ? Number(chatId) : null;
    if (this.activeChatId === nextChatId && this.timer) {
      return; // 已经在跑当前 Chat，不重复启动
    }

    this.activeChatId = nextChatId;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    if (!this.activeChatId) return;

    // 每 2 分钟巡检一次发帖条件
    this.timer = setInterval(() => {
      this.checkAndTrigger();
    }, 2 * 60 * 1000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.activeChatId = null;
  }

  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notify() {
    this.listeners.forEach((fn) => {
      try { fn(); } catch (e) {
        console.error('[SnapshotScheduler] 订阅回调异常:', e);
      }
    });
  }

  async checkAndTrigger() {
    if (!this.activeChatId || this.isRunningCheck) return;
    this.isRunningCheck = true;

    try {
      const chat = await db.chats.get(this.activeChatId);
      if (!chat) return;

      const char = chat.characterId ? await db.characters.get(chat.characterId) : null;
      const now = Date.now();
      let postsThisRound = 0;

      // 0. 这个chat要是从来没有NPC（用户没手动加，也没自动补过），先补一次
      // （只补这一次，见 snapshotNpcService.ensureAutoNpcPool 的注释）。
      await ensureAutoNpcPool(this.activeChatId, char, chat);

      // 1. 检查 Char 是否该主动发生活动态 (角色开启了主动消息，冷却 4 小时)
      // 2026-10 新增：角色本人的主动发帖现在也受一个全局开关控制
      // （跟下面 NPC 那个开关是两件独立的事），关掉之后角色本人不会再
      // 自己往动态圈发帖。
      const characterAutoPostEnabled = await isCharacterAutoPostEnabled();

      if (
        char
        && char.isAutoMessageActive
        && characterAutoPostEnabled
        && postsThisRound < MAX_POSTS_PER_ROUND
      ) {
        const lastCharPost = await db.snapshots
          .where('chatId')
          .equals(this.activeChatId)
          .and(s => s.characterId === char.id && s.authorType === 'character')
          .last();

        if (!lastCharPost || now - lastCharPost.timestamp > 4 * 60 * 60 * 1000) {
          const postData = await generateCharacterPost(char.id, this.activeChatId);
          const record = {
            chatId: this.activeChatId,
            authorType: 'character',
            characterId: char.id,
            authorName: char.name,
            authorAvatar: char.avatar || '',
            mediaUrl: '',
            imagePrompt: postData.imagePrompt,
            content: postData.content,
            location: postData.location,
            likes: 1,
            isLiked: false,
            timestamp: now,
            createdAt: now
          };
          const snapshotId = await db.snapshots.add(record);
          postsThisRound += 1;

          // 只有后台调度器自动发的角色动态才自动配NPC评论。
          await autoGenerateNpcComments(this.activeChatId, { id: snapshotId, ...record }, { type: 'character', id: char.id });

          this.notify();
          return; // 本次轮询已发，结束本次检查
        }
      }

      // 2. 检查 NPC 是否偶发生活动态
      // 冷却 4 小时，每个已过冷却的 NPC 各自独立 70% 概率触发，
      // 但受本轮 MAX_POSTS_PER_ROUND 预算限制——预算用完就跳过剩下的，
      // 它们的冷却没被消耗，下一轮还会正常参与判定。
      const npcAutoPostEnabled = await isNpcAutoPostEnabled();
      const npcs = npcAutoPostEnabled ? await getNpcsByChatId(this.activeChatId) : [];
      let hasNpcPosted = false;

      for (const npc of npcs) {
        if (postsThisRound >= MAX_POSTS_PER_ROUND) break;

        const lastNpcPost = await db.snapshots
          .where('chatId')
          .equals(this.activeChatId)
          .and(s => s.authorType === 'npc' && s.npcId === npc.id)
          .last();

        const offCooldown = !lastNpcPost || now - lastNpcPost.timestamp > 4 * 60 * 60 * 1000;
        if (!offCooldown) continue;

        if (Math.random() >= NPC_TRIGGER_PROBABILITY) continue;

        try {
          const npcWithPersona = await ensureNpcPersona(npc, char);
          const postData = await generateNpcPost(
            npcWithPersona,
            this.activeChatId,
            char?.name || '朋友',
            chat.userName || '常客',
            '',
            chat.userPersona || ''
          );

          const record = {
            chatId: this.activeChatId,
            authorType: 'npc',
            npcId: npc.id,
            authorName: npc.name,
            authorAvatar: '',
            mediaUrl: '',
            imagePrompt: postData.imagePrompt,
            content: postData.content,
            location: postData.location,
            likes: 0,
            isLiked: false,
            timestamp: now,
            createdAt: now
          };
          const snapshotId = await db.snapshots.add(record);
          postsThisRound += 1;

          // NPC自己发的帖子也一起配自动评论（跟用户确认过的范围）。
          await autoGenerateNpcComments(this.activeChatId, { id: snapshotId, ...record }, { type: 'npc', id: npc.id });

          hasNpcPosted = true;
        } catch (err) {
          console.error(`[SnapshotScheduler] NPC(${npc.name}) 动态生成失败:`, err);
        }
      }

      // 3. 本地生活速报：独立冷却（6小时）+ 50%概率，不占用角色/NPC的发帖机会，
      // 但同样受本轮预算限制。
      let hasNewsPosted = false;
      if (postsThisRound < MAX_POSTS_PER_ROUND) {
        const lastNewsPost = await db.snapshots
          .where('chatId')
          .equals(this.activeChatId)
          .and(s => s.authorType === 'news')
          .last();
        const newsOffCooldown = !lastNewsPost || now - lastNewsPost.timestamp > NEWS_POST_COOLDOWN_MS;

        if (newsOffCooldown && Math.random() < NEWS_TRIGGER_PROBABILITY) {
          try {
            const postData = await generateNewsPost(this.activeChatId);
            await db.snapshots.add({
              chatId: this.activeChatId,
              authorType: 'news',
              characterId: null,
              npcId: null,
              authorName: NEWS_ACCOUNT.name,
              authorAvatar: NEWS_ACCOUNT.avatar,
              mediaUrl: '',
              imagePrompt: postData.imagePrompt,
              content: postData.content,
              location: postData.location,
              likes: 0,
              isLiked: false,
              timestamp: now,
              createdAt: now
            });
            postsThisRound += 1;
            hasNewsPosted = true;
          } catch (err) {
            console.error('[SnapshotScheduler] 新闻速报生成失败:', err);
          }
        }
      }

      if (hasNpcPosted || hasNewsPosted) {
        this.notify();
      }
    } catch (err) {
      console.error('[SnapshotScheduler] 调度检查异常:', err);
    } finally {
      this.isRunningCheck = false;
    }
  }
}

export const snapshotScheduler = new SnapshotScheduler();