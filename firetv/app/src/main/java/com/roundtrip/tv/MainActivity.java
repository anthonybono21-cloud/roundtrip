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
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
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

  /**
   * Where the one-time YouTube sign-in goes. The point of it is the adverts:
   * the feeds are embedded YouTube players, an embedded player honours the
   * viewer's own Premium subscription, and a subscription only reaches it if
   * this WebView is carrying the account's cookies. Nothing else here needs
   * an account, and nothing is stored by the app itself.
   *
   * The password is typed on the television, by the person whose account it
   * is, and it deliberately has no other route in: nothing here accepts one
   * over adb, from the page, or from an intent extra.
   */
  private static final String SIGN_IN =
      "https://accounts.google.com/ServiceLogin?service=youtube"
      + "&continue=https%3A%2F%2Fwww.youtube.com%2F";

  /**
   * Step two, and the reason the sign-in does not simply end when Google lets
   * it through. A channel picked here is where everything this television
   * watches gets recorded, so choosing a Brand Account channel keeps 130-odd
   * webcams out of the account holder's own watch history and recommendations
   * while the Premium subscription, which belongs to the Google Account rather
   * than to any one channel, still reaches the players.
   */
  private static final String CHANNEL_SWITCHER =
      "https://www.youtube.com/channel_switcher";

  /**
   * Google refuses a sign-in from a user agent it recognises as an embedded
   * browser, and the framework WebView announces itself as one with "; wv".
   * The sign-in pages are given a plain desktop string instead; the app drops
   * back to its own the moment it is done, because the site itself wants to
   * be told it is on a television, not on a desktop.
   */
  private static final String DESKTOP_UA =
      "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) "
      + "Chrome/124.0.0.0 Safari/537.36";

  private WebView web;
  private String home = HOME;
  private final Handler ui = new Handler(Looper.getMainLooper());
  private boolean failed = false;
  private boolean signingIn = false;
  /** 1 while Google has the screen, 2 once the channel is being chosen. */
  private int signInStep = 0;

  @SuppressLint("SetJavaScriptEnabled")
  @Override
  protected void onCreate(Bundle saved) {
    super.onCreate(saved);
    getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

    // `adb shell am start -n com.roundtrip.tv/.MainActivity --ez fps true`
    // turns on the page's frame log, which comes back out through logcat.
    // firetv/CHECK.md is what uses this.
    if (getIntent() != null && getIntent().getBooleanExtra("fps", false)) home = HOME + "&fps=1";

    // Without this there is no devtools socket, and then there is no way to
    // ask the page anything from a machine that can reach the stick. This is
    // a sideloaded app on one television; there is nothing here to protect.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
      WebView.setWebContentsDebuggingEnabled(true);
    }

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

    // The feeds are youtube.com iframes inside a github.io page, so to the
    // WebView every cookie they carry is a third-party one. Off — which is the
    // default — a signed-in account can never reach the embedded player, and
    // a Premium subscription would have no way of removing the adverts. This
    // is the whole reason the sign-in below is worth having.
    CookieManager cookies = CookieManager.getInstance();
    cookies.setAcceptCookie(true);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      cookies.setAcceptThirdPartyCookies(web, true);
    }

    // The page asks for the sign-in through this, because the cookie jar
    // belongs to the app rather than to the page. It is injected into every
    // frame, the YouTube iframes included, so it checks who is asking.
    web.addJavascriptInterface(new Shell(), "RoundtripShell");

    // A chrome client is what makes a video able to go full screen, and the
    // absence of one is a long-standing way to get a black player.
    web.setWebChromeClient(new WebChromeClient());
    web.setWebViewClient(new WebViewClient() {
      @Override public void onPageFinished(WebView v, String url) {
        failed = false;
        if (!signingIn || url == null) return;
        boolean onYouTube = url.startsWith("https://www.youtube.com/")
            && !url.contains("/signin") && !url.contains("accounts.google");
        if (!onYouTube) return;

        // Landing on YouTube proper is what getting through Google looks
        // like: that is where the continue= parameter sends an account that
        // was accepted. Rather than stopping there, go straight on to the
        // channel picker, because which channel this television watches as is
        // the whole point of signing it in separately.
        if (signInStep == 1 && !url.contains("channel_switcher")) {
          signInStep = 2;
          web.loadUrl(CHANNEL_SWITCHER);
          return;
        }
        // Picking a channel takes YouTube back to its own front page, and
        // that is the app's cue to go home. Nobody wants to hunt for a way
        // out on a kitchen television.
        if (signInStep == 2 && !url.contains("channel_switcher")) {
          ui.postDelayed(new Runnable() {
            @Override public void run() { if (signingIn) endSignIn(); }
          }, 2000);
        }
      }

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
    else web.loadUrl(home);

    immersive();
  }

  /**
   * A desk display comes back from a router reboot on its own or not at all,
   * so keep trying rather than putting an error on the screen nobody is
   * standing in front of.
   */
  private void retry() {
    if (failed || signingIn) return;
    failed = true;
    ui.postDelayed(new Runnable() {
      @Override public void run() {
        failed = false;
        web.loadUrl(home);
      }
    }, 6000);
  }

  /**
   * The bridge the page's Ads button reaches. It arrives on the WebView's own
   * thread, so everything real happens back on the UI one.
   */
  private class Shell {
    @JavascriptInterface public void signIn() {
      ui.post(new Runnable() {
        @Override public void run() {
          String at = web.getUrl();
          // Only our own page may ask. The interface is injected into the
          // YouTube frames too, and they have no business navigating the app.
          if (at == null || !at.startsWith("https://anthonybono21-cloud.github.io/")) return;
          startSignIn();
        }
      });
    }

    /** So the page can tell it is inside this shell rather than in Silk. */
    @JavascriptInterface public boolean isShell() { return true; }
  }

  private void startSignIn() {
    if (signingIn) return;
    signingIn = true;
    signInStep = 1;
    web.getSettings().setUserAgentString(DESKTOP_UA);
    // Immersive mode and a soft keyboard fight each other: the sticky flags
    // come back while a field has focus and take the bottom of the keyboard
    // with them. Roundtrip itself never takes typing, so the plain window is
    // only ever up during the sign-in.
    showSystemUi();
    web.clearHistory();               // so Back walks the sign-in, not the app
    web.loadUrl(SIGN_IN);
  }

  /** Back to Roundtrip, carrying whatever account the sign-in left behind. */
  private void endSignIn() {
    if (!signingIn) return;
    signingIn = false;
    signInStep = 0;
    CookieManager.getInstance().flush();
    web.getSettings().setUserAgentString(null);   // back to the app's own
    web.clearHistory();
    web.loadUrl(home);
    immersive();
  }

  /** The ordinary window, so the on-screen keyboard has somewhere to sit. */
  private void showSystemUi() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.KITKAT) return;
    getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);
  }

  private void immersive() {
    if (signingIn) return;          // the keyboard owns the screen until it is done
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
    // Holding Back leaves the app, except during a sign-in, where it is the
    // way out of the sign-in rather than out of Roundtrip.
    if (code == KeyEvent.KEYCODE_BACK) {
      if (signingIn) endSignIn(); else finish();
      return true;
    }
    return super.onKeyLongPress(code, e);
  }

  @Override public boolean onKeyUp(int code, KeyEvent e) {
    if (code == KeyEvent.KEYCODE_BACK) {
      if (e.isCanceled()) return true;          // the long press already fired
      if (signingIn && !web.canGoBack()) { endSignIn(); return true; }
      if (web.canGoBack()) web.goBack(); else finish();
      return true;
    }
    return super.onKeyUp(code, e);
  }

  /** singleTask, so a second `am start` arrives here rather than in onCreate. */
  @Override protected void onNewIntent(android.content.Intent intent) {
    super.onNewIntent(intent);
    setIntent(intent);
    String want = intent.getBooleanExtra("fps", false) ? HOME + "&fps=1" : HOME;
    if (!want.equals(home)) { home = want; web.loadUrl(home); }
  }

  @Override protected void onSaveInstanceState(Bundle out) {
    super.onSaveInstanceState(out);
    web.saveState(out);
  }

  @Override protected void onPause() {
    super.onPause();
    web.onPause();
    // A sideloaded app on a television is killed rather than closed, so the
    // account survives only if the jar is written out here.
    CookieManager.getInstance().flush();
  }
  @Override protected void onResume()  { super.onResume();  web.onResume(); immersive(); }
  @Override protected void onDestroy() { web.destroy(); super.onDestroy(); }
}
