/*
 * CompanionSchoolHomeworkEntry.jsx —— 学校页上的「老师的嘱托」横幅。
 *
 * 不是随机弹窗：做完一组题后有概率留下一份作业，留到批完为止。学校页读到
 * 未批嘱托（getHomeworkTask）就在四个入口上面渲染这一条；没有嘱托时整条不
 * 出现（调用方不渲染，这个组件收到 null 也什么都不画）。
 *
 * 粉黄渐变、轻微晃动、右侧粉色"待批"小标。样式在 schoolHomework.css（前缀
 * hw-），渲染在 .sd-root 里面，所以直接继承 --cp-* / --sd-* 变量。
 *
 * Props:
 *   task    object    —— getHomeworkTask 读出来的嘱托（用 entryLine）
 *   onOpen  function  —— 点横幅，打开 CompanionSchoolHomeworkModal
 */

import React from 'react';

import './school.css';
import './schoolHomework.css';

import { EditGlyph } from './SchoolArt';
import { HOMEWORK_BANNER } from './companionSchoolHomeworkData';

const CompanionSchoolHomeworkEntry = ({ task, onOpen }) => {
  if (!task) return null;
  return (
    <button type="button" className="hw-entry" onClick={onOpen}>
      <span className="hw-entry-ic"><EditGlyph size={20} /></span>
      <span className="hw-entry-text">
        <b>{HOMEWORK_BANNER.title}</b>
        <small>{task.entryLine}</small>
      </span>
      <span className="hw-entry-tag">{HOMEWORK_BANNER.tag}</span>
    </button>
  );
};

export default CompanionSchoolHomeworkEntry;