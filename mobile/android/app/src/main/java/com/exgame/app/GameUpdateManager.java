package com.exgame.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * GitHub Releases의 version.json / www zip을 확인해
 * 내부 저장소에 게임 본문을 갱신합니다.
 */
public final class GameUpdateManager {
    private static final String TAG = "ExGameUpdate";
    private static final String PREFS = "exgame_update";
    private static final String KEY_WWW_VERSION = "www_version";
    private static final String KEY_WWW_VERSION_CODE = "www_version_code";
    private static final int CONNECT_TIMEOUT_MS = 12_000;
    private static final int READ_TIMEOUT_MS = 60_000;

    public interface ProgressListener {
        void onStatus(String message);
        void onProgress(int percentOrMinusOne);
    }

    public static final class Result {
        public final boolean updated;
        public final String version;
        public final int versionCode;
        public final String message;

        Result(boolean updated, String version, int versionCode, String message) {
            this.updated = updated;
            this.version = version;
            this.versionCode = versionCode;
            this.message = message;
        }
    }

    private final Context appContext;
    private final String owner;
    private final String repo;

    public GameUpdateManager(Context context, String owner, String repo) {
        this.appContext = context.getApplicationContext();
        this.owner = owner;
        this.repo = repo;
    }

    /** OTA 게임 루트: files/ota/www/index.html */
    public File getOtaWwwDir() {
        return new File(new File(appContext.getFilesDir(), "ota"), "www");
    }

    /** WebViewAssetLoader InternalStorage 루트 (ota). URL /assets/www/... → ota/www/... */
    public File getOtaRootDir() {
        return new File(appContext.getFilesDir(), "ota");
    }

    public boolean hasOtaWww() {
        return new File(getOtaWwwDir(), "index.html").isFile();
    }

    public String getInstalledWwwVersion() {
        return prefs().getString(KEY_WWW_VERSION, bundledVersionName());
    }

    public int getInstalledWwwVersionCode() {
        return prefs().getInt(KEY_WWW_VERSION_CODE, bundledVersionCode());
    }

    /**
     * 최신 릴리스를 확인하고 필요 시 www zip을 받아 적용합니다.
     * 네트워크 실패 시 내장/기존 OTA로 계속 진행합니다.
     */
    public Result checkAndApply(ProgressListener listener) {
        notify(listener, "업데이트 확인 중…", -1);
        try {
            JSONObject remote = fetchVersionJson();
            if (remote == null) {
                return new Result(false, getInstalledWwwVersion(), getInstalledWwwVersionCode(),
                        "원격 버전 정보를 가져오지 못했습니다");
            }
            String remoteVersion = remote.optString("version", "");
            int remoteCode = remote.optInt("versionCode", 0);
            String wwwZip = remote.optString("wwwZip", "");
            if (wwwZip.isEmpty()) {
                wwwZip = String.format(Locale.US, "exgame-%s-www.zip", remoteVersion);
            }

            int localCode = getInstalledWwwVersionCode();
            boolean needWww = remoteCode > localCode
                    || (remoteCode == localCode && !hasOtaWww() && remoteCode > 0);
            // 버전 문자열만 올라간 경우도 허용
            if (!needWww && remoteCode == localCode) {
                String localVer = getInstalledWwwVersion();
                needWww = remoteVersion.length() > 0
                        && !remoteVersion.equals(localVer)
                        && compareSemver(remoteVersion, localVer) > 0;
            }
            if (!needWww && hasOtaWww()) {
                return new Result(false, getInstalledWwwVersion(), localCode, "이미 최신입니다");
            }
            if (!needWww && !hasOtaWww() && remoteCode <= bundledVersionCode()) {
                return new Result(false, bundledVersionName(), bundledVersionCode(),
                        "내장 버전 사용");
            }

            notify(listener, "게임 데이터 다운로드 중…", 0);
            File zipFile = new File(appContext.getCacheDir(), "exgame-www-update.zip");
            String downloadUrl = String.format(
                    Locale.US,
                    "https://github.com/%s/%s/releases/latest/download/%s",
                    owner, repo, wwwZip
            );
            downloadFile(downloadUrl, zipFile, listener);

            notify(listener, "업데이트 적용 중…", -1);
            File staging = new File(appContext.getFilesDir(), "ota_staging");
            deleteRecursive(staging);
            if (!staging.mkdirs()) {
                throw new IOException("staging 디렉터리 생성 실패");
            }
            unzipTo(zipFile, staging);
            // zip 루트가 www/ 이거나 바로 index.html 인 경우 모두 허용
            File stagedWww = new File(staging, "www");
            if (!new File(stagedWww, "index.html").isFile()) {
                if (new File(staging, "index.html").isFile()) {
                    stagedWww = staging;
                } else {
                    throw new IOException("www zip에 index.html 이 없습니다");
                }
            }

            File otaRoot = getOtaRootDir();
            File otaWww = getOtaWwwDir();
            deleteRecursive(otaWww);
            // ota/www 로 이동
            File finalWwwParent = otaRoot;
            if (!finalWwwParent.exists() && !finalWwwParent.mkdirs()) {
                throw new IOException("ota 루트 생성 실패");
            }
            File targetWww = new File(finalWwwParent, "www");
            deleteRecursive(targetWww);
            if (stagedWww.equals(staging)) {
                if (!stagedWww.renameTo(targetWww)) {
                    copyRecursive(stagedWww, targetWww);
                    deleteRecursive(stagedWww);
                }
            } else {
                if (!stagedWww.renameTo(targetWww)) {
                    copyRecursive(stagedWww, targetWww);
                    deleteRecursive(staging);
                } else {
                    deleteRecursive(staging);
                }
            }
            // rename left empty staging
            deleteRecursive(staging);
            //noinspection ResultOfMethodCallIgnored
            zipFile.delete();

            prefs().edit()
                    .putString(KEY_WWW_VERSION, remoteVersion)
                    .putInt(KEY_WWW_VERSION_CODE, Math.max(remoteCode, 1))
                    .apply();

            writeLocalVersionMarker(remoteVersion, Math.max(remoteCode, 1));
            return new Result(true, remoteVersion, Math.max(remoteCode, 1), "업데이트 완료");
        } catch (Exception e) {
            Log.w(TAG, "update failed", e);
            return new Result(false, getInstalledWwwVersion(), getInstalledWwwVersionCode(),
                    e.getMessage() != null ? e.getMessage() : "update failed");
        }
    }

    private JSONObject fetchVersionJson() throws IOException {
        String url = String.format(
                Locale.US,
                "https://github.com/%s/%s/releases/latest/download/version.json",
                owner, repo
        );
        HttpURLConnection conn = open(url);
        try {
            int code = conn.getResponseCode();
            if (code >= 400) {
                Log.w(TAG, "version.json HTTP " + code);
                return null;
            }
            String body = readFully(conn.getInputStream());
            return new JSONObject(body);
        } catch (Exception e) {
            Log.w(TAG, "fetchVersionJson", e);
            return null;
        } finally {
            conn.disconnect();
        }
    }

    private void downloadFile(String url, File dest, ProgressListener listener) throws IOException {
        HttpURLConnection conn = open(url);
        try {
            int code = conn.getResponseCode();
            if (code >= 400) {
                throw new IOException("다운로드 실패 HTTP " + code);
            }
            long total = conn.getContentLengthLong();
            try (InputStream in = new BufferedInputStream(conn.getInputStream());
                 OutputStream out = new BufferedOutputStream(new FileOutputStream(dest))) {
                byte[] buf = new byte[8192];
                long readTotal = 0;
                int n;
                int lastPct = -1;
                while ((n = in.read(buf)) >= 0) {
                    out.write(buf, 0, n);
                    readTotal += n;
                    if (total > 0 && listener != null) {
                        int pct = (int) Math.min(99, (readTotal * 100) / total);
                        if (pct != lastPct) {
                            lastPct = pct;
                            listener.onProgress(pct);
                        }
                    }
                }
                out.flush();
            }
            if (listener != null) listener.onProgress(100);
        } finally {
            conn.disconnect();
        }
    }

    private static HttpURLConnection open(String urlString) throws IOException {
        URL url = new URL(urlString);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setInstanceFollowRedirects(true);
        conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
        conn.setReadTimeout(READ_TIMEOUT_MS);
        conn.setRequestProperty("Accept", "application/octet-stream, application/json, */*");
        conn.setRequestProperty("User-Agent", "ExGame-Android-Updater");
        return conn;
    }

    private static String readFully(InputStream in) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) >= 0) {
            bos.write(buf, 0, n);
        }
        return bos.toString(StandardCharsets.UTF_8.name());
    }

    private void unzipTo(File zipFile, File destDir) throws IOException {
        try (ZipInputStream zis = new ZipInputStream(
                new BufferedInputStream(new FileInputStream(zipFile)))) {
            ZipEntry entry;
            byte[] buf = new byte[8192];
            while ((entry = zis.getNextEntry()) != null) {
                File out = new File(destDir, entry.getName());
                String destPath = destDir.getCanonicalPath();
                String outPath = out.getCanonicalPath();
                if (!outPath.startsWith(destPath + File.separator) && !outPath.equals(destPath)) {
                    throw new IOException("잘못된 zip 경로: " + entry.getName());
                }
                if (entry.isDirectory()) {
                    if (!out.exists() && !out.mkdirs()) {
                        throw new IOException("디렉터리 생성 실패: " + out);
                    }
                } else {
                    File parent = out.getParentFile();
                    if (parent != null && !parent.exists() && !parent.mkdirs()) {
                        throw new IOException("부모 디렉터리 생성 실패: " + parent);
                    }
                    try (OutputStream os = new BufferedOutputStream(new FileOutputStream(out))) {
                        int n;
                        while ((n = zis.read(buf)) >= 0) {
                            os.write(buf, 0, n);
                        }
                    }
                }
                zis.closeEntry();
            }
        }
    }

    private void writeLocalVersionMarker(String version, int code) {
        try {
            File marker = new File(getOtaWwwDir(), "version.json");
            File parent = marker.getParentFile();
            if (parent != null && !parent.exists()) parent.mkdirs();
            String json = String.format(
                    Locale.US,
                    "{\"version\":\"%s\",\"versionCode\":%d}\n",
                    version.replace("\"", ""),
                    code
            );
            try (OutputStream os = new FileOutputStream(marker)) {
                os.write(json.getBytes(StandardCharsets.UTF_8));
            }
        } catch (IOException e) {
            Log.w(TAG, "marker write failed", e);
        }
    }

    private String bundledVersionName() {
        return PackageVersions.versionName(appContext);
    }

    private int bundledVersionCode() {
        return PackageVersions.versionCode(appContext);
    }

    private SharedPreferences prefs() {
        return appContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private static void notify(ProgressListener listener, String msg, int pct) {
        if (listener == null) return;
        listener.onStatus(msg);
        listener.onProgress(pct);
    }

    static void deleteRecursive(File file) {
        if (file == null || !file.exists()) return;
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursive(child);
                }
            }
        }
        //noinspection ResultOfMethodCallIgnored
        file.delete();
    }

    static void copyRecursive(File src, File dest) throws IOException {
        if (src.isDirectory()) {
            if (!dest.exists() && !dest.mkdirs()) {
                throw new IOException("copy mkdir fail: " + dest);
            }
            File[] children = src.listFiles();
            if (children == null) return;
            for (File child : children) {
                copyRecursive(child, new File(dest, child.getName()));
            }
            return;
        }
        File parent = dest.getParentFile();
        if (parent != null && !parent.exists() && !parent.mkdirs()) {
            throw new IOException("copy parent fail: " + parent);
        }
        try (InputStream in = new FileInputStream(src);
             OutputStream out = new FileOutputStream(dest)) {
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) >= 0) {
                out.write(buf, 0, n);
            }
        }
    }

    /** 단순 semver 비교. a>b → 양수. */
    static int compareSemver(String a, String b) {
        String[] pa = a.replaceAll("[^0-9.]", "").split("\\.");
        String[] pb = b.replaceAll("[^0-9.]", "").split("\\.");
        int n = Math.max(pa.length, pb.length);
        for (int i = 0; i < n; i++) {
            int va = i < pa.length && !pa[i].isEmpty() ? Integer.parseInt(pa[i]) : 0;
            int vb = i < pb.length && !pb[i].isEmpty() ? Integer.parseInt(pb[i]) : 0;
            if (va != vb) return va - vb;
        }
        return 0;
    }
}
