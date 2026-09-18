package com.anthonybono.roundtrip;

import android.os.Bundle;
import android.view.WindowManager;

import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

/**
 * Roundtrip on Android.
 *
 * Three things the web page cannot ask for itself and a desk display needs:
 * the map plugin, a screen that never sleeps, and no system bars over the
 * picture.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(RoundtripMapPlugin.class);
        super.onCreate(savedInstanceState);

        // This is a thing you leave running on a shelf. A globe turning by
        // itself is not "activity" as far as Android is concerned, so without
        // this the screen is off within a minute.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // Edge to edge, with the status and navigation bars hidden until
        // someone swipes for them. The app is one full-bleed picture.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowInsetsControllerCompat bars =
            WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        bars.hide(WindowInsetsCompat.Type.systemBars());
        bars.setSystemBarsBehavior(
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
    }
}
