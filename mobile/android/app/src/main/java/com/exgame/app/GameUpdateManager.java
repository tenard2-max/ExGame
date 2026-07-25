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
 * <p>
 * PAT/토큰 없이 공개 Releases URL만 사용합니다.
 */
public final class GameUpdateManager {
    private static final String TAG = "ExGameUpdate";
    private static final String PREFS = "exgame_update";
    private static final String KEY_WWW_VERSION = "www_version";
    private static final String KEY_WWW_VERSION_CODE = "www_version_code";
    private static final int CONNECT_TIMEOUT_MS = 8_000;
    private static final int READ_TIMEOUT_MS = 20_000;
    private static final int MAX_REDIRECTS = 8;

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
        File index = new File(getOtaWwwDir(), "index.html");
        if (!index.isFile()) return false;
        // 깨진 OTA(빈 껍데기)면 내장 assets 로 폴백
        File indexJs = new File(getOtaWwwDir(), "index.js");
        File srcDir = new File(getOtaWwwDir(), "src");
        return indexJs.isFile() || srcDir.isDirectory();
    }

    /** 손상된 OTA를 지워 다음 실행에서 APK 내장본을 쓰게 합니다. */
    public void discardBrokenOtaIfNeeded() {
        if (new File(getOtaWwwDir(), "index.html").isFile() && !hasOtaWww()) {
            Log.w(TAG, "discarding broken OTA");
            deleteRecursive(getOtaRootDir());
            prefs().edit().remove(KEY_WWW_VERSION).remove(KEY_WWW_VERSION_CODE).apply();
        }
    }

    public String getInstalledWwwVersion() {
        return prefs().getString(KEY_WWW_VERSION, bundledVersionName());
    }

    public int getInstalledWwwVersionCode() {
        return prefs().getInt(KEY_WWW_VERSION_CODE, bundledVersionCode());
    }

    /**
     * 최신 릴리스를 확인하고, remote 가 더 높을 때만 www zip을 받아 적용합니다.
     * 네트워크/파싱 실패 시 내장·기존 OTA로 계속합니다. PAT 불필요.
     */
    public Result checkAndApply(ProgressListener listener) {
        notify(listener, "업데이트 확인 중…", -1);
        discardBrokenOtaIfNeeded();
        try {
            JSONObject remote = fetchVersionJson();
            if (remote == null) {
                return new Result(false, getInstalledWwwVersion(), getInstalledWwwVersionCode(),
                        "원격 버전 정보를 가져오지 못했습니다");
            }
            String remoteVersion = remote.optString("version", "");
            int remoteCode = remote.optInt("versionCode", 0);
            String wwwZip = remote.optString("wwwZip", "");
            if (wwwZip.isEmpty() && remoteVersion.length() > 0) {
                wwwZip = String.format(Locale.US, "exgame-%s-www.zip", remoteVersion);
            }

            int localCode = getInstalledWwwVersionCode();
            String localVer = getInstalledWwwVersion();

            // 같은 버전(또는 더 낮음)이면 절대 재다운로드하지 않음 — 이전엔 !hasOtaWww 때 23MB를 다시 받아 멈춘 것처럼 보였음
            boolean newer = remoteCode > localCode
                    || (remoteCode == localCode
                    && remoteVersion.length() > 0
                    && compareSemver(remoteVersion, localVer) > 0);
            if (!newer) {
                return new Result(false, localVer, localCode,
                        hasOtaWww() ? "이미 최신입니다" : "내장 버전 사용");
            }
            if (wwwZip.isEmpty()) {
                return new Result(false, localVer, localCode, "wwwZip 필드 없음");
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
            File stagedWww = new File(staging, "www");
            if (!new File(stagedWww, "index.html").isFile()) {
                if (new File(staging, "index.html").isFile()) {
                    stagedWww = staging;
                } else {
                    throw new IOException("www zip에 index.html 이 없습니다");
                }
            }

            File otaRoot = getOtaRootDir();
            if (!otaRoot.exists() && !otaRoot.mkdirs()) {
                throw new IOException("ota 루트 생성 실패");
            }
            File targetWww = new File(otaRoot, "www");
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
            deleteRecursive(staging);
            //noinspection ResultOfMethodCallIgnored
            zipFile.delete();

            if (!hasOtaWww()) {
                deleteRecursive(getOtaRootDir());
                throw new IOException("OTA 검증 실패(필수 파일 없음)");
            }

            int appliedCode = Math.max(remoteCode, 1);
            prefs().edit()
                    .putString(KEY_WWW_VERSION, remoteVersion)
                    .putInt(KEY_WWW_VERSION_CODE, appliedCode)
                    .apply();

            writeLocalVersionMarker(remoteVersion, appliedCode);
            return new Result(true, remoteVersion, appliedCode, "업데이트 완료");
        } catch (Exception e) {
            Log.w(TAG, "update failed", e);
            return new Result(false, getInstalledWwwVersion(), getInstalledWwwVersionCode(),
                    e.getMessage() != null ? e.getMessage() : "update failed");
        }
    }

    private JSONObject fetchVersionJson() {
        String url = String.format(
                Locale.US,
                "https://github.com/%s/%s/releases/latest/download/version.json",
                owner, repo
        );
        try {
            byte[] raw = downloadBytes(url, null);
            String body = new String(raw, StandardCharsets.UTF_8);
            // PowerShell Set-Content -Encoding UTF8 이 붙인 BOM 제거
            if (!body.isEmpty() && body.charAt(0) == '\uFEFF') {
                body = body.substring(1);
            }
            body = body.trim();
            if (body.isEmpty()) return null;
            return new JSONObject(body);
        } catch (Exception e) {
            Log.w(TAG, "fetchVersionJson", e);
            return null;
        }
    }

    private void downloadFile(String url, File dest, ProgressListener listener) throws IOException {
        HttpURLConnection conn = openFollowingRedirects(url);
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

    private byte[] downloadBytes(String url, ProgressListener listener) throws IOException {
        HttpURLConnection conn = openFollowingRedirects(url);
        try {
            int code = conn.getResponseCode();
            if (code >= 400) {
                throw new IOException("HTTP " + code);
            }
            try (InputStream in = new BufferedInputStream(conn.getInputStream())) {
                return readFullyBytes(in);
            }
        } finally {
            conn.disconnect();
        }
    }

    /**
     * GitHub → objects.githubusercontent.com 리다이렉트를 홉마다 타임아웃을 유지하며 따라갑니다.
     * (자동 follow 시 일부 기기에서 타임아웃이 무시되어 멈출 수 있음)
     */
    private static HttpURLConnection openFollowingRedirects(String urlString) throws IOException {
        String current = urlString;
        for (int i = 0; i < MAX_REDIRECTS; i++) {
            HttpURLConnection conn = open(current);
            conn.setInstanceFollowRedirects(false);
            int code = conn.getResponseCode();
            if (code >= 300 && code < 400) {
                String location = conn.getHeaderField("Location");
                conn.disconnect();
                if (location == null || location.isEmpty()) {
                    throw new IOException("리다이렉트 Location 없음");
                }
                current = new URL(new URL(current), location).toString();
                continue;
            }
            return conn;
        }
        throw new IOException("리다이렉트 초과");
    }

    private static HttpURLConnection open(String urlString) throws IOException {
        URL url = new URL(urlString);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
        conn.setReadTimeout(READ_TIMEOUT_MS);
        conn.setRequestProperty("Accept", "application/octet-stream, application/json, */*");
        // GitHub 공개 API/다운로드 — PAT 없음. User-Agent 만 명시.
        conn.setRequestProperty("User-Agent", "ExGame-Android-Updater");
        return conn;
    }

    private static byte[] readFullyBytes(InputStream in) throws IOException {
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        byte[] buf = new byte[4096];
        int n;
        while ((n = in.read(buf)) >= 0) {
            bos.write(buf, 0, n);
        }
        return bos.toByteArray();
    }

    private void unzipTo(File zipFile, File destDir) throws IOException {
        try (ZipInputStream zis = new ZipInputStream(
                new BufferedInputStream(new FileInputStream(zipFile)))) {
            ZipEntry entry;
            byte[] buf = new byte[8192];
            while ((entry = zis.getNextEntry()) != null) {
                String name = entry.getName();
                // Windows Compress-Archive 가 가끔 쓰는 절대경로/.. 방어
                if (name.contains("..")) {
                    throw new IOException("잘못된 zip 경로: " + name);
                }
                File out = new File(destDir, name);
                String destPath = destDir.getCanonicalPath();
                String outPath = out.getCanonicalPath();
                if (!outPath.startsWith(destPath + File.separator) && !outPath.equals(destPath)) {
                    throw new IOException("잘못된 zip 경로: " + name);
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
