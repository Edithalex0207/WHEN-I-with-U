/*
 * CompanionSchoolAlbumModal.jsx —— 「学校相册」浏览弹窗。
 *
 * 对应视觉预览 school-album-preview.html（已确认，没有另外对应一屏已定稿
 * 的 school-preview.html 预览，这个界面是单独出的新预览）。
 *
 * 【这个弹窗管什么】
 * 只管"翻看 + 删除"已经存在的相册照片（companionSchoolAlbum，入学/升班
 * 时由 SchoolEnrollFlow.jsx 用 html-to-image 导出截图落库）。不负责生成
 * 新照片——相册里的每一张 image 本身就是当时导出的完整纪念卡截图（场景、
 * 小伙伴贴纸、印章、称呼、日期都已经"烧"在图片像素里了），这里只是给
 * 这些已经成型的图片搭一个翻页、筛选、删除的壳子，不会重新用 DOM 拼一张
 * 一模一样的卡片出来（那样反而会跟截图内容对不上）。
 *
 * 【筛选 chip 什么时候出现】
 * 相册里出现过几种不同的 type（ALBUM_TYPE: enroll/promote/event）就显示
 * 几个 chip，再加一个"全部"；如果从头到尾只有一种类型（比如还没升过班，
 * 也没有活动纪念卡），筛选栏完全不渲染——此时筛选没有意义，强行显示一个
 * "全部"+一个类型的筛选栏只会占地方。
 *
 * 【删除要点两次确认】
 * 第一次点"删除这张"只是进入确认态（按钮文字变成"再点一次确认删除"），
 * 翻页或切换筛选都会把这个确认态重置掉——纪念卡这种东西手滑删掉就真的
 * 没有了，不能跟"下一步"一样轻易点掉。
 *
 * Props:
 *   companion  object    —— 当前小伙伴（用 id / name）
 *   onClose    function  —— 关闭弹窗
 */

import React, { useEffect, useRef, useState } from 'react';

import './school.css';
import './schoolAlbum.css';

import { ALBUM_TYPE } from './companionSchoolData';
import { getAlbum, deleteAlbumPhoto } from './companionSchoolService';
import { CloseGlyph, BackGlyph, ForwardGlyph, TrashGlyph, PhotoGlyph } from './SchoolArt';

/* 类型 -> 筛选 chip 的文案和色调，顺序就是筛选栏里出现的顺序 */
const TYPE_META = {
  [ALBUM_TYPE.ENROLL]: { label: '入学', badge: '入学纪念', tone: 'heart' },
  [ALBUM_TYPE.PROMOTE]: { label: '升班', badge: '升班纪念', tone: 'sky' },
  [ALBUM_TYPE.EVENT]: { label: '活动', badge: '活动纪念', tone: 'mint' },
};
const TYPE_ORDER = [ALBUM_TYPE.ENROLL, ALBUM_TYPE.PROMOTE, ALBUM_TYPE.EVENT];

const pad2 = (n) => String(n).padStart(2, '0');
const formatDate = (timestamp) => {
  const d = new Date(timestamp);
  return `${d.getFullYear()} . ${pad2(d.getMonth() + 1)} . ${pad2(d.getDate())}`;
};

const CompanionSchoolAlbumModal = ({ companion, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState([]);
  const [filter, setFilter] = useState('all');
  const [idx, setIdx] = useState(0);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  useEffect(() => {
    let alive = true;
    getAlbum(companion.id).then((rows) => {
      if (alive) {
        setPhotos(rows);
        setLoading(false);
      }
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companion.id]);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = (text) => {
    clearTimeout(toastTimer.current);
    setToast(text);
    toastTimer.current = setTimeout(() => setToast(''), 1800);
  };

  const presentTypes = TYPE_ORDER.filter((t) => photos.some((p) => p.type === t));
  const showFilter = presentTypes.length > 1;
  const visible = filter === 'all' ? photos : photos.filter((p) => p.type === filter);
  // idx 可能因为删除/切换筛选而超出新列表长度，这里统一夹到合法范围，
  // 不另外用 useEffect 去同步，避免多一次渲染。
  const safeIdx = Math.min(idx, Math.max(0, visible.length - 1));
  const current = visible[safeIdx] || null;

  const goTo = (nextIdx) => {
    setIdx(Math.max(0, Math.min(visible.length - 1, nextIdx)));
    setPendingDeleteId(null);
  };

  const handleFilter = (nextFilter) => {
    setFilter(nextFilter);
    setIdx(0);
    setPendingDeleteId(null);
  };

  const handleDeleteClick = async (photo) => {
    if (deleting) return;
    if (pendingDeleteId !== photo.id) {
      setPendingDeleteId(photo.id);
      return;
    }
    setDeleting(true);
    try {
      await deleteAlbumPhoto(photo.id);
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      setPendingDeleteId(null);
      showToast('已从相册删除');
      // 删掉的这张从当前筛选列表里消失后，safeIdx 下次渲染会自动夹到合法范围，
      // 这里不用再手动调整 idx。
    } catch (e) {
      showToast(e?.message || '没删掉，再试一次吧');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="cp-overlay center">
      <div className="cp-backdrop" onClick={onClose} />
      <div className="sd-root" role="dialog" aria-label="学校相册">
        <div className="sd-head">
          <button type="button" className="sd-round" aria-label="关闭" onClick={onClose}><CloseGlyph /></button>
          <div className="sd-title"><b>学校相册</b></div>
          <span className="sa-count">{photos.length} 张</span>
        </div>

        {loading && (
          <div className="sd-body is-center"><p className="sd-hint">正在整理相册…</p></div>
        )}

        {!loading && photos.length === 0 && (
          <div className="sd-body">
            <div className="sa-empty">
              <div className="sa-empty-pic"><PhotoGlyph size={44} /></div>
              <h4>相册还是空的</h4>
              <p>入学、升班的时候<br />会自动拍一张纪念卡放进来</p>
            </div>
          </div>
        )}

        {!loading && photos.length > 0 && (
          <div className="sd-body">
            {showFilter && (
              <div className="sa-filter">
                <button type="button" className={`sa-fchip${filter === 'all' ? ' is-on' : ''}`} onClick={() => handleFilter('all')}>
                  全部
                </button>
                {presentTypes.map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`sa-fchip sd-tone-${TYPE_META[t].tone}${filter === t ? ' is-on' : ''}`}
                    onClick={() => handleFilter(t)}
                  >
                    {TYPE_META[t].label}
                  </button>
                ))}
              </div>
            )}

            {current && (
              <>
                <div className="sa-stage">
                  <button
                    type="button"
                    className="sa-nav"
                    aria-label="上一张"
                    disabled={safeIdx <= 0}
                    onClick={() => goTo(safeIdx - 1)}
                  >
                    <BackGlyph size={16} />
                  </button>

                  <div className="sa-stack">
                    {visible.length > 2 && <span className="sa-peek sa-peek-2" />}
                    {visible.length > 1 && <span className="sa-peek sa-peek-1" />}
                    <div className="sa-card" key={current.id}>
                      <span className="sd-tape" />
                      <div className="sa-frame">
                        <img src={current.image} alt={current.title} className="sa-img" />
                      </div>
                      <div className="sa-cap">
                        <span className={`sa-cap-badge sd-tone-${TYPE_META[current.type]?.tone || 'sky'}`}>
                          {TYPE_META[current.type]?.badge || '纪念卡'}
                        </span>
                        <span className="sa-cap-title">{current.title}</span>
                        <span className="sa-cap-date">{formatDate(current.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="sa-nav"
                    aria-label="下一张"
                    disabled={safeIdx >= visible.length - 1}
                    onClick={() => goTo(safeIdx + 1)}
                  >
                    <ForwardGlyph size={16} />
                  </button>
                </div>

                {visible.length > 1 && (
                  <div className="sa-dots">
                    {visible.map((p, i) => (
                      <i key={p.id} className={i === safeIdx ? 'is-on' : ''} />
                    ))}
                  </div>
                )}

                <div className="sa-actions">
                  <button
                    type="button"
                    className={`sa-del${pendingDeleteId === current.id ? ' is-confirm' : ''}`}
                    disabled={deleting}
                    onClick={() => handleDeleteClick(current)}
                  >
                    <TrashGlyph size={14} />
                    {pendingDeleteId === current.id ? '再点一次确认删除' : '删除这张'}
                  </button>
                </div>
              </>
            )}

            {toast && <p className="sa-toast" role="status">{toast}</p>}
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanionSchoolAlbumModal;