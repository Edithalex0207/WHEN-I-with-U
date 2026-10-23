/*
 * companionSchoolFestivalBodies.js —— 校园节日事件的"玩法组件"登记表。
 *
 * CompanionSchoolFestivalModal 管外壳（标题丝带、关闭、落库、结算贴纸），
 * 具体怎么玩由这里登记的组件负责：FESTIVAL_BODIES[festivalId] 对应一个
 * React 组件，弹窗按事件的 festivalId 去取。
 *
 * 【玩法组件的约定】（跟课间事件的玩法组件相近，区别是节日组件自己画旁白
 * 气泡和舞台，外壳只留标题和结算）
 *   props:
 *     event      object    待玩的节日事件（festivalId / stage / classmates /
 *                          scene / entryLine ...，见 companionSchoolFestivalService.js
 *                          的 buildFestivalEvent）
 *     companion  object    当前小伙伴
 *     disabled   boolean   正在落库时为 true，玩法组件此时不要再响应点击
 *     onDone     function({ outcome, hearts, moodDelta, text, meta, mateMood })
 *                玩完调一次：outcome 是结果标签，hearts / moodDelta 是奖励，
 *                text 是写进生活记录的那句话，meta 是额外记进生活记录的内容
 *     settled    object|null  落库成功后是 { row, hearts, moodDelta, text }，之前
 *                是 null。外壳在落库后仍然保留玩法组件（比如留着同学的反应），
 *                玩法组件看到 settled 非空就不要再出现任何操作按钮。
 *                落库失败时外壳会在原地提示一句，并允许玩法组件再调一次
 *                onDone，所以玩法组件的"确认"按钮不要调完之后永久锁死。
 *   玩法组件自己不写库、不关弹窗、不显示"+N 心情""+N 心心"，这些都是外壳的事。
 *   中途关闭小窗算放弃：玩法组件会被卸载，卸载时要取消还没回来的请求。
 *
 * 登记了哪个，就要同时把对应的 id 加进 companionSchoolFestivalData.js 的
 * FESTIVAL_LIVE_IDS，两边要一起改，否则要么抽到没有玩法的节日，要么玩法
 * 永远抽不到。
 */

import { FESTIVAL_ID } from './companionSchoolFestivalData';
import CompanionSchoolOpenDay from './CompanionSchoolOpenDay';

export const FESTIVAL_BODIES = {
  [FESTIVAL_ID.OPEN_DAY]: CompanionSchoolOpenDay,
};