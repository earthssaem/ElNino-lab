/* 엘니뇨·라니냐 탐구실 공통: 과목 선택 상태와 학습 방법 사이 이동 (window.LAB)
 * - 과목: integrated(통합과학) | earth(지구과학). 주소에 ?subject= 가 있으면 그 값을 쓰고 저장하며,
 *   없으면 이 브라우저의 localStorage('enso-lab-subject')를 쓴다. 과목은 어디로도 보내지 않는다.
 * - <head> 에서 읽히자마자 <html data-subject="…"> 를 붙인다. 각 페이지는 이 속성(css)과
 *   window 의 'lab:subject' 이벤트(js, detail.subject)로 과목별 내용을 바꾼다. 과목을 바꿔도 페이지는 그대로 머문다.
 * - <html data-lab="story|sim|data"> 인 학습 페이지에는 맨 위에 탐구실 막대(학습 메뉴 · 학습 방법 · 과목)를 붙인다.
 * - 학습 페이지는 탐구실 첫 화면(저장소 루트 index.html)의 한 단계 아래 폴더에 있다.
 */
(function () {
  'use strict';
  var KEY = 'enso-lab-subject';
  var SUBJECTS = {
    integrated: { id: 'integrated', name: '통합과학' },
    earth: { id: 'earth', name: '지구과학' }
  };
  var METHODS = [
    { id: 'story', name: '대화형 학습', short: '대화형', path: 'story/' },
    { id: 'sim', name: '개념 시뮬레이션', short: '시뮬레이션', path: 'simulation/' },
    { id: 'data', name: '실측자료 탐구', short: '실측자료', path: 'observatory/' }
  ];
  var ICON = {
    story: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H11l-4.5 4v-4h0A2.5 2.5 0 0 1 4 13.5z"/><path d="M8 8.5h8M8 11.5h5"/>',
    sim: '<path d="M3 7h18M3 12h18M3 17h18"/><circle cx="8" cy="7" r="2" fill="currentColor"/><circle cx="15" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="17" r="2" fill="currentColor"/>',
    data: '<path d="M4 4v16h16"/><path d="M7 15l4-5 3 3 5-7"/>',
    home: '<path d="M4 11l8-7 8 7"/><path d="M6 10v10h12V10"/>'
  };
  var root = document.documentElement;
  var page = root.getAttribute('data-lab');      // 학습 페이지면 story | sim | data, 첫 화면이면 null
  var BASE = page ? '../' : '';
  var listeners = [];

  function valid(s) { return s === 'integrated' || s === 'earth'; }
  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&#]*)').exec(location.search);
    return m ? decodeURIComponent(m[1]) : null;
  }
  function load() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function save(s) { try { localStorage.setItem(KEY, s); } catch (e) { /* 저장할 수 없는 환경: 이 페이지에서만 기억 */ } }

  var current = null, fromUrl = param('subject');
  if (valid(fromUrl)) { current = fromUrl; save(fromUrl); } else if (valid(load())) current = load();
  if (current) root.setAttribute('data-subject', current);

  // 주소에 ?subject= 가 있으면 지금 과목으로 고쳐 둔다(새로고침해도 바꾼 과목이 유지되게)
  function syncUrl() {
    if (!/[?&]subject=/.test(location.search)) return;
    var q = location.search.replace(/([?&]subject=)[^&#]*/, '$1' + current);
    try { history.replaceState(history.state, '', location.pathname + q + location.hash); } catch (e) { /* 그냥 둠 */ }
  }

  function method(id) { for (var i = 0; i < METHODS.length; i++) if (METHODS[i].id === id) return METHODS[i]; return null; }
  function withSubject(url, s) { return s ? url + (url.indexOf('?') < 0 ? '?' : '&') + 'subject=' + s : url; }

  var LAB = {
    SUBJECTS: SUBJECTS,
    METHODS: METHODS,
    page: page,
    valid: valid,
    param: param,
    get: function () { return current; },
    name: function (s) { return SUBJECTS[s] ? SUBJECTS[s].name : ''; },
    // 학습 방법 페이지 주소 (과목을 주소에도 실어 localStorage 를 못 쓰는 환경에서도 이어지게)
    url: function (id, s) { var m = method(id); return m ? withSubject(BASE + m.path, s === undefined ? current : s) : BASE; },
    // 탐구실 첫 화면(과목이 있으면 학습 메뉴, 없으면 과목 선택)
    homeUrl: function (s) { return withSubject(BASE || './', s === undefined ? current : s); },
    set: function (s) {
      if (!valid(s)) return;
      var changed = s !== current;
      current = s;
      save(s);
      root.setAttribute('data-subject', s);
      syncUrl();
      if (bar) renderBar();
      if (!changed) return;
      listeners.forEach(function (fn) { try { fn(s); } catch (e) { /* 다른 구독자는 계속 */ } });
      var ev;
      try { ev = new CustomEvent('lab:subject', { detail: { subject: s } }); } catch (e) { ev = document.createEvent('CustomEvent'); ev.initCustomEvent('lab:subject', false, false, { subject: s }); }
      window.dispatchEvent(ev);
    },
    onChange: function (fn) { listeners.push(fn); },
    icon: function (id) { return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + (ICON[id] || '') + '</svg>'; }
  };

  /* ── 탐구실 막대 (학습 페이지 맨 위) ─────────────── */
  var bar = null;
  function renderBar() {
    var m = method(page), s = current;
    bar.innerHTML =
      '<div class="labbar-in">' +
        '<a class="lb-home" href="' + LAB.homeUrl() + '">' + LAB.icon('home') +
          '<span class="lb-name">엘니뇨·라니냐 탐구실</span><span class="lb-menu">학습 메뉴</span></a>' +
        '<div class="lb-right">' +
          '<div class="lb-dd">' +
            '<button type="button" class="lb-btn" id="lb-m-btn" aria-haspopup="true" aria-expanded="false" aria-controls="lb-m-pop" aria-label="학습 방법: ' + m.name + ' (바꾸기)">' +
              LAB.icon(page) + '<span class="lb-long">' + m.name + '</span><span class="lb-short">' + m.short + '</span><span class="lb-caret" aria-hidden="true">▾</span></button>' +
            '<div class="lb-pop" id="lb-m-pop" role="menu" aria-label="학습 방법 바꾸기" hidden>' +
              METHODS.map(function (q) {
                var here = q.id === page;
                return '<a class="lb-item' + (here ? ' here' : '') + '" role="menuitem" href="' + LAB.url(q.id) + '"' + (here ? ' aria-current="page"' : '') + '>' +
                  LAB.icon(q.id) + '<span>' + q.name + '</span>' + (here ? '<small>지금 보는 중</small>' : '') + '</a>';
              }).join('') +
            '</div>' +
          '</div>' +
          '<div class="lb-dd">' +
            '<button type="button" class="lb-btn lb-subj' + (s ? '' : ' none') + '" id="lb-s-btn" aria-haspopup="true" aria-expanded="false" aria-controls="lb-s-pop"' +
              ' aria-label="과목: ' + (s ? LAB.name(s) : '선택 안 함') + ' (바꾸기)">' +
              '<span>' + (s ? LAB.name(s) : '과목 선택') + '</span><span class="lb-caret" aria-hidden="true">▾</span></button>' +
            '<div class="lb-pop right" id="lb-s-pop" role="menu" aria-label="과목 바꾸기" hidden>' +
              ['integrated', 'earth'].map(function (k) {
                return '<button type="button" class="lb-item" role="menuitemradio" aria-checked="' + (k === s) + '" data-s="' + k + '">' +
                  '<span class="lb-dot" aria-hidden="true"></span><span>' + LAB.name(k) + '</span></button>';
              }).join('') +
              '<p class="lb-note">과목을 바꿔도 지금 화면에 그대로 있어요.</p>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }
  function popOf(btn) { return document.getElementById(btn.getAttribute('aria-controls')); }
  function closeAll(except) {
    Array.prototype.forEach.call(bar.querySelectorAll('.lb-btn'), function (b) {
      if (b === except) return;
      b.setAttribute('aria-expanded', 'false');
      popOf(b).hidden = true;
    });
  }
  function items(pop) { return Array.prototype.slice.call(pop.querySelectorAll('.lb-item')); }
  function mountBar() {
    if (!page || !method(page) || bar) return;
    bar = document.createElement('nav');
    bar.className = 'labbar';
    bar.setAttribute('aria-label', '엘니뇨·라니냐 탐구실');
    renderBar();
    document.body.insertBefore(bar, document.body.firstChild);
    bar.addEventListener('click', function (e) {
      var b = e.target.closest('.lb-btn');
      if (b) {
        var open = b.getAttribute('aria-expanded') !== 'true';
        closeAll(b);
        b.setAttribute('aria-expanded', open);
        popOf(b).hidden = !open;
        return;
      }
      var it = e.target.closest('.lb-item[data-s]');
      if (it) {
        LAB.set(it.getAttribute('data-s'));
        var sb = document.getElementById('lb-s-btn');
        if (sb) sb.focus();
      }
    });
    bar.addEventListener('keydown', function (e) {
      var pop = e.target.closest('.lb-pop'), btn = e.target.closest('.lb-btn');
      if (e.key === 'Escape') {
        var open = bar.querySelector('.lb-btn[aria-expanded="true"]');
        if (open) { e.preventDefault(); closeAll(); open.focus(); }
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      if (btn) {   // 단추에서 ↓: 메뉴를 열고 첫 항목으로
        e.preventDefault();
        closeAll(btn);
        btn.setAttribute('aria-expanded', 'true');
        popOf(btn).hidden = false;
        items(popOf(btn))[0].focus();
      } else if (pop) {
        e.preventDefault();
        var list = items(pop), i = list.indexOf(document.activeElement);
        list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length].focus();
      }
    });
    document.addEventListener('click', function (e) { if (!bar.contains(e.target)) closeAll(); });
  }
  if (page) {
    if (document.body) mountBar();
    else document.addEventListener('DOMContentLoaded', mountBar);
  }

  window.LAB = LAB;
})();
