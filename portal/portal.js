(() => {
  'use strict';

  const prefersReduced =
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 1. Progressive reveal via IntersectionObserver
  const revealNodes = Array.from(document.querySelectorAll('[data-reveal]'));
  if (!prefersReduced && 'IntersectionObserver' in window) {
    revealNodes.forEach((node) => {
      const delay = node.getAttribute('data-reveal-delay');
      if (delay) {
        node.style.setProperty('--reveal-delay', `${delay}ms`);
      }
    });

    const revealObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -24px 0px' }
    );

    requestAnimationFrame(() => {
      revealNodes.forEach((node) => {
        const rect = node.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.95) {
          node.classList.add('is-revealed');
        } else {
          revealObserver.observe(node);
        }
      });
    });
  } else {
    revealNodes.forEach((node) => node.classList.add('is-revealed'));
  }

  // 2. Top scroll progress rail (compositor scaleX)
  const railFill = document.getElementById('scroll-rail-fill');
  let rafId = 0;

  function updateScrollRail() {
    rafId = 0;
    if (!railFill) return;
    const doc = document.documentElement;
    const maxScroll = doc.scrollHeight - window.innerHeight;
    const ratio = maxScroll > 0 ? Math.min(1, Math.max(0, window.scrollY / maxScroll)) : 0;
    railFill.style.transform = `scaleX(${ratio.toFixed(4)})`;
  }

  window.addEventListener(
    'scroll',
    () => {
      if (!rafId) {
        rafId = window.requestAnimationFrame(updateScrollRail);
      }
    },
    { passive: true }
  );
  updateScrollRail();

  // 3. Sliding active-section indicator in top navigation
  const nav = document.getElementById('topbar-nav');
  const indicator = document.getElementById('topbar-indicator');
  const navLinks = nav ? Array.from(nav.querySelectorAll('.topbar-link')) : [];
  const sectionTargets = navLinks
    .map((link) => {
      const id = link.getAttribute('href')?.replace(/^#/, '');
      const el = id ? document.getElementById(id) : null;
      return el ? { link, el } : null;
    })
    .filter(Boolean);

  function moveIndicator(activeLink) {
    if (!nav || !indicator || !activeLink) return;
    const navRect = nav.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    const left = linkRect.left - navRect.left;
    indicator.style.width = `${linkRect.width}px`;
    indicator.style.transform = `translateX(${left}px)`;
    indicator.style.opacity = '1';
  }

  function syncActiveNav() {
    if (!sectionTargets.length) return;
    const threshold = window.scrollY + 120;
    let current = sectionTargets[0];

    for (const item of sectionTargets) {
      if (item.el.offsetTop <= threshold) {
        current = item;
      }
    }

    if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 24) {
      current = sectionTargets[sectionTargets.length - 1];
    }

    navLinks.forEach((l) => l.classList.remove('is-active'));
    current.link.classList.add('is-active');
    moveIndicator(current.link);
  }

  window.addEventListener('scroll', syncActiveNav, { passive: true });
  window.addEventListener('resize', syncActiveNav, { passive: true });
  window.addEventListener('load', syncActiveNav);
  syncActiveNav();

  // 4. ExDia CTA click tracking (GA4: G-0GM4B0FTW9)
  document.querySelectorAll('[data-exdia-cta]').forEach((el) => {
    el.addEventListener('click', () => {
      if (typeof window.gtag !== 'function') return;
      window.gtag('event', 'exdia_cta_click', {
        source_app: el.getAttribute('data-cta-source') || 'portal',
        placement: el.getAttribute('data-cta-placement') || 'unknown',
        destination: el.getAttribute('data-cta-destination') || 'unknown',
        link_url: el.href || el.getAttribute('href') || '',
        transport_type: 'beacon'
      });
    });
  });
})();
