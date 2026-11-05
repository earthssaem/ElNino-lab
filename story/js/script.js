/* 대화로 배우는 엘니뇨: 캐릭터와 대본
 * 대사를 고치려면 이 파일만 고치면 된다. 그림의 수온·수온약층·해수면·용승은 ../js/model.js 가 s 로 계산한다.
 *
 * 캐릭터 CH : nm(대화창 이름) · tag(그림 위 짧은 이름) · ic(mood) → 얼굴 SVG
 * 단계 STEPS : title · lines[] · more(더 알아보기) · dare(도전 단계 표시)
 * 대사 line  : who(말하는 캐릭터) · t(대사)
 *   s     이 대사의 상태(−1 강한 엘니뇨 … 0 평상시 … +1 강한 라니냐). 생략하면 앞 대사 그대로
 *   badge 그림 왼쪽 위 딱지(normal·weak·nino·strong·nina). 생략하면 앞 대사 그대로
 *   show  이 대사부터 나타나는 그림 층(누적): wind 무역풍 · flow 표층 바닷물 이동 · sea 해수면 높이 차
 *         thermo 수온약층 · up 용승 · fish 어장 · air 공기 흐름과 구름·비
 *   hl    밝게 비출 곳: westsea · eastsea · wind · flow · sea · thermo · up · fish · cloud · sink · drywest
 *   key   핵심 정리 · mood 말하는 캐릭터 표정(sad)
 *   ask   먼저 예측하기 {q: 묻는 값, opts, ans, reveal: 고른 뒤의 s, badge: 고른 뒤의 딱지}
 * 교과 범위: 통합과학에 나오지 않는 용어(남방진동, 워커 순환)는 쓰지 않는다. 라니냐는 마지막 도전 단계에서 이름만 알려 준다.
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
    { title: '같은 적도, 다른 바다', lines: [
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
    { title: '무역풍이 바닷물을 밀어요', more: '실제 해수면 높이 차이는 수십 cm 정도예요. 그림에서는 잘 보이도록 크게 과장했어요.', lines: [
      { who: 'wind', show: ['wind'], hl: ['wind'],
        t: '나는 무역풍이야. 적도 부근에서 일 년 내내 동쪽에서 서쪽으로 불지.' },
      { who: 'wind', show: ['flow'], hl: ['flow'],
        t: '내가 바다 위를 불면 따뜻한 표층 바닷물이 서쪽으로 밀려가.' },
      { who: 'west', show: ['sea'], hl: ['sea'],
        t: '밀려온 따뜻한 물이 나한테 쌓여. 그래서 서쪽은 해수면이 동쪽보다 높아.' },
      { who: 'west', show: ['thermo'], hl: ['thermo'],
        t: '따뜻한 물의 층도 두꺼워. 흰 선 아래부터는 깊어질수록 수온이 빠르게 낮아지는 수온약층이야.',
        key: '무역풍 → 따뜻한 표층 바닷물이 서쪽으로 이동 → 서쪽은 해수면이 높고 따뜻한 물의 층이 두꺼워요.' }
    ] },
    { title: '동쪽에서는 찬물이 올라와요', lines: [
      { who: 'east', show: ['up'], hl: ['up'],
        t: '따뜻한 물이 서쪽으로 빠져나간 자리는 깊은 곳의 차가운 물이 올라와 채워. 이걸 용승이라고 해.' },
      { who: 'east', hl: ['eastsea'],
        t: '그래서 나는 적도에 있어도 차가워. 수온약층도 바다 표면 가까이까지 올라와 있지.' },
      { who: 'fisher', show: ['fish'], hl: ['fish'],
        t: '깊은 바닷물에는 영양분이 많아. 플랑크톤이 잘 자라고 물고기가 몰려들어서 우리 바다는 세계적인 어장이야.',
        key: '용승: 깊은 곳의 차가운 바닷물이 표층으로 올라오는 현상이에요. 영양분이 많아 좋은 어장이 만들어져요.' }
    ] },
    { title: '비는 어디에 많이 내릴까?', lines: [
      { who: 'cloud', show: ['air'], hl: ['cloud'],
        t: '따뜻한 바다 위에서는 데워진 공기가 위로 올라가. 공기가 올라가면 구름이 생기고 비가 내리지.' },
      { who: 'cloud', hl: ['cloud'],
        t: '그래서 나는 주로 따뜻한 서쪽 바다 위에 있어. 인도네시아에 비가 많이 오고 열대 우림이 우거진 까닭이야.' },
      { who: 'fisher', hl: ['sink'],
        t: '우리 쪽은 차가운 바다 위로 공기가 내려오는 곳이라 비가 거의 안 와. 바닷가가 사막일 만큼 건조하지.',
        key: '따뜻한 바다 위: 공기가 올라감 → 구름과 비가 많아요. 차가운 바다 위: 공기가 내려옴 → 맑고 건조해요.' }
    ] },
    { title: '무역풍이 약해지면?', lines: [
      { who: 'wind', hl: ['wind'],
        t: '그런데 몇 년에 한 번씩 내가 평소보다 약해질 때가 있어.' },
      { who: 'wind', hl: ['eastsea'],
        t: '내가 약해지면 동쪽 바다의 수온은 어떻게 될까? 먼저 예측해 봐.',
        ask: { q: '동쪽 바다의 수온', opts: ['up', 'down', 'same'], ans: 'up', reveal: -0.85, badge: 'weak' } },
      { who: 'east', s: -0.85, badge: 'weak', hl: ['up', 'eastsea'],
        t: '서쪽에 쌓여 있던 따뜻한 물이 동쪽으로 돌아오고, 찬물이 올라오는 용승도 약해졌어. 그래서 내가 평소보다 따뜻해졌어.' },
      { who: 'west', hl: ['sea'],
        t: '나는 따뜻한 물이 빠져나가서 해수면이 낮아졌어. 수온도 조금 내려갔고.' },
      { who: 'east', badge: 'nino',
        t: '이처럼 동태평양 적도 부근의 표층 수온이 평소보다 높은 상태가 몇 달 넘게 이어지는 현상을 엘니뇨라고 해.',
        key: '엘니뇨: 무역풍이 약해져 동태평양 적도 부근의 표층 수온이 평소보다 높은 상태가 몇 달 이상 계속되는 현상이에요.' }
    ] },
    { title: '엘니뇨가 오면', more: '엘니뇨는 태평양 주변뿐 아니라 멀리 떨어진 지역의 날씨와 농작물 수확에도 영향을 줘요.', lines: [
      { who: 'fisher', mood: 'sad', hl: ['fish'],
        t: '용승이 약해지니 영양분이 올라오지 않아. 물고기가 줄어서 그물이 텅 비었어.' },
      { who: 'fisher', mood: 'sad',
        t: '이런 따뜻한 바닷물이 크리스마스 무렵에 찾아와서, 옛날 페루 어부들은 아기 예수를 뜻하는 스페인어 ‘엘니뇨’라는 이름을 붙였대.' },
      { who: 'cloud', hl: ['cloud'],
        t: '나도 따뜻해진 바다를 따라 동쪽으로 옮겨 갔어. 평소 건조하던 남아메리카 서쪽 해안에 큰비가 내려 홍수가 나기도 해.' },
      { who: 'west', hl: ['drywest'],
        t: '반대로 나와 가까운 인도네시아와 오스트레일리아는 비가 줄어 가뭄이 들고, 산불이 나기도 해.',
        key: '엘니뇨의 영향: 동태평양의 어획량이 줄고, 비가 많이 오는 곳이 바뀌어 어떤 곳은 홍수, 어떤 곳은 가뭄과 산불을 겪어요.' }
    ] },
    { title: '한눈에 정리', lines: [
      { who: 'wind', s: 0, badge: 'normal',
        t: '처음으로 돌아가 볼까? 평소에는 내가 불어서 동쪽 바다가 차갑고, 비는 서쪽에 많이 내렸어.' },
      { who: 'wind', s: -0.85, badge: 'nino',
        t: '내가 약해지면 이렇게 바뀌어. ◀ 이전 버튼으로 앞의 그림과 번갈아 비교해 봐.',
        key: '무역풍 약해짐 → 따뜻한 바닷물이 동쪽으로 → 용승 약해짐 → 동태평양 수온 상승 → 어획량 감소, 비 오는 곳의 변화(홍수·가뭄)' }
    ] },
    { title: '무역풍이 강해지면?', dare: true, lines: [
      { who: 'wind', s: 0, badge: 'normal', hl: ['wind'],
        t: '이번엔 반대야. 내가 평소보다 훨씬 세게 불면 어떻게 될까? 지금까지 배운 것으로 추리해 봐.' },
      { who: 'wind', hl: ['eastsea'],
        t: '내가 세게 불면 동쪽 바다의 수온은 어떻게 될까?',
        ask: { q: '동쪽 바다의 수온', opts: ['up', 'down', 'same'], ans: 'down', reveal: 0.85, badge: 'strong' } },
      { who: 'east', s: 0.85, badge: 'strong', hl: ['up', 'eastsea'],
        t: '따뜻한 물이 서쪽으로 더 많이 밀려가고, 찬물이 올라오는 용승이 더 강해졌어. 그래서 나는 평소보다 더 차가워졌어.' },
      { who: 'fisher', hl: ['fish'],
        t: '영양분이 많이 올라오니 물고기도 더 많아졌네.' },
      { who: 'cloud', hl: ['cloud'],
        t: '서쪽 바다는 더 따뜻해져서 서쪽에는 비가 더 많이 내려.' },
      { who: 'east', badge: 'nina',
        t: '엘니뇨와 정반대지? 이런 상태에도 이름이 있어. 바로 라니냐야.',
        key: '라니냐: 무역풍이 강해져 동태평양 적도 부근의 표층 수온이 평소보다 낮은 상태가 이어지는 현상이에요. 엘니뇨와 반대예요.' },
      { who: 'fisher',
        t: '실제 바다에서도 정말 이렇게 바뀌었을까? 진짜 관측 자료로 확인해 보자.' }
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

  window.STORY = { CH: CH, STEPS: STEPS, BADGE: BADGE, CHOICE: CHOICE, RESULT: RESULT, END_URL: '../observatory/', END_LABEL: '실제 자료로 확인하기 →' };
})();
