/**
 * 모바일 셸 판별 및 빌드 페이지 크롬(헤더/푸터) 제거입니다.
 * PC·모바일 공통으로 상단 exgame 헤더를 숨깁니다.
 */

const MOBILE_BODY_CLASS = 'exgame-mobile';

/** 터치 우선 환경이거나 강제 플래그일 때 모바일 셸로 취급합니다. */
export function isMobileShell(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false;
  }
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('mobile') === '1') return true;
    if (params.get('mobile') === '0') return false;
  } catch {
    // ignore
  }
  const coarse = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  const touchPoints = navigator.maxTouchPoints > 0;
  const ua = navigator.userAgent || '';
  const androidWebView = /Android/i.test(ua)
    && (/wv|WebView/i.test(ua) || !/Chrome\/\d+/i.test(ua) || /Version\/\d+/i.test(ua));
  return coarse || (touchPoints && /Android|iPhone|iPad|iPod/i.test(ua)) || androidWebView;
}

/** body에 모바일 클래스를 붙입니다. CSS 분기용입니다. */
export function applyMobileShellClass(): void {
  if (typeof document === 'undefined') return;
  document.body.classList.toggle(MOBILE_BODY_CLASS, isMobileShell());
}

/**
 * 빌드 템플릿의 상단 헤더·하단 푸터를 제거합니다.
 * PC/모바일 공통입니다.
 */
export function stripBuildPageChrome(): void {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('.header, .footer').forEach((el) => {
    el.remove();
  });
  let style = document.getElementById('exgame-chrome-strip') as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = 'exgame-chrome-strip';
    document.head.appendChild(style);
  }
  style.textContent = `
.header, .footer { display: none !important; height: 0 !important; margin: 0 !important; padding: 0 !important; }
html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  height: 100% !important;
  overflow: hidden !important;
  background: #000 !important;
}
#GameDiv {
  margin: 0 auto !important;
}
`;
}

/** 부트 시 한 번에 호출합니다. */
export function initShellUi(): void {
  stripBuildPageChrome();
  applyMobileShellClass();
}
