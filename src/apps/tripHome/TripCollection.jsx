// src/apps/tripHome/TripCollection.jsx
//
// 「收藏」分页：明信片册。缩略图按最新收到的排在最前面，顶部一排筛选
// chip 按居民筛选（chip 复用 tripHome.css 已有的 .trip-chip 样式，跟别处
// 的筛选 chip 是同一套）。点一张缩略图打开详情，详情卡片复用
// TripPostcard.jsx 里的 TripPostcardCard——跟领取明信片时看到的是同一张卡，
// 只是这里是回顾、不带"收好明信片"按钮。
//
// 这一页自己管自己的数据：claimed 状态的旅行记录不在外壳 TripApp.jsx 读的
// journeys 里（外壳只读 away/arrived 的，见 tripService.js 的
// listActiveJourneys），所以收藏页自己在打开时读一次、自己管刷新。

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { getTripDestination, getTripSceneUrl } from './tripCatalog';
import { listClaimedJourneys } from './tripService';
import { ensureJourneyPostcard } from './tripPostcardService';
import { SafeImage, TripAvatar } from './TripParts';
import { TripPostcardCard } from './TripPostcard';

const TripCollection = ({ residents }) => {
  const [journeys, setJourneys] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [filterId, setFilterId] = useState('all'); // 'all' 或 resident.id 的字符串
  const [openId, setOpenId] = useState(null);
  const [regenId, setRegenId] = useState(null); // 正在重新生成明信片的 journeyId

  const refresh = useCallback(async () => {
    try {
      const rows = await listClaimedJourneys();
      setJourneys(rows);
    } catch (error) {
      console.warn('读取收藏册失败：', error);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const residentMap = useMemo(() => new Map(residents.map((resident) => [resident.id, resident])), [residents]);

  // 筛选 chip：只列出"至少寄回过一张明信片"的居民，没寄过的居民放上去点了
  // 也是空的，没有意义。按居民在册子里第一次出现的顺序（也就是最近一次
  // 收到明信片的新旧）排，常联系的居民排在前面。
  const chipResidents = useMemo(() => {
    const seen = new Set();
    const list = [];
    journeys.forEach((journey) => {
      if (seen.has(journey.residentId)) return;
      const resident = residentMap.get(journey.residentId);
      if (!resident) return;
      seen.add(journey.residentId);
      list.push(resident);
    });
    return list;
  }, [journeys, residentMap]);

  const visibleJourneys = useMemo(
    () => (filterId === 'all' ? journeys : journeys.filter((journey) => String(journey.residentId) === filterId)),
    [journeys, filterId]
  );

  const openJourney = openId == null ? null : journeys.find((journey) => journey.id === openId) || null;

  const handleRegenerate = async (journeyId) => {
    setRegenId(journeyId);
    try {
      await ensureJourneyPostcard(journeyId, { force: true });
      await refresh();
    } catch (error) {
      console.warn('重新生成明信片失败：', error);
    } finally {
      setRegenId(null);
    }
  };

  if (!loaded) {
    return (
      <div className="trip-view">
        <p className="trip-empty">正在翻找相册……</p>
      </div>
    );
  }

  return (
    <div className="trip-view">
      <div className="trip-sec">明信片册 · 共 {journeys.length} 张</div>

      {journeys.length === 0 ? (
        <p className="trip-empty">还没有收好的明信片。居民旅行回来、在「航班」页领取明信片之后，会出现在这里。</p>
      ) : (
        <>
          {chipResidents.length > 1 && (
            <div className="trip-chips">
              <button type="button" className="trip-chip" aria-pressed={filterId === 'all'} onClick={() => setFilterId('all')}>
                全部
              </button>
              {chipResidents.map((resident) => (
                <button
                  key={resident.id}
                  type="button"
                  className="trip-chip"
                  aria-pressed={filterId === String(resident.id)}
                  onClick={() => setFilterId(String(resident.id))}
                >
                  <TripAvatar resident={resident} size={18} />
                  {resident.name}
                </button>
              ))}
            </div>
          )}

          {visibleJourneys.length === 0 ? (
            <p className="trip-empty">这位还没有收好的明信片。</p>
          ) : (
            <div className="trip-pc-grid">
              {visibleJourneys.map((journey) => {
                const resident = residentMap.get(journey.residentId);
                const destination = getTripDestination(journey.destinationId);
                const sceneUrl = destination ? getTripSceneUrl(destination) : '';
                return (
                  <button key={journey.id} type="button" className="trip-pc-thumb" onClick={() => setOpenId(journey.id)}>
                    <span className="trip-pc-thumb__img">
                      <SafeImage
                        src={sceneUrl}
                        className="trip-pc-thumb__img-el"
                        fallback={<span className="trip-pc-thumb__blank">{journey.destinationName}</span>}
                      />
                    </span>
                    <span className="trip-pc-thumb__who">
                      <TripAvatar resident={resident} size={20} />
                      {resident ? resident.name : '旅客'}
                    </span>
                    <span className="trip-pc-thumb__dest">{journey.destinationName}</span>
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      {openJourney && (
        <div className="trip-scrim" onClick={() => setOpenId(null)}>
          <div className="trip-sheet trip-pc-sheet" onClick={(event) => event.stopPropagation()}>
            <h2 className="trip-sheet-title trip-sheet-title--center">
              {(residentMap.get(openJourney.residentId) || {}).name || '旅客'} 寄来的明信片
            </h2>
            <TripPostcardCard
              postcard={openJourney.postcard}
              journey={openJourney}
              resident={residentMap.get(openJourney.residentId)}
              onRegenerate={() => handleRegenerate(openJourney.id)}
              regenerating={regenId === openJourney.id}
            />
            <div className="trip-pc-actions">
              <button type="button" className="trip-btn trip-btn--ghost" onClick={() => setOpenId(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TripCollection;