package com.roundtrip.tv;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Roundtrip on a Fire Stick.
 *
 * Deliberately thin: it is one full-screen WebView pointed at the live site,
 * so every push to the repository reaches the television on its next launch
 * and there is nothing here to keep in step with the app itself. What it adds
 * over opening the same address in Silk is a tile on the home row, no browser
 * chrome, a screen that never sleeps, and a back button that behaves.
 *
 * ?tv=1 is on the URL rather than left to sniffing: inside a WebView the user
 * agent is the host app's, not Silk's, so the page cannot tell it is on a
 * television unless it is told.
 */
public class MainActivity extends Activity {

  private static final String HOME =
      "https://anthonybono21-cloud.github.io/roundtrip/?tv=1";

  private WebView web;
  private final Handler ui = new Handler(Looper.getMainLooper());
  private boolean failed = false;

  @SuppressLint("SetJavaScriptEnabled")
  @Override
  protected void onCreate(Bundle saved) {
    super.onCreate(saved);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

    web = new WebView(this);
    web.setLayoutParams(new ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
    web.setBackgroundColor(0xFF05070C);

    WebSettings s = web.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setDatabaseEnabled(true);
    s.setLoadWithOverviewMode(true);
    s.setUseWideViewPort(true);
    s.setCacheMode(WebSettings.LOAD_DEFAULT);
    // The feeds are meant to come up on their own; without this the WebView
    // holds every one of them until something is pressed.
    s.setMediaPlaybackRequiresUserGesture(false);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) s.setSafeBrowsingEnabled(false);

    // A chrome client is what makes a video able to go full screen, and the
    // absence of one is a long-standing way to get a black player.
    web.setWebChromeClient(new WebChromeClient());
    web.setWebViewClient(new WebViewClient() {
      @Override public void onPageFinished(WebView v, String url) { failed = false; }

      @Override public void onReceivedError(WebView v, int code, String msg, String url) {
        retry();
      }

      @Override
      @SuppressWarnings("deprecation")
      public boolean shouldOverrideUrlLoading(WebView v, String url) {
        return false;      // the YouTube iframes must load in place
      }
    });

    web.setFocusable(true);
    web.setFocusableInTouchMode(true);
    setContentView(web);
    web.requestFocus();

    if (saved != null) web.restoreState(saved);
    else web.loadUrl(HOME);

    immersive();
  }

  /**
   * A desk display comes back from a router reboot on its own or not at all,
   * so keep trying rather than putting an error on the screen nobody is
   * standing in front of.
   */
  private void retry() {
    if (failed) return;
    failed = true;
    ui.postDelayed(new Runnable() {
      @Override public void run() {
        failed = false;
        web.loadUrl(HOME);
      }
    }, 6000);
  }

  private void immersive() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.KITKAT) return;
    getWindow().getDecorView().setSystemUiVisibility(
        View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
        | View.SYSTEM_UI_FLAG_FULLSCREEN
        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
  }

  @Override public void onWindowFocusChanged(boolean has) {
    super.onWindowFocusChanged(has);
    if (has) immersive();
  }

  /**
   * The remote's back button. The page keeps a spare history entry so that a
   * press lands inside Roundtrip and pulls the view out to orbit instead of
   * leaving the app; holding the button is how you actually leave.
   */
  @Override public boolean onKeyDown(int code, KeyEvent e) {
    if (code == KeyEvent.KEYCODE_BACK) {
      e.startTracking();
      return true;
    }
    return super.onKeyDown(code, e);
  }

  @Override public boolean onKeyLongPress(int code, KeyEvent e) {
    if (code == KeyEvent.KEYCODE_BACK) { finish(); return true; }
    return super.onKeyLongPress(code, e);
  }

  @Override public boolean onKeyUp(int code, KeyEvent e) {
    if (code == KeyEvent.KEYCODE_BACK) {
      if (e.isCanceled()) return true;          // the long press already fired
      if (web.canGoBack()) web.goBack(); else finish();
      return true;
    }
    return super.onKeyUp(code, e);
  }

  @Override protected void onSaveInstanceState(Bundle out) {
    super.onSaveInstanceState(out);
    web.saveState(out);
  }

  @Override protected void onPause()   { super.onPause();   web.onPause(); }
  @Override protected void onResume()  { super.onResume();  web.onResume(); immersive(); }
  @Override protected void onDestroy() { web.destroy(); super.onDestroy(); }
}
