import React, { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

const SHOW_AFTER_PX = 480;

/*
 * 回到顶部按钮。
 *
 * 不用 position: fixed —— 记忆页是跑在主页那条窄通道里的普通页面，
 * fixed 在宽屏上会跑到整个浏览器窗口的右下角，离内容很远。
 * 这里放一个高度为 0 的 sticky 容器在页面最末尾，滚动时它会贴在
 * 视口底部，但水平方向始终留在记忆页自己的宽度里。
 */
export const MemoryBackToTop = () => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const next = window.scrollY > SHOW_AFTER_PX;

      setIsVisible((current) => (
        current === next ? current : next
      ));
    };

    handleScroll();

    window.addEventListener('scroll', handleScroll, {
      passive: true
    });

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const handleClick = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  return (
    <div className="memory-backtop-anchor">
      <button
        type="button"
        className={[
          'memory-backtop-button',
          isVisible ? 'memory-backtop-button-visible' : ''
        ].filter(Boolean).join(' ')}
        onClick={handleClick}
        aria-label="回到顶部"
        tabIndex={isVisible ? 0 : -1}
      >
        <ArrowUp className="memory-icon" />
        <span>TOP</span>
      </button>
    </div>
  );
};

export default MemoryBackToTop;
