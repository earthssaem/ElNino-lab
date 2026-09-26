/* 탭 전환, 화면 갱신 루프, 테마 변화 감지 */
(function () {
  'use strict';
  var D = window.ENSODraw;
  var TABS = [
    { key: 'wind', btn: 'tabbtn-wind', panel: 'tab-wind', mod: window.TabWind },
    { key: 'compare', btn: 'tabbtn-compare', panel: 'tab-compare', mod: window.TabCompare },
    { key: 'so', btn: 'tabbtn-so', panel: 'tab-so', mod: window.TabSO }
  ];
  var active = 0;
  var reduced = false;
  try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* 무시 */ }

  TABS.forEach(function (t) { t.mod.init({ reducedMotion: reduced }); });

  function select(i, focus) {
    TABS.forEach(function (t, k) {
      var on = k === i;
      var b = document.getElementById(t.btn);
      b.setAttribute('aria-selected', on);
      b.tabIndex = on ? 0 : -1;
      document.getElementById(t.panel).hidden = !on;
      if (!on && k === active && k !== i) t.mod.hide();
    });
    active = i;
    TABS[i].mod.show();
    if (focus) document.getElementById(TABS[i].btn).focus();
    try { localStorage.setItem('enso-lab-tab', TABS[i].key); } catch (e) { /* 저장 불가 */ }
    try { history.replaceState(null, '', '#' + TABS[i].key); } catch (e) { /* 무시 */ }
  }

  TABS.forEach(function (t, i) {
    var b = document.getElementById(t.btn);
    b.addEventListener('click', function () { select(i); });
    b.addEventListener('keydown', function (e) {
      var n = null;
      if (e.key === 'ArrowRight') n = (i + 1) % TABS.length;
      else if (e.key === 'ArrowLeft') n = (i + TABS.length - 1) % TABS.length;
      else if (e.key === 'Home') n = 0;
      else if (e.key === 'End') n = TABS.length - 1;
      if (n != null) { e.preventDefault(); select(n, true); }
    });
  });

  // 처음 열 탭: 주소의 #wind / #compare / #so → 지난번 탭 → 첫 탭
  var first = 0, want = (location.hash || '').replace('#', '');
  if (!want) { try { want = localStorage.getItem('enso-lab-tab') || ''; } catch (e) { want = ''; } }
  TABS.forEach(function (t, i) { if (t.key === want) first = i; });
  TABS.forEach(function (t, i) { if (i !== first) t.mod.hide(); });
  select(first);
  window.addEventListener('hashchange', function () {
    var h = (location.hash || '').replace('#', '');
    TABS.forEach(function (t, i) { if (t.key === h && i !== active) select(i); });
  });

  // 테마(밝게/어둡게)가 바뀌면 색을 다시 읽는다
  function themeChanged() {
    D.invalidateTheme();
    TABS.forEach(function (t) { t.mod.redraw(); });
  }
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', themeChanged); } catch (e) { /* 무시 */ }
  if (window.MutationObserver) {
    new MutationObserver(themeChanged).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(themeChanged);

  var last = performance.now();
  function loop(now) {
    var dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    TABS[active].mod.frame(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
