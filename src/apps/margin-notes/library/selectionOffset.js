// src/apps/margin-notes/library/selectionOffset.js
//
// 把浏览器的文字选区，换算成「在这一段纯文本里的第几个字到第几个字」。
// 选区的起止点有时落在文字节点上（offset 是字符数），有时落在标签上
// （比如 <mark>，offset 是第几个子节点），两种情况混着出现 —— 用
// Range.toString() 的长度来量，不用关心落在哪一种节点上，天然通用。

/**
 * 量出「从 root 开头到 (node, offsetInNode) 这一点」之间有多少个字符。
 */
const measureOffset = (root, node, offsetInNode) => {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offsetInNode);
  return range.toString().length;
};

/**
 * 读当前的文字选区，换算成相对 paragraphNode 的 { start, end, rect }。
 * 选区没有、选区是空的、或者选区跑出了这一段，都返回 null。
 */
export const getParagraphSelection = (paragraphNode) => {
  if (!paragraphNode || typeof window === 'undefined') return null;

  const selection = window.getSelection ? window.getSelection() : null;
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null;
  }

  const range = selection.getRangeAt(0);
  if (
    !paragraphNode.contains(range.startContainer) ||
    !paragraphNode.contains(range.endContainer)
  ) {
    return null;
  }

  const a = measureOffset(paragraphNode, range.startContainer, range.startOffset);
  const b = measureOffset(paragraphNode, range.endContainer, range.endOffset);
  const start = Math.min(a, b);
  const end = Math.max(a, b);
  if (end <= start) return null;

  return { start, end, rect: range.getBoundingClientRect() };
};

export const clearNativeSelection = () => {
  const selection = window.getSelection ? window.getSelection() : null;
  if (selection) selection.removeAllRanges();
};