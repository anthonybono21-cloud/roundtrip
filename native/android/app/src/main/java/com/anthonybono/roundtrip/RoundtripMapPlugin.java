package com.anthonybono.roundtrip;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.PointF;
import android.graphics.Typeface;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.maplibre.android.MapLibre;
import org.maplibre.android.camera.CameraPosition;
import org.maplibre.android.camera.CameraUpdateFactory;
import org.maplibre.android.geometry.LatLng;
import org.maplibre.android.maps.MapLibreMap;
import org.maplibre.android.maps.MapView;
import org.maplibre.android.maps.Style;
import org.maplibre.android.style.expressions.Expression;
import org.maplibre.android.style.layers.CircleLayer;
import org.maplibre.android.style.layers.PropertyFactory;
import org.maplibre.android.style.layers.RasterLayer;
import org.maplibre.android.style.sources.GeoJsonSource;
import org.maplibre.android.style.sources.RasterSource;
import org.maplibre.android.style.sources.TileSet;
import org.maplibre.geojson.Feature;

import java.util.List;

/**
 * The map behind Roundtrip's map button, on Android.
 *
 * The web app's globe is stitched from raster tiles inside a WebGL scene, which
 * is as far as a browser can reasonably go. A phone already carries a real map
 * engine, so in the app the same camera list is thrown onto MapLibre: satellite
 * imagery you can push around with a finger down to street level, every camera
 * as a dot, and a tap that dives into one.
 *
 * Imagery is Esri World Imagery — the same free, keyless source the globe's
 * descent already uses, so nothing new has to be signed up for and the map and
 * the dive show the same ground. MapLibre itself is open source and needs no
 * key; the API-key call every Mapbox-derived example makes is deliberately not
 * here.
 *
 * The view is added over the WebView rather than replacing it: the web app
 * keeps its WebGL context, its loaded tiles and its paused rotation, so closing
 * the map is instant instead of a reload.
 */
@CapacitorPlugin(name = "RoundtripMap")
public class RoundtripMapPlugin extends Plugin {

    /** Esri World Imagery, {z}/{y}/{x} — note the y before the x. */
    private static final String IMAGERY =
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
    private static final String CREDIT = "Imagery: Esri, Maxar, Earthstar Geographics";

    private static final String SRC_SAT = "roundtrip-satellite";
    private static final String SRC_CAMS = "roundtrip-cameras";
    private static final String LYR_SAT = "roundtrip-satellite-layer";
    private static final String LYR_DOTS = "roundtrip-camera-dots";
    private static final String LYR_HALO = "roundtrip-camera-halo";

    private FrameLayout overlay;
    private MapView mapView;
    private MapLibreMap map;
    private TextView cardName, cardWhere;
    private View card;
    private String selectedId;
    private OnBackPressedCallback backCallback;

    /* ── show ─────────────────────────────────────────────────────────────── */

    @PluginMethod
    public void show(final PluginCall call) {
        final JSArray pins = call.getArray("pins", new JSArray());
        final JSObject focus = call.getObject("focus", new JSObject());

        getActivity().runOnUiThread(() -> {
            try {
                if (overlay != null) { call.resolve(); return; }
                build(pins, focus);
                call.resolve();
            } catch (Exception e) {
                teardown();
                call.reject("The map could not be opened: " + e.getMessage(), e);
            }
        });
    }

    @PluginMethod
    public void hide(final PluginCall call) {
        getActivity().runOnUiThread(() -> { teardown(); call.resolve(); });
    }

    /** Whether the map is on screen, for the web side to stay in step. */
    @PluginMethod
    public void isOpen(PluginCall call) {
        JSObject r = new JSObject();
        r.put("open", overlay != null);
        call.resolve(r);
    }

    /* ── building the screen ──────────────────────────────────────────────── */

    private void build(JSArray pins, JSObject focus) throws JSONException {
        Activity activity = getActivity();
        MapLibre.getInstance(activity);

        overlay = new FrameLayout(activity);
        overlay.setBackgroundColor(Color.parseColor("#05070c"));
        // The WebView underneath keeps running; swallow every touch so a tap
        // meant for the map never reaches the page behind it.
        overlay.setClickable(true);
        overlay.setFocusable(true);

        mapView = new MapView(activity);
        mapView.onCreate(null);
        overlay.addView(mapView, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        overlay.addView(closeButton(activity));
        overlay.addView(creditLine(activity));
        overlay.addView(card = detailCard(activity));

        ViewGroup root = activity.findViewById(android.R.id.content);
        root.addView(overlay, new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        final String geojson = toGeoJson(pins);
        final double lat = focus.has("lat") ? focus.getDouble("lat") : 20;
        final double lng = focus.has("lng") ? focus.getDouble("lng") : 0;
        final double zoom = focus.has("zoom") ? focus.getDouble("zoom") : 2;

        mapView.getMapAsync(m -> {
            map = m;
            m.setMaxZoomPreference(19);            // the imagery's own ceiling
            m.getUiSettings().setLogoEnabled(false);
            m.getUiSettings().setAttributionEnabled(false);  // shown in creditLine instead
            m.getUiSettings().setTiltGesturesEnabled(true);
            m.getUiSettings().setRotateGesturesEnabled(true);

            m.setStyle(style(geojson), loaded -> {
                m.moveCamera(CameraUpdateFactory.newCameraPosition(
                    new CameraPosition.Builder()
                        .target(new LatLng(lat, lng))
                        .zoom(Math.max(1.4, zoom - 3))     // open wide, then settle in
                        .tilt(0)
                        .build()));
                m.animateCamera(CameraUpdateFactory.newCameraPosition(
                    new CameraPosition.Builder()
                        .target(new LatLng(lat, lng))
                        .zoom(zoom)
                        .tilt(zoom > 8 ? 55 : 0)           // lean over only once close in
                        .build()), 1400);
            });

            m.addOnMapClickListener(point -> {
                PointF screen = m.getProjection().toScreenLocation(point);
                List<Feature> hits = m.queryRenderedFeatures(touchBox(screen), LYR_DOTS);
                if (hits.isEmpty()) { dismissCard(); return false; }
                Feature f = hits.get(0);
                selectedId = f.getStringProperty("id");
                showCard(f.getStringProperty("name"), f.getStringProperty("subtitle"));
                return true;
            });
        });

        mapView.onStart();
        mapView.onResume();
        interceptBack();
    }

    /** A finger is not a pixel; give the dots a generous target. */
    private android.graphics.RectF touchBox(PointF p) {
        float r = dpPx(22);
        return new android.graphics.RectF(p.x - r, p.y - r, p.x + r, p.y + r);
    }

    private Style.Builder style(String geojson) {
        TileSet sat = new TileSet("2.2.0", IMAGERY);
        sat.setMinZoom(0);
        sat.setMaxZoom(19);
        sat.setAttribution(CREDIT);

        RasterSource imagery = new RasterSource(SRC_SAT, sat, 256);
        GeoJsonSource cams = new GeoJsonSource(SRC_CAMS, geojson);

        // Two circles per camera: a soft halo so a dot still reads over bright
        // desert or snow, and the dot itself. Live cameras are the warm colour
        // the app uses for anything pinned; ones outside their hours are grey.
        CircleLayer halo = new CircleLayer(LYR_HALO, SRC_CAMS).withProperties(
            PropertyFactory.circleRadius(13f),   // map units, not screen pixels
            PropertyFactory.circleColor(Color.parseColor("#000000")),
            PropertyFactory.circleOpacity(0.35f),
            PropertyFactory.circleBlur(0.65f));

        CircleLayer dots = new CircleLayer(LYR_DOTS, SRC_CAMS).withProperties(
            PropertyFactory.circleRadius(5.5f),
            // "case", not "match": the style spec only matches on strings and
            // numbers, and `live` is a boolean.
            PropertyFactory.circleColor(
                Expression.switchCase(
                    Expression.eq(Expression.get("live"), true),
                    Expression.color(Color.parseColor("#ffd479")),
                    Expression.color(Color.parseColor("#8fa3bd")))),
            PropertyFactory.circleStrokeWidth(1.6f),
            PropertyFactory.circleStrokeColor(Color.parseColor("#05070c")),
            PropertyFactory.circleStrokeOpacity(0.85f));

        return new Style.Builder()
            .withSources(imagery, cams)
            .withLayers(new RasterLayer(LYR_SAT, SRC_SAT), halo, dots);
    }

    /** The pin list arrives as plain data from the page; turn it into GeoJSON. */
    private String toGeoJson(JSArray pins) throws JSONException {
        JSONArray features = new JSONArray();
        for (int i = 0; i < pins.length(); i++) {
            JSONObject p = pins.getJSONObject(i);
            JSONArray coords = new JSONArray();
            coords.put(p.optDouble("lng", 0));
            coords.put(p.optDouble("lat", 0));

            JSONObject geometry = new JSONObject();
            geometry.put("type", "Point");
            geometry.put("coordinates", coords);

            JSONObject props = new JSONObject();
            props.put("id", p.optString("id", ""));
            props.put("name", p.optString("name", ""));
            props.put("subtitle", p.optString("subtitle", ""));
            props.put("live", p.optBoolean("live", true));

            JSONObject feature = new JSONObject();
            feature.put("type", "Feature");
            feature.put("geometry", geometry);
            feature.put("properties", props);
            features.put(feature);
        }
        JSONObject fc = new JSONObject();
        fc.put("type", "FeatureCollection");
        fc.put("features", features);
        return fc.toString();
    }

    /* ── chrome ───────────────────────────────────────────────────────────── */

    private View closeButton(Activity activity) {
        TextView x = new TextView(activity);
        x.setText("✕");                       // ✕
        x.setTextColor(Color.parseColor("#e8eef7"));
        x.setTextSize(TypedValue.COMPLEX_UNIT_SP, 19);
        x.setGravity(Gravity.CENTER);
        x.setBackground(disc());
        x.setOnClickListener(v -> { teardown(); notifyListeners("mapClosed", new JSObject()); });

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams((int) dpPx(50), (int) dpPx(50));
        lp.gravity = Gravity.TOP | Gravity.END;
        lp.topMargin = (int) dpPx(44);
        lp.rightMargin = (int) dpPx(20);
        x.setLayoutParams(lp);
        return x;
    }

    private android.graphics.drawable.GradientDrawable disc() {
        android.graphics.drawable.GradientDrawable d = new android.graphics.drawable.GradientDrawable();
        d.setShape(android.graphics.drawable.GradientDrawable.OVAL);
        d.setColor(Color.parseColor("#85090f19"));
        d.setStroke((int) dpPx(1), Color.parseColor("#52ffffff"));
        return d;
    }

    /** Esri's terms require the credit to stay on screen and readable. */
    private View creditLine(Activity activity) {
        TextView t = new TextView(activity);
        t.setText(CREDIT + "  ·  © MapLibre");
        t.setTextColor(Color.parseColor("#b0c8d7eb"));
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, 10);
        t.setShadowLayer(3f, 0f, 1f, Color.parseColor("#cc000000"));
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.gravity = Gravity.BOTTOM | Gravity.START;
        lp.leftMargin = (int) dpPx(14);
        lp.bottomMargin = (int) dpPx(12);
        t.setLayoutParams(lp);
        return t;
    }

    /** Tapping a dot raises this: which camera it is, and a way into it. */
    private View detailCard(Activity activity) {
        LinearLayout box = new LinearLayout(activity);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding((int) dpPx(18), (int) dpPx(15), (int) dpPx(18), (int) dpPx(16));
        box.setVisibility(View.GONE);
        box.setClickable(true);

        android.graphics.drawable.GradientDrawable bg = new android.graphics.drawable.GradientDrawable();
        bg.setColor(Color.parseColor("#e60a1018"));
        bg.setCornerRadius(dpPx(16));
        bg.setStroke((int) dpPx(1), Color.parseColor("#26ffffff"));
        box.setBackground(bg);

        cardName = new TextView(activity);
        cardName.setTextColor(Color.parseColor("#e8eef7"));
        cardName.setTextSize(TypedValue.COMPLEX_UNIT_SP, 18);
        cardName.setTypeface(Typeface.DEFAULT_BOLD);
        box.addView(cardName);

        cardWhere = new TextView(activity);
        cardWhere.setTextColor(Color.parseColor("#8fa3bd"));
        cardWhere.setTextSize(TypedValue.COMPLEX_UNIT_SP, 13);
        LinearLayout.LayoutParams wl = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        wl.topMargin = (int) dpPx(2);
        cardWhere.setLayoutParams(wl);
        box.addView(cardWhere);

        TextView watch = new TextView(activity);
        watch.setText("Watch this one");
        watch.setTextColor(Color.parseColor("#05070c"));
        watch.setTextSize(TypedValue.COMPLEX_UNIT_SP, 15);
        watch.setTypeface(Typeface.DEFAULT_BOLD);
        watch.setGravity(Gravity.CENTER);
        watch.setPadding(0, (int) dpPx(12), 0, (int) dpPx(12));
        android.graphics.drawable.GradientDrawable wb = new android.graphics.drawable.GradientDrawable();
        wb.setColor(Color.parseColor("#ffd479"));
        wb.setCornerRadius(dpPx(11));
        watch.setBackground(wb);
        LinearLayout.LayoutParams bl = new LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        bl.topMargin = (int) dpPx(14);
        watch.setLayoutParams(bl);
        watch.setOnClickListener(v -> {
            if (selectedId == null) return;
            JSObject ev = new JSObject();
            ev.put("id", selectedId);
            // The page decides what happens next; it owns the rotation and the
            // dive. All this says is which camera was chosen.
            notifyListeners("pinTapped", ev);
        });
        box.addView(watch);

        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.gravity = Gravity.BOTTOM;
        lp.leftMargin = lp.rightMargin = (int) dpPx(16);
        lp.bottomMargin = (int) dpPx(34);
        box.setLayoutParams(lp);
        return box;
    }

    private void showCard(String name, String where) {
        if (card == null) return;
        cardName.setText(name == null ? "" : name);
        cardWhere.setText(where == null ? "" : where);
        cardWhere.setVisibility(where == null || where.isEmpty() ? View.GONE : View.VISIBLE);
        card.setVisibility(View.VISIBLE);
        card.setAlpha(0f);
        card.setTranslationY(dpPx(14));
        card.animate().alpha(1f).translationY(0f).setDuration(180).start();
    }

    private void dismissCard() {
        selectedId = null;
        if (card != null) card.setVisibility(View.GONE);
    }

    /* ── lifecycle ────────────────────────────────────────────────────────── */

    /**
     * The system back button should close the map, not the app. Capacitor's
     * Plugin has no back hook, so this goes straight onto the activity's own
     * dispatcher and is taken off again the moment the map is gone.
     */
    private void interceptBack() {
        backCallback = new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                teardown();
                notifyListeners("mapClosed", new JSObject());
            }
        };
        getActivity().getOnBackPressedDispatcher().addCallback(backCallback);
    }

    @Override protected void handleOnPause()  { if (mapView != null) mapView.onPause(); }
    @Override protected void handleOnResume() { if (mapView != null) mapView.onResume(); }
    @Override protected void handleOnDestroy() { teardown(); }

    private void teardown() {
        if (mapView != null) {
            try { mapView.onPause(); mapView.onStop(); mapView.onDestroy(); } catch (Exception ignored) {}
        }
        if (overlay != null && overlay.getParent() instanceof ViewGroup) {
            ((ViewGroup) overlay.getParent()).removeView(overlay);
        }
        if (backCallback != null) { backCallback.remove(); backCallback = null; }
        overlay = null; mapView = null; map = null; card = null; selectedId = null;
    }

    /* ── units ────────────────────────────────────────────────────────────── */

    /* MapLibre's own sizes (circle radii, stroke widths) are already
       density-independent, so those are written as plain numbers above. Views
       laid out by hand are not, which is what this is for. */
    private float dpPx(float v) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v,
            getContext().getResources().getDisplayMetrics());
    }
}
