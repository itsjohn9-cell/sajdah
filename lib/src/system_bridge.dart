import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

/// Bridges native Android Picture-in-Picture and strong waveform vibration
/// alerts while degrading gracefully on Web, iOS, and widget test harnesses.
class SystemBridge {
  static const MethodChannel _channel = MethodChannel('sijda/system');

  static bool get _isAndroid =>
      !kIsWeb && defaultTargetPlatform == TargetPlatform.android;

  static Future<bool> isPipSupported() async {
    if (!_isAndroid) return false;
    try {
      final result = await _channel.invokeMethod<bool>('isPipSupported');
      return result ?? false;
    } on PlatformException {
      return false;
    } on MissingPluginException {
      return false;
    }
  }

  static Future<bool> enterPip({
    int aspectWidth = 4,
    int aspectHeight = 5,
  }) async {
    if (!_isAndroid) return false;
    try {
      final result = await _channel.invokeMethod<bool>('enterPip', {
        'aspectWidth': aspectWidth,
        'aspectHeight': aspectHeight,
      });
      return result ?? false;
    } on PlatformException catch (error) {
      debugPrint('Sajdah PiP failed: $error');
      return false;
    } on MissingPluginException {
      return false;
    }
  }

  /// Plays a multi-pulse "vibration beep" pattern so tasbeeh milestones
  /// remain unmistakable even when device volume is set to zero.
  static Future<void> vibrateAlert({bool complete = false}) async {
    if (_isAndroid) {
      try {
        final ok = await _channel.invokeMethod<bool>('vibrateAlert', {
          'pattern': complete ? 'complete' : 'milestone',
        });
        if (ok == true) return;
      } on PlatformException catch (error) {
        debugPrint('Sajdah native vibration failed: $error');
      } on MissingPluginException {
        // Fallback below for widget tests or non-native targets.
      }
    }
    await HapticFeedback.heavyImpact();
    if (complete) {
      await HapticFeedback.vibrate();
    }
  }

  static void listenPip({
    required ValueChanged<bool> onPipChanged,
    required VoidCallback onPipIncrement,
  }) {
    _channel.setMethodCallHandler((call) async {
      switch (call.method) {
        case 'onPipChanged':
          onPipChanged(call.arguments == true);
        case 'onPipIncrement':
          onPipIncrement();
      }
    });
  }

  static void clearListeners() {
    _channel.setMethodCallHandler(null);
  }
}
