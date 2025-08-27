// Minimal starter script for CryptoVault template
(function () {
  // Footer year
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // Initialize Lucide icons when library is available
  function initIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    } else {
      // Retry shortly if script not yet loaded
      setTimeout(initIcons, 50);
    }
  }
  initIcons();

  // Simple hash router: show one [data-page] at a time, default to trading
  const pages = Array.from(document.querySelectorAll('[data-page]'));
  const navLinks = Array.from(document.querySelectorAll('[data-route]'));

  function setRoute(hash) {
    const page = (hash || '#/trading').replace('#/', '') || 'trading';
    pages.forEach(sec => { sec.hidden = sec.getAttribute('data-page') !== page; });
    navLinks.forEach(a => {
      const target = (a.getAttribute('href') || '').replace('#/', '');
      const isActive = target === page;
      a.classList.toggle('text-white', isActive);
      a.classList.toggle('text-white/70', !isActive);
      if (a.classList.contains('px-4')) {
        // Special styling for the first pill link
        a.classList.toggle('bg-white/10', isActive);
      }
    });
    // Rebuild icons in newly-shown section
    initIcons();
  }

  window.addEventListener('hashchange', () => setRoute(location.hash));
  setRoute(location.hash);
})();
