import React, { useMemo } from 'react';

import { MEMORY_TYPE_OPTIONS } from './memoryConstants';

export const LIST_VIEW_TIMELINE = 'timeline';
export const LIST_VIEW_GROUPED = 'grouped';

const LIST_VIEW_STORAGE_KEY = 'memoryListView';

/*
 * 记住上次用的是哪种视图。只是个人习惯，不是必须保存的数据，
 * 所以读写都包 try/catch，读不到就用时间线。
 */
export const readStoredListView = () => {
  try {
    const stored = window.localStorage.getItem(
      LIST_VIEW_STORAGE_KEY
    );

    return stored === LIST_VIEW_GROUPED
      ? LIST_VIEW_GROUPED
      : LIST_VIEW_TIMELINE;
  } catch (error) {
    return LIST_VIEW_TIMELINE;
  }
};

export const storeListView = (view) => {
  try {
    window.localStorage.setItem(LIST_VIEW_STORAGE_KEY, view);
  } catch (error) {
    // 存不下就算了，下次打开回到默认视图。
  }
};

const pad2 = (value) => String(value).padStart(2, '0');

const getCreatedDate = (memory) => {
  const date = new Date(memory?.createdAt || 0);

  return Number.isNaN(date.getTime()) || date.getTime() === 0
    ? null
    : date;
};

const getDayKey = (date) => (
  date
    ? `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
    : 'unknown'
);

const getDayLabel = (date) => {
  if (!date) {
    return '时间未记录';
  }

  const weekday = date.toLocaleDateString('zh-CN', {
    weekday: 'short'
  });

  const isThisYear = (
    date.getFullYear() === new Date().getFullYear()
  );

  const dayText = `${pad2(date.getMonth() + 1)}.${pad2(date.getDate())}`;

  return isThisYear
    ? `${dayText}  /  ${weekday}  /  生成`
    : `${date.getFullYear()}.${dayText}  /  ${weekday}  /  生成`;
};

const getTypeLabel = (type) => (
  MEMORY_TYPE_OPTIONS.find((item) => item.id === type)?.label
  || '其他'
);

const getTypeEyebrow = (type) => (
  `CATEGORY / ${String(type || 'other').replace(/_/g, ' ').toUpperCase()}`
);

/*
 * 记忆列表的两种视图：
 * - 时间线：按生成日期倒序，每天一条分隔线（memories 进来时已经是
 *   createdAt 倒序，这里只负责按天切段，不再重新排序）。
 * - 按类型：每个类型一个大标题，类型顺序跟 MEMORY_TYPE_OPTIONS 一致。
 *
 * 卡片本身仍然是 MemoryCard，由调用方通过 renderCard 传进来，
 * 这样 MemoryApp 里原来那一大串 onEdit/onWithdraw/... 接线不用搬家。
 */
export const MemoryListViews = ({
  memories,
  view,
  selectMode,
  selectedIds,
  onToggleGroup,
  renderCard
}) => {
  const selectedSet = useMemo(
    () => new Set(selectedIds),
    [selectedIds]
  );

  const days = useMemo(() => {
    const result = [];
    const indexByKey = new Map();

    memories.forEach((memory) => {
      const date = getCreatedDate(memory);
      const key = getDayKey(date);

      if (!indexByKey.has(key)) {
        indexByKey.set(key, result.length);

        result.push({
          key,
          label: getDayLabel(date),
          items: []
        });
      }

      result[indexByKey.get(key)].items.push(memory);
    });

    return result;
  }, [memories]);

  const groups = useMemo(() => {
    const knownTypes = MEMORY_TYPE_OPTIONS.map((item) => item.id);

    const orderedTypes = [
      ...knownTypes,
      ...Array.from(
        new Set(
          memories
            .map((memory) => memory.type)
            .filter((type) => !knownTypes.includes(type))
        )
      )
    ];

    return orderedTypes
      .map((type) => ({
        type,
        label: getTypeLabel(type),
        eyebrow: getTypeEyebrow(type),
        items: memories.filter((memory) => memory.type === type)
      }))
      .filter((group) => group.items.length > 0);
  }, [memories]);

  if (view === LIST_VIEW_GROUPED) {
    return (
      <div className="memory-groups">
        {groups.map((group) => {
          const groupIds = group.items
            .map((memory) => memory.memoryId)
            .filter(Boolean);

          const isAllSelected = (
            groupIds.length > 0 &&
            groupIds.every((id) => selectedSet.has(id))
          );

          return (
            <section
              className="memory-group"
              key={group.type || 'other'}
            >
              <div className="memory-group-header">
                <div className="memory-group-title">
                  <span className="memory-group-eyebrow">
                    {group.eyebrow}
                  </span>

                  <h3>{group.label}</h3>
                </div>

                <div className="memory-group-tools">
                  {selectMode && (
                    <button
                      type="button"
                      className="memory-group-link"
                      onClick={() => {
                        onToggleGroup?.(groupIds, isAllSelected);
                      }}
                    >
                      {isAllSelected ? '取消本组' : '选择本组'}
                    </button>
                  )}

                  <span className="memory-group-count">
                    {pad2(group.items.length)} 页
                  </span>
                </div>
              </div>

              <div className="memory-group-grid">
                {group.items.map((memory) => (
                  <React.Fragment
                    key={memory.memoryId || memory.id}
                  >
                    {renderCard(memory, LIST_VIEW_GROUPED)}
                  </React.Fragment>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className="memory-timeline">
      {days.map((day) => (
        <section className="memory-day" key={day.key}>
          <div className="memory-day-label">
            <span>{day.label}</span>
          </div>

          <div className="memory-list">
            {day.items.map((memory) => (
              <React.Fragment
                key={memory.memoryId || memory.id}
              >
                {renderCard(memory, LIST_VIEW_TIMELINE)}
              </React.Fragment>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
};

export default MemoryListViews;
