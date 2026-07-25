package com.exgame.app;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.webkit.WebChromeClient;
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
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Cocos Web 빌드를 로컬 https 가상 호스트로 띄웁니다.
 * 시작 시 공개 GitHub Releases를 확인합니다(PAT 불필요).
 * 업데이트 확인이 늦어도 내장 버전으로 먼저 진입합니다.
 */
public class MainActivity extends AppCompatActivity {
    private static final String TAG = "ExGameMain";
    private static final String GAME_URL =
            "https://appassets.androidplatform.net/assets/www/index.html"
                    + "?offline=1&fullscreen=1&mobile=1";
    /** 업데이트 확인 최대 대기. 넘으면 내장 버전으로 바로 시작. */
    private static final long UPDATE_BUDGET_MS = 12_000L;

    private WebView webView;
    private LinearLayout statusPanel;
    private TextView statusText;
    private ProgressBar progressBar;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicReference<WebViewAssetLoader> assetLoaderRef = new AtomicReference<>();
    private final AtomicBoolean gameStarted = new AtomicBoolean(false);
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
        updater.discardBrokenOtaIfNeeded();
        configureWebView();
        // 일단 내장/기존 OTA 로더를 깔아 두고, 타임아웃 시 바로 게임 진입 가능
        installAssetLoader(updater);
        startUpdateThenLoad();
    }

    private LinearLayout buildStatusPanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setBackgroundColor(Color.parseColor("#F0101820"));
        panel.setPadding(48, 48, 48, 48);

        statusText = new TextView(this);
        statusText.setText(R.string.update_checking);
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
        });
        webView.setWebChromeClient(new WebChromeClient());

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setAllowFileAccess(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
    }

    private void installAssetLoader(GameUpdateManager updateManager) {
        WebViewAssetLoader.Builder builder = new WebViewAssetLoader.Builder();
        if (updateManager.hasOtaWww()) {
            builder.addPathHandler(
                    "/assets/",
                    new WebViewAssetLoader.InternalStoragePathHandler(
                            this, updateManager.getOtaRootDir()
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

    private void startUpdateThenLoad() {
        Future<GameUpdateManager.Result> future = worker.submit(() -> updater.checkAndApply(
                new GameUpdateManager.ProgressListener() {
                    @Override
                    public void onStatus(String message) {
                        mainHandler.post(() -> {
                            if (!gameStarted.get()) statusText.setText(message);
                        });
                    }

                    @Override
                    public void onProgress(int percentOrMinusOne) {
                        mainHandler.post(() -> {
                            if (gameStarted.get()) return;
                            if (percentOrMinusOne < 0) {
                                progressBar.setIndeterminate(true);
                            } else {
                                progressBar.setIndeterminate(false);
                                progressBar.setProgress(percentOrMinusOne);
                            }
                        });
                    }
                }
        ));

        worker.execute(() -> {
            GameUpdateManager.Result result;
            try {
                result = future.get(UPDATE_BUDGET_MS, TimeUnit.MILLISECONDS);
            } catch (Exception e) {
                Log.w(TAG, "update budget exceeded or failed", e);
                future.cancel(true);
                result = new GameUpdateManager.Result(
                        false,
                        updater.getInstalledWwwVersion(),
                        updater.getInstalledWwwVersionCode(),
                        "업데이트 시간 초과 — 내장 버전으로 시작"
                );
            }

            final GameUpdateManager.Result finalResult = result;
            mainHandler.post(() -> {
                if (finalResult.updated) {
                    installAssetLoader(updater);
                    statusText.setText(
                            getString(R.string.update_ready) + " (" + finalResult.version + ")"
                    );
                } else if (finalResult.message != null
                        && (finalResult.message.contains("원격")
                        || finalResult.message.contains("초과"))) {
                    statusText.setText(R.string.update_failed_offline);
                }
                startGameOnce();
            });
        });

        // 예산이 끝나기 전에도 UI가 하얗게만 보이지 않도록, 로더가 준비되면 안전망 타이머
        mainHandler.postDelayed(() -> {
            if (!gameStarted.get()) {
                statusText.setText(R.string.update_failed_offline);
                startGameOnce();
            }
        }, UPDATE_BUDGET_MS + 500L);
    }

    private void startGameOnce() {
        if (!gameStarted.compareAndSet(false, true)) return;
        installAssetLoader(updater);
        statusPanel.setVisibility(View.GONE);
        webView.loadUrl(GAME_URL);
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
        worker.shutdownNow();
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
