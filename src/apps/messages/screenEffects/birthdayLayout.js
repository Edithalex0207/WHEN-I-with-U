// src/apps/messages/screenEffects/birthdayLayout.js
//
// 生日全屏文字的排版与节奏（纯函数，不碰 DOM / 数据库）。
// 沿用聊天内"专注文字"的歌词排版规则：普通行字号错落、左/右/中轮换，
// 进场方向跟着位置走（靠左从左滑入、靠右从右滑入、居中从下浮起）；
// 强调行大号居中带光晕，模糊/缩放进场。区别是节奏更慢（一句一句落下，
// 强调行前后留白更长），整段约十秒，更像一支歌词 PV。

const ALIGN_CYCLE = ['start', 'end', 'center'];
const SIZE_CYCLE = [22, 30, 24, 28];
const EMPHASIS_ENTER_CYCLE = ['sfx-line-blur-in', 'sfx-line-fade-scale'];

// 第一行出现前的留白（秒）
const FIRST_DELAY_S = 0.6;
// 最后一行出现之后，画面再停留多久才开始淡出（秒）
const HOLD_AFTER_LAST_S = 4.6;

const emphasisSize = (length) => {
  if (length <= 4) return 56;
  if (length <= 7) return 46;
  if (length <= 11) return 36;
  return 30;
};

/*
 * 把 [{ text, emphasis }] 排成带位置/字号/进场动画/出现时间的行。
 * 每行的间隔：普通行 1.1 秒；强调行之后多留 0.9 秒让它站稳；
 * 下一行是强调行时再多留 0.3 秒，给强调行一点"蓄力"。
 */
export const buildBirthdayLayout = (lines) => {
  const list = Array.isArray(lines) ? lines : [];
  let normalIndex = 0;
  let emphasisIndex = 0;
  let cursor = FIRST_DELAY_S;

  return list.map((line, index) => {
    const next = list[index + 1];
    const delay = Number(cursor.toFixed(2));
    cursor += 1.1 + (line.emphasis ? 0.9 : 0) + (next && next.emphasis ? 0.3 : 0);

    if (line.emphasis) {
      const enter = EMPHASIS_ENTER_CYCLE[emphasisIndex % EMPHASIS_ENTER_CYCLE.length];
      emphasisIndex += 1;
      return {
        text: line.text,
        size: emphasisSize(line.text.length),
        align: 'center',
        emphasis: true,
        enter,
        delay,
      };
    }

    const align = ALIGN_CYCLE[normalIndex % ALIGN_CYCLE.length];
    const size = SIZE_CYCLE[normalIndex % SIZE_CYCLE.length];
    normalIndex += 1;

    const enter = align === 'start'
      ? 'sfx-line-slide-left'
      : align === 'end'
        ? 'sfx-line-slide-right'
        : 'sfx-line-fade-up';

    return {
      text: line.text,
      size,
      align,
      emphasis: false,
      enter,
      delay,
    };
  });
};

// 整段祝福从开始到开始淡出的时长（毫秒）。
export const getBirthdayDurationMs = (lines) => {
  const layout = buildBirthdayLayout(lines);
  const lastDelay = layout.length > 0 ? layout[layout.length - 1].delay : 0;
  return Math.round((lastDelay + HOLD_AFTER_LAST_S) * 1000);
};