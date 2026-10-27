package app.sijda.sijda

import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import android.Manifest
import android.content.pm.PackageManager
import android.webkit.PermissionRequest

class MainActivity : FlutterActivity() {
    @Volatile
    var cameraForeground = false
        private set
    private val cameraViews = mutableSetOf<RakatCameraView>()
    private var pendingCamera: PermissionRequest? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        flutterEngine.platformViewsController.registry.registerViewFactory(
            "sijda/automatic-rakat",
            RakatCameraFactory(this, cameraViews)
        )
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
}
