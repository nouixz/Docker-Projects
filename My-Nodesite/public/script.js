// Small interactivity to enhance the glass feel
(function () {
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Parallax tilt effect on stacked cards
  const cards = document.querySelectorAll('.tilt');
  const constrain = 12;
  function transform(x, y, rect) {
    const calcX = (y - rect.top - rect.height / 2) / constrain;
    const calcY = (x - rect.left - rect.width / 2) / constrain;
    return `perspective(900px) rotateX(${calcX}deg) rotateY(${calcY}deg)`;
  }
  function addTilt(card) {
    let raf = null;
    function onMove(e) {
      const p = e.touches ? e.touches[0] : e;
      const rect = card.getBoundingClientRect();
      const t = transform(p.clientX, p.clientY, rect);
      if (!raf) {
        raf = requestAnimationFrame(() => {
          card.style.transform = t;
          raf = null;
        });
      }
    }
    function reset() {
      card.style.transform = '';
    }
    card.addEventListener('mousemove', onMove);
    card.addEventListener('mouseleave', reset);
    card.addEventListener('touchstart', onMove, { passive: true });
    card.addEventListener('touchmove', onMove, { passive: true });
    card.addEventListener('touchend', reset);
  }
  cards.forEach(addTilt);
})();
