package com.doconclick.app;

import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // CookieManager keeps newly-set cookies (e.g. the login session cookie)
    // in memory and only writes them to its persistent store lazily — if the
    // process is killed before that happens (backgrounded then reclaimed by
    // the OS, or swiped from recents), the cookie is lost and the app shows
    // the login screen again despite a real, unexpired session having been
    // set moments earlier. Flushing on pause covers every path to the
    // process dying after this point.
    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }
}
