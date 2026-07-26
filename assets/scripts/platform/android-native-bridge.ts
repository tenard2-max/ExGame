/**
 * Android WebView `ExGameNative` 브리지 접근입니다.
 * PC/브라우저에는 객체가 없으므로 모두 no-op/false 로 처리합니다.
 */

interface ExGameNativeBridge {
  isAndroid?: () => boolean;
  getVersionName?: () => string;
  getVersionCode?: () => number;
  requestApkUpdate?: () => void;
  openReleasesPage?: () => void;
}

function getBridge(): ExGameNativeBridge | null {
  if (typeof window === 'undefined') return null;
  const bridge = (window as Window & { ExGameNative?: ExGameNativeBridge }).ExGameNative;
  return bridge ?? null;
}

/** Android 앱 WebView에서만 true. */
export function hasAndroidNativeBridge(): boolean {
  const bridge = getBridge();
  return typeof bridge?.requestApkUpdate === 'function';
}

/** GitHub 최신 APK 확인 후 브라우저로 다운로드/릴리스를 엽니다. */
export function requestAndroidApkUpdate(): void {
  getBridge()?.requestApkUpdate?.();
}

export function openAndroidReleasesPage(): void {
  getBridge()?.openReleasesPage?.();
}
