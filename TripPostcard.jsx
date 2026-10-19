// src/apps/tripHome/TripPostcard.jsx
//
// 领取明信片的弹层（从「航班」页的"领取明信片"打开）：显示风景照、信的
// 正文、雨中小故事、路上的新朋友，带了一次性相机时多一张"景色 + 小动物"的
// 合照。明信片本身由 tripPostcardService.js 生成并存在车票记录上，这里
// 只负责显示；还没写好时会触发生成并显示"正在写信"。
//
// "收好明信片"才会真正把车票收起、让居民回到可以再次出发的状态
// （见 tripService.js 的 dismissArrivedJourney）。

import React, { useEffect, useState } from 'react';

import { getTripDestination, getTripSceneUrl } from './tripCatalog';
import { SafeImage, TripAnimalFigure } from './TripParts';
import { ensureJourneyPostcard } from './tripPostcardService';

const formatDay = (timestamp) => {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};

const SceneBlank = ({ name }) => <div className="trip-pc-blank">{name}</div>;

const TripPostcard = ({ journey, resident, onChange, onClose, onClaim }) => {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const postcard = journey.postcard || null;
  const destination = getTripDestination(journey.destinationId);
  const sceneUrl = destination ? getTripSceneUrl(destination) : '';
  const name = resident ? resident.name : '旅客';

  // 还没有明信片（刚到站、还在写）：触发生成。同一张车票的并发请求在服务里
  // 会合并成一个，外壳和这里同时触发也只调用一次 AI。
  useEffect(() => {
    if (postcard) return undefined;
    let cancelled = false;
    setFailed(false);

    ensureJourneyPostcard(journey.id)
      .catch((error) => {
        console.warn('明信片生成失败：', error);
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) onChange();
      });

    return () => {
      cancelled = true;
    };
  }, [journey.id, postcard, onChange]);

  const handleRegenerate = async () => {
    setBusy(true);
    try {
      await ensureJourneyPostcard(journey.id, { force: true });
      onChange();
    } catch (error) {
      console.warn('重新生成明信片失败：', error);
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await ensureJourneyPostcard(journey.id);
      onChange();
    } catch (error) {
      console.warn('明信片生成失败：', error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const scene = (
    <SafeImage src={sceneUrl} className="trip-pc-photo__img" fallback={<SceneBlank name={journey.destinationName} />} />
  );

  return (
    <div className="trip-scrim" onClick={onClose}>
      <div className="trip-sheet trip-pc-sheet" onClick={(event) => event.stopPropagation()}>
        <h2 className="trip-sheet-title trip-sheet-title--center">{name} 寄来的明信片</h2>

        {!postcard && (
          <div className="trip-pc-wait">
            <p className="trip-hint trip-hint--center">{failed ? '这张明信片没能写好，再试一次吧。' : `${name} 正在写信……`}</p>
            {failed && (
              <button type="button" className="trip-btn" disabled={busy} onClick={handleRetry}>
                再试一次
              </button>
            )}
          </div>
        )}

        {postcard && (
          <article className="trip-pc-card">
            <figure className="trip-pc-photo">
              <div className="trip-pc-frame">{scene}</div>
              <figcaption>{postcard.caption}</figcaption>
            </figure>

            {postcard.hasExtraPhoto && (
              <figure className="trip-pc-photo trip-pc-photo--duo">
                <div className="trip-pc-frame">
                  {scene}
                  <span className="trip-pc-pet" aria-hidden="true">
                    {resident && resident.skinDataUrl ? (
                      <img src={resident.skinDataUrl} alt="" draggable={false} />
                    ) : (
                      <TripAnimalFigure animalId={resident ? resident.animalId : undefined} />
                    )}
                  </span>
                </div>
                <figcaption>和 {name} 的合照</figcaption>
              </figure>
            )}

            <p className="trip-pc-letter">{postcard.letter}</p>

            {postcard.story && (
              <div className="trip-pc-extra">
                <b>雨中小故事</b>
                <p>{postcard.story}</p>
              </div>
            )}

            {postcard.friend && (
              <div className="trip-pc-extra">
                <b>路上的新朋友</b>
                <p>
                  {postcard.friend.animal}「{postcard.friend.name}」：{postcard.friend.line}
                </p>
              </div>
            )}

            <p className="trip-pc-sign">
              {name} · {journey.destinationName} · {formatDay(journey.arriveAt)}
            </p>

            {postcard.source === 'fallback' && (
              <p className="trip-hint trip-pc-fallback">
                这是备用文字（还没连上 AI，或者这次没写成）。检查好 API 设置后可以重新写一次。
                <button type="button" className="trip-btn trip-btn--ghost trip-btn--sm" disabled={busy} onClick={handleRegenerate}>
                  重新写一次
                </button>
              </p>
            )}
          </article>
        )}

        <div className="trip-pc-actions">
          <button type="button" className="trip-btn" disabled={!postcard} onClick={() => onClaim(journey.id)}>
            收好明信片
          </button>
          <button type="button" className="trip-btn trip-btn--ghost" onClick={onClose}>
            先放着
          </button>
        </div>
      </div>
    </div>
  );
};

export default TripPostcard;
