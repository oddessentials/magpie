const links = [...document.querySelectorAll('[data-view]')];
const panels = [...document.querySelectorAll('.tour-panel')];

function showView() {
  const requested = window.location.hash.slice(1);
  const selected = panels.some((panel) => panel.id === requested) ? requested : 'today';
  for (const panel of panels) panel.hidden = panel.id !== selected;
  for (const link of links) {
    if (link.dataset.view === selected) link.setAttribute('aria-current', 'true');
    else link.removeAttribute('aria-current');
  }
}

for (const link of links) {
  link.addEventListener('click', (event) => {
    event.preventDefault();
    if (window.location.hash !== link.hash) history.pushState(null, '', link.hash);
    showView();
  });
}
window.addEventListener('popstate', showView);
window.addEventListener('hashchange', showView);
showView();
