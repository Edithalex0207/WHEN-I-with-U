// src/apps/messages/components/cards/WebSearchResultCard.jsx
//
// 角色这次回复里用了联网搜索工具（webSearchTool.js）时，展示在气泡下面
// 的小卡片：查了什么、搜到的摘要、有来源链接就列出来。跟 RobotActionCard
// 一个风格（轻量、无边框、弱化阴影），不做成 WeatherCard 那种大卡片——
// 这里只是"过程展示"，角色自己转述的内容已经在气泡正文里了。

import React from 'react';

const SearchIcon = () => (
  <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-500 dark:text-sky-400">
    <svg
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.2-3.2" />
    </svg>
  </div>
);

export default function WebSearchResultCard({ card }) {
  if (!card) return null;

  const { query, summary, sources } = card;
  const hasSources = Array.isArray(sources) && sources.length > 0;

  return (
    <div className="relative my-2 w-fit max-w-[320px] overflow-hidden rounded-3xl p-3.5 select-none">
      <div className="pointer-events-none absolute -inset-2 bg-gradient-to-r from-sky-400/15 via-cyan-300/10 to-transparent opacity-60 blur-xl" />

      <div className="relative z-10 flex items-start gap-3">
        <SearchIcon />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-xs font-semibold tracking-wide text-zinc-800 dark:text-zinc-100">
              联网搜索
            </span>
            <span className="h-1 w-1 shrink-0 rounded-full bg-sky-400" />
          </div>

          <div className="mt-0.5 truncate text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            {query}
          </div>

          {summary && (
            <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400 dark:text-zinc-500">
              {summary}
            </p>
          )}

          {hasSources && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="max-w-[140px] truncate rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-600 hover:bg-sky-500/20 dark:text-sky-400"
                  title={source.title}
                >
                  {source.title}
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}