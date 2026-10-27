import 'package:audioplayers/audioplayers.dart';

class BeepSound {
  static final AudioPlayer _player = AudioPlayer();

  static Future<void> play() async {
    await _player.stop();
    await _player.play(AssetSource('audio/beep.wav'));
  }
}
