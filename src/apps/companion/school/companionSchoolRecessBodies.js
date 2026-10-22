/*
 * companionSchoolRecessBodies.js —— 可互动课间事件的"玩法组件"登记表。
 *
 * CompanionSchoolRecessModal 管外壳（标题丝带、旁白气泡、角色、结算、
 * 关闭），具体怎么玩由这里登记的组件负责：RECESS_BODIES[kind] 对应一个
 * React 组件，弹窗按事件的 kind 去取。
 *
 * 【玩法组件的约定】
 *   props:
 *     event      object    待玩的事件（classmate / scene / kind ...）
 *     companion  object    当前小伙伴
 *     disabled   boolean   正在落库时为 true，玩法组件此时不要再响应点击
 *     onDone     function({ outcome, moodDelta, text })
 *                玩完调一次：outcome 是结果标签，moodDelta 是心情加成
 *                （用 getRecessMoodBonus 取），text 是写进生活记录的那句话，
 *                可选的 mateMood（normal/happy/sad/wink）决定落库后同学
 *                显示哪张表情贴图，不传就是 happy。
 *     settled    object|null  落库成功后是 { row, moodDelta, text }，之前是
 *                null。外壳在落库后仍然保留玩法组件（比如石头剪刀布揭晓
 *                的画面），玩法组件看到 settled 非空就不要再出现任何操作按钮。
 *                落库失败时弹窗会在外壳里提示一句，并允许玩法组件再调一次
 *                onDone，所以玩法组件的"确认"按钮不要在调完之后永久锁死。
 *   玩法组件自己不写库、不关弹窗、不显示"+N 心情"，这些都是外壳的事。
 *
 * 【切片进度】
 *   A          外壳和概率
 *   B          石头剪刀布
 *   C          猜词
 *   D（现在）  文字选项
 * 登记了哪个，就要同时把对应的种类加进 companionSchoolRecessData.js 的
 * RECESS_LIVE_KINDS，两边要一起改，否则要么抽到没有玩法的事件，要么玩法
 * 永远抽不到。
 */

import { RECESS_KIND } from './companionSchoolRecessData';
import CompanionSchoolRecessRps from './CompanionSchoolRecessRps';
import CompanionSchoolRecessGuess from './CompanionSchoolRecessGuess';
import CompanionSchoolRecessChoice from './CompanionSchoolRecessChoice';

export const RECESS_BODIES = {
  [RECESS_KIND.RPS]: CompanionSchoolRecessRps,
  [RECESS_KIND.GUESS]: CompanionSchoolRecessGuess,
  [RECESS_KIND.CHOICE]: CompanionSchoolRecessChoice,
};