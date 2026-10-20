import React, { useState } from 'react';

import './companionCustodySchoolLetter.css';

const BOOK_PATH = 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15Z M6.5 17H20v3H6.5a2.5 2.5 0 0 1 0-5Z';

/*
 * 「托管上学」学校信：托管带完一组课后弹一次（取走即清空，见
 * companionCustodySchoolService.takePendingCustodySchoolLetter），内容是
 * 一条校园小事（可能没中，是 null）+ 一句成绩。
 *
 * 考砸的时候（letter.badScore）额外带一块"安慰一下"：用户手写一段话，
 * comfort 还没用过（companion.custodySchoolComfort?.used 为 false）才显示；
 * 提交后用 onComforted 的返回值（{succeeded}）显示结果，成不成功两种文案，
 * 只能交一次——交完这块区域会换成结果展示，不再能重复提交。
 *
 * 配色跟"贴心照顾"信一样走 --cp-* 变量，但用天蓝色系区分（学校/上学的
 * 既有配色，跟 school.css 的蓝色体系呼应），不跟喂食清洁那封的粉色混。
 */
const CompanionCustodySchoolLetter = ({
  letter,
  companion,
  onClose,
  onComfort,
}) => {
  const [comfortText, setComfortText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [comfortResult, setComfortResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  if (!letter) return null;

  const name = companion?.name || '小伙伴';
  const comfort = companion?.custodySchoolComfort;
  const needsComfort = Boolean(letter.badScore) && comfort && !comfort.used;

  const handleSubmitComfort = async () => {
    if (submitting || !comfortText.trim()) return;
    setSubmitting(true);
    setErrorMsg('');
    try {
      const res = await onComfort?.(comfortText.trim());
      setComfortResult(res || null);
    } catch (error) {
      setErrorMsg(error?.message || '这次没安慰成，再试一次吧');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="cp-overlay center ccsl-overlay">
      <div className="cp-backdrop" onClick={onClose} />

      <div className="ccsl-stage">
        <div className="ccsl-letter" role="dialog" aria-label="学校来信">
          <i className="ccsl-tape" aria-hidden="true" />

          <div className="ccsl-seal" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d={BOOK_PATH} /></svg>
          </div>

          <p className="ccsl-title">{`来自学校的小信笺`}</p>

          {letter.activityText && (
            <p className="ccsl-body">{letter.activityText}</p>
          )}

          <p className="ccsl-grade">{letter.gradeLine}</p>
          <p className="ccsl-score">{`这组题对了 ${letter.correct}/${letter.total} 道`}</p>

          {needsComfort && !comfortResult && (
            <div className="ccsl-comfort">
              <p className="ccsl-comfort-hint">{`${name}今天有点不开心，写点什么安慰TA吧~`}</p>
              <textarea
                className="ccsl-comfort-input"
                value={comfortText}
                maxLength={200}
                placeholder="写几句安慰的话…"
                onChange={(e) => setComfortText(e.target.value)}
                disabled={submitting}
              />
              {errorMsg && <p className="ccsl-comfort-error">{errorMsg}</p>}
              <button
                type="button"
                className="ccsl-comfort-btn"
                disabled={submitting || !comfortText.trim()}
                onClick={handleSubmitComfort}
              >
                {submitting ? '安慰中…' : '安慰TA'}
              </button>
            </div>
          )}

          {comfortResult && (
            <p className={`ccsl-comfort-result ${comfortResult.succeeded ? 'ok' : 'no'}`}>
              {comfortResult.succeeded ? `${name}好像好多了~` : `${name}好像还是有点闷闷的…`}
            </p>
          )}

          {!comfortResult && comfort?.used && (
            <p className={`ccsl-comfort-result ${comfort.succeeded ? 'ok' : 'no'}`}>
              {comfort.succeeded ? `${name}好像好多了~` : `${name}好像还是有点闷闷的…`}
            </p>
          )}

          <button type="button" className="ccsl-btn" onClick={onClose}>知道啦</button>
          <p className="ccsl-sign">托管上学 · 自动完成</p>
        </div>
      </div>
    </div>
  );
};

export default CompanionCustodySchoolLetter;