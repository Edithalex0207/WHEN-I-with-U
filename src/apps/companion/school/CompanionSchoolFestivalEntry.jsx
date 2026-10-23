/*
 * CompanionSchoolFestivalEntry.jsx —— 结算页上的"校园节日"入口横幅。
 *
 * 由 CompanionSchoolQuizModal.jsx 在 rollSchoolFestival 返回了待玩节日事件时
 * 渲染：几位同学的贴图头像叠在一起 + 节日名 + 一句话 + "去看看"。点了才打开
 * CompanionSchoolFestivalModal，不会自己跳出来盖住结算结果；不点就关掉结算页，
 * 这件事就当没发生（不留记录、不加心情和心心，也不保存）。
 * 位置、倾斜、红点跟课间事件的横幅一致，只是换成暖黄渐变。
 *
 * Props:
 *   event    object    —— buildFestivalEvent 造的待玩事件（用 classmates / entryLine / festivalId）
 *   onOpen   function  —— 点横幅
 */

import React from 'react';

import './school.css';
import './schoolRecess.css';
import './schoolFestival.css';

import { getFestival } from './companionSchoolFestivalService';
import { ForwardGlyph } from './SchoolArt';
import { ClassmateSticker } from './CompanionSchoolRecessSticker';

const MOODS = ['happy', 'wink', 'normal'];

const CompanionSchoolFestivalEntry = ({ event, onOpen }) => {
  if (!event) return null;
  const title = getFestival(event.festivalId)?.title || '校园节日';
  const mates = (event.classmates || []).slice(0, 3);

  return (
    <button type="button" className="od-entry" onClick={onOpen}>
      <span className="od-entry-dot" aria-hidden="true" />
      <span className="od-entry-mates">
        {mates.map((mate, i) => (
          <ClassmateSticker key={mate.id} classmate={mate} mood={MOODS[i % MOODS.length]} size={46} />
        ))}
      </span>
      <span className="od-entry-text">
        <b>{title}</b>
        {event.entryLine}
      </span>
      <span className="od-entry-go">
        去看看
        <ForwardGlyph size={12} />
      </span>
    </button>
  );
};

export default CompanionSchoolFestivalEntry;