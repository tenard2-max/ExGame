package com.exgame.app;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 게임은 즉시 APK 내장(www)으로 실행합니다.
 * GitHub OTA는 백그라운드에서만 받으며, 다음 실행부터 적용합니다.
 * (업데이트 대기 중 하얀 화면 고정을 막기 위함. PAT 불필요.)
 */
public class MainActivity extends AppCompatActivity {
    private static final String TAG = "ExGameMain";
    private static final String GAME_URL =
            "https://appassets.androidplatform.net/assets/www/index.html"
                    + "?offline=1&fullscreen=1&mobile=1";

    /**
     * true 이면 검증된 OTA www 를 로드합니다.
     * 0.1.3: 깨진 OTA로 하얀 화면이 재발하지 않도록 당분간 APK 내장만 사용.
     * (백그라운드 다운로드는 계속하며, 안정화 후 true 로 전환)
     */
    private static final boolean LOAD_OTA_WWW = false;

    private WebView webView;
    private LinearLayout statusPanel;
    private TextView statusText;
    private ProgressBar progressBar;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService updateWorker = Executors.newSingleThreadExecutor();
    private final AtomicReference<WebViewAssetLoader> assetLoaderRef = new AtomicReference<>();
    private GameUpdateManager updater;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#101820"));
        setContentView(root);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#101820"));
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        statusPanel = buildStatusPanel();
        root.addView(statusPanel, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        updater = new GameUpdateManager(
                this,
                getString(R.string.github_owner),
                getString(R.string.github_repo)
        );
        // 이전에 깨진 OTA가 하얀 화면을 만들면 지우고 내장본으로 복구
        updater.discardBrokenOtaIfNeeded();
        updater.wipeOtaOnce("wipe_ota_v013");

        configureWebView();
        // 이번 세션 로더: 기본은 APK assets (OTA 로드는 플래그로 제어)
        installAssetLoader(LOAD_OTA_WWW && updater.hasOtaWww());
        startGameNow();
        startBackgroundUpdate();
    }

    private LinearLayout buildStatusPanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setBackgroundColor(Color.parseColor("#F0101820"));
        panel.setPadding(48, 48, 48, 48);

        statusText = new TextView(this);
        statusText.setText("게임 시작 중…");
        statusText.setTextColor(Color.WHITE);
        statusText.setTextSize(16f);
        statusText.setGravity(Gravity.CENTER_HORIZONTAL);

        progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setIndeterminate(true);
        progressBar.setMax(100);
        LinearLayout.LayoutParams barLp = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        barLp.topMargin = 24;
        panel.addView(statusText);
        panel.addView(progressBar, barLp);
        return panel;
    }

    private void configureWebView() {
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(
                    WebView view,
                    WebResourceRequest request
            ) {
                WebViewAssetLoader loader = assetLoaderRef.get();
                if (loader == null) return null;
                return loader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public void onReceivedError(
                    WebView view,
                    WebResourceRequest request,
                    WebResourceError error
            ) {
                if (request != null && request.isForMainFrame()) {
                    Log.e(TAG, "main frame error: " + error.getDescription());
                    mainHandler.post(() -> {
                        statusPanel.setVisibility(android.view.View.VISIBLE);
                        statusText.setText("로드 실패: " + error.getDescription());
                        progressBar.setIndeterminate(false);
                    });
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                // 페이지가 뜨면 오버레이 제거 (Cocos 스플래시가 이어받음)
                mainHandler.postDelayed(() -> statusPanel.setVisibility(android.view.View.GONE), 300);
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage consoleMessage) {
                Log.d(TAG, consoleMessage.message()
                        + " @" + consoleMessage.sourceId()
                        + ":" + consoleMessage.lineNumber());
                return super.onConsoleMessage(consoleMessage);
            }
        });

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setAllowFileAccess(true);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
    }

    private void installAssetLoader(boolean useOta) {
        WebViewAssetLoader.Builder builder = new WebViewAssetLoader.Builder();
        if (useOta && updater.hasOtaWww()) {
            builder.addPathHandler(
                    "/assets/",
                    new WebViewAssetLoader.InternalStoragePathHandler(
                            this, updater.getOtaRootDir()
                    )
            );
        } else {
            builder.addPathHandler(
                    "/assets/",
                    new WebViewAssetLoader.AssetsPathHandler(this)
            );
        }
        assetLoaderRef.set(builder.build());
    }

    private void startGameNow() {
        statusText.setText("게임 시작 중…");
        webView.loadUrl(GAME_URL);
        // 페이지 콜백이 없어도 2초 뒤 오버레이는 걷어 하얀 고정 방지
        mainHandler.postDelayed(() -> statusPanel.setVisibility(android.view.View.GONE), 2000);
    }

    private void startBackgroundUpdate() {
        updateWorker.execute(() -> {
            try {
                GameUpdateManager.Result result = updater.checkAndApply(
                        new GameUpdateManager.ProgressListener() {
                            @Override
                            public void onStatus(String message) {
                                Log.i(TAG, "update: " + message);
                            }

                            @Override
                            public void onProgress(int percentOrMinusOne) {
                                // 백그라운드 — UI 막지 않음
                            }
                        }
                );
                Log.i(TAG, "update result updated=" + result.updated
                        + " ver=" + result.version
                        + " msg=" + result.message);
            } catch (Exception e) {
                Log.w(TAG, "background update failed", e);
            }
        });
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        updateWorker.shutdownNow();
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
