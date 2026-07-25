package com.exgame.app;

import android.annotation.SuppressLint;
import android.graphics.Color;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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
import java.util.concurrent.atomic.AtomicReference;

/**
 * Cocos Web 빌드를 로컬 https 가상 호스트로 띄웁니다.
 * 시작 시 GitHub Releases version.json을 확인해 www를 OTA 갱신합니다.
 */
public class MainActivity extends AppCompatActivity {
    private static final String GAME_URL =
            "https://appassets.androidplatform.net/assets/www/index.html"
                    + "?offline=1&fullscreen=1&mobile=1";

    private WebView webView;
    private LinearLayout statusPanel;
    private TextView statusText;
    private ProgressBar progressBar;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicReference<WebViewAssetLoader> assetLoaderRef = new AtomicReference<>();

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        FrameLayout root = new FrameLayout(this);
        setContentView(root);

        webView = new WebView(this);
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        statusPanel = buildStatusPanel();
        root.addView(statusPanel, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        configureWebView();
        startUpdateThenLoad();
    }

    private LinearLayout buildStatusPanel() {
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setBackgroundColor(Color.parseColor("#E0101820"));
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

    /**
     * OTA www가 있으면 내부 저장소만 사용하고, 없으면 APK assets를 사용합니다.
     * (InternalStoragePathHandler는 파일 부재 시 404를 돌려 폴백 체인이 불가합니다.)
     */
    private void installAssetLoader(GameUpdateManager updater) {
        WebViewAssetLoader.Builder builder = new WebViewAssetLoader.Builder();
        if (updater.hasOtaWww()) {
            builder.addPathHandler(
                    "/assets/",
                    new WebViewAssetLoader.InternalStoragePathHandler(this, updater.getOtaRootDir())
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
        final GameUpdateManager updater = new GameUpdateManager(
                this,
                getString(R.string.github_owner),
                getString(R.string.github_repo)
        );

        worker.execute(() -> {
            GameUpdateManager.Result result = updater.checkAndApply(
                    new GameUpdateManager.ProgressListener() {
                        @Override
                        public void onStatus(String message) {
                            mainHandler.post(() -> statusText.setText(message));
                        }

                        @Override
                        public void onProgress(int percentOrMinusOne) {
                            mainHandler.post(() -> {
                                if (percentOrMinusOne < 0) {
                                    progressBar.setIndeterminate(true);
                                } else {
                                    progressBar.setIndeterminate(false);
                                    progressBar.setProgress(percentOrMinusOne);
                                }
                            });
                        }
                    }
            );

            mainHandler.post(() -> {
                installAssetLoader(updater);
                if (result.updated) {
                    statusText.setText(
                            getString(R.string.update_ready) + " (" + result.version + ")"
                    );
                } else if (result.message != null && result.message.contains("원격")) {
                    statusText.setText(R.string.update_failed_offline);
                }
                long delayMs = result.updated ? 600L : 200L;
                mainHandler.postDelayed(() -> {
                    statusPanel.setVisibility(View.GONE);
                    webView.loadUrl(GAME_URL);
                }, delayMs);
            });
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
        worker.shutdownNow();
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
