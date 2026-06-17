(() => {
  if (window.__NEIGHBOR_ROUTE__ || document.body?.dataset.routeId) {
    return;
  }

  const tags = Array.from(document.querySelectorAll('#skill-tags .skill-tag'));
  const counter = document.getElementById('skill-count');

  if (!tags.length || !counter) {
    return;
  }

  const updateCounter = () => {
    const count = tags.filter((tag) => tag.classList.contains('selected')).length;
    counter.textContent = /\d+/.test(counter.textContent)
      ? counter.textContent.replace(/\d+/, String(count))
      : String(count);
  };

  tags.forEach((tag) => {
    tag.addEventListener('click', () => {
      tag.classList.toggle('selected');
      updateCounter();
    });
  });

  updateCounter();
})();
