package com.exgame.app;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.util.Log;

final class PackageVersions {
    private static final String TAG = "ExGameUpdate";

    private PackageVersions() {}

    static String versionName(Context context) {
        try {
            PackageInfo info = info(context);
            return info.versionName != null ? info.versionName : "0.0.0";
        } catch (Exception e) {
            Log.w(TAG, "versionName", e);
            return "0.0.0";
        }
    }

    static int versionCode(Context context) {
        try {
            PackageInfo info = info(context);
            if (Build.VERSION.SDK_INT >= 28) {
                return (int) info.getLongVersionCode();
            }
            //noinspection deprecation
            return info.versionCode;
        } catch (Exception e) {
            Log.w(TAG, "versionCode", e);
            return 0;
        }
    }

    private static PackageInfo info(Context context) throws PackageManager.NameNotFoundException {
        PackageManager pm = context.getPackageManager();
        if (Build.VERSION.SDK_INT >= 33) {
            return pm.getPackageInfo(context.getPackageName(), PackageManager.PackageInfoFlags.of(0));
        }
        //noinspection deprecation
        return pm.getPackageInfo(context.getPackageName(), 0);
    }
}
