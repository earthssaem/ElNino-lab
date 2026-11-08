/* 대화로 배우는 엘니뇨: 캐릭터와 대본 (과목별)
 * 대사를 고치려면 이 파일만 고치면 된다. 그림의 수온·수온약층·해수면·용승·기압은 ../js/model.js 가 s 로 계산한다(모형 값, 특정 날짜의 관측값 아님).
 *
 * 캐릭터 CH : nm(대화창 이름) · tag(그림 위 짧은 이름) · ic(mood) → 얼굴 SVG
 * 단계 STEPS : id · part(지구과학 PART A~D) · only('integrated'|'earth', 생략하면 두 과목 공통) · title · lines[] · more(더 알아보기)
 * 대사 line  : who(말하는 캐릭터) · t(대사) · only(그 과목에서만)
 *   t·key·title 은 문자열(공통) 또는 {integrated: '…', earth: '…'}(과목마다 다른 말)
 *   s     이 대사의 상태(−1 강한 엘니뇨 … 0 평상시 … +1 강한 라니냐). 생략하면 앞 대사 그대로
 *   badge 그림 위 딱지(normal·weak·nino·strong·nina). 생략하면 앞 대사 그대로
 *   show  이 대사부터 나타나는 그림 층(누적, '-층'은 감춤): wind 무역풍 · flow 표층 바닷물 이동 · sea 해수면 높이 차
 *         thermo 따뜻한 해수층 이름(통합과학, 선 없음)·수온약층과 20 ℃ 등온선(지구과학) · up 용승 · fish 어장 · air 공기의 오르내림과 구름·비
 *         walker 워커 순환 고리 · pressure 다윈·타히티 기압 편차 · soi 남방진동 지수
 *   hl    밝게 비출 곳: westsea · eastsea · wind · flow · sea · thermo · up · fish · cloud · sink · drywest
 *         walker · rise(상승 기류) · lower(지표 부근 바람) · darwin · tahiti · soi
 *   key   핵심 정리 · mood 말하는 캐릭터 표정(sad)
 *   ask   먼저 예측하기 {q: 묻는 값, opts, ans, reveal: 고른 뒤의 s, badge: 고른 뒤의 딱지, show: 고른 뒤 나타날 층,
 *         words: 선택지 글자(생략하면 CHOICE), result: 틀렸을 때 알려 줄 답(생략하면 RESULT)}
 * 교과 범위: 통합과학 단계에는 라니냐·워커 순환·남방진동·수온약층이라는 말을 쓰지 않는다(쉬운 말로 같은 현상을 설명).
 *   지구과학은 PART A(기본 원리, 정확한 용어) → B 라니냐 → C 워커 순환 → D 남방진동.
 */
(function () {
  'use strict';

  function face(mood) {
    var mouth = mood === 'sad' ? 'M-4.5,7 Q0,3.2 4.5,7' : 'M-4.5,4.5 Q0,8.5 4.5,4.5';
    return '<g><circle cx="-5" cy="-1" r="2" fill="#24313a"/><circle cx="5" cy="-1" r="2" fill="#24313a"/>' +
      '<circle cx="-4.3" cy="-1.8" r=".7" fill="#fff"/><circle cx="5.7" cy="-1.8" r=".7" fill="#fff"/>' +
      '<circle cx="-9" cy="3.6" r="2.3" fill="#ff8f7a" opacity=".5"/><circle cx="9" cy="3.6" r="2.3" fill="#ff8f7a" opacity=".5"/>' +
      '<path d="' + mouth + '" fill="none" stroke="#24313a" stroke-width="1.6" stroke-linecap="round"/></g>';
  }
  function svg(body) { return '<svg viewBox="-20 -20 40 40" aria-hidden="true">' + body + '</svg>'; }
  function crest(color) {
    return '<path d="M-21,-9 q5.25,-4.5 10.5,0 t10.5,0 t10.5,0 t10.5,0" fill="none" stroke="' + color + '" stroke-width="2.6" stroke-linecap="round"/>';
  }

  var CH = {
    wind: { nm: '무역풍', tag: '무역풍', ic: function (m) {
      return svg('<circle r="20" fill="#e4eff7"/><g fill="none" stroke="#6f93ad" stroke-width="2.4" stroke-linecap="round">' +
        '<path d="M-15,-11 H5 a3.6,3.6 0 1 0 -3.6,-3.6"/><path d="M-16,12.5 H7 a3.6,3.6 0 1 1 -3.6,3.6"/></g>' + face(m));
    } },
    west: { nm: '서태평양 바다', tag: '서쪽 바다', ic: function (m) {
      return svg('<circle r="20" fill="#f29a6a"/>' + crest('#ffe2cf') + '<g transform="translate(0,3)">' + face(m) + '</g>');
    } },
    east: { nm: '동태평양 바다', tag: '동쪽 바다', ic: function (m) {
      return svg('<circle r="20" fill="#63aee3"/>' + crest('#dff1fd') + '<g transform="translate(0,3)">' + face(m) + '</g>');
    } },
    cloud: { nm: '구름', tag: '구름', ic: function (m) {
      return svg('<circle r="20" fill="#dce9f4"/><g fill="#fff"><circle cx="-9" cy="3" r="8"/><circle cx="-1" cy="-4" r="10"/><circle cx="8.5" cy="0" r="8.5"/><rect x="-16" y="3" width="31" height="9" rx="4.5"/></g>' + face(m));
    } },
    fisher: { nm: '페루 어부', tag: '어부', ic: function (m) {
      return svg('<circle r="20" fill="#f4e7cf"/><circle cy="5" r="11.5" fill="#efc49c"/>' +
        '<ellipse cy="-5.5" rx="16" ry="3.6" fill="#c48a37"/><path d="M-8.5,-6 Q-8,-15 0,-15 Q8,-15 8.5,-6 Z" fill="#dcaa55"/>' +
        '<path d="M-8.4,-8.6 H8.4" stroke="#8b5a22" stroke-width="2"/>' +
        '<g transform="translate(0,6.5) scale(.82)">' + face(m) + '</g>');
    } }
  };

  var STEPS = [
    { id: 'same', part: 'A', title: '같은 적도, 다른 바다', lines: [
      { who: 'fisher', s: 0, badge: 'normal',
        t: '안녕, 나는 남아메리카 페루의 어부야. 오늘은 우리 앞바다, 적도 태평양 이야기를 들려줄게.',
        key: '그림은 적도를 따라 태평양을 세로로 자른 모습이에요. 왼쪽이 서쪽(인도네시아), 오른쪽이 동쪽(남아메리카)이고, 색은 바닷물의 온도예요.' },
      { who: 'west', hl: ['westsea'],
        t: '나는 태평양 서쪽, 인도네시아 앞바다야. 일 년 내내 30 ℃ 가까운 따뜻한 바다지.' },
      { who: 'east', hl: ['eastsea'],
        t: '나는 태평양 동쪽, 남아메리카 앞바다야. 같은 적도인데 나는 서쪽보다 훨씬 차가워.' },
      { who: 'fisher',
        t: '같은 적도에 있는데 왜 서쪽만 따뜻할까? 그 열쇠는 바람이 쥐고 있어.' }
    ] },
    { id: 'trade', part: 'A', title: '무역풍이 바닷물을 밀어요', more: '실제 해수면 높이 차이는 수십 cm 정도예요. 그림에서는 잘 보이도록 크게 과장했어요.', lines: [
      { who: 'wind', show: ['wind'], hl: ['wind'],
        t: '나는 무역풍이야. 적도 부근에서 일 년 내내 동쪽에서 서쪽으로 불지.' },
      { who: 'wind', show: ['flow'], hl: ['flow'],
        t: '내가 바다 위를 불면 따뜻한 표층 바닷물이 서쪽으로 밀려가.' },
      { who: 'west', show: ['sea'], hl: ['sea'],
        t: '밀려온 따뜻한 물이 나한테 쌓여. 그래서 서쪽은 해수면이 동쪽보다 높아.' },
      { who: 'west', show: ['thermo'], hl: ['thermo'],
        t: { integrated: '따뜻한 물의 층도 두꺼워. 붉은색이 깊게 내려와 있고, 그 아래로 갈수록 차가운 물이야.',
          earth: '따뜻한 물의 층도 두꺼워. 흰 선 아래부터는 깊어질수록 수온이 빠르게 낮아지는 수온약층이야.' },
        key: '무역풍 → 따뜻한 표층 바닷물이 서쪽으로 이동 → 서쪽은 해수면이 높고 따뜻한 물의 층이 두꺼워요.' },
      { who: 'west', only: 'earth', hl: ['thermo'],
        t: '굵은 선은 20 ℃ 등온선이야. 수온약층의 깊이를 나타내는 대표 선이라, 서쪽은 깊고 동쪽은 얕게 기울어 있지.',
        key: '20 ℃ 등온선: 수온약층 깊이의 대표 지표(수온약층 자체와 같지는 않아요). 평상시 서태평양은 깊고 동태평양은 얕아요.' }
    ] },
    { id: 'upwell', part: 'A', title: '동쪽에서는 찬물이 올라와요', lines: [
      { who: 'east', show: ['up'], hl: ['up'],
        t: '따뜻한 물이 서쪽으로 빠져나간 자리는 깊은 곳의 차가운 물이 올라와 채워. 이걸 용승이라고 해.' },
      { who: 'east', hl: ['eastsea'],
        t: { integrated: '그래서 나는 적도에 있어도 차가워. 차가운 물이 바다 표면 가까이까지 올라와 있지.',
          earth: '그래서 나는 적도에 있어도 차가워. 수온약층도 바다 표면 가까이까지 올라와 있지.' } },
      { who: 'fisher', show: ['fish'], hl: ['fish'],
        t: '깊은 바닷물에는 영양분이 많아. 플랑크톤이 잘 자라고 물고기가 몰려들어서 우리 바다는 세계적인 어장이야.',
        key: '용승: 깊은 곳의 차가운 바닷물이 표층으로 올라오는 현상이에요. 영양분이 많아 좋은 어장이 만들어져요.' }
    ] },
    { id: 'rain', part: 'A', title: '비는 어디에 많이 내릴까?', lines: [
      { who: 'cloud', show: ['air'], hl: ['cloud'],
        t: '따뜻한 바다 위에서는 데워진 공기가 위로 올라가. 공기가 올라가면 구름이 생기고 비가 내리지.' },
      { who: 'cloud', hl: ['cloud'],
        t: '그래서 나는 주로 따뜻한 서쪽 바다 위에 있어. 인도네시아에 비가 많이 오고 열대 우림이 우거진 까닭이야.' },
      { who: 'fisher', hl: ['sink'],
        t: '우리 쪽은 차가운 바다 위로 공기가 내려오는 곳이라 비가 거의 안 와. 바닷가가 사막일 만큼 건조하지.',
        key: '따뜻한 바다 위: 공기가 올라감 → 구름과 비가 많아요. 차가운 바다 위: 공기가 내려옴 → 맑고 건조해요.' }
    ] },
    { id: 'weak', part: 'A', title: '무역풍이 약해지면?', lines: [
      { who: 'wind', hl: ['wind'],
        t: '그런데 몇 년에 한 번씩 내가 평소보다 약해질 때가 있어.' },
      { who: 'wind', hl: ['eastsea'],
        t: '내가 약해지면 동쪽 바다의 수온은 어떻게 될까? 먼저 예측해 봐.',
        ask: { q: '동쪽 바다의 수온', opts: ['up', 'down', 'same'], ans: 'up', reveal: -0.85, badge: 'weak' } },
      { who: 'east', s: -0.85, badge: 'weak', hl: ['up', 'eastsea'],
        t: '서쪽에 쌓여 있던 따뜻한 물이 동쪽으로 돌아오고, 찬물이 올라오는 용승도 약해졌어. 그래서 내가 평소보다 따뜻해졌어.' },
      { who: 'west', hl: ['sea'],
        t: '나는 따뜻한 물이 빠져나가서 해수면이 낮아졌어. 수온도 조금 내려갔고.' },
      { who: 'east', only: 'earth', hl: ['thermo'],
        t: '바닷속도 봐. 내 쪽 20 ℃ 등온선은 깊어지고 서쪽은 얕아져서, 수온약층의 기울기가 완만해졌어.' },
      { who: 'east', badge: 'nino',
        t: '이처럼 동태평양 적도 부근의 표층 수온이 평소보다 높은 상태가 몇 달 넘게 이어지는 현상을 엘니뇨라고 해.',
        key: '엘니뇨: 무역풍이 약해져 동태평양 적도 부근의 표층 수온이 평소보다 높은 상태가 몇 달 이상 계속되는 현상이에요.' }
    ] },
    { id: 'impact', part: 'A', title: '엘니뇨가 오면',
      more: { integrated: '엘니뇨는 태평양 주변뿐 아니라 멀리 떨어진 지역의 날씨와 농작물 수확에도 영향을 줘요. 그림의 상승·하강기류는 엘니뇨에 따른 대표적인 대기 순환 변화를 단순화하여 나타낸 것이에요.',
        earth: '엘니뇨는 태평양 주변뿐 아니라 멀리 떨어진 지역의 날씨와 농작물 수확에도 영향을 줘요.' }, lines: [
      { who: 'fisher', mood: 'sad', hl: ['fish'],
        t: '용승이 약해지니 영양분이 올라오지 않아. 물고기가 줄어서 그물이 텅 비었어.' },
      { who: 'fisher', mood: 'sad',
        t: '이런 따뜻한 바닷물이 크리스마스 무렵에 찾아와서, 옛날 페루 어부들은 아기 예수를 뜻하는 스페인어 ‘엘니뇨’라는 이름을 붙였대.' },
      { who: 'cloud', hl: ['cloud'],
        t: '나도 따뜻해진 바다를 따라 동쪽으로 옮겨 갔어. 평소 건조하던 남아메리카 서쪽 해안에 큰비가 내려 홍수가 나기도 해.' },
      { who: 'west', hl: ['drywest'],
        t: { integrated: '반대로 내 쪽에서는 하강 기류가 나타나. 그래서 인도네시아와 오스트레일리아는 비가 줄어 가뭄이 들고, 산불이 나기도 해.',
          earth: '반대로 나와 가까운 인도네시아와 오스트레일리아는 비가 줄어 가뭄이 들고, 산불이 나기도 해.' },
        key: '엘니뇨의 영향: 동태평양의 어획량이 줄고, 비가 많이 오는 곳이 바뀌어 어떤 곳은 홍수, 어떤 곳은 가뭄과 산불을 겪어요.' }
    ] },
    { id: 'summary', only: 'integrated', title: '한눈에 정리', lines: [
      { who: 'wind', s: 0, badge: 'normal',
        t: '처음으로 돌아가 볼까? 평소에는 내가 불어서 동쪽 바다가 차갑고, 비는 서쪽에 많이 내렸어.' },
      { who: 'wind', s: -0.85, badge: 'nino',
        t: '내가 약해지면 이렇게 바뀌어. ◀ 이전 버튼으로 앞의 그림과 번갈아 비교해 봐.',
        key: '무역풍 약해짐 → 따뜻한 바닷물이 동쪽으로 → 용승 약해짐 → 동태평양 수온 상승 → 어획량 감소, 비 오는 곳의 변화(홍수·가뭄)' }
    ] },
    /* ── 지구과학 PART B: 라니냐 ─────────────── */
    { id: 'strong', part: 'B', only: 'earth', title: '무역풍이 강해지면?', lines: [
      { who: 'wind', s: 0, badge: 'normal', hl: ['wind'],
        t: '이번엔 반대야. 내가 평소보다 훨씬 세게 불면 어떻게 될까? 지금까지 배운 것으로 추리해 봐.' },
      { who: 'wind', hl: ['eastsea'],
        t: '내가 세게 불면 동쪽 바다의 수온은 어떻게 될까?',
        ask: { q: '동쪽 바다의 수온', opts: ['up', 'down', 'same'], ans: 'down', reveal: 0.85, badge: 'strong' } },
      { who: 'east', s: 0.85, badge: 'strong', hl: ['up', 'eastsea'],
        t: '따뜻한 물이 서쪽으로 더 많이 밀려가고, 찬물이 올라오는 용승이 더 강해졌어. 그래서 나는 평소보다 더 차가워졌어.' },
      { who: 'fisher', hl: ['fish'],
        t: '영양분이 많이 올라오니 물고기도 더 많아졌네.' }
    ] },
    { id: 'tilt', part: 'B', only: 'earth', title: '수온약층은 어떻게 기울까?', lines: [
      { who: 'west', s: 0, badge: 'normal', hl: ['thermo'],
        t: '이번에는 바닷속을 보자. 무역풍이 강해지면 동쪽의 20 ℃ 등온선은 어떻게 될까?',
        ask: { q: '동쪽 20 ℃ 등온선의 깊이', opts: ['shallow', 'deep', 'same'], ans: 'shallow', reveal: 0.85, badge: 'strong',
          words: { shallow: '▲ 더 얕아진다', deep: '▼ 더 깊어진다', same: '= 그대로다' }, result: { shallow: '더 얕아져요.' } } },
      { who: 'east', s: 0.85, badge: 'strong', hl: ['thermo', 'eastsea'],
        t: '내 쪽 수온약층은 바다 표면 가까이까지 올라왔어. 그만큼 깊은 곳의 찬물이 쉽게 올라오지.' },
      { who: 'west', hl: ['thermo', 'sea'],
        t: '나한테는 따뜻한 물이 더 두껍게 쌓여서 20 ℃ 등온선이 더 깊어졌어. 서쪽은 깊고 동쪽은 얕은, 더 가파른 기울기가 된 거야.',
        key: '무역풍 강화 → 서쪽으로 가는 표층 해수 증가 → 동태평양 용승 강화·수온 하강 → 수온약층 기울기 증가' },
      { who: 'east', badge: 'nina',
        t: '이런 상태가 몇 달 넘게 이어지는 현상을 라니냐라고 해.',
        key: '라니냐: 무역풍이 강해져 동태평양 적도 부근의 표층 수온이 평소보다 낮은 상태가 몇 달 이상 계속되는 현상이에요.' }
    ] },
    { id: 'pair', part: 'B', only: 'earth', title: '엘니뇨와 라니냐 비교', lines: [
      { who: 'wind', s: -0.85, badge: 'nino', hl: ['thermo'],
        t: '엘니뇨 때를 다시 떠올려 봐. 내가 약해지면 동쪽 바다가 따뜻해지고 수온약층 기울기가 완만해졌지.' },
      { who: 'wind', s: 0.85, badge: 'nina', hl: ['thermo'],
        t: '라니냐 때는 정반대야. ◀ 이전 버튼으로 두 그림을 번갈아 비교해 봐.',
        key: '엘니뇨: 무역풍 약화 · 동태평양 수온 상승 · 용승 약화 · 수온약층 기울기 완만 / 라니냐: 무역풍 강화 · 동태평양 수온 하강 · 용승 강화 · 수온약층 기울기 가파름' }
    ] },
    /* ── 지구과학 PART C: 워커 순환 ─────────────── */
    { id: 'updown', part: 'C', only: 'earth', title: '공기는 어디서 오르내릴까?', lines: [
      { who: 'cloud', s: 0, badge: 'normal', show: ['air'], hl: ['cloud'],
        t: '따뜻한 서태평양 위에서는 데워진 공기가 올라가. 그래서 이곳에 구름이 많고 비가 자주 와.' },
      { who: 'fisher', hl: ['sink'],
        t: '상대적으로 차가운 동태평양 위에서는 공기가 내려와. 그래서 맑고 건조하지.' },
      { who: 'cloud', hl: ['cloud'],
        t: '서쪽에서 올라간 공기는 높은 하늘에서 어느 쪽으로 움직일까?',
        ask: { q: '높은 하늘의 공기 흐름', opts: ['east', 'west'], ans: 'east', show: ['walker'],
          words: { east: '→ 동쪽으로', west: '← 서쪽으로' }, result: { east: '동쪽으로 움직여요.' } } }
    ] },
    { id: 'walker', part: 'C', only: 'earth', title: '워커 순환',
      more: '고리는 대표적인 순환을 단순하게 나타낸 모식도예요. 구름 위치는 실제 강수 자료에서 정했지만, 고리의 굵기와 공기가 내려오는 위치는 실제로 잰 값이 아니에요.',
      lines: [
      { who: 'cloud', show: ['walker'], hl: ['walker'],
        t: '높은 하늘에서는 서쪽에서 동쪽으로, 바다 가까이에서는 동쪽에서 서쪽으로 공기가 움직여. 하나의 큰 고리처럼 돌지.' },
      { who: 'wind', hl: ['lower'],
        t: '바다 가까이에서 동쪽에서 서쪽으로 부는 바람이 바로 나, 무역풍이야. 이 고리의 아래쪽이 나인 셈이지.' },
      { who: 'cloud', hl: ['walker'],
        t: '이렇게 적도 태평양에서 동서 방향으로 도는 큰 대기 순환을 워커 순환이라고 해.',
        key: '워커 순환: 서태평양 상승 기류 → 높은 하늘에서 동쪽으로 → 동태평양 하강 기류 → 바다 가까이에서 서쪽으로(무역풍)' }
    ] },
    { id: 'walker-nino', part: 'C', only: 'earth', title: '엘니뇨 때 워커 순환',
      more: '그림의 고리는 대표적인 대기 순환의 변화를 단순하게 나타낸 모식도예요. 점선 고리는 평상시와 비교한 변화(서태평양의 상승 운동 약화·하강 운동 강화 경향)를 나타내요. 실제로 서태평양 바다 가까이의 바람은 엘니뇨 때도 대체로 약한 동풍이고, 평상시보다 서풍 쪽으로 바뀌는 변화가 나타나요. 고리의 굵기도 실제 세기를 잰 값이 아니에요.',
      lines: [
      { who: 'wind', s: 0, badge: 'normal', hl: ['walker'],
        t: '엘니뇨가 되어 따뜻한 바닷물이 동쪽으로 옮겨 가면 이 고리는 어떻게 될까?' },
      { who: 'cloud', hl: ['rise'],
        t: '공기가 올라가는 곳은 어느 쪽으로 옮겨 갈까?',
        ask: { q: '상승 기류의 위치', opts: ['east', 'west', 'same'], ans: 'east', reveal: -0.85, badge: 'nino',
          words: { east: '→ 동쪽으로', west: '← 서쪽으로', same: '= 그대로' }, result: { east: '동쪽(중앙 태평양 쪽)으로 옮겨 가요.' } } },
      { who: 'cloud', s: -0.85, badge: 'nino', hl: ['rise'],
        t: '따뜻한 바다를 따라 나도 중앙 태평양 쪽으로 옮겨 왔어. 동쪽의 고리는 약해지고, 서쪽은 평상시보다 공기가 덜 올라가고 내려오는 쪽으로 바뀌어. 점선 고리가 그 변화야.' },
      { who: 'west', hl: ['drywest'],
        t: '그래서 인도네시아와 오스트레일리아 쪽은 평상시보다 비가 줄고 가뭄이 들기 쉬워. 흐린 구름은 평상시 구름이 있던 자리야.' }
    ] },
    { id: 'walker-nina', part: 'C', only: 'earth', title: '라니냐 때 워커 순환', lines: [
      { who: 'wind', s: 0.85, badge: 'nina', hl: ['walker'],
        t: '라니냐 때는 내가 더 세게 불고, 이 고리도 더 강해져.' },
      { who: 'cloud', hl: ['rise'],
        t: '서태평양의 상승 기류가 더 강해져서 그쪽에 비가 더 많이 와.',
        key: '엘니뇨: 상승 기류가 중앙 태평양 쪽으로 이동, 워커 순환 약화 / 라니냐: 서태평양 상승 기류 강화, 워커 순환 강화' }
    ] },
    /* ── 지구과학 PART D: 남방진동 ─────────────── */
    { id: 'pressure', part: 'D', only: 'earth', title: '동서 태평양의 기압', lines: [
      { who: 'cloud', s: 0, badge: 'normal', show: ['-walker', 'pressure'], hl: ['cloud', 'sink'],
        t: '공기가 올라가는 곳은 기압이 낮고, 공기가 내려오는 곳은 기압이 높아. 평소 서태평양은 기압이 낮고, 동태평양은 높지.' },
      { who: 'west', hl: ['darwin'],
        t: '서태평양 쪽에는 오스트레일리아 북쪽의 다윈이, 남태평양 가운데에는 타히티가 있어. 두 곳의 기압을 오랫동안 재 왔지.' },
      { who: 'east', hl: ['darwin', 'tahiti'],
        t: '그림의 표시는 두 곳의 기압이 평소보다 높은지 낮은지를 보여 줘. 지금은 평상시라 둘 다 평소와 같아.' }
    ] },
    { id: 'pressure-nino', part: 'D', only: 'earth', title: '엘니뇨 때 기압', lines: [
      { who: 'wind', hl: ['cloud'],
        t: '엘니뇨가 되면 공기가 올라가는 곳이 동쪽으로 옮겨 가지. 그러면 기압은 어떻게 될까?' },
      { who: 'west', hl: ['darwin'],
        t: '엘니뇨 때 다윈의 기압은 평소보다 어떻게 될까?',
        ask: { q: '다윈의 기압', opts: ['up', 'down', 'same'], ans: 'up', reveal: -0.85, badge: 'nino' } },
      { who: 'east', s: -0.85, badge: 'nino', hl: ['darwin', 'tahiti'],
        t: '다윈은 기압이 높아지고, 반대로 타히티는 기압이 낮아져.' }
    ] },
    { id: 'pressure-nina', part: 'D', only: 'earth', title: '라니냐 때 기압', lines: [
      { who: 'east', s: 0.85, badge: 'nina', hl: ['darwin', 'tahiti'],
        t: '라니냐 때는 거꾸로야. 다윈은 기압이 낮아지고, 타히티는 기압이 높아져.' }
    ] },
    { id: 'so', part: 'D', only: 'earth', title: '남방진동', lines: [
      { who: 'cloud', show: ['soi'], hl: ['darwin', 'tahiti'],
        t: '이렇게 동서 태평양의 기압이 시소처럼 서로 반대로 오르내리는 현상을 남방진동이라고 해.' },
      { who: 'fisher', hl: ['soi'],
        t: '두 곳의 기압 차이로 남방진동 지수를 만들어. 타히티의 기압 변화에서 다윈의 기압 변화를 빼는 셈이라, 지금 같은 라니냐 때는 양수가 돼.' },
      { who: 'wind', s: -0.85, badge: 'nino', hl: ['soi'],
        t: '엘니뇨 때는 남방진동 지수가 음수가 돼.',
        key: '남방진동 지수 ≈ 타히티 기압 편차 − 다윈 기압 편차. 음수는 엘니뇨 쪽, 양수는 라니냐 쪽이에요.' }
    ] },
    { id: 'coupled', part: 'D', only: 'earth', title: '바다와 대기는 서로 영향을 줘요', lines: [
      { who: 'wind', s: -0.85, badge: 'nino',
        t: '그런데 남방진동은 엘니뇨의 결과이기만 한 게 아니야. 바다와 대기는 서로 영향을 주고받아.' },
      { who: 'east', hl: ['eastsea'],
        t: '무역풍이 약해지면 따뜻한 물이 동쪽으로 와서 내가 따뜻해져.' },
      { who: 'cloud', hl: ['darwin', 'tahiti'],
        t: '그러면 공기가 올라가는 곳도 동쪽으로 옮겨 오고, 동서 태평양의 기압 차가 줄어들어.' },
      { who: 'wind', hl: ['wind'],
        t: '기압 차가 줄면 나는 더 약해지고, 따뜻한 물은 더 동쪽으로 와. 이렇게 서로 밀어주며 엘니뇨가 커지는 거야.',
        key: '해양과 대기의 상호 작용: 무역풍 약화 → 동태평양 수온 상승 → 상승 기류 이동 → 동서 기압 차 감소(남방진동) → 무역풍 더 약화. 반대 방향으로 돌면 라니냐 쪽으로 커져요.' },
      { who: 'fisher',
        t: '실제 바다와 하늘에서도 정말 이렇게 함께 움직였을까? 실제 자료로 확인해 보자.' }
    ] }
  ];

  // 그림 왼쪽 위 딱지: [글자, 색(data-phase)]
  var BADGE = {
    normal: ['평상시', 'normal'], weak: ['무역풍 약함', 'nino'], nino: ['엘니뇨', 'nino'],
    strong: ['무역풍 강함', 'nina'], nina: ['라니냐', 'nina']
  };
  // 예측 선택지
  var CHOICE = { up: '▲ 높아진다', down: '▼ 낮아진다', same: '= 그대로다' };
  // 틀렸을 때 알려 주는 답 ('아쉬워요. 실제로는 ○○ 그림에서 확인해 보세요.')
  var RESULT = { up: '높아져요.', down: '낮아져요.', same: '변하지 않아요.' };

  // 지구과학 PART 이름
  var PARTS = { A: '기본 원리', B: '라니냐', C: '워커 순환', D: '남방진동' };
  // 마지막 대사 다음에 갈 곳
  var END = {
    integrated: { learn: 'data', hash: '', label: '실제 자료로 확인하기 →' },
    earth: { learn: 'sim', hash: '#so', label: '실제 남방진동 자료 보기 →' }
  };
  function pick(v, subj) { return v == null || typeof v === 'string' ? v : (v[subj] != null ? v[subj] : v.earth); }
  // 과목에 맞춘 단계 목록: only 로 거르고, 과목마다 다른 말(t·key·title)을 고른다
  function stepsFor(subj) {
    return STEPS.filter(function (s) { return !s.only || s.only === subj; }).map(function (s) {
      return {
        id: s.id, part: subj === 'earth' ? s.part : null, title: pick(s.title, subj), more: pick(s.more, subj),
        lines: s.lines.filter(function (l) { return !l.only || l.only === subj; }).map(function (l) {
          var o = {};
          for (var k in l) o[k] = l[k];
          o.t = pick(l.t, subj); o.key = pick(l.key, subj);
          return o;
        })
      };
    });
  }
  // 과목을 바꿀 때 가장 가까운 단계를 찾기 위한 전체 순서
  var ORDER = STEPS.map(function (s) { return s.id; });

  window.STORY = { CH: CH, STEPS: STEPS, PARTS: PARTS, END: END, ORDER: ORDER, stepsFor: stepsFor, BADGE: BADGE, CHOICE: CHOICE, RESULT: RESULT };
})();
