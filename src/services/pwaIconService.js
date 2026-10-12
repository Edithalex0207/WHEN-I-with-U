// pwaIconService.js
let _blobUrl = null;
let _originalManifestHref = null;
let _originalAppleTouchIconHref = null;
let _hasAppleTouchIconPrecomposed = false;
let _originalAppleTouchIconPrecomposedHref = null;

function ensureLink(rel, attrs = {}) {
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.rel = rel;
    document.head.appendChild(el);
  }
  Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  return el;
}

// 2026-10 修复：之前 iconUrl 为空（用户点"移除"）时直接 return，
// apple-touch-icon 和 manifest 的 <link> 还停留在上一次换成的自定义图标，
// 导致"移除"这个操作在当前会话里看起来完全没反应，要刷新页面才会真的
// 变回默认图标。现在空值统一转去 resetPwaIcon()，把两个 <link> 都
// 改回首次替换前记录下来的原始地址。
export async function applyPwaIcon(iconUrl) {
  if (!iconUrl || typeof iconUrl !== 'string') {
    resetPwaIcon();
    return;
  }

  try {
    const absIcon = new URL(iconUrl, location.href).href;

    // 第一次真正替换前，把 index.html 里原本写的默认地址记下来，
    // 供之后 resetPwaIcon() 用。只记一次，避免后面读到的已经是
    // 被我们自己改过的值。
    const appleTouchIconEl = document.querySelector('link[rel="apple-touch-icon"]');
    if (appleTouchIconEl && !_originalAppleTouchIconHref) {
      _originalAppleTouchIconHref = appleTouchIconEl.href;
    }

    const appleTouchIconPrecomposedEl = document.querySelector(
      'link[rel="apple-touch-icon-precomposed"]',
    );
    if (appleTouchIconPrecomposedEl) {
      _hasAppleTouchIconPrecomposed = true;
      if (!_originalAppleTouchIconPrecomposedHref) {
        _originalAppleTouchIconPrecomposedHref = appleTouchIconPrecomposedEl.href;
      }
    }

    // 1. apple-touch-icon（iOS 主要读这个），没有就创建
    ensureLink('apple-touch-icon', { href: absIcon, sizes: '180x180' });

    // 顺手把 -precomposed 那个也换掉（如果页面本来就有这个标签），
    // 避免两个标签各指向不同图标——虽然现代 iOS 优先读不带
    // -precomposed 的那个，但留着不同步容易让人以为没生效。
    if (_hasAppleTouchIconPrecomposed) {
      ensureLink('apple-touch-icon-precomposed', { href: absIcon });
    }

    // 2. manifest
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (!manifestLink) return;

    // 只记录一次"原始"地址，避免之后读到已被 revoke 的 blob
    if (!_originalManifestHref) _originalManifestHref = manifestLink.href;
    const origHref = _originalManifestHref;

    let base = {};
    try {
      const res = await fetch(origHref);
      if (res.ok) base = await res.json();
    } catch {}

    // blob URL 下相对路径会失效，统一转成绝对地址
    const abs = (p, fallback = '.') => new URL(p || fallback, origHref).href;

    const newManifest = {
      ...base,
      start_url: abs(base.start_url),
      scope: abs(base.scope),
      ...(base.id ? { id: abs(base.id) } : {}),
      icons: [
        { src: absIcon, sizes: '192x192', purpose: 'any' },
        { src: absIcon, sizes: '512x512', purpose: 'any' },
      ],
    };

    if (_blobUrl) URL.revokeObjectURL(_blobUrl);
    _blobUrl = URL.createObjectURL(
      new Blob([JSON.stringify(newManifest)], { type: 'application/manifest+json' }),
    );
    manifestLink.href = _blobUrl;
  } catch (e) {
    console.warn('[pwaIconService] 应用自定义图标失败:', e);
  }
}

// 把 apple-touch-icon（+ -precomposed，如果页面本来就有）和 manifest
// 的 <link> 都改回首次替换前记录的原始地址，并释放 blob URL。
// 如果这个会话里从来没真正替换过（_originalXxxHref 都还是 null），
// 说明链接本来就还是默认值，不需要做任何事。
export function resetPwaIcon() {
  try {
    if (_originalAppleTouchIconHref) {
      const el = ensureLink('apple-touch-icon', { href: _originalAppleTouchIconHref });
      el.removeAttribute('sizes');
    }

    if (_hasAppleTouchIconPrecomposed && _originalAppleTouchIconPrecomposedHref) {
      ensureLink('apple-touch-icon-precomposed', {
        href: _originalAppleTouchIconPrecomposedHref,
      });
    }

    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (manifestLink && _originalManifestHref) {
      manifestLink.href = _originalManifestHref;
    }

    if (_blobUrl) {
      URL.revokeObjectURL(_blobUrl);
      _blobUrl = null;
    }
  } catch (e) {
    console.warn('[pwaIconService] 恢复默认图标失败:', e);
  }
}