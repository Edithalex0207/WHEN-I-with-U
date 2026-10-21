/*
 * openSweetStreet.js —— 从小伙伴页跳到「甜品小街」顶层 app 的小桥。
 *
 * 小伙伴页挂在聊天室里面，跟 App.jsx 之间没有现成的 props 通道，
 * 所以用一个 window 自定义事件传话（跟引导页「重新查看引导」同一个做法）。
 * App.jsx 里有对应的监听，收到后切到 sweetstreet 并记下是哪个聊天窗来的。
 */

export const OPEN_SWEET_STREET_EVENT = 'sweetstreet:open';

export const openSweetStreet = (chatId) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(OPEN_SWEET_STREET_EVENT, { detail: { chatId } })
  );
};
