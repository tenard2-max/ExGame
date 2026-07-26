package com.exgame.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

import java.util.concurrent.ExecutorService;

/**
 * WebView ↔ 네이티브 브리지.
 * 게임 DOM에서 APK 업데이트 확인/다운로드 페이지 열기에 사용합니다.
 */
public final class ExGameJsBridge {
    private static final String TAG = "ExGameJsBridge";

    private final MainActivity activity;
    private final GameUpdateManager updater;
    private final ExecutorService worker;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    public ExGameJsBridge(
            MainActivity activity,
            GameUpdateManager updater,
            ExecutorService worker
    ) {
        this.activity = activity;
        this.updater = updater;
        this.worker = worker;
    }

    @JavascriptInterface
    public boolean isAndroid() {
        return true;
    }

    @JavascriptInterface
    public String getVersionName() {
        return PackageVersions.versionName(activity);
    }

    @JavascriptInterface
    public int getVersionCode() {
        return PackageVersions.versionCode(activity);
    }

    /**
     * GitHub 최신 Release의 APK를 확인합니다.
     * 새 버전이면 다운로드 URL을 브라우저로 열고, 아니면 토스트로 안내합니다.
     */
    @JavascriptInterface
    public void requestApkUpdate() {
        worker.execute(() -> {
            try {
                GameUpdateManager.ApkCheckResult result = updater.checkApkUpdate();
                mainHandler.post(() -> handleApkCheckResult(result));
            } catch (Exception e) {
                Log.w(TAG, "requestApkUpdate failed", e);
                mainHandler.post(() -> {
                    Toast.makeText(
                            activity,
                            "업데이트 확인 실패. 릴리스 페이지를 엽니다.",
                            Toast.LENGTH_LONG
                    ).show();
                    openUrl(updater.getReleasesLatestUrl());
                });
            }
        });
    }

    /** 최신 Release 페이지를 바로 엽니다. */
    @JavascriptInterface
    public void openReleasesPage() {
        mainHandler.post(() -> openUrl(updater.getReleasesLatestUrl()));
    }

    private void handleApkCheckResult(GameUpdateManager.ApkCheckResult result) {
        if (result.newerAvailable) {
            String url = result.apkDownloadUrl != null && !result.apkDownloadUrl.isEmpty()
                    ? result.apkDownloadUrl
                    : result.releasePageUrl;
            Toast.makeText(
                    activity,
                    "새 버전 v" + result.remoteVersion + " 다운로드를 엽니다",
                    Toast.LENGTH_LONG
            ).show();
            openUrl(url);
            return;
        }
        if (result.checkFailed) {
            Toast.makeText(
                    activity,
                    result.message + " — 릴리스 페이지를 엽니다",
                    Toast.LENGTH_LONG
            ).show();
            openUrl(result.releasePageUrl);
            return;
        }
        Toast.makeText(
                activity,
                "최신 버전입니다 (v" + result.localVersion + ")",
                Toast.LENGTH_SHORT
        ).show();
    }

    private void openUrl(String url) {
        if (url == null || url.isEmpty()) return;
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            activity.startActivity(intent);
        } catch (Exception e) {
            Log.w(TAG, "openUrl failed: " + url, e);
            Toast.makeText(activity, "브라우저를 열 수 없습니다", Toast.LENGTH_SHORT).show();
        }
    }
}
