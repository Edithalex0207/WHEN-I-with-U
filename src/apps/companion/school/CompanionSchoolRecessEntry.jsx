/*
 * CompanionSchoolRecessEntry.jsx —— 结算页上的"课间有小事"入口横幅。
 *
 * 由 CompanionSchoolQuizModal.jsx 在 rollCampusBreak 返回了待玩事件时渲染：
 * 同学的贴图头像 + 一句话 + "去看看"。点了才打开
 * CompanionSchoolRecessModal，不会自己跳出来盖住结算结果；不点就关掉
 * 结算页，这件事就当没发生（不留记录、不加心情）。
 *
 * Props:
 *   event    object    —— buildRecessEvent 造的待玩事件（用 classmate / entryLine）
 *   onOpen   function  —— 点横幅
 */

import React from 'react';

import './school.css';
import './schoolRecess.css';

import { ForwardGlyph } from './SchoolArt';
import { ClassmateSticker } from './CompanionSchoolRecessSticker';

const CompanionSchoolRecessEntry = ({ event, onOpen }) => {
  if (!event) return null;
  return (
    <button type="button" className="rc-entry" onClick={onOpen}>
      <span className="rc-entry-dot" aria-hidden="true" />
      <span className="rc-entry-mate">
        <ClassmateSticker classmate={event.classmate} mood="normal" size={52} />
      </span>
      <span className="rc-entry-text">
        <b>课间有小事</b>
        {event.entryLine}
      </span>
      <span className="rc-entry-go">
        去看看
        <ForwardGlyph size={12} />
      </span>
    </button>
  );
};

export default CompanionSchoolRecessEntry;
