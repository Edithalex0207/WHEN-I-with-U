/*
 * companionSchoolRecessRpsRules.js —— 「石头剪刀布」的规则和结果文案。
 *
 * 纯逻辑 + 纯文案，只 import companionSchoolRecessData.js（取手势名字）。
 * 想改输赢文案、加几句新的，只改这一个文件。
 *
 * 规则：只比一局。玩家替小伙伴选一个手势，同学随机出一个（三个手势
 * 概率相同），石头赢剪刀、剪刀赢布、布赢石头。心情加成见
 * companionSchoolRecessData.js 的 RECESS_MOOD（赢 3 / 平 2 / 输 1，
 * 都不扣）。
 *
 * 文案占位符：
 *   {name}      小伙伴的名字
 *   {mate}      同学的名字
 *   {hand}      小伙伴出的手势（石头 / 剪刀 / 布）
 *   {mateHand}  同学出的手势
 */

import { RECESS_HAND_LABELS } from './companionSchoolRecessData';

/** 三个手势，同时也是 RECESS_HAND_STICKERS 的键。 */
export const RPS_HANDS = ['rock', 'scissors', 'paper'];

const BEATS = { rock: 'scissors', scissors: 'paper', paper: 'rock' };

/** 结果界面的大字。 */
export const RPS_OUTCOME_LABELS = { win: '赢啦', draw: '平局', lose: '输了' };

/** 揭晓后同学的表情贴图：小伙伴赢了它不甘心，输了它开心，平局眨个眼。 */
export const RPS_MATE_MOOD = { win: 'sad', draw: 'wink', lose: 'happy' };

/** @returns {'win'|'draw'|'lose'} 以 mine（小伙伴）的视角。 */
export const judgeRps = (mine, theirs) => {
  if (mine === theirs) return 'draw';
  return BEATS[mine] === theirs ? 'win' : 'lose';
};

/** 同学随机出一个手势。 */
export const pickMateHand = (rng = Math.random) => RPS_HANDS[Math.floor(rng() * RPS_HANDS.length)];

/* 写进在校生活记录的那句话，也是结果贴纸上显示的文字（都用第三人称）。 */
const RESULT_LINES = {
  win: [
    '{name}出了{hand}，{mate}出了{mateHand}，{name}赢啦！{mate}鼓起腮帮子，嘴上说下次一定赢回来，还是乖乖去擦了黑板。',
    '{hand}对{mateHand}，这一局是{name}赢了。{mate}愣了一秒，笑着拍了拍{name}的肩膀，说你今天手气真好。',
    '{name}悄悄出了{hand}，{mate}出的是{mateHand}。{name}高兴得原地转了半圈，整个课间都在笑。',
  ],
  draw: [
    '两个人同时出了{hand}，面面相觑，下一秒一起笑了出来，这局算平手。',
    '{name}和{mate}都出了{hand}，默契得有点好笑，黑板谁也不用一个人擦，两个人一起去擦了。',
  ],
  lose: [
    '{name}出了{hand}，{mate}出了{mateHand}，这一局输了。{name}抿着嘴有点不甘心，{mate}却把自己的小零食分了一半过来。',
    '{hand}遇上{mateHand}，{name}输了一局。{name}认真地说下次一定赢，{mate}笑着说好呀，那我等着。',
    '这一局，{mate}的{mateHand}赢了{name}的{hand}。{name}摸摸头，帮{mate}擦了黑板，还是笑着的。',
  ],
};

const fillTemplate = (text, vars) => Object.keys(vars).reduce(
  (acc, key) => acc.split(`{${key}}`).join(vars[key]),
  text,
);

/**
 * 按结果挑一句文案并填好占位符。
 * @param {{ outcome: 'win'|'draw'|'lose', name: string, mate: string,
 *           mine: string, theirs: string, rng?: function }} params
 */
export const buildRpsResultText = ({ outcome, name, mate, mine, theirs, rng = Math.random }) => {
  const pool = RESULT_LINES[outcome] || RESULT_LINES.draw;
  const line = pool[Math.floor(rng() * pool.length)];
  return fillTemplate(line, {
    name: name || '小伙伴',
    mate: mate || '同学',
    hand: RECESS_HAND_LABELS[mine] || '',
    mateHand: RECESS_HAND_LABELS[theirs] || '',
  });
};