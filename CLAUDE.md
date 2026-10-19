# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 작업 규칙

- **모든 작업은 머지까지 끝낸다.** 커밋 → 푸시 → `main` 대상 PR 생성 → 머지까지 한 번에 하고, 사용자에게 따로 묻지 않는다. 머지 방식은 일반 머지(merge commit).
- 앞선 PR이 이미 머지된 작업 브랜치에 이어서 작업할 때는 최신 `main`에서 브랜치를 다시 시작한다.
- 기본 브랜치는 `main`이다.
- 화면 글자, 코드 주석, 커밋 메시지, PR 설명은 한국어로 쓴다.

## 프로젝트 개요

지구과학Ⅰ 「대기와 해양의 상호 작용」(엘니뇨·라니냐, 남방진동) 수업용 정적 웹앱이다. 빌드 도구, 패키지, 테스트 코드가 없고 `index.html`을 브라우저로 열면 바로 동작한다. 글은 최소로 하고 모식도와 조작 위주로 만든다. 용어는 교과서 용어(수온 약층, 혼합층, 용승, 엘니뇨 감시 구역, 남방진동 지수, 워커 순환)를 따른다.

## 명령

```bash
# 로컬 서버 (파일로 바로 열어도 되지만 브라우저 검사는 서버로)
npx http-server -p 8765 -c-1 .

# 문법·미정의 변수 검사 (설정 파일 없음)
npx eslint --no-config-lookup --rule '{"no-undef":"error"}' \
  --global window,document,getComputedStyle,localStorage,history,location,performance,requestAnimationFrame,ResizeObserver,MutationObserver,Map,Uint8ClampedArray \
  js/*.js
```

자동 테스트가 없으므로 바꾼 뒤에는 Playwright(Chromium)로 직접 확인한다. 휴대폰(375px), 태블릿(820px), 노트북(1366×768), 교실 프로젝터(1280×720, 1024×768) 크기와 밝은·어두운 테마(`colorScheme`)에서 세 탭(`#wind`, `#compare`, `#so`)을 열어 콘솔 오류, 404, 가로 넘침(`scrollWidth > clientWidth`)이 없는지 본다. 휴대폰 터치 스크롤은 CDP `Input.synthesizeScrollGesture`로는 헤드리스에서 재현되지 않으므로 `Input.dispatchTouchEvent`를 쓴다.

## 구조

모듈 시스템 없이 `<script>` 태그로 읽고 전역 객체로 연결한다. **읽는 순서가 의존 순서**다(`index.html` 아래쪽):

`land.js`(`window.ENSO_LAND`) → `model.js`(`window.ENSO`) → `draw.js`(`window.ENSODraw`) → `tab-wind.js` / `tab-compare.js` / `tab-so.js`(`window.TabWind` 등) → `app.js`

### 상태 변수 `s` 하나로 모든 값이 정해진다

- `s` ∈ [−1, 1]: −1 강한 엘니뇨(무역풍 약화) · 0 평상시 · +1 강한 라니냐(무역풍 강화). 탭의 엘니뇨·라니냐 버튼은 ±0.85.
- 경도는 0~360°E로 다룬다(180 = 날짜 변경선, 260 = 100°W). 단면은 `LON_W`=130 ~ `LON_E`=280.
- 수온, 20 °C 등온선 깊이(`iso20`), 혼합층(= iso20의 절반 = 수온 약층 시작 깊이), 해수면, 용승, 워커 순환, 기압이 모두 `model.js`에서 `s`로 계산된다. 수치를 바꾸려면 `model.js`의 표(`ANOM_NINO`, `ANOM_NINA`, `iso20`의 서·동 깊이 등)만 고치면 세 탭에 모두 반영된다. 수치를 바꾸면 README의 「과학적 근거와 단순화」도 함께 고친다.
- 엘니뇨·라니냐 판정은 `nino34(s)`(엘니뇨 감시 구역 평균 편차)의 ±0.5 °C 기준(`phase`).
- ③의 시계열(`EVENTS`, `seriesState`)은 **실제 관측 자료가 아닌 모식값**이다. 화면과 문서에서 관측 자료처럼 보이게 하지 않는다.

### 탭 모듈과 화면 갱신

- 각 탭 모듈은 `init(cfg)`, `show()`, `hide()`, `frame(dt)`, `redraw()`를 가진다. `app.js`가 탭 전환(①은 주소 그대로, ②·③은 `#compare`·`#so` 주소, `localStorage` 기억, `index.html` 머리 스크립트의 `html[data-tab]`로 새로고침 깜빡임 방지)과 `requestAnimationFrame` 루프 하나를 맡고, 보이는 탭의 `frame(dt)`만 부른다.
- `frame`은 '움직임'이 꺼져 있고 `dirty`가 아니면 아무것도 그리지 않는다. 상태나 옵션을 바꾸면 `dirty = true`로 표시해야 화면이 바뀐다.
- 캔버스는 정적인 바탕(하늘·바다 단면·등온선·육지·축)을 `base` 캔버스에 캐시하고(키: `s`, 크기, 옵션, `themeTick`), 매 프레임 그 위에 움직이는 층(입자, 무역풍, 워커 순환, 물고기)만 그린다. 수온 단면 이미지는 `draw.js`의 `field()`가 따로 캐시한다.
- 캔버스 크기는 CSS가 아니라 각 탭의 `resize()`가 컨테이너 폭으로 계산한다(`ResizeObserver`, `devicePixelRatio` 최대 2). ②는 가로 3단일 때 세 그림이 한 화면에 들어오도록 창 높이에 맞춘다.
- ③의 지도는 등장방형 평면 지도를 한 장 만든 뒤 띠 150개로 잘라 원근(남쪽에서 비스듬히 내려다본 모습)으로 그린다. 워커 순환은 `D.drawWalker`에 좌표 변환 함수 `P(lon, a)`를 넘겨 ②의 단면과 ③의 지도가 같은 코드로 그린다. 기압 시소와 시계열 그래프는 JS로 만드는 SVG다.

### 색과 테마

- 모든 색은 `css/style.css`의 CSS 변수다. 어두운 테마 값이 `@media (prefers-color-scheme: dark)` 블록과 `:root[data-theme="dark"]` 블록 **두 곳에 똑같이** 들어 있으므로 함께 고친다.
- 캔버스는 `D.theme()`로 CSS 변수를 읽어 캐시한다. 캔버스에 새 색을 쓰려면 CSS 변수(밝은·어두운 세 곳)를 추가하고 `D.theme()`에 연결한다. 테마가 바뀌면 `app.js`가 `D.invalidateTheme()`와 각 탭의 `redraw()`를 부른다.
- 엘니뇨·라니냐·평상시 색 바탕 위의 글자는 `--on-phase`(밝은 테마 흰색, 어두운 테마 진한 색)를 쓴다.

## 코드 관례

- 기존 코드처럼 ES5 문법(`var`, `function`, 즉시 실행 함수 + `'use strict'`)을 유지한다. 빌드 단계가 없다.
- 접근성: 모든 조작은 키보드로도 되어야 한다(탭 ←/→, 슬라이더, ③ 그래프의 ←/→·PageUp/PageDown·Home/End). 상태가 바뀌면 캔버스의 `aria-label`도 갱신한다. 운영 체제의 '동작 줄이기'가 켜져 있으면 각 탭의 '움직임'이 꺼진 채 시작한다.
