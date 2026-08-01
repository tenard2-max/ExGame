package com.exgame.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;

import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Media Editor가 폰 안에서 ffmpeg.wasm으로 만든 MP4를 저장합니다.
 *
 * WebView에는 blob: 다운로드 처리기가 없어서 &lt;a download&gt;로는 아무 일도 일어나지
 * 않습니다. 그래서 JS가 결과를 base64 청크로 넘겨주면 여기서 파일로 이어 붙입니다.
 * 수십 MB를 문자열 하나로 받으면 OOM이 나므로 반드시 청크로 나눠 받습니다.
 *
 * 저장 위치
 *   API 29+ : MediaStore Movies/ExGame (권한 불필요, 갤러리에 바로 보임)
 *   API 24~28: 앱 전용 외부 저장소 (권한 불필요, 앱 삭제 시 함께 삭제)
 */
public final class MediaExportSaver {
    private static final String TAG = "ExGameExportSaver";
    private static final String ALBUM = "ExGame";

    private static final class Session {
        final File tempFile;
        final String displayName;
        final OutputStream out;

        Session(File tempFile, String displayName, OutputStream out) {
            this.tempFile = tempFile;
            this.displayName = displayName;
            this.out = out;
        }
    }

    private final Context context;
    private final Map<String, Session> sessions = new ConcurrentHashMap<>();

    public MediaExportSaver(Context context) {
        this.context = context.getApplicationContext();
    }

    /** 이어받기를 시작하고 토큰을 돌려줍니다. 실패하면 빈 문자열. */
    public String begin(String filename) {
        String safeName = sanitize(filename);
        try {
            File dir = new File(context.getCacheDir(), "media-export");
            if (!dir.exists() && !dir.mkdirs()) {
                throw new IOException("cache dir create failed: " + dir);
            }
            String token = UUID.randomUUID().toString();
            File temp = new File(dir, token + ".part");
            OutputStream out = new BufferedOutputStream(new FileOutputStream(temp), 1 << 16);
            sessions.put(token, new Session(temp, safeName, out));
            return token;
        } catch (IOException e) {
            Log.w(TAG, "begin failed", e);
            return "";
        }
    }

    public boolean chunk(String token, String base64) {
        Session session = sessions.get(token);
        if (session == null) {
            return false;
        }
        try {
            session.out.write(Base64.decode(base64, Base64.DEFAULT));
            return true;
        } catch (IOException | IllegalArgumentException e) {
            Log.w(TAG, "chunk failed", e);
            abort(token);
            return false;
        }
    }

    /** 저장을 마치고 사용자에게 보여줄 경로를 돌려줍니다. 실패하면 빈 문자열. */
    public String end(String token) {
        Session session = sessions.remove(token);
        if (session == null) {
            return "";
        }
        try {
            session.out.close();
            if (session.tempFile.length() < 32) {
                throw new IOException("empty export");
            }
            return Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q
                    ? publishToMediaStore(session)
                    : publishToAppStorage(session);
        } catch (IOException e) {
            Log.w(TAG, "end failed", e);
            return "";
        } finally {
            deleteQuietly(session.tempFile);
        }
    }

    public void abort(String token) {
        Session session = sessions.remove(token);
        if (session == null) {
            return;
        }
        closeQuietly(session.out);
        deleteQuietly(session.tempFile);
    }

    private String publishToMediaStore(Session session) throws IOException {
        ContentResolver resolver = context.getContentResolver();
        ContentValues values = new ContentValues();
        values.put(MediaStore.Video.Media.DISPLAY_NAME, session.displayName);
        values.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
        values.put(
                MediaStore.Video.Media.RELATIVE_PATH,
                Environment.DIRECTORY_MOVIES + File.separator + ALBUM
        );
        values.put(MediaStore.Video.Media.IS_PENDING, 1);

        Uri collection = MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        Uri item = resolver.insert(collection, values);
        if (item == null) {
            throw new IOException("MediaStore insert returned null");
        }
        try (OutputStream out = resolver.openOutputStream(item)) {
            if (out == null) {
                throw new IOException("MediaStore stream unavailable");
            }
            copy(session.tempFile, out);
        } catch (IOException e) {
            resolver.delete(item, null, null);
            throw e;
        }

        // IS_PENDING을 풀어야 갤러리 등 다른 앱에서 보입니다.
        ContentValues done = new ContentValues();
        done.put(MediaStore.Video.Media.IS_PENDING, 0);
        resolver.update(item, done, null, null);

        return Environment.DIRECTORY_MOVIES + "/" + ALBUM + "/" + session.displayName;
    }

    private String publishToAppStorage(Session session) throws IOException {
        File dir = context.getExternalFilesDir(Environment.DIRECTORY_MOVIES);
        if (dir == null) {
            throw new IOException("external files dir unavailable");
        }
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IOException("dir create failed: " + dir);
        }
        File target = new File(dir, session.displayName);
        try (OutputStream out = new FileOutputStream(target)) {
            copy(session.tempFile, out);
        }
        return target.getAbsolutePath();
    }

    private static void copy(File source, OutputStream out) throws IOException {
        byte[] buffer = new byte[1 << 16];
        try (InputStream in = new FileInputStream(source)) {
            int read;
            while ((read = in.read(buffer)) > 0) {
                out.write(buffer, 0, read);
            }
        }
        out.flush();
    }

    /** 사용자가 넘긴 이름을 파일명으로 쓸 수 있게 다듬습니다. */
    private static String sanitize(String filename) {
        String name = filename == null ? "" : filename.trim();
        name = name.replaceAll("[^A-Za-z0-9._-]", "_");
        if (name.isEmpty()) {
            name = "exgame-export.mp4";
        }
        if (!name.toLowerCase().endsWith(".mp4")) {
            name = name + ".mp4";
        }
        return name;
    }

    private static void closeQuietly(OutputStream out) {
        try {
            out.close();
        } catch (IOException ignored) {
            // 정리 중 발생한 오류는 원인 파악에 도움이 되지 않습니다.
        }
    }

    private static void deleteQuietly(File file) {
        if (file.exists() && !file.delete()) {
            Log.w(TAG, "temp delete failed: " + file);
        }
    }
}
