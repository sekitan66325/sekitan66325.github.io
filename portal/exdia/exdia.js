(() => {
  'use strict';

  /**
   * =========================================================================
   * 公開前差し替え用 一括設定（ここを更新するだけでページ全体へ反映されます）
   * =========================================================================
   */
  const EXDIA_CONFIG = {
    // BOOTH 販売ページURL（1ページ内バリエーション出品のため共通URL、版別に分ける場合はオブジェクトでも指定可）
    boothUrl: 'https://sekitan66325.booth.pm/items/9206447',

    // 個別カスタマイズ相談 Google フォーム URL（空文字の間はページ内の相談フォームモーダルが起動）
    customFormUrl: 'https://forms.gle/CaTR8ShCaVNaA6f56',

    // 紹介PV動画URL（YouTube埋め込みURL 例: 'https://www.youtube.com/embed/XXXX' または MP4パス 例: 'assets/videos/exdia-pv.mp4'）
    pvVideoUrl: '',

    // 実機スクリーンショット画像を使用する場合は true に変更（false の間はクリーンなタイトル枠を表示し404を出さない）
    useScreenshots: false,

    // 実機スクリーンショット画像パス（useScreenshots: true 時に読込、未配置時はプレースホルダー表示）
    media: {
      diagram: {
        src: 'assets/screenshots/diagram-preview.png',
        alt: 'ExDia ダイヤグラム・時刻表編集画面',
        title: 'ダイヤグラム・時刻表編集',
        caption: '1,200本超の列車スジも60fpsで軽快にドラッグ編集。秒単位の時刻調整や番線競合を即座に検出します。',
        bridgeEdition: 'web',
        bridgeLabel: 'Web版から利用可能 — 価格を見る'
      },
      'box-diagram': {
        src: 'assets/screenshots/box-diagram-preview.png',
        alt: 'ExDia 箱ダイヤ・車両運用連動画面',
        title: '箱ダイヤ・車両運用連動',
        caption: 'スジの修正に合わせて時刻表・車両運用表・箱ダイヤ・番線在線表がリアルタイムに同期します。',
        bridgeEdition: 'web',
        bridgeLabel: 'Web版から利用可能 — 価格を見る'
      },
      'tid-track': {
        src: 'assets/screenshots/tid-track-preview.png',
        alt: 'ExDia Ultra マルチトラックTID・構内配線カスタムエディタ画面',
        title: 'マルチトラックTID・構内配線',
        caption: '3状態終端や留置線在線まで描ける構内配線エディタと、遅延波及リアルタイム指令盤TIDが連動します。',
        bridgeEdition: 'ultra',
        bridgeLabel: 'Ultra 限定機能 — 価格を見る'
      },
      'run-curve': {
        src: 'assets/screenshots/run-curve-preview.png',
        alt: 'ExDia Ultra 物理運転曲線（ランカーブ）画面',
        title: '物理運転曲線（ランカーブ）',
        caption: '勾配・曲線半径・Davis走行抵抗から速度曲線と消費電力量を算出し、基準運転時分へ直接反映します。',
        bridgeEdition: 'ultra',
        bridgeLabel: 'Ultra 限定機能 — 価格を見る'
      },
      'station-poster': {
        src: 'assets/screenshots/station-poster-preview.png',
        alt: 'ExDia Plus 駅掲示 縦型発車時刻表SVG出力プレビュー',
        title: '駅掲示「縦型・発車時刻表」ポスター',
        caption: '駅の掲示板にそのまま使える縦型時刻表を自動組版し、全駅一括でベクターSVGとして書き出します。',
        bridgeEdition: 'plus',
        bridgeLabel: 'Plus 以上 — 価格を見る'
      },
      'driver-staff': {
        src: 'assets/screenshots/driver-staff-preview.png',
        alt: 'ExDia Ultra 乗務員仕業・運転士スタフ出力プレビュー',
        title: '乗務員仕業・運転士スタフ',
        caption: '連続乗務・休憩チェック付きの行路管理から、運転士用携帯時刻表（スタフ）まで一貫して出力します。',
        bridgeEdition: 'ultra',
        bridgeLabel: 'Ultra 限定機能 — 価格を見る'
      },
      pv: {
        src: '',
        alt: 'ExDia 紹介PV動画',
        title: 'ExDia 紹介PV',
        caption: 'Web版・デスクトップ版の操作感と、TID構内配線・ランカーブ・帳票出力の流れをまとめた紹介映像です。',
        bridgeEdition: 'ultra',
        bridgeLabel: '全エディション比較・価格を見る'
      }
    }
  };

  const prefersReducedMotion =
    Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  // -------------------------------------------------------------------------
  // GA4 イベント計測ヘルパー (G-0GM4B0FTW9 / 個人情報送信禁止)
  // -------------------------------------------------------------------------
  const GA_MEASUREMENT_ID = 'G-0GM4B0FTW9';

  function trackEvent(eventName, params = {}) {
    const themeVariant = document.documentElement.getAttribute('data-brand-theme') || 'web';
    const payload = Object.assign({}, params, {
      theme_variant: themeVariant,
      transport_type: 'beacon'
    });

    if (window['ga-disable-' + GA_MEASUREMENT_ID] === true || window.__exdiaGaDryRun) {
      console.debug('[GA4 dry-run]', eventName, payload);
      return;
    }

    if (window.__exdiaGaDebug) {
      payload.debug_mode = true;
    }

    if (typeof window.gtag === 'function') {
      window.gtag('event', eventName, payload);
    }
  }

  const revealNodes = Array.from(document.querySelectorAll('[data-reveal]'));
  let revealObserver = null;
  let revealRafId = 0;

  function revealNode(node) {
    if (!node || node.classList.contains('is-revealed')) return;
    node.classList.add('is-revealed');
    if (revealObserver) {
      revealObserver.unobserve(node);
    }
    const delayMs = Number(node.getAttribute('data-reveal-delay') || 0);
    window.setTimeout(() => {
      node.classList.add('reveal-settled');
    }, delayMs + 560);
  }

  function revealVisibleElements() {
    revealRafId = 0;
    const viewportThreshold = window.innerHeight + 48;
    revealNodes.forEach((node) => {
      if (node.classList.contains('is-revealed')) return;
      const rect = node.getBoundingClientRect();
      if (rect.top < viewportThreshold) {
        revealNode(node);
      }
    });
  }

  function scheduleRevealCheck() {
    if (!revealRafId) {
      revealRafId = window.requestAnimationFrame(revealVisibleElements);
    }
  }

  function revealSectionImmediately(sectionEl) {
    if (!sectionEl) return;
    if (sectionEl.hasAttribute('data-reveal')) {
      revealNode(sectionEl);
    }
    sectionEl.querySelectorAll('[data-reveal]').forEach(revealNode);
  }

  function startScrollReveals() {
    if (!prefersReducedMotion && 'IntersectionObserver' in window) {
      revealNodes.forEach((node) => {
        const delay = node.getAttribute('data-reveal-delay');
        if (delay) {
          node.style.setProperty('--reveal-delay', `${delay}ms`);
        }
      });

      revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting || entry.boundingClientRect.top < window.innerHeight) {
              revealNode(entry.target);
            }
          });
        },
        { threshold: 0, rootMargin: '0px 0px -12px 0px' }
      );

      revealNodes.forEach((node) => {
        revealObserver.observe(node);
      });

      window.requestAnimationFrame(revealVisibleElements);
      window.addEventListener('scroll', scheduleRevealCheck, { passive: true });
      window.addEventListener('resize', scheduleRevealCheck, { passive: true });
      window.addEventListener('hashchange', () => {
        revealVisibleElements();
        window.setTimeout(revealVisibleElements, 400);
      });

      if (window.location.hash) {
        const hashTarget = document.getElementById(window.location.hash.slice(1));
        revealSectionImmediately(hashTarget);
      }

      document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
        anchor.addEventListener('click', () => {
          const href = anchor.getAttribute('href') || '';
          const id = href.slice(1);
          if (id) {
            revealSectionImmediately(document.getElementById(id));
          }
          window.setTimeout(revealVisibleElements, 350);
          window.setTimeout(revealVisibleElements, 750);
        });
      });
    } else {
      revealNodes.forEach((node) => {
        node.classList.add('is-revealed', 'reveal-settled');
      });
    }
  }

  startScrollReveals();

  // -------------------------------------------------------------------------
  // 0. オープニング：ExDia ロゴ描画コントローラー
  // -------------------------------------------------------------------------
  const introOverlay = document.getElementById('intro-overlay');
  const introSkipBtn = document.getElementById('intro-skip');
  let introCurtainTimer = 0;
  let introDoneTimer = 0;
  let introFinished = false;
  const introStartTime = typeof performance !== 'undefined' ? performance.now() : Date.now();

  function trackIntroSkip() {
    if (introFinished) return;
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    trackEvent('exdia_intro_skip', {
      elapsed_ms: Math.max(0, Math.round(now - introStartTime))
    });
  }

  function finishIntroImmediately() {
    if (introFinished) return;
    introFinished = true;
    window.clearTimeout(introCurtainTimer);
    window.clearTimeout(introDoneTimer);
    document.documentElement.classList.remove('intro-active');
    document.documentElement.classList.add('hero-ready');
    if (introOverlay) {
      introOverlay.classList.remove('is-curtain-up');
      introOverlay.hidden = true;
    }
    revealVisibleElements();
  }

  if (prefersReducedMotion || !introOverlay) {
    finishIntroImmediately();
  } else {
    introCurtainTimer = window.setTimeout(() => {
      if (introFinished) return;
      introOverlay.classList.add('is-curtain-up');
      document.documentElement.classList.add('hero-ready');
      revealVisibleElements();
      introDoneTimer = window.setTimeout(finishIntroImmediately, 380);
    }, 1480);

    if (introSkipBtn) {
      introSkipBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        trackIntroSkip();
        finishIntroImmediately();
      });
    }

    introOverlay.addEventListener('click', () => {
      trackIntroSkip();
      finishIntroImmediately();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !introFinished) {
        trackIntroSkip();
        finishIntroImmediately();
      }
    });
  }

  // -------------------------------------------------------------------------
  // 1. BOOTH URL 一括適用 ＆ 外部導線クリック計測
  // -------------------------------------------------------------------------
  document.querySelectorAll('[data-booth-url]').forEach((el) => {
    const tier = el.getAttribute('data-booth-url') || 'default';
    const url =
      typeof EXDIA_CONFIG.boothUrl === 'string'
        ? EXDIA_CONFIG.boothUrl
        : EXDIA_CONFIG.boothUrl[tier] || EXDIA_CONFIG.boothUrl.default;
    if (url) {
      el.setAttribute('href', url);
    }
    el.addEventListener('click', () => {
      const placementBase = el.getAttribute('data-ga-placement') || 'unknown';
      const placement =
        tier !== 'default' && (placementBase === 'edition_card' || placementBase === 'compare_tfoot')
          ? `${placementBase}_${tier}`
          : placementBase;
      const destination = tier === 'default' ? 'booth' : `booth_${tier}`;
      trackEvent('exdia_booth_click', {
        edition: tier,
        placement: placementBase
      });
      trackEvent('exdia_cta_click', {
        source_app: 'exdia_lp',
        placement,
        destination,
        link_url: el.href || url || ''
      });
    });
  });

  document.querySelectorAll('a[href^="https://exdia.sekitan.net"]').forEach((el) => {
    el.addEventListener('click', () => {
      const placement = el.getAttribute('data-ga-placement') || 'unknown';
      trackEvent('exdia_web_click', {
        placement
      });
      trackEvent('exdia_cta_click', {
        source_app: 'exdia_lp',
        placement,
        destination: 'exdia_web',
        link_url: el.href || ''
      });
    });
  });

  document.querySelectorAll('[data-ga-outbound]').forEach((el) => {
    el.addEventListener('click', () => {
      const destination = el.getAttribute('data-ga-outbound') || 'unknown';
      const placementBase = el.getAttribute('data-ga-placement') || 'unknown';
      trackEvent('exdia_outbound_click', {
        destination,
        placement: placementBase
      });
      if (destination === 'tsunagu') {
        trackEvent('exdia_cta_click', {
          source_app: 'exdia_lp',
          placement: `${placementBase}_tsunagu`,
          destination: 'tsunagu',
          link_url: el.href || ''
        });
      }
    });
  });

  document.querySelectorAll('[data-ga-cta]').forEach((el) => {
    el.addEventListener('click', () => {
      trackEvent('exdia_cta_click', {
        source_app: 'exdia_lp',
        placement: el.getAttribute('data-ga-placement') || 'unknown',
        destination: el.getAttribute('data-ga-cta') || 'unknown',
        link_url: el.href || el.getAttribute('href') || ''
      });
    });
  });

  // -------------------------------------------------------------------------
  // 2. トップ極細スクロール進捗バー (requestAnimationFrame)
  // -------------------------------------------------------------------------
  const railFill = document.getElementById('scroll-rail-fill');
  let railRafId = 0;

  function updateScrollRail() {
    railRafId = 0;
    if (!railFill) return;
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
    railFill.style.transform = `scaleX(${ratio.toFixed(4)})`;
  }

  function scheduleScrollRail() {
    if (!railRafId) {
      railRafId = window.requestAnimationFrame(updateScrollRail);
    }
  }

  window.addEventListener('scroll', scheduleScrollRail, { passive: true });
  window.addEventListener('resize', scheduleScrollRail, { passive: true });
  updateScrollRail();

  // -------------------------------------------------------------------------
  // 4. スライディング・インジケーター共通ヘルパー
  // -------------------------------------------------------------------------
  function moveIndicator(indicator, target) {
    if (!indicator || !target) return;
    const width = target.offsetWidth;
    if (width <= 0) return;
    indicator.style.width = `${width}px`;
    indicator.style.transform = `translateX(${target.offsetLeft}px)`;
    indicator.style.opacity = '1';
  }

  // -------------------------------------------------------------------------
  // 5. スクリーンショット拡大ライトボックス
  // -------------------------------------------------------------------------
  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxCaption = document.getElementById('lightbox-caption');
  const lightboxClose = document.getElementById('lightbox-close');
  let lastFocusedEl = null;

  function openLightbox(src, alt, caption) {
    if (!lightbox || !lightboxImg) return;
    lastFocusedEl = document.activeElement;
    lightboxImg.src = src;
    lightboxImg.alt = alt || '';
    if (lightboxCaption) {
      lightboxCaption.textContent = caption || alt || '';
    }
    lightbox.hidden = false;
    document.body.style.overflow = 'hidden';
    if (lightboxClose) {
      lightboxClose.focus();
    }
  }

  function closeLightbox() {
    if (!lightbox || lightbox.hidden) return;
    lightbox.hidden = true;
    document.body.style.overflow = '';
    if (lightboxImg) {
      lightboxImg.src = '';
    }
    if (lastFocusedEl && typeof lastFocusedEl.focus === 'function') {
      lastFocusedEl.focus();
    }
  }

  if (lightboxClose) {
    lightboxClose.addEventListener('click', closeLightbox);
  }
  if (lightbox) {
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) {
        closeLightbox();
      }
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeLightbox();
    }
  });

  function enableImageZoom(img, captionText, mediaKey) {
    if (!img) return;
    img.classList.add('is-zoomable');
    img.addEventListener('click', () => {
      if (img.naturalWidth > 0) {
        if (mediaKey) {
          trackEvent('exdia_viewer_tab', {
            media_key: mediaKey,
            action: 'lightbox_open'
          });
        }
        openLightbox(img.src, img.alt, captionText);
      }
    });
  }

  // -------------------------------------------------------------------------
  // 6. ショーケース画像の読み込みフォールバック & ライトボックス連携
  // -------------------------------------------------------------------------
  function attachImageFallback(img, onFail) {
    if (!img) return;
    img.addEventListener('error', onFail, { once: true });
    if (img.complete && img.naturalWidth === 0) {
      onFail();
    }
  }

  document.querySelectorAll('[data-showcase-media]').forEach((wrap) => {
    const img = wrap.querySelector('img');
    const fallback = wrap.querySelector('.showcase-placeholder');
    if (!img || !fallback) return;

    const targetSrc = img.getAttribute('data-src') || img.getAttribute('src');
    if (!EXDIA_CONFIG.useScreenshots || !targetSrc) {
      img.hidden = true;
      fallback.hidden = false;
      return;
    }

    const titleEl = wrap.closest('.showcase-block')?.querySelector('.showcase-title');
    img.src = targetSrc;
    attachImageFallback(img, () => {
      img.hidden = true;
      fallback.hidden = false;
    });
    img.addEventListener('load', () => {
      if (img.naturalWidth > 0) {
        img.hidden = false;
        fallback.hidden = true;
        enableImageZoom(img, titleEl ? titleEl.textContent.trim() : img.alt, 'showcase');
      }
    });
  });

  // -------------------------------------------------------------------------
  // 7. ヒーロー 実機画面＆PV 切替タブビューア（clip-path ワイプ）+ ブリッジ
  // -------------------------------------------------------------------------
  const viewerTabs = Array.from(document.querySelectorAll('.viewer-tab'));
  const viewerTabIndicator = document.getElementById('viewer-tab-indicator');
  const viewerStage = document.getElementById('viewer-stage');
  const viewerCaption = document.getElementById('viewer-caption');
  const viewerBridgeLink = document.getElementById('viewer-bridge-link');
  const viewerBridgeText = document.getElementById('viewer-bridge-text');

  function createViewerPlaceholder(title) {
    const box = document.createElement('div');
    box.className = 'viewer-placeholder';
    const p = document.createElement('p');
    p.className = 'viewer-placeholder-title';
    p.textContent = title;
    box.appendChild(p);
    return box;
  }

  let currentViewerMediaKey = 'diagram';

  function renderViewerPanel(key) {
    const item = EXDIA_CONFIG.media[key];
    if (!item || !viewerStage) return;
    currentViewerMediaKey = key;

    viewerStage.innerHTML = '';
    const inner = document.createElement('div');
    inner.className = 'viewer-stage-inner';
    viewerStage.appendChild(inner);

    if (viewerCaption) {
      viewerCaption.textContent = item.caption;
    }
    if (viewerBridgeLink && viewerBridgeText) {
      viewerBridgeLink.setAttribute('data-target-edition', item.bridgeEdition || 'web');
      viewerBridgeText.textContent = item.bridgeLabel || '価格を見る';
    }

    if (key === 'pv') {
      const videoUrl = EXDIA_CONFIG.pvVideoUrl.trim();
      if (videoUrl) {
        if (/\.(mp4|webm|ogg)(\?.*)?$/i.test(videoUrl)) {
          const video = document.createElement('video');
          video.className = 'viewer-media';
          video.src = videoUrl;
          video.controls = true;
          video.preload = 'metadata';
          inner.appendChild(video);
        } else {
          const iframe = document.createElement('iframe');
          iframe.className = 'viewer-video-frame';
          iframe.src = videoUrl;
          iframe.title = item.title;
          iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
          iframe.allowFullscreen = true;
          inner.appendChild(iframe);
        }
        return;
      }
      inner.appendChild(createViewerPlaceholder(item.title));
      return;
    }

    if (!EXDIA_CONFIG.useScreenshots || !item.src) {
      inner.appendChild(createViewerPlaceholder(item.title));
      return;
    }

    const img = document.createElement('img');
    img.className = 'viewer-media';
    img.src = item.src;
    img.alt = item.alt;

    const fallback = createViewerPlaceholder(item.title);
    fallback.hidden = true;

    attachImageFallback(img, () => {
      img.hidden = true;
      fallback.hidden = false;
    });
    img.addEventListener('load', () => {
      if (img.naturalWidth > 0) {
        enableImageZoom(img, item.title, key);
      }
    });

    inner.appendChild(img);
    inner.appendChild(fallback);
  }

  function syncViewerTabIndicator() {
    const activeTab = viewerTabs.find((t) => t.getAttribute('aria-selected') === 'true') || viewerTabs[0];
    if (activeTab) {
      moveIndicator(viewerTabIndicator, activeTab);
    }
  }

  if (viewerTabs.length) {
    viewerTabs.forEach((tab, index) => {
      tab.addEventListener('click', () => {
        const mediaKey = tab.getAttribute('data-media-key') || 'diagram';
        viewerTabs.forEach((t) => {
          t.setAttribute('aria-selected', String(t === tab));
          t.tabIndex = t === tab ? 0 : -1;
        });
        moveIndicator(viewerTabIndicator, tab);
        renderViewerPanel(mediaKey);
        trackEvent('exdia_viewer_tab', {
          media_key: mediaKey,
          action: 'tab_switch'
        });
      });

      tab.addEventListener('keydown', (e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const dir = e.key === 'ArrowRight' ? 1 : -1;
        const next = viewerTabs[(index + dir + viewerTabs.length) % viewerTabs.length];
        next.focus();
        next.click();
      });
    });

    renderViewerPanel(viewerTabs[0].getAttribute('data-media-key'));
    syncViewerTabIndicator();
  }

  let bridgePulseTimer = 0;
  if (viewerBridgeLink) {
    viewerBridgeLink.addEventListener('click', (e) => {
      trackEvent('exdia_viewer_tab', {
        media_key: currentViewerMediaKey || 'diagram',
        action: 'bridge_click'
      });
      const targetEdition = viewerBridgeLink.getAttribute('data-target-edition');
      const targetCard = targetEdition
        ? document.querySelector(`.edition-card[data-edition="${targetEdition}"]`)
        : null;
      const editionsSection = document.getElementById('editions');
      if (!targetCard && !editionsSection) return;

      e.preventDefault();
      revealSectionImmediately(editionsSection);
      const scrollTarget = window.innerWidth < 768 && targetCard ? targetCard : editionsSection || targetCard;
      scrollTarget.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
      window.setTimeout(revealVisibleElements, 400);

      if (targetCard) {
        window.clearTimeout(bridgePulseTimer);
        document.querySelectorAll('.edition-card.is-bridge-pulse').forEach((c) => {
          c.classList.remove('is-bridge-pulse');
        });
        targetCard.classList.add('is-bridge-pulse');
        bridgePulseTimer = window.setTimeout(() => {
          targetCard.classList.remove('is-bridge-pulse');
        }, 1200);
      }
    });
  }

  // -------------------------------------------------------------------------
  // 8. やりたいことから選ぶ ワンクリック絞り込みバー (#editions)
  // -------------------------------------------------------------------------
  const intentChips = Array.from(document.querySelectorAll('.intent-chip'));
  const editionCards = Array.from(document.querySelectorAll('.edition-card[data-edition]'));
  const intentGuide = document.getElementById('intent-guide');

  const INTENT_MAP = {
    all: {
      editions: ['web', 'plus', 'pro', 'ultra'],
      minEdition: 'all',
      guide: ''
    },
    plus: {
      editions: ['plus', 'pro', 'ultra'],
      minEdition: 'plus',
      guide: 'この用途には「ExDia Plus（¥1,280）」以上が対応しています。'
    },
    'pro-print': {
      editions: ['pro', 'ultra'],
      minEdition: 'pro',
      guide: 'この用途には「ExDia Pro（¥2,980）」以上が対応しています。'
    },
    'pro-fleet': {
      editions: ['pro', 'ultra'],
      minEdition: 'pro',
      guide: 'この用途には「ExDia Pro（¥2,980）」以上が対応しています。'
    },
    'ultra-tid': {
      editions: ['ultra'],
      minEdition: 'ultra',
      guide: 'この用途には最上位の「ExDia Ultra（¥4,980）」が対応しています。'
    },
    'ultra-ops': {
      editions: ['ultra'],
      minEdition: 'ultra',
      guide: 'この用途には最上位の「ExDia Ultra（¥4,980）」が対応しています。'
    }
  };

  function applyIntentFilter(intentKey) {
    revealSectionImmediately(document.getElementById('editions'));
    const spec = INTENT_MAP[intentKey] || INTENT_MAP.all;
    const isAll = intentKey === 'all';

    intentChips.forEach((chip) => {
      chip.setAttribute('aria-pressed', String(chip.getAttribute('data-intent') === intentKey));
    });

    editionCards.forEach((card) => {
      const ed = card.getAttribute('data-edition');
      const matches = spec.editions.includes(ed);
      card.classList.toggle('is-intent-match', !isAll && matches);
      card.classList.toggle('is-intent-dim', !isAll && !matches);
    });

    if (intentGuide) {
      if (!spec.guide) {
        intentGuide.textContent = '';
        intentGuide.hidden = true;
      } else {
        intentGuide.hidden = false;
        intentGuide.textContent = spec.guide;
        intentGuide.classList.remove('is-animated');
        void intentGuide.offsetWidth;
        intentGuide.classList.add('is-animated');
      }
    }
  }

  intentChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const intentKey = chip.getAttribute('data-intent') || 'all';
      const spec = INTENT_MAP[intentKey] || INTENT_MAP.all;
      applyIntentFilter(intentKey);
      trackEvent('exdia_intent_filter', {
        intent_key: intentKey,
        min_edition: spec.minEdition
      });
    });
  });

  // -------------------------------------------------------------------------
  // 9. 個別カスタマイズ相談フォーム導線 (EXDIA_CONFIG.customFormUrl + モーダル)
  // -------------------------------------------------------------------------
  const customFormTrigger = document.getElementById('custom-form-trigger');
  const customModal = document.getElementById('custom-modal');
  const customModalClose = document.getElementById('custom-modal-close');
  const customConsultForm = document.getElementById('custom-consult-form');
  const customCopyBtn = document.getElementById('custom-copy-btn');
  const customModalStatus = document.getElementById('custom-modal-status');
  let lastCustomFocus = null;

  if (customFormTrigger) {
    const formUrl = EXDIA_CONFIG.customFormUrl.trim();
    if (formUrl) {
      customFormTrigger.setAttribute('href', formUrl);
      customFormTrigger.setAttribute('target', '_blank');
      customFormTrigger.setAttribute('rel', 'noopener noreferrer');
      customFormTrigger.addEventListener('click', () => {
        trackEvent('exdia_custom_form_click', {
          placement: 'custom_section',
          destination: 'google_form'
        });
        trackEvent('exdia_cta_click', {
          source_app: 'exdia_lp',
          placement: 'custom_section_enterprise',
          destination: 'enterprise_form',
          link_url: customFormTrigger.href || formUrl
        });
      });
    } else {
      customFormTrigger.addEventListener('click', (e) => {
        e.preventDefault();
        trackEvent('exdia_custom_form_click', {
          placement: 'custom_section',
          destination: 'modal'
        });
        if (!customModal) return;
        lastCustomFocus = document.activeElement;
        customModal.hidden = false;
        document.body.style.overflow = 'hidden';
        const firstInput = document.getElementById('custom-field-type');
        if (firstInput) firstInput.focus();
      });
    }
  }

  function closeCustomModal() {
    if (!customModal || customModal.hidden) return;
    customModal.hidden = true;
    document.body.style.overflow = '';
    if (customModalStatus) customModalStatus.textContent = '';
    if (lastCustomFocus && typeof lastCustomFocus.focus === 'function') {
      lastCustomFocus.focus();
    }
  }

  if (customModalClose) {
    customModalClose.addEventListener('click', closeCustomModal);
  }
  if (customModal) {
    customModal.addEventListener('click', (e) => {
      if (e.target === customModal) closeCustomModal();
    });
  }
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCustomModal();
  });

  function buildConsultMessage() {
    const type = document.getElementById('custom-field-type')?.value || '';
    const edition = document.getElementById('custom-field-edition')?.value || '';
    const detail = document.getElementById('custom-field-detail')?.value.trim() || '（未記入）';
    return {
      subject: `ExDia 個別カスタマイズのご相談（${type}）`,
      body: `【相談種別】${type}\n【対象エディション】${edition}\n【ご希望内容】\n${detail}\n`
    };
  }

  if (customConsultForm) {
    customConsultForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = buildConsultMessage();
      const mailUrl = `mailto:sekitan.info@gmail.com?subject=${encodeURIComponent(msg.subject)}&body=${encodeURIComponent(msg.body)}`;
      window.location.href = mailUrl;
      if (customModalStatus) {
        customModalStatus.textContent = 'メールアプリを起動しました。起動しない場合は「相談内容をコピー」をご利用ください。';
      }
    });
  }

  if (customCopyBtn) {
    customCopyBtn.addEventListener('click', () => {
      const msg = buildConsultMessage();
      const text = `${msg.subject}\n\n${msg.body}`;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(() => {
          if (customModalStatus) customModalStatus.textContent = '相談内容をクリップボードへコピーしました。';
        }).catch(() => {
          if (customModalStatus) customModalStatus.textContent = 'コピーに失敗しました。メール下書きをお試しください。';
        });
      }
    });
  }

  // -------------------------------------------------------------------------
  // 10. 詳細機能比較表（スライドトグル・差分のみ切替・基本折りたたみ・スマホ2版比較）
  // -------------------------------------------------------------------------
  const compareTable = document.getElementById('compare-table');
  const filterAllBtn = document.getElementById('filter-all-btn');
  const filterDiffBtn = document.getElementById('filter-diff-btn');
  const compareToggleIndicator = document.getElementById('compare-toggle-indicator');
  const basicGroupBtn = document.getElementById('basic-group-toggle');
  const mobileLeftSelect = document.getElementById('mobile-compare-left');
  const mobileRightSelect = document.getElementById('mobile-compare-right');
  const mobileCompareBody = document.getElementById('mobile-compare-body');
  const mobileThLeft = document.getElementById('mobile-th-left');
  const mobileThRight = document.getElementById('mobile-th-right');

  let showDiffOnly = false;
  let basicExpanded = false;

  const EDITION_META = {
    web: { colIndex: 1, label: 'ExDia Web（無料）' },
    plus: { colIndex: 2, label: 'Plus（¥1,280）' },
    pro: { colIndex: 3, label: 'Pro（¥2,980）' },
    ultra: { colIndex: 4, label: 'Ultra（¥4,980）' }
  };

  function syncCompareToggleIndicator() {
    const activeBtn = showDiffOnly ? filterDiffBtn : filterAllBtn;
    if (activeBtn) {
      moveIndicator(compareToggleIndicator, activeBtn);
    }
  }

  function isRowDifferent(row) {
    const cells = Array.from(row.querySelectorAll('td')).slice(1, 5);
    const values = cells.map((c) => c.textContent.trim());
    return new Set(values).size > 1;
  }

  function applyComparisonFilter() {
    if (!compareTable) return;

    const groupRows = Array.from(compareTable.querySelectorAll('tbody tr.compare-group-row'));
    const featureRows = Array.from(compareTable.querySelectorAll('tbody tr.compare-row'));

    featureRows.forEach((row) => {
      const isBasic = row.getAttribute('data-group') === 'basic';
      const diffOk = !showDiffOnly || isRowDifferent(row);
      const collapseOk = !isBasic || basicExpanded;

      row.classList.toggle('is-hidden-diff', !diffOk);
      row.classList.toggle('is-collapsed-group', !collapseOk);
    });

    groupRows.forEach((groupRow) => {
      const groupId = groupRow.getAttribute('data-group-id');
      if (groupId === 'basic') {
        groupRow.hidden = showDiffOnly;
        return;
      }
      const matching = featureRows.filter((r) => r.getAttribute('data-group') === groupId);
      const hasVisible = matching.some(
        (r) => !r.classList.contains('is-hidden-diff') && !r.classList.contains('is-collapsed-group')
      );
      groupRow.hidden = !hasVisible;
    });

    if (basicGroupBtn) {
      basicGroupBtn.setAttribute('aria-expanded', String(basicExpanded));
      const stateEl = basicGroupBtn.querySelector('.compare-group-state');
      if (stateEl) {
        stateEl.textContent = basicExpanded ? '（クリックで閉じる）' : '（クリックで展開）';
      }
    }

    syncCompareToggleIndicator();
    renderMobileComparison();
  }

  function renderMobileComparison() {
    if (!compareTable || !mobileCompareBody || !mobileLeftSelect || !mobileRightSelect) return;

    const leftKey = mobileLeftSelect.value;
    const rightKey = mobileRightSelect.value;
    const leftMeta = EDITION_META[leftKey];
    const rightMeta = EDITION_META[rightKey];
    if (!leftMeta || !rightMeta) return;

    if (mobileThLeft) mobileThLeft.textContent = leftMeta.label;
    if (mobileThRight) mobileThRight.textContent = rightMeta.label;

    mobileCompareBody.innerHTML = '';

    const rows = Array.from(compareTable.querySelectorAll('tbody tr'));
    rows.forEach((tr) => {
      if (tr.classList.contains('compare-group-row')) {
        if (tr.hidden) return;
        const groupId = tr.getAttribute('data-group-id');
        const groupTr = document.createElement('tr');
        groupTr.className = 'compare-group-row';
        const td = document.createElement('td');
        td.colSpan = 3;

        if (groupId === 'basic') {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'compare-group-toggle-btn';
          btn.setAttribute('aria-expanded', String(basicExpanded));
          btn.textContent = basicExpanded
            ? '⑤ 基本ダイヤ編集機能（クリックで閉じる）'
            : '⑤ 基本ダイヤ編集機能（クリックで展開）';
          btn.addEventListener('click', () => {
            basicExpanded = !basicExpanded;
            applyComparisonFilter();
            if (basicExpanded) {
              trackEvent('exdia_compare_action', { action: 'basic_expand' });
            }
          });
          td.appendChild(btn);
        } else {
          td.textContent = tr.textContent.trim();
        }
        groupTr.appendChild(td);
        mobileCompareBody.appendChild(groupTr);
        return;
      }

      if (tr.classList.contains('is-collapsed-group')) return;

      const cells = Array.from(tr.querySelectorAll('td'));
      const leftCell = cells[leftMeta.colIndex];
      const rightCell = cells[rightMeta.colIndex];
      if (!leftCell || !rightCell) return;

      if (showDiffOnly && leftCell.textContent.trim() === rightCell.textContent.trim()) {
        return;
      }

      const rowEl = document.createElement('tr');
      const labelTd = document.createElement('td');
      labelTd.innerHTML = cells[0].innerHTML;

      const leftTd = document.createElement('td');
      leftTd.innerHTML = leftCell.innerHTML;

      const rightTd = document.createElement('td');
      rightTd.innerHTML = rightCell.innerHTML;

      rowEl.appendChild(labelTd);
      rowEl.appendChild(leftTd);
      rowEl.appendChild(rightTd);
      mobileCompareBody.appendChild(rowEl);
    });
  }

  if (filterAllBtn && filterDiffBtn) {
    filterAllBtn.addEventListener('click', () => {
      showDiffOnly = false;
      filterAllBtn.setAttribute('aria-pressed', 'true');
      filterDiffBtn.setAttribute('aria-pressed', 'false');
      applyComparisonFilter();
      trackEvent('exdia_compare_action', { action: 'filter_all' });
    });

    filterDiffBtn.addEventListener('click', () => {
      showDiffOnly = true;
      filterAllBtn.setAttribute('aria-pressed', 'false');
      filterDiffBtn.setAttribute('aria-pressed', 'true');
      applyComparisonFilter();
      trackEvent('exdia_compare_action', { action: 'filter_diff' });
    });
  }

  if (basicGroupBtn) {
    basicGroupBtn.addEventListener('click', () => {
      basicExpanded = !basicExpanded;
      applyComparisonFilter();
      if (basicExpanded) {
        trackEvent('exdia_compare_action', { action: 'basic_expand' });
      }
    });
  }

  if (mobileLeftSelect && mobileRightSelect) {
    const handleMobilePairChange = () => {
      renderMobileComparison();
      trackEvent('exdia_compare_action', {
        action: 'mobile_pair_change',
        value: `${mobileLeftSelect.value}_vs_${mobileRightSelect.value}`
      });
    };
    mobileLeftSelect.addEventListener('change', handleMobilePairChange);
    mobileRightSelect.addEventListener('change', handleMobilePairChange);
  }

  applyComparisonFilter();

  // -------------------------------------------------------------------------
  // 11. FAQ アコーディオンの滑らかな開閉（Web Animations API）＆ 計測
  // -------------------------------------------------------------------------
  document.querySelectorAll('.faq-item').forEach((details) => {
    details.addEventListener('toggle', () => {
      if (details.open) {
        trackEvent('exdia_faq_open', {
          faq_id: details.getAttribute('data-faq-id') || 'unknown'
        });
      }
    });
  });

  if (!prefersReducedMotion) {
    document.querySelectorAll('.faq-item').forEach((details) => {
      const summary = details.querySelector('.faq-summary');
      const answer = details.querySelector('.faq-answer');
      if (!summary || !answer) return;

      let anim = null;
      let isClosing = false;
      let isExpanding = false;

      summary.addEventListener('click', (e) => {
        e.preventDefault();
        details.style.overflow = 'hidden';

        if (isClosing || !details.open) {
          isExpanding = true;
          isClosing = false;
          const startHeight = `${details.offsetHeight}px`;
          details.open = true;
          window.requestAnimationFrame(() => {
            const endHeight = `${summary.offsetHeight + answer.offsetHeight}px`;
            if (anim) anim.cancel();
            anim = details.animate(
              { height: [startHeight, endHeight] },
              { duration: 300, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
            );
            anim.onfinish = () => {
              details.style.height = '';
              details.style.overflow = '';
              anim = null;
              isExpanding = false;
            };
            anim.oncancel = () => {
              isExpanding = false;
            };
          });
        } else if (isExpanding || details.open) {
          isClosing = true;
          isExpanding = false;
          const startHeight = `${details.offsetHeight}px`;
          const endHeight = `${summary.offsetHeight}px`;
          if (anim) anim.cancel();
          anim = details.animate(
            { height: [startHeight, endHeight] },
            { duration: 260, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
          );
          anim.onfinish = () => {
            details.open = false;
            details.style.height = '';
            details.style.overflow = '';
            anim = null;
            isClosing = false;
          };
          anim.oncancel = () => {
            isClosing = false;
          };
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // 12. 固定ヘッダーナビ スライディング・アンダーライン同期
  // -------------------------------------------------------------------------
  const headerNavIndicator = document.getElementById('header-nav-indicator');
  const navLinks = Array.from(document.querySelectorAll('.header-nav-link'));
  const navTargets = navLinks
    .map((link) => {
      const id = (link.getAttribute('href') || '').replace(/^#/, '');
      const el = id ? document.getElementById(id) : null;
      return el ? { link, el } : null;
    })
    .filter(Boolean);

  function syncActiveNav() {
    if (!navTargets.length) return;
    const threshold = window.scrollY + 130;
    let active = navTargets[0];
    for (const item of navTargets) {
      if (item.el.offsetTop <= threshold) {
        active = item;
      }
    }
    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 24) {
      active = navTargets[navTargets.length - 1];
    }
    navLinks.forEach((l) => l.classList.remove('is-active'));
    active.link.classList.add('is-active');
    moveIndicator(headerNavIndicator, active.link);
  }

  function syncAllIndicators() {
    syncActiveNav();
    syncViewerTabIndicator();
    syncCompareToggleIndicator();
  }

  window.addEventListener('scroll', syncActiveNav, { passive: true });
  window.addEventListener('resize', syncAllIndicators, { passive: true });
  window.addEventListener('load', syncAllIndicators);
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(syncAllIndicators);
  }
  // -------------------------------------------------------------------------
  // 13. 主要セクション読了計測 (exdia_section_view / 1ページ1回)
  // -------------------------------------------------------------------------
  const SECTION_VIEW_IDS = ['features', 'editions', 'custom', 'compare', 'requirements', 'closing'];
  const viewedSections = new Set();

  if ('IntersectionObserver' in window) {
    const sectionViewObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const id = entry.target.id;
          if (!id || viewedSections.has(id)) return;
          viewedSections.add(id);
          sectionViewObserver.unobserve(entry.target);
          trackEvent('exdia_section_view', { section_id: id });
        });
      },
      { threshold: 0.25 }
    );

    SECTION_VIEW_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        sectionViewObserver.observe(el);
      }
    });
  }

  syncAllIndicators();
})();
