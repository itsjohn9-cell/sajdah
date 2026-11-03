package app.sijda.sijda

import android.content.Context
import android.content.Intent
import android.content.ActivityNotFoundException
import android.app.AlertDialog
import android.graphics.Color
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.net.Uri
import android.os.SystemClock
import android.util.Log
import android.view.View
import android.webkit.PermissionRequest
import android.webkit.JsResult
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Toast
import io.flutter.plugin.common.StandardMessageCodec
import io.flutter.plugin.platform.PlatformView
import io.flutter.plugin.platform.PlatformViewFactory
import org.json.JSONObject
import java.io.ByteArrayInputStream
import java.io.FileNotFoundException
import java.util.concurrent.ExecutionException
import java.util.concurrent.FutureTask
import java.util.concurrent.TimeUnit
import java.util.concurrent.TimeoutException
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.sqrt

class RakatCameraFactory(
    private val activity: MainActivity,
    private val views: MutableSet<RakatCameraView>
) : PlatformViewFactory(StandardMessageCodec.INSTANCE) {
    override fun create(context: Context, viewId: Int, args: Any?): PlatformView {
        val view = RakatCameraView(activity) { views.remove(it) }
        views.add(view)
        return view
    }
}

class RakatCameraView(
    private val activity: MainActivity,
    private val onDisposed: (RakatCameraView) -> Unit
) : PlatformView {
    companion object {
        const val ORIGIN = "https://appassets.androidplatform.net"
        private const val PREFIX = "/assets/"
    }

    private val webView = WebView(activity)
    private var disposed = false
    private var confirmation: AlertDialog? = null
    private var previousBrightness: Float? = null

    private fun restoreBrightness() {
        val previous = previousBrightness ?: return
        activity.window.attributes = activity.window.attributes.apply { screenBrightness = previous }
        previousBrightness = null
    }

    private inner class LightingBridge {
        @JavascriptInterface
        fun setEnabled(enabled: Boolean): Boolean {
            // The bridge is callable from WebView's worker thread; window access stays on the UI thread.
            val update = FutureTask<Boolean> {
                if (!enabled) {
                    restoreBrightness()
                    true
                } else if (!disposed && activity.cameraForeground &&
                    webView.url?.substringBefore('#') == "$ORIGIN${PREFIX}web/rakat/index.html") {
                    if (previousBrightness == null) previousBrightness = activity.window.attributes.screenBrightness
                    activity.window.attributes = activity.window.attributes.apply { screenBrightness = 1f }
                    true
                } else {
                    false
                }
            }
            activity.runOnUiThread(update)
            return try {
                update.get(2, TimeUnit.SECONDS)
            } catch (error: TimeoutException) {
                update.cancel(false)
                Log.e("SijdaLighting", "Window brightness update timed out", error)
                false
            } catch (error: InterruptedException) {
                update.cancel(false)
                Thread.currentThread().interrupt()
                Log.e("SijdaLighting", "Window brightness update interrupted", error)
                false
            } catch (error: ExecutionException) {
                Log.e("SijdaLighting", "Window brightness update failed", error)
                false
            }
        }
    }

    private val sensorManager = activity.getSystemService(Context.SENSOR_SERVICE) as? SensorManager
    private val proximitySensor = sensorManager?.getDefaultSensor(Sensor.TYPE_PROXIMITY)
    private val lightSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_LIGHT)
    private val gravitySensor = sensorManager?.getDefaultSensor(Sensor.TYPE_GRAVITY)
    private val accelerometer = sensorManager?.getDefaultSensor(Sensor.TYPE_ACCELEROMETER)
    private val gyroscope = sensorManager?.getDefaultSensor(Sensor.TYPE_GYROSCOPE)

    private inner class SensorBridge : SensorEventListener {
        private var active = false
        private var latestProximity = -1f
        private var latestLux = -1f
        private var pitch = 0.0
        private var roll = 0.0
        private var acceleration = 0.0
        private var rotationRate = 0.0
        private var orientationTime = 0L
        private var accelerationTime = 0L
        private var gyroscopeTime = 0L

        @Synchronized
        override fun onSensorChanged(event: SensorEvent?) {
            if (!active || event == null) return
            when (event.sensor.type) {
                Sensor.TYPE_PROXIMITY -> latestProximity = event.values[0]
                Sensor.TYPE_LIGHT -> latestLux = event.values[0]
                Sensor.TYPE_GRAVITY, Sensor.TYPE_ACCELEROMETER -> {
                    val x = event.values[0].toDouble()
                    val y = event.values[1].toDouble()
                    val z = event.values[2].toDouble()
                    if (event.sensor.type == Sensor.TYPE_GRAVITY || gravitySensor == null) {
                        pitch = Math.toDegrees(atan2(y, z))
                        roll = Math.toDegrees(atan2(-x, sqrt(y * y + z * z)))
                        orientationTime = event.timestamp
                    }
                    if (event.sensor.type == Sensor.TYPE_ACCELEROMETER) {
                        acceleration = abs(sqrt(x * x + y * y + z * z) - SensorManager.GRAVITY_EARTH)
                        accelerationTime = event.timestamp
                    }
                }
                Sensor.TYPE_GYROSCOPE -> {
                    rotationRate = sqrt(event.values.sumOf { it.toDouble() * it.toDouble() })
                    gyroscopeTime = event.timestamp
                }
            }
        }

        override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

        @Synchronized
        @JavascriptInterface
        fun setEnabled(enabled: Boolean): Boolean {
            if (enabled && (disposed || !activity.cameraForeground)) return false
            if (active == enabled) return true
            sensorManager?.unregisterListener(this)
            active = enabled
            latestProximity = -1f
            latestLux = -1f
            orientationTime = 0L
            accelerationTime = 0L
            gyroscopeTime = 0L
            if (enabled) {
                listOfNotNull(proximitySensor, lightSensor, gravitySensor, accelerometer, gyroscope).forEach {
                    if (sensorManager?.registerListener(this, it, SensorManager.SENSOR_DELAY_UI) != true) {
                        Log.w("SijdaSensors", "Could not register sensor type ${it.type}")
                    }
                }
            }
            return true
        }

        @Synchronized
        @JavascriptInterface
        fun getSnapshot(): String {
            val now = SystemClock.elapsedRealtimeNanos()
            fun fresh(timestamp: Long) = active && timestamp > 0L && now - timestamp in 0..1_000_000_000L
            // Proximity and light are on-change sensors: unchanged readings remain valid until disabled.
            return JSONObject()
                .put("proximityAvailable", active && latestProximity >= 0f)
                .put("proximityDistance", latestProximity.toDouble())
                .put("proximityMaxRange", (proximitySensor?.maximumRange ?: -1f).toDouble())
                .put("lightAvailable", active && latestLux >= 0f)
                .put("lux", latestLux.toDouble())
                .put("orientationAvailable", fresh(orientationTime))
                .put("pitch", pitch).put("roll", roll)
                .put("accelerationAvailable", fresh(accelerationTime)).put("acceleration", acceleration)
                .put("gyroscopeAvailable", fresh(gyroscopeTime)).put("rotationRate", rotationRate)
                .toString()
        }
    }

    private val sensorBridge = SensorBridge()

    init {
        webView.setBackgroundColor(Color.rgb(248, 247, 242))
        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            allowFileAccess = false
            allowContentAccess = false
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            mediaPlaybackRequiresUserGesture = true
            userAgentString = "$userAgentString SijdaAndroid/0.1"
        }
        webView.addJavascriptInterface(LightingBridge(), "SijdaLighting")
        webView.addJavascriptInterface(sensorBridge, "SijdaSensors")
        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.buildUpon().fragment(null).build().toString() ==
                    "$ORIGIN${PREFIX}web/rakat/index.html") return false
                if (request.isForMainFrame &&
                    uri.toString() == "https://itsjohn9-cell.github.io/sijda/privacy.html") {
                    try {
                        activity.startActivity(Intent(Intent.ACTION_VIEW, uri))
                    } catch (error: ActivityNotFoundException) {
                        Log.e("SijdaPrivacy", "No browser can open the privacy policy", error)
                        Toast.makeText(activity, "Could not open privacy policy. Contact fehmatics@gmail.com.", Toast.LENGTH_LONG).show()
                    }
                }
                return true
            }

            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
                val uri = request.url
                if (uri.host != "appassets.androidplatform.net") {
                    // The only nonlocal requests supported by this page are opt-in Firebase feedback.
                    return if (uri.scheme == "https" && uri.host in setOf(
                            "identitytoolkit.googleapis.com", "firestore.googleapis.com"
                        )) null else errorResponse(403, "Blocked external request")
                }
                if (uri.scheme != "https" || !uri.path.orEmpty().startsWith(PREFIX)) {
                    return errorResponse(403, "Invalid local asset origin")
                }
                val path = Uri.decode(uri.encodedPath.orEmpty()).removePrefix(PREFIX)
                if (path.split('/').any { it == ".." || it == "." } ||
                    !(path.startsWith("web/rakat/") || path.startsWith("web/vendor/mediapipe/"))) {
                    return errorResponse(403, "Asset path not allowed")
                }
                return try {
                    val mime = when (path.substringAfterLast('.')) {
                        "html" -> "text/html"
                        "mjs", "js" -> "text/javascript"
                        "json" -> "application/json"
                        "wasm" -> "application/wasm"
                        else -> "application/octet-stream"
                    }
                    WebResourceResponse(
                        mime, if (mime.startsWith("text/") || mime == "application/json") "UTF-8" else null,
                        activity.assets.open("flutter_assets/$path")
                    )
                } catch (_: FileNotFoundException) {
                    errorResponse(404, "Local asset not found")
                }
            }
        }
        webView.webChromeClient = object : WebChromeClient() {
            override fun onJsConfirm(view: WebView, url: String, message: String, result: JsResult): Boolean {
                if (disposed || !url.startsWith("$ORIGIN${PREFIX}web/rakat/")) {
                    result.cancel()
                    return true
                }
                confirmation?.dismiss()
                confirmation = AlertDialog.Builder(activity)
                    .setMessage(message)
                    .setPositiveButton("Confirm") { _, _ -> result.confirm() }
                    .setNegativeButton("Cancel") { _, _ -> result.cancel() }
                    .setOnCancelListener { result.cancel() }
                    .create()
                confirmation?.show()
                return true
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                activity.runOnUiThread {
                    if (disposed) request.deny() else activity.requestCamera(request)
                }
            }

            override fun onPermissionRequestCanceled(request: PermissionRequest) {
                activity.runOnUiThread { activity.cancelCameraRequest(request) }
            }
        }
        webView.loadUrl("$ORIGIN${PREFIX}web/rakat/index.html")
    }

    private fun errorResponse(code: Int, message: String) = WebResourceResponse(
        "text/plain", "UTF-8", code, message, emptyMap(),
        ByteArrayInputStream(message.toByteArray())
    )

    fun stopCamera() {
        restoreBrightness()
        sensorBridge.setEnabled(false)
        if (!disposed) {
            confirmation?.cancel()
            confirmation = null
            webView.evaluateJavascript("window.dispatchEvent(new Event('pagehide'));", null)
        }
    }

    override fun getView(): View = webView

    override fun dispose() {
        if (disposed) return
        stopCamera()
        activity.cancelCameraRequest()
        disposed = true
        sensorManager?.unregisterListener(sensorBridge)
        webView.removeJavascriptInterface("SijdaLighting")
        webView.removeJavascriptInterface("SijdaSensors")
        webView.loadUrl("about:blank")
        webView.stopLoading()
        webView.destroy()
        onDisposed(this)
    }
}
