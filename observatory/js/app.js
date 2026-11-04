/* 화면 상태와 조작 (엘니뇨 실측자료 탐구실)
   모든 패널(지도·바람·단면·등온선·관측값·시계열)은 같은 연·월(state.ym)의 자료로 함께 갱신된다. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var DEFAULT = { caseId: '2023', ym: '2023-12' };
  var state = {
    caseId: DEFAULT.caseId, ym: DEFAULT.ym,
    layer: 'sst', mapMode: 'value', arrows: true,
    secMode: 'value', iso: true,
    col: null, click: null, clickDepth: null,
    compare: false, A: null, B: null,
    regionId: 'central', windMode: 'value',
    playing: false
  };
  var maps = [], secs = [], series = null, timer = null;

  /* ---------- 공통 ---------- */
  function caseMonths() { return OBS.caseInfo(state.caseId).months; }
  function viewMonths() { return state.compare ? [state.A, state.B] : [state.ym]; }
  function region() {
    var r = OBS.meta.regions.wind;
    for (var i = 0; i < r.length; i++) if (r[i].id === state.regionId) return r[i];
    return r[0];
  }
  function ensure(months) {
    var ids = {};
    months.forEach(function (m) { ids[OBS.caseOf(m)] = true; });
    return Promise.all(Object.keys(ids).map(OBS.loadCase));
  }
  function setRadio(group, attr, val) {
    document.querySelectorAll('[data-' + attr + ']').forEach(function (b) {
      if (group && !group.contains(b)) return;
      b.setAttribute('aria-checked', b.getAttribute('data-' + attr) === val ? 'true' : 'false');
    });
  }

  /* ---------- 보기(지도·단면 캔버스) 만들기 ---------- */
  function buildViews() {
    var mv = $('mapViews'), sv = $('secViews');
    mv.innerHTML = ''; sv.innerHTML = '';
    maps = []; secs = [];
    var tags = state.compare ? ['A', 'B'] : [null];
    mv.className = sv.className = 'views' + (state.compare ? ' two' : '');
    tags.forEach(function (tag) {
      [['map', mv], ['sec', sv]].forEach(function (pair) {
        var box = document.createElement('div');
        box.className = 'view';
        if (tag) {
          var t = document.createElement('div');
          t.className = 'view-tag';
          t.innerHTML = '<b>' + tag + '</b> <span></span>';
          box.appendChild(t);
        }
        var holder = document.createElement('div');
        holder.className = 'cv';
        var cv = document.createElement('canvas');
        cv.setAttribute('role', 'img');
        cv.tabIndex = 0;
        holder.appendChild(cv);
        box.appendChild(holder);
        pair[1].appendChild(box);
        if (pair[0] === 'map') {
          var r = OBSMap.create(cv);
          cv.addEventListener('click', function (e) { onMapClick(r, e); });
          cv.addEventListener('keydown', function (e) { onMapKey(e); });
          maps.push(r);
        } else {
          var s = OBSSection.create(cv, state.compare ? { ratio: 0.42, minH: 180, maxH: 330 } : { ratio: 0.33, minH: 200, maxH: 440 });
          cv.addEventListener('click', function (e) { onSecClick(s, e); });
          cv.addEventListener('keydown', onSecKey);
          secs.push(s);
        }
      });
    });
  }

  /* ---------- 그리기 ---------- */
  function drawAll() {
    if (!OBS.meta) return;
    var months = viewMonths();
    var g = OBS.meta.grids.section;
    var probeLon = state.col === null ? null : g.lon[state.col];
    var reg = $('seriesFold').open ? region() : null;
    months.forEach(function (ym, i) {
      maps[i].draw({ ym: ym, layer: state.layer, mode: state.mapMode, arrows: state.arrows, probeLon: probeLon, click: state.click, region: reg });
      var probe = null;
      if (state.col !== null) {
        probe = { cur: OBS.isoLine(OBS.value('section', ym))[state.col], clim: OBS.isoLine(OBS.climOf('section', ym))[state.col] };
      }
      secs[i].draw({ ym: ym, mode: state.secMode, iso: state.iso, probeLon: probeLon, probe: probe });
      labelCanvas(maps[i].canvas, secs[i].canvas, ym, probe);
      var tags = document.querySelectorAll('.view-tag span');
      if (state.compare) { tags[i].textContent = OBS.fmtMonth(ym); tags[i + 2].textContent = OBS.fmtMonth(ym); }
    });
    drawLegends();
    updateTimebar();
    sliderYears();
    updateReadouts();
    if ($('seriesFold').open) drawSeries();
  }

  function labelCanvas(mc, sc, ym, probe) {
    var lay = state.layer === 'sst' ? '해수면 온도' : '강수량';
    mc.setAttribute('aria-label', OBS.fmtMonth(ym) + ' 태평양 ' + lay + (state.mapMode === 'anom' ? ' 평년 편차' : '') + ' 지도' +
      (state.arrows ? ', 10 m 바람 화살표 표시' : '') + '. 누르면 그 위치의 관측값을 보여 줍니다.');
    var t = OBS.fmtMonth(ym) + ' 적도 태평양(2°S~2°N 평균) ' + (state.secMode === 'anom' ? '수온 편차' : '수온') + ' 단면';
    if (probe) t += ', ' + OBS.fmtLon(OBS.meta.grids.section.lon[state.col]) + ' 20 ℃ 등온선 ' + depthText(probe.cur) + ', 평년 ' + depthText(probe.clim);
    sc.setAttribute('aria-label', t + '. 누르거나 ←/→ 키로 경도를 고릅니다.');
  }

  function drawLegends() {
    var key = state.layer + (state.mapMode === 'anom' ? 'A' : '');
    OBSColor.legend($('mapLegend'), key);
    OBSColor.legend($('secLegend'), state.secMode === 'anom' ? 'secA' : 'sec');
    $('isoLegend').hidden = !state.iso;
    var al = $('arrowLegend');
    al.hidden = !state.arrows;
    if (state.arrows && maps[0]) {
      var px = maps[0].pxPerMs() * 5;
      al.innerHTML = '<svg width="' + Math.round(px + 12) + '" height="14" aria-hidden="true"><path d="M2 7H' + (px + 2).toFixed(1) +
        'M' + (px + 2).toFixed(1) + ' 7l-5-3M' + (px + 2).toFixed(1) + ' 7l-5 3" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg>' +
        '<span>5 m/s</span>';
      al.setAttribute('aria-label', '바람 화살표 길이 범례: 이 길이가 풍속 5 m/s');
    }
    var notes = {
      sst: 'NOAA ERSST v5 · 2° 격자 칸을 그대로 칠함',
      precip: 'GPCP v2.3 · 2.5° 격자 칸 · mm/일 × 그 달 일수 = mm/월'
    };
    var n = notes[state.layer] + (state.mapMode === 'anom' ? ' · 편차 = 그 달 − 같은 달 1991~2020 평년' : '') + ' · 양 끝 칸은 범위 밖 값 포함';
    if (state.arrows) n += ' · 화살표: NCEP/NCAR R1 10 m 바람 격자점 값(' + (maps[0] ? maps[0].step() : 3) + '점마다 하나), 바람이 향하는 방향';
    n += ' · 점선 띠: 단면 영역(2°S~2°N), 점선 상자: Niño 3.4 감시 구역';
    $('mapNote').textContent = n;
    $('mapSub').textContent = (state.layer === 'sst' ? '해수면 온도' : '강수량') + (state.mapMode === 'anom' ? ' 평년 편차' : '') + ' · 30°S~30°N';
  }

  function updateTimebar() {
    var ms = caseMonths(), i = ms.indexOf(state.ym);
    var sl = $('timeSlider');
    sl.max = ms.length - 1; sl.value = i;
    sl.setAttribute('aria-valuetext', OBS.fmtMonth(state.ym));
    $('nowMonth').textContent = OBS.fmtMonth(state.ym);
    var si = OBS.series.months.indexOf(state.ym), a = OBS.series.nino34.anom[si];
    $('nowSub').textContent = 'Niño 3.4 해수면 온도 편차 ' + (a === null ? '자료 없음' : OBS.sign(a, 2) + ' °C');
    $('prevBtn').disabled = i <= 0;
    $('nextBtn').disabled = i >= ms.length - 1;
    document.querySelectorAll('#caseGroup button').forEach(function (b) {
      b.setAttribute('aria-checked', b.getAttribute('data-case') === state.caseId ? 'true' : 'false');
      b.tabIndex = b.getAttribute('data-case') === state.caseId ? 0 : -1;
    });
  }

  function drawSeries() {
    if (!series) series = OBSSeries.create($('seriesBox'), function (ym) { stop(); goMonth(ym); });
    var ym = state.compare ? state.B : state.ym;
    var info = OBS.caseInfo(OBS.caseOf(ym));
    series.draw({ months: info.months, ym: ym, region: region(), windMode: state.windMode });
  }

  /* ---------- 관측값 ---------- */
  function depthText(z) { return z !== z ? '측정 불가' : Math.round(z) + ' m'; }

  function mapValues(ym, lon, lat) {
    var out = [], G = OBS.meta.grids;
    [['sst', '해수면 온도', 'ERSST', '°C', 2], ['precip', '강수량', 'GPCP', 'mm/월', 0]].forEach(function (d) {
      var g = G[d[0]], i = OBS.cellIndex(g.lon, lon), j = OBS.cellIndex(g.lat, lat), txt;
      if (i < 0 || j < 0) txt = '<span class="na">격자 범위 밖</span>';
      else {
        var k = j * g.lon.length + i, v = OBS.value(d[0], ym)[k], a = OBS.anom(d[0], ym)[k];
        var cell = ' <span class="grid">(' + d[2] + ' 격자 ' + OBS.fmtLat(g.lat[j]) + ' ' + OBS.fmtLon(g.lon[i]) + ')</span>';
        txt = v !== v ? '<span class="na">자료 없음(육지)</span>' + cell :
          '<b>' + OBS.num(v, d[4] === 0 ? 0 : 1) + ' ' + d[3] + '</b>, 편차 ' + (a !== a ? '자료 없음' : '<b>' + OBS.sign(a, d[4] === 0 ? 0 : 1) + '</b>') + cell;
      }
      out.push('<span class="rk">' + d[1] + '</span> ' + txt);
    });
    var wg = G.wind, wi = OBS.nearest(wg.lon, lon), wj = OBS.nearest(wg.lat, lat), wt;
    if (Math.abs(wg.lon[wi] - lon) > 1.0 || Math.abs(wg.lat[wj] - lat) > 1.0) wt = '<span class="na">격자 범위 밖</span>';
    else {
      var kk = wj * wg.lon.length + wi, u = OBS.value('u', ym)[kk], v = OBS.value('v', ym)[kk];
      if (u !== u || v !== v) wt = '<span class="na">자료 없음</span>';
      else {
        var sp = Math.sqrt(u * u + v * v), f = OBS.windFrom(u, v);
        wt = '<b>' + f.name + ' ' + sp.toFixed(1) + ' m/s</b> (불어오는 방향 ' + Math.round(f.deg) + '°, u ' + OBS.num(u, 1) + ', v ' + OBS.num(v, 1) + ')' +
          ' <span class="grid">(R1 격자점 ' + OBS.fmtLat(wg.lat[wj]) + ' ' + OBS.fmtLon(wg.lon[wi]) + ')</span>';
      }
    }
    out.push('<span class="rk">바람</span> ' + wt);
    return out;
  }

  function secValues(ym) {
    var g = OBS.meta.grids.section, c = state.col;
    var cur = OBS.isoLine(OBS.value('section', ym))[c], cl = OBS.isoLine(OBS.climOf('section', ym))[c];
    var diff = cur - cl, out = [];
    var d = (cur === cur && cl === cl) ? ' · 차이 <b>' + OBS.sign(diff, 0) + ' m</b> (' + (Math.abs(diff) < 0.5 ? '같음' : diff > 0 ? '평년보다 깊음' : '평년보다 얕음') + ')' : ' · 차이 측정 불가';
    out.push('<span class="rk">20 ℃ 등온선</span> 그 달 <b>' + depthText(cur) + '</b> · 같은 달 평년 <b>' + depthText(cl) + '</b>' + d);
    if (state.clickDepth !== null) {
      var k = OBS.nearest(g.depth, state.clickDepth), n = g.lon.length;
      var v = OBS.value('section', ym)[k * n + c], a = OBS.anom('section', ym)[k * n + c];
      out.push('<span class="rk">누른 곳</span> 가장 가까운 자료 층 ' + Math.round(g.depth[k]) + ' m: ' +
        (v !== v ? '<span class="na">자료 없음</span>' : '<b>' + v.toFixed(1) + ' °C</b>, 편차 ' + (a !== a ? '자료 없음' : '<b>' + OBS.sign(a, 1) + ' °C</b>')));
    }
    return { html: out, cur: cur };
  }

  function updateReadouts() {
    var months = viewMonths();
    if (state.click) {
      var h = '<div class="ro-head">' + OBS.fmtLat(state.click.lat) + ', ' + OBS.fmtLon(state.click.lon) + '</div>';
      months.forEach(function (ym, i) {
        h += '<div class="ro-row">' + (state.compare ? '<span class="ro-tag">' + 'AB'[i] + '</span>' : '') + '<span class="ro-month">' + OBS.fmtMonth(ym) + '</span> ' +
          mapValues(ym, state.click.lon, state.click.lat).join('<span class="sep"> · </span>') + '</div>';
      });
      $('mapReadout').innerHTML = h;
    }
    if (state.col !== null) {
      var g = OBS.meta.grids.section;
      var hh = '<div class="ro-head">' + OBS.fmtLon(g.lon[state.col]) + ' <span class="grid">(GODAS 경도 격자, 2°S~2°N 평균)</span></div>', curs = [];
      months.forEach(function (ym, i) {
        var r = secValues(ym);
        curs.push(r.cur);
        hh += '<div class="ro-row">' + (state.compare ? '<span class="ro-tag">' + 'AB'[i] + '</span>' : '') + '<span class="ro-month">' + OBS.fmtMonth(ym) + '</span> ' + r.html.join('<span class="sep"> · </span>') + '</div>';
      });
      if (state.compare) {
        var dd = curs[1] - curs[0];
        hh += '<div class="ro-row"><span class="ro-tag">B−A</span> 20 ℃ 등온선 깊이 차이 <b>' + (dd === dd ? OBS.sign(dd, 0) + ' m' : '측정 불가') + '</b></div>';
      }
      $('secReadout').innerHTML = hh;
    }
  }

  /* ---------- 조작 ---------- */
  function goMonth(ym) {
    if (!OBS.caseOf(ym)) return;
    var cid = OBS.caseOf(ym);
    if (state.compare) {     // 비교 중 그래프를 누르면 B를 바꾼다
      state.B = ym; $('pickB').value = ym;
      ensure([ym]).then(drawAll);
      return;
    }
    state.ym = ym;
    if (cid !== state.caseId) state.caseId = cid;
    ensure([ym]).then(drawAll);
  }

  function step(d) {
    var ms = caseMonths(), i = ms.indexOf(state.ym) + d;
    if (i < 0 || i >= ms.length) return false;
    state.ym = ms[i];
    drawAll();
    return true;
  }

  function play() {
    var ms = caseMonths();
    if (ms.indexOf(state.ym) >= ms.length - 1) state.ym = ms[0];
    state.playing = true;
    $('playBtn').classList.add('on');
    $('playBtn').setAttribute('aria-label', '일시정지'); $('playBtn').title = '일시정지';
    drawAll();
    timer = setInterval(function () { if (!step(1)) stop(); }, 850);
  }
  function stop() {
    if (timer) clearInterval(timer);
    timer = null; state.playing = false;
    $('playBtn').classList.remove('on');
    $('playBtn').setAttribute('aria-label', '자동 재생'); $('playBtn').title = '자동 재생';
  }

  function setCase(id) {
    stop();
    state.caseId = id;
    var c = OBS.caseInfo(id);
    var peak = { '1997': '1997-12', '2015': '2015-12', '2023': '2023-12' }[id];
    state.ym = c.months.indexOf(peak) >= 0 ? peak : c.months[0];
    ensure([state.ym]).then(drawAll);
  }

  function onMapClick(r, e) {
    var rect = r.canvas.getBoundingClientRect(), p = r.hit(e.clientX - rect.left, e.clientY - rect.top);
    if (!p) return;
    state.click = { lon: p.lon, lat: p.lat };
    var g = OBS.meta.grids.section;
    if (Math.abs(p.lat) <= 5 && p.lon >= g.lon[0] - 0.5 && p.lon <= g.lon[g.lon.length - 1] + 0.5) {
      state.col = OBS.nearest(g.lon, p.lon);
      state.clickDepth = null;
    }
    drawAll();
  }
  function onMapKey(e) {
    if (!state.click) { if (e.key === 'Enter' || e.key === ' ') { state.click = { lon: 200, lat: 0 }; e.preventDefault(); drawAll(); } return; }
    var d = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, 2], ArrowDown: [0, -2] }[e.key];
    if (!d) return;
    e.preventDefault();
    state.click = { lon: Math.max(100, Math.min(290, state.click.lon + d[0])), lat: Math.max(-30, Math.min(30, state.click.lat + d[1])) };
    drawAll();
  }
  function onSecClick(s, e) {
    var rect = s.canvas.getBoundingClientRect(), p = s.hit(e.clientX - rect.left, e.clientY - rect.top);
    if (!p) return;
    state.col = OBS.nearest(OBS.meta.grids.section.lon, p.lon);
    state.clickDepth = p.depth;
    drawAll();
  }
  function onSecKey(e) {
    var n = OBS.meta.grids.section.lon.length;
    var d = { ArrowLeft: -1, ArrowRight: 1, PageUp: -10, PageDown: 10 }[e.key];
    if (e.key === 'Home') d = -n; if (e.key === 'End') d = n;
    if (!d) return;
    e.preventDefault();
    if (state.col === null) state.col = OBS.nearest(OBS.meta.grids.section.lon, 200);
    else state.col = Math.max(0, Math.min(n - 1, state.col + d));
    drawAll();
  }

  function setCompare(on) {
    stop();
    state.compare = on;
    $('compareBtn').setAttribute('aria-pressed', on ? 'true' : 'false');
    $('compareBtn').textContent = on ? '비교 끝내기' : '시기 비교';
    $('timebar').hidden = on;
    $('comparebar').hidden = !on;
    if (on) {
      var y = parseInt(state.ym.slice(0, 4), 10) - 1, prev = y + state.ym.slice(4);
      state.B = state.ym;
      state.A = OBS.caseOf(prev) ? prev : caseMonths()[0];
      $('pickA').value = state.A; $('pickB').value = state.B;
    }
    buildViews();
    ensure(viewMonths()).then(drawAll);
  }

  function fillPickers() {
    ['pickA', 'pickB'].forEach(function (id) {
      var sel = $(id);
      OBS.meta.cases.forEach(function (c) {
        var og = document.createElement('optgroup');
        og.label = c.name;
        c.months.forEach(function (m) {
          var o = document.createElement('option');
          o.value = m; o.textContent = OBS.fmtMonth(m);
          og.appendChild(o);
        });
        sel.appendChild(og);
      });
      sel.addEventListener('change', function () {
        state[id === 'pickA' ? 'A' : 'B'] = sel.value;
        ensure(viewMonths()).then(drawAll);
      });
    });
  }

  function buildCases() {
    var g = $('caseGroup');
    OBS.meta.cases.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'radio');
      b.setAttribute('data-case', c.id);
      b.innerHTML = '<span class="c-name">' + c.name.replace(' 엘니뇨', '') + '</span><span class="c-sub">' + c.start.slice(0, 4) + '~' + c.end.slice(0, 4) + '</span>';
      b.setAttribute('aria-label', c.name + ' (' + OBS.fmtMonth(c.start) + '~' + OBS.fmtMonth(c.end) + ')');
      b.addEventListener('click', function () { if (state.compare) setCompare(false); setCase(c.id); });
      g.appendChild(b);
    });
    g.addEventListener('keydown', function (e) {
      var ids = OBS.meta.cases.map(function (c) { return c.id; }), i = ids.indexOf(state.caseId);
      var d = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
      if (!d) return;
      e.preventDefault();
      var nid = ids[(i + d + ids.length) % ids.length];
      setCase(nid);
      setTimeout(function () { var b = g.querySelector('[data-case="' + nid + '"]'); if (b) b.focus(); }, 0);
    });
  }

  function sliderYears() {
    var ms = caseMonths(), box = $('sliderYears'), h = '';
    ms.forEach(function (m, i) {
      if (m.slice(5) === '01') h += '<span style="left:' + (i / (ms.length - 1) * 100) + '%">' + m.slice(0, 4) + '</span>';
    });
    box.innerHTML = h;
  }

  function segGroup(attr, key) {
    document.querySelectorAll('[data-' + attr + ']').forEach(function (b) {
      b.addEventListener('click', function () {
        state[key] = b.getAttribute('data-' + attr);
        setRadio(null, attr, state[key]);
        drawAll();
      });
    });
    // 라디오 그룹 ←/→
    var groups = {};
    document.querySelectorAll('[data-' + attr + ']').forEach(function (b) { groups[attr] = b.parentNode; });
    var gEl = groups[attr];
    if (gEl) gEl.addEventListener('keydown', function (e) {
      var bs = Array.prototype.slice.call(gEl.querySelectorAll('[data-' + attr + ']'));
      var i = bs.indexOf(document.activeElement), d = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
      if (i < 0 || !d) return;
      e.preventDefault();
      var nb = bs[(i + d + bs.length) % bs.length];
      nb.click(); nb.focus();
    });
  }

  function buildSources() {
    var m = OBS.meta;
    $('sources').innerHTML =
      '<p class="src-lead">이 웹앱의 모든 지도·단면·그래프는 아래 공식 자료를 내려받아 가공한 <b>실제 관측·분석·재분석 자료</b>입니다. ' +
      '임의로 만든 값은 없으며, 원자료의 결측은 채우지 않고 회색(자료 없음)으로 둡니다. 모든 편차는 <b>1991~2020년 같은 달 평년값</b>을 원자료에서 직접 계산해 구했습니다. ' +
      '자료 생성일 ' + m.generated + ', 가공 기간 ' + m.period[0] + ' ~ ' + m.period[1] + '.</p>' +
      '<div class="table-wrap"><table><thead><tr><th>화면 요소</th><th>자료</th><th>종류</th><th>해상도</th><th>단위·처리</th></tr></thead><tbody>' +
      '<tr><td>해수면 온도 지도, Niño 3.4</td><td><a href="https://www.ncei.noaa.gov/products/extended-reconstructed-sst" target="_blank" rel="noopener">NOAA ERSST v5</a> (NCEI) 변수 sst</td><td>선박·부이 관측을 통계적으로 재구성한 분석 자료</td><td>2° × 2°, 월평균</td><td>°C. 파일의 1971~2000 기준 편차(ssta)는 쓰지 않음</td></tr>' +
      '<tr><td>수온 단면, 20 ℃ 등온선</td><td><a href="https://www.cpc.ncep.noaa.gov/products/GODAS/" target="_blank" rel="noopener">NCEP GODAS</a> (NOAA PSL 배포본) 변수 pottmp</td><td>해양 관측을 해양 모형에 동화한 해양 재분석</td><td>경도 1° × 위도 1/3°, 수심 층 5~225 m는 10 m 간격(그 아래 238, 262, 303, 366, 459, 584 m), 월평균</td><td>K → °C. 잠재 수온(0~500 m에서 현장 수온과 0.1 °C 미만 차이). 2°S~2°N 위도 격자 12개를 먼저 평균한 뒤 등온선·편차 계산</td></tr>' +
      '<tr><td>바람 화살표, 무역풍 그래프</td><td><a href="https://psl.noaa.gov/data/gridded/data.ncep.reanalysis.html" target="_blank" rel="noopener">NCEP/NCAR Reanalysis 1</a> (NOAA PSL) 10 m uwnd·vwnd</td><td>대기 관측을 모형에 동화한 대기 재분석</td><td>T62 가우스 격자(경도 1.875° × 위도 약 1.9°), 월평균</td><td>m/s. 1991~2024 전 기간 이 자료 하나만 사용(다른 재분석과 섞지 않음)</td></tr>' +
      '<tr><td>강수량 지도</td><td><a href="https://www.ncei.noaa.gov/products/climate-data-records/precipitation-gpcp-monthly" target="_blank" rel="noopener">GPCP Monthly v2.3</a> (NOAA CDR, 파일 버전 v02r03)</td><td>위성·우량계 관측을 합친 분석 자료</td><td>2.5° × 2.5°, 월평균</td><td>원자료 mm/일 × 그 달 실제 일수 = mm/월</td></tr>' +
      '</tbody></table></div>' +
      '<h3>계산 방법</h3><ul>' +
      '<li><b>Niño 3.4 편차</b>: ERSST v5의 5°S~5°N, 170°W~120°W 위도 가중 평균에서 같은 달 1991~2020 평년값을 뺀 값. NOAA CPC 공식 값과 1991~2024년 408개월 모두 0.03 °C 이내로 일치함을 확인했습니다.</li>' +
      '<li><b>무역풍 지역 평균</b>: R1 10 m 동서 바람 u를 5°S~5°N 격자에서 위도 가중 평균(이 웹앱이 직접 계산). 서태평양 135°E~180°, 중앙 태평양 175°W~140°W, 동태평양 135°W~120°W로 NOAA CPC 850 hPa 무역풍 지수와 경도 범위가 같지만 고도가 다릅니다(편차 상관계수 0.73~0.96).</li>' +
      '<li><b>20 ℃ 등온선 깊이</b>: 단면의 각 경도에서 위로부터 수온이 20 ℃ 이상에서 미만으로 바뀌는 첫 두 자료 층 사이를 선형 보간. 결측 층을 먼저 만나거나 20 ℃를 지나지 않으면 "측정 불가".</li>' +
      '<li><b>평년값</b>: 1991~2020년 같은 달 평균. 원자료의 결측은 채우지 않으며, 30년 중 24년 이상 자료가 있는 칸만 평년값을 만듭니다(WMO 평년값 기준).</li>' +
      '<li><b>지도 클릭</b>: 해수면 온도·강수량은 누른 곳이 들어 있는 격자 칸의 값, 바람은 가장 가까운 R1 격자점의 값을 보간 없이 보여 줍니다.</li>' +
      '</ul>' +
      '<h3>한계와 주의</h3><ul>' +
      '<li>수온 단면은 적도 부근 <b>2°S~2°N을 평균</b>한 경도-수심 단면입니다. 페루 연안의 실제 수직 단면이 아닙니다.</li>' +
      '<li>20 ℃ 등온선은 수온약층 깊이의 <b>대표 지표</b>이며 수온약층 전체와 같지 않습니다.</li>' +
      '<li>지도의 해수면 온도(ERSST)와 단면 맨 위 층 수온(GODAS 5 m)은 서로 다른 자료라서 같은 곳이라도 값이 조금 다를 수 있습니다. 억지로 맞추지 않았습니다.</li>' +
      '<li>단면 색은 자료 격자 사이를 선형 보간해 칠한 것으로, 원자료보다 해상도가 높은 관측값이 아닙니다. 오른쪽 눈금이 실제 자료 층입니다.</li>' +
      '<li>NCEP/NCAR Reanalysis 1은 1990년대에 만든 비교적 오래된 재분석으로 격자가 성기고(약 1.9°), 최신 재분석(ERA5 등)과 세부 값이 다를 수 있습니다. 바람 그래프의 값은 공식 지수가 아니라 이 웹앱의 계산값입니다.</li>' +
      '<li>엘니뇨 때도 무역풍이 늘 서풍으로 바뀌는 것은 아닙니다. 지도의 화살표와 그래프는 실제 자료 그대로이며, 바람과 수온의 변화가 같은 달에 함께 나타나도록 맞추지 않았습니다.</li>' +
      '<li>색 범위는 변수마다 고정되어 있고, 범위 밖 값은 양 끝 색으로 칠합니다.</li>' +
      '</ul>' +
      '<p class="src-foot">자료를 만든 Python 코드와 검증 보고서는 저장소의 <code>pipeline/</code> 폴더에 있습니다(<code>pipeline/validation/REPORT.md</code>).</p>';
  }

  function home(e) {
    if (e) e.preventDefault();
    stop();
    if (state.compare) setCompare(false);
    state.click = null; state.col = null; state.clickDepth = null;
    $('mapReadout').textContent = '지도를 누르면 그 위치의 관측값을 보여 줍니다. 적도 부근을 누르면 아래 단면에도 같은 경도가 표시됩니다.';
    $('secReadout').textContent = '단면을 누르면 그 경도의 20 ℃ 등온선 깊이를 잽니다. 단면을 고른 뒤 ←/→ 키로 1°씩 옮길 수 있습니다.';
    window.scrollTo(0, 0);
    setCase(DEFAULT.caseId);
  }

  /* ---------- 시작 ---------- */
  function init() {
    OBS.load().then(function () {
      buildCases();
      fillPickers();
      buildSources();
      var rs = $('regionSel');
      OBS.meta.regions.wind.forEach(function (r) {
        var o = document.createElement('option');
        o.value = r.id;
        o.textContent = r.name + ' (5°S~5°N, ' + OBS.fmtLon(r.lon[0]) + '~' + OBS.fmtLon(r.lon[1]) + ')';
        rs.appendChild(o);
      });
      rs.value = state.regionId;
      rs.addEventListener('change', function () { state.regionId = rs.value; drawAll(); });

      segGroup('layer', 'layer');
      segGroup('mapmode', 'mapMode');
      segGroup('secmode', 'secMode');
      segGroup('windmode', 'windMode');
      $('arrowChk').addEventListener('change', function () { state.arrows = this.checked; drawAll(); });
      $('isoChk').addEventListener('change', function () { state.iso = this.checked; drawAll(); });
      $('timeSlider').addEventListener('input', function () { stop(); state.ym = caseMonths()[+this.value]; drawAll(); });
      $('prevBtn').addEventListener('click', function () { stop(); step(-1); });
      $('nextBtn').addEventListener('click', function () { stop(); step(1); });
      $('playBtn').addEventListener('click', function () { if (state.playing) stop(); else play(); });
      $('compareBtn').addEventListener('click', function () { setCompare(!state.compare); });
      $('seriesFold').addEventListener('toggle', drawAll);
      $('homeLink').addEventListener('click', home);

      buildViews();
      return ensure([state.ym]);
    }).then(function () {
      sliderYears();
      drawAll();
      $('loading').hidden = true;
      var last = 0;
      new ResizeObserver(function () {
        var w = $('main').clientWidth;
        if (w === last) return;
        last = w;
        drawAll();
      }).observe($('main'));
      var mq = window.matchMedia('(prefers-color-scheme: dark)');
      var onTheme = function () { maps.forEach(function (m) { m.clearCache(); }); drawAll(); };
      if (mq.addEventListener) mq.addEventListener('change', onTheme);
    }).catch(function (err) {
      $('loading').textContent = '관측 자료를 읽지 못했습니다: ' + err.message + ' (웹 서버로 열어야 합니다. 파일을 바로 열면 자료를 읽을 수 없습니다.)';
      $('loading').classList.add('err');
    });
  }

  init();
})();
