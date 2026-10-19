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
    document.documentElement.removeAttribute('data-tab'); // 처음 표시(html[data-tab], index.html 머리 스크립트)를 거두고 hidden 속성으로만 보여 줌
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
    // 새로고침해도 보던 탭이 열리게 주소 끝에 탭을 적어 둠(#compare, #so). ① 은 주소를 깨끗하게 둠. 방문 기록은 늘리지 않음
    try { history.replaceState(null, '', i === 0 ? location.pathname + location.search : '#' + TABS[i].key); } catch (e) { /* 주소를 못 바꾸는 환경이면 그냥 둠 */ }
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

  // 처음 열 탭: 주소의 #compare / #so (예전 주소 #wind 도 받음) → 주소가 비었으면 지난번 탭 → 첫 탭. 없는 탭이면 첫 탭.
  // index.html 머리 스크립트와 같은 순서로 고른다. app.js 는 마지막 스크립트라 여기서 모든 탭 스크립트를 이미 읽은 상태이므로
  // DOMContentLoaded 를 기다리지 않고 바로 탭 버튼과 같은 select 로 연다(그 사이 ① 이 그려질 틈을 만들지 않음).
  var first = 0, want = (location.hash || '').replace('#', '');
  if (!want) { try { want = localStorage.getItem('enso-lab-tab') || ''; } catch (e) { want = ''; } }
  TABS.forEach(function (t, i) { if (t.key === want) first = i; });
  TABS.forEach(function (t, i) { if (i !== first) t.mod.hide(); });
  select(first);
  // 제목을 누르면 처음 화면으로: ① 무역풍 실험 탭 · 맨 위 (각 탭의 슬라이더·보기 설정·③ 그래프 위치는 그대로 둠)
  function goHome() {
    if (active !== 0) select(0);
    window.scrollTo(0, 0); document.body.scrollTop = 0;   // 좁은 화면에서 스크롤한 경우 맨 위로
  }
  document.getElementById('homeLink').addEventListener('click', function (e) { e.preventDefault(); goHome(); });
  window.addEventListener('hashchange', function () {
    var h = (location.hash || '').replace('#', '') || 'wind';   // 주소의 # 뒤가 비면 ①
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
