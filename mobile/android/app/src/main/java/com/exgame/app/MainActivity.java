package com.exgame.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.view.Gravity;
import android.webkit.ConsoleMessage;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.webkit.WebViewAssetLoader;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 게임은 즉시 APK 내장(www)으로 실행합니다.
 * GitHub OTA는 백그라운드에서만 받습니다.
 * WebView 파일 선택(오디오 불러오기)은 onShowFileChooser 로 처리합니다.
 * (저장소 권한 없이 시스템 문서 UI 사용)
 */
public class MainActivity extends AppCompatActivity {
    private static final String TAG = "ExGameMain";
    private static final int FILE_CHOOSER_REQUEST = 4101;
    private static final String GAME_URL =
            "https://appassets.androidplatform.net/assets/www/index.html"
                    + "?offline=1&fullscreen=1&mobile=1";

    /**
     * true 이면 검증된 OTA www 를 로드합니다.
     * 당분간 APK 내장만 사용 (하얀 화면 재발 방지).
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
    @Nullable
    private ValueCallback<Uri[]> filePathCallback;

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
        updater.wipeOtaOnce("wipe_ota_v015");

        configureWebView();
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
                mainHandler.postDelayed(
                        () -> statusPanel.setVisibility(android.view.View.GONE),
                        300
                );
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

            /**
             * &lt;input type="file"&gt; (오디오 파일 추가)용.
             * 시스템 문서 선택기를 쓰므로 READ_EXTERNAL_STORAGE 불필요.
             */
            @Override
            public boolean onShowFileChooser(
                    WebView webView,
                    ValueCallback<Uri[]> filePathCallback,
                    FileChooserParams fileChooserParams
            ) {
                if (MainActivity.this.filePathCallback != null) {
                    MainActivity.this.filePathCallback.onReceiveValue(null);
                }
                MainActivity.this.filePathCallback = filePathCallback;

                Intent intent = fileChooserParams.createIntent();
                try {
                    // 오디오 MIME 이 비어 있으면 보완
                    String[] accept = fileChooserParams.getAcceptTypes();
                    boolean hasAccept = accept != null && accept.length > 0
                            && accept[0] != null && !accept[0].isEmpty();
                    if (!hasAccept) {
                        intent.setType("audio/*");
                    }
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (ActivityNotFoundException e) {
                    Log.w(TAG, "file chooser not found", e);
                    MainActivity.this.filePathCallback = null;
                    filePathCallback.onReceiveValue(null);
                    return false;
                }
                return true;
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
        settings.setAllowContentAccess(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);
    }

    @Override
    @SuppressWarnings("deprecation")
    protected void onActivityResult(int requestCode, int resultCode, @Nullable Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            Uri[] result = null;
            if (filePathCallback != null) {
                if (resultCode == Activity.RESULT_OK) {
                    result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
                }
                filePathCallback.onReceiveValue(result);
                filePathCallback = null;
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
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
                                // background only
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
        if (filePathCallback != null) {
            filePathCallback.onReceiveValue(null);
            filePathCallback = null;
        }
        updateWorker.shutdownNow();
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
