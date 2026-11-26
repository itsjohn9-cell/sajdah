package app.sijda.sijda

import android.Manifest
import android.app.PendingIntent
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.drawable.Icon
import android.media.AudioAttributes
import android.os.Build
import android.os.Bundle
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Rational
import android.webkit.PermissionRequest
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    @Volatile
    var cameraForeground = false
        private set
    private val cameraViews = mutableSetOf<RakatCameraView>()
    private var pendingCamera: PermissionRequest? = null
    private var systemChannel: MethodChannel? = null
    private var pipReceiverRegistered = false

    companion object {
        private const val SYSTEM_CHANNEL = "sijda/system"
        private const val ACTION_PIP_INCREMENT = "app.sijda.sijda.PIP_INCREMENT"
    }

    private val pipActionReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action == ACTION_PIP_INCREMENT) {
                systemChannel?.invokeMethod("onPipIncrement", null)
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        registerPipReceiver()
    }

    private fun registerPipReceiver() {
        if (pipReceiverRegistered) return
        val filter = IntentFilter(ACTION_PIP_INCREMENT)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(pipActionReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(pipActionReceiver, filter)
        }
        pipReceiverRegistered = true
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        flutterEngine.platformViewsController.registry.registerViewFactory(
            "sijda/automatic-rakat",
            RakatCameraFactory(this, cameraViews)
        )
        systemChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, SYSTEM_CHANNEL).also { channel ->
            channel.setMethodCallHandler { call, result ->
                when (call.method) {
                    "isPipSupported" -> result.success(isPipSupported())
                    "enterPip" -> {
                        val width = call.argument<Int>("aspectWidth") ?: 4
                        val height = call.argument<Int>("aspectHeight") ?: 5
                        result.success(enterPipMode(width, height))
                    }
                    "vibrateAlert" -> {
                        val pattern = call.argument<String>("pattern") ?: "milestone"
                        result.success(triggerVibrationBeep(pattern))
                    }
                    else -> result.notImplemented()
                }
            }
        }
    }

    private fun isPipSupported(): Boolean {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
            packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
    }

    private fun enterPipMode(width: Int, height: Int): Boolean {
        if (!isPipSupported()) return false
        return try {
            val safeWidth = width.coerceAtLeast(1)
            val safeHeight = height.coerceAtLeast(1)
            val intent = Intent(ACTION_PIP_INCREMENT).setPackage(packageName)
            val pendingFlags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            val pendingIntent = PendingIntent.getBroadcast(this, 101, intent, pendingFlags)
            val action = RemoteAction(
                Icon.createWithResource(this, android.R.drawable.ic_input_add),
                "Count +1",
                "Increment tasbeeh counter",
                pendingIntent
            )
            val builder = PictureInPictureParams.Builder()
                .setAspectRatio(Rational(safeWidth, safeHeight))
                .setActions(listOf(action))
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                builder.setSeamlessResizeEnabled(true)
            }
            enterPictureInPictureMode(builder.build())
        } catch (_: Exception) {
            false
        }
    }

    private fun triggerVibrationBeep(pattern: String): Boolean {
        val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val manager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            manager?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        }
        if (vibrator == null || !vibrator.hasVibrator()) return false

        val timings: LongArray
        val amplitudes: IntArray
        when (pattern) {
            "complete" -> {
                timings = longArrayOf(0, 180, 85, 180, 85, 340)
                amplitudes = intArrayOf(0, 255, 0, 255, 0, 255)
            }
            "milestone" -> {
                timings = longArrayOf(0, 170, 90, 260)
                amplitudes = intArrayOf(0, 255, 0, 255)
            }
            else -> {
                timings = longArrayOf(0, 40)
                amplitudes = intArrayOf(0, 190)
            }
        }

        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                val effect = VibrationEffect.createWaveform(timings, amplitudes, -1)
                val attrs = VibrationAttributes.Builder()
                    .setUsage(VibrationAttributes.USAGE_ALARM)
                    .build()
                vibrator.vibrate(effect, attrs)
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val effect = VibrationEffect.createWaveform(timings, amplitudes, -1)
                val attrs = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
                @Suppress("DEPRECATION")
                vibrator.vibrate(effect, attrs)
            } else {
                @Suppress("DEPRECATION")
                vibrator.vibrate(timings, -1)
            }
            true
        } catch (_: Exception) {
            false
        }
    }

    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: Configuration
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        systemChannel?.invokeMethod("onPipChanged", isInPictureInPictureMode)
    }

    fun requestCamera(request: PermissionRequest) {
        if (request.origin.scheme != "https" ||
            request.origin.host != "appassets.androidplatform.net" ||
            request.origin.port != -1 ||
            !request.resources.contentEquals(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))) {
            request.deny()
            return
        }
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
            request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
        } else if (pendingCamera == null) {
            pendingCamera = request
            requestPermissions(arrayOf(Manifest.permission.CAMERA), 7401)
        } else {
            request.deny()
        }
    }

    fun cancelCameraRequest(request: PermissionRequest? = null) {
        if (request == null || request === pendingCamera) {
            pendingCamera?.deny()
            pendingCamera = null
        }
    }

    override fun onRequestPermissionsResult(code: Int, permissions: Array<out String>, results: IntArray) {
        super.onRequestPermissionsResult(code, permissions, results)
        if (code == 7401) {
            val request = pendingCamera
            pendingCamera = null
            if (request != null) {
                if (results.isNotEmpty() && results[0] == PackageManager.PERMISSION_GRANTED) {
                    request.grant(arrayOf(PermissionRequest.RESOURCE_VIDEO_CAPTURE))
                } else {
                    request.deny()
                }
            }
        }
    }

    override fun onResume() {
        super.onResume()
        cameraForeground = true
    }

    override fun onPause() {
        cameraForeground = false
        cameraViews.toList().forEach { it.stopCamera() }
        cancelCameraRequest()
        super.onPause()
    }

    override fun onDestroy() {
        if (pipReceiverRegistered) {
            try {
                unregisterReceiver(pipActionReceiver)
            } catch (_: Exception) {}
            pipReceiverRegistered = false
        }
        systemChannel?.setMethodCallHandler(null)
        super.onDestroy()
    }
}
