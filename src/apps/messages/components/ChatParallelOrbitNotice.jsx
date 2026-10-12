import React from 'react';
import { Orbit, ChevronRight } from 'lucide-react';

// 平行轨迹"后台静默扫描"开关打开后，调度器在用户没在看这个聊天窗的
// 时候偷偷生成了新的轨迹——跟DIY换装那条不一样，这条是可以点的：
// 点进去才能看到角色这段时间都经历了什么，所以视觉上照搬
// ChatParcelArrivedNotice 的"强调色描边卡片 + 右侧箭头"语言，保持
// 跟项目里其它"点我进去看"的卡片同一套风格。
const ChatParallelOrbitNotice = ({ message, onOpenParallelOrbit }) => {
  const text = message?.content || '平行轨迹悄悄更新了。';

  return (
    <div
      className="mx-auto my-3 w-[calc(100%-1rem)] max-w-[340px] overflow-hidden rounded-[1.75rem] p-4 backdrop-blur-xl transition-all duration-200"
      style={{
        background: 'var(--card-bg-gradient)',
        color: 'var(--text-main)',
        border: '1px solid var(--accent-color)',
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.12)',
      }}
    >
      <button
        type="button"
        onClick={() => onOpenParallelOrbit?.()}
        className="flex w-full items-center justify-between gap-3 text-left transition-opacity active:opacity-70"
      >
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
            style={{
              background: 'var(--control-soft-bg)',
              color: 'var(--accent-color)',
            }}
          >
            <Orbit className="h-[18px] w-[18px]" />
          </div>

          <div className="min-w-0">
            <div className="truncate text-[13px] leading-relaxed">
              {text}
            </div>

            <div
              className="mt-0.5 flex items-center gap-1.5 text-[12px]"
              style={{ color: 'var(--accent-color)' }}
            >
              <span className="relative flex h-1.5 w-1.5">
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                  style={{ background: 'var(--accent-color)' }}
                />
                <span
                  className="relative inline-flex h-1.5 w-1.5 rounded-full"
                  style={{ background: 'var(--accent-color)' }}
                />
              </span>
              点这里翻一翻
            </div>
          </div>
        </div>

        <ChevronRight className="h-5 w-5 shrink-0 opacity-50" />
      </button>
    </div>
  );
};

export default ChatParallelOrbitNotice;