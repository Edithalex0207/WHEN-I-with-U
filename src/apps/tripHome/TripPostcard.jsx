// src/apps/tripHome/TripPostcard.jsx
//
// 两样东西：
// - TripPostcardCard（具名导出）：明信片本身的卡片（风景照 + 信 + 小故事 +
//   新朋友 + 落款），只管显示，不管"怎么打开的"。领取弹层（本文件默认导出
//   的 TripPostcard）和收藏册的详情弹层（TripCollection.jsx）共用这一个，
//   不用各写一份。
// - TripPostcard（默认导出）：领取明信片的弹层，从「航班」页的"领取明信片"
//   打开。明信片本身由 tripPostcardService.js 生成并存在车票记录上，这里
//   负责触发生成/重新生成，还没写好时显示"正在写信"。
//
// "收好明信片"才会真正把车票收起、让居民回到可以再次出发的状态
// （见 tripService.js 的 dismissArrivedJourney）；收好之后这张车票会出现在
// 收藏册里（TripCollection.jsx）。

import React, { useEffect, useState } from 'react';

import { getTripDestination, getTripSceneUrl } from './tripCatalog';
import { SafeImage, TripAnimalFigure } from './TripParts';
import { ensureJourneyPostcard } from './tripPostcardService';

const formatDay = (timestamp) => {
  const date = new Date(timestamp);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};

const SceneBlank = ({ name }) => <div className="trip-pc-blank">{name}</div>;

// 明信片卡片本身。onRegenerate/regenerating 不传时（比如收藏册里不想开放
// 重新生成）就不显示"重新写一次"那一行。
export const TripPostcardCard = ({ postcard, journey, resident, onRegenerate, regenerating }) => {
  const destination = getTripDestination(journey.destinationId);
  const sceneUrl = destination ? getTripSceneUrl(destination) : '';
  const name = resident ? resident.name : '旅客';

  const scene = (
    <SafeImage src={sceneUrl} className="trip-pc-photo__img" fallback={<SceneBlank name={journey.destinationName} />} />
  );

  return (
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

      {postcard.source === 'fallback' && onRegenerate && (
        <p className="trip-hint trip-pc-fallback">
          这是备用文字（还没连上 AI，或者这次没写成）。检查好 API 设置后可以重新写一次。
          <button type="button" className="trip-btn trip-btn--ghost trip-btn--sm" disabled={regenerating} onClick={onRegenerate}>
            重新写一次
          </button>
        </p>
      )}
    </article>
  );
};

const TripPostcard = ({ journey, resident, onChange, onClose, onClaim }) => {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const postcard = journey.postcard || null;
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
          <TripPostcardCard
            postcard={postcard}
            journey={journey}
            resident={resident}
            onRegenerate={handleRegenerate}
            regenerating={busy}
          />
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