import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:speech_to_text/speech_recognition_result.dart';
import 'package:speech_to_text/speech_to_text.dart';

import 'store.dart';
import 'beep_sound.dart';

const sajdaEmerald = Color(0xFF0F4C3A);
const sajdaEmeraldLight = Color(0xFF165B47);
const sajdaGold = Color(0xFFC5A059);
const _ink = Color(0xFF1B2A24);

class TasbeehPage extends StatefulWidget {
  const TasbeehPage({super.key, required this.store, this.playBeep});
  final SijdaStore store;
  final Future<void> Function()? playBeep;

  @override
  State<TasbeehPage> createState() => _TasbeehPageState();
}

class _TasbeehPageState extends State<TasbeehPage> {
  final SpeechToText _speech = SpeechToText();
  bool _speechEnabled = false;
  bool _initializingSpeech = false;
  bool _isListening = false;
  DateTime? _lastHeardTime;

  Future<void> _initSpeech() async {
    if (_initializingSpeech) return;
    _initializingSpeech = true;
    try {
      _speechEnabled = await _speech.initialize(
        onError: (val) {
          debugPrint('Speech error: $val');
          if (mounted && _isListening) {
            _restartListening();
          }
        },
        onStatus: (val) {
          debugPrint('Speech status: $val');
          if (val == 'done' && _isListening && mounted) {
            _restartListening();
          }
        },
      );
      if (mounted) setState(() {});
    } catch (e) {
      debugPrint('Speech recognition initialization error: $e');
    } finally {
      _initializingSpeech = false;
    }
  }

  void _restartListening() {
    if (!_isListening) return;
    Future.delayed(const Duration(milliseconds: 300), () {
      if (mounted && _isListening) {
        _startListening();
      }
    });
  }

  Future<void> _toggleListening() async {
    if (_initializingSpeech) return;
    if (_isListening) {
      await _stopListening();
    } else {
      if (!_speechEnabled) {
        await _initSpeech();
      }
      if (_speechEnabled) {
        await _startListening();
      } else if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Microphone access or speech service is unavailable.',
            ),
          ),
        );
      }
    }
  }

  Future<void> _startListening() async {
    try {
      await _speech.listen(
        onResult: _onSpeechResult,
        listenOptions: SpeechListenOptions(
          partialResults: true,
          cancelOnError: false,
          listenFor: const Duration(seconds: 30),
          pauseFor: const Duration(seconds: 3),
        ),
      );
      if (mounted) setState(() => _isListening = true);
    } catch (e) {
      debugPrint('Error starting speech recognition: $e');
    }
  }

  Future<void> _stopListening() async {
    try {
      await _speech.stop();
    } catch (_) {}
    if (mounted) {
      setState(() => _isListening = false);
    }
  }

  void _onSpeechResult(SpeechRecognitionResult result) {
    if (!mounted || widget.store.saving) return;
    final words = result.recognizedWords.toLowerCase().trim();
    if (words.isEmpty) return;

    final now = DateTime.now();
    // 600ms debounce between speech counts to prevent double counting
    if (_lastHeardTime != null &&
        now.difference(_lastHeardTime!).inMilliseconds < 650) {
      return;
    }

    final store = widget.store;
    final guided = store.mode == TasbeehMode.guided;

    bool matched = false;

    if (guided) {
      final stage = store.stageIndex;
      if (stage == 0) {
        // Allahu Akbar / الله أكبر
        if (words.contains('akbar') ||
            words.contains('akber') ||
            words.contains('allahu') ||
            words.contains('الله') ||
            words.contains('أكبر')) {
          matched = true;
        }
      } else if (stage == 1) {
        // Alhamdulillah / الحمد لله
        if (words.contains('hamd') ||
            words.contains('lillah') ||
            words.contains('alhamd') ||
            words.contains('الحمد') ||
            words.contains('لله')) {
          matched = true;
        }
      } else {
        // SubhanAllah / سبحان الله
        if (words.contains('subhan') ||
            words.contains('sobhan') ||
            words.contains('سبحان') ||
            words.contains('الله')) {
          matched = true;
        }
      }
    } else {
      // Free count: any detected speech phrase counts
      matched = true;
    }

    if (matched) {
      _lastHeardTime = now;
      _increment(context);
    }
  }

  @override
  void dispose() {
    _speech.stop();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final store = widget.store;
    final guided = store.mode == TasbeehMode.guided;
    final complete = guided && store.guidedComplete;
    final enabled = !store.saving && !complete;

    return ColoredBox(
      color: const Color(0xFFFBF9F5),
      child: LayoutBuilder(
        builder: (context, constraints) => SingleChildScrollView(
          child: ConstrainedBox(
            constraints: BoxConstraints(minHeight: constraints.maxHeight),
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  SegmentedButton<TasbeehMode>(
                    style: SegmentedButton.styleFrom(
                      foregroundColor: const Color(0xFF5A6B63),
                      selectedForegroundColor: Colors.white,
                      selectedBackgroundColor: sajdaEmerald,
                      backgroundColor: const Color(0xFFEDE8DE),
                      padding: const EdgeInsets.symmetric(vertical: 16),
                      side: BorderSide.none,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14),
                      ),
                    ),
                    showSelectedIcon: false,
                    segments: const [
                      ButtonSegment(
                        value: TasbeehMode.guided,
                        label: Text(
                          'Guided tasbeeh',
                          style: TextStyle(fontWeight: FontWeight.w600),
                          textAlign: TextAlign.center,
                        ),
                      ),
                      ButtonSegment(
                        value: TasbeehMode.free,
                        label: Text(
                          'Free count',
                          style: TextStyle(fontWeight: FontWeight.w600),
                          textAlign: TextAlign.center,
                        ),
                      ),
                    ],
                    selected: {store.mode},
                    onSelectionChanged: store.saving
                        ? null
                        : (value) => store.setMode(value.single),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    alignment: WrapAlignment.spaceBetween,
                    crossAxisAlignment: WrapCrossAlignment.center,
                    spacing: 8,
                    runSpacing: 4,
                    children: [
                      // Voice Listening Mode Toggle Button
                      FilledButton.tonalIcon(
                        style: FilledButton.styleFrom(
                          backgroundColor: _isListening
                              ? Colors.red.withValues(alpha: 0.12)
                              : const Color(0xFFEDE8DE),
                          foregroundColor: _isListening
                              ? Colors.red
                              : sajdaEmerald,
                          padding: const EdgeInsets.symmetric(
                            horizontal: 14,
                            vertical: 8,
                          ),
                          shape: RoundedRectangleBorder(
                            borderRadius: BorderRadius.circular(20),
                          ),
                        ),
                        onPressed: enabled ? _toggleListening : null,
                        icon: Icon(
                          _isListening ? Icons.mic : Icons.mic_none,
                          size: 18,
                        ),
                        label: Text(
                          _isListening ? 'Listening...' : 'Voice mode',
                          style: const TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 13,
                          ),
                        ),
                      ),
                      TextButton.icon(
                        onPressed: store.saving
                            ? null
                            : () => _settings(context),
                        icon: Icon(
                          guided
                              ? (store.guidedBeep
                                    ? Icons.volume_up
                                    : Icons.volume_off)
                              : (store.freeBeepMode == FreeBeepMode.off
                                    ? Icons.volume_off
                                    : Icons.volume_up),
                          size: 18,
                        ),
                        label: Text(
                          guided
                              ? 'Stage beeps: ${store.guidedBeep ? 'on' : 'off'}'
                              : switch (store.freeBeepMode) {
                                  FreeBeepMode.off => 'Beep: off',
                                  FreeBeepMode.once =>
                                    'Beep at ${store.freeBeepInterval}',
                                  FreeBeepMode.every =>
                                    'Beep every ${store.freeBeepInterval}',
                                },
                          style: const TextStyle(fontSize: 13),
                        ),
                      ),
                    ],
                  ),
                  if (_isListening)
                    Padding(
                      padding: const EdgeInsets.only(top: 8),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 12,
                          vertical: 6,
                        ),
                        decoration: BoxDecoration(
                          color: sajdaEmerald.withValues(alpha: 0.08),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                            color: sajdaEmerald.withValues(alpha: 0.2),
                          ),
                        ),
                        child: Row(
                          children: [
                            const SizedBox(
                              width: 12,
                              height: 12,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: sajdaEmerald,
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              child: Text(
                                guided
                                    ? 'Listening for "${store.dhikr}"...'
                                    : 'Listening for any dhikr...',
                                style: const TextStyle(
                                  fontSize: 12,
                                  color: sajdaEmerald,
                                  fontWeight: FontWeight.w500,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  const SizedBox(height: 16),
                  Semantics(
                    button: true,
                    enabled: enabled,
                    label: guided
                        ? '${store.dhikr}, ${store.stageCount} of '
                              '${store.stageTarget}. ${store.guidedCount} of 100 total. '
                              '${complete ? 'Sequence complete' : 'Tap to count'}'
                        : '${store.tasbeeh}. Tap to count',
                    child: InkWell(
                      key: const Key('tasbeeh-count-area'),
                      onTap: enabled ? () => _increment(context) : null,
                      borderRadius: BorderRadius.circular(20),
                      excludeFromSemantics: true,
                      child: ConstrainedBox(
                        constraints: BoxConstraints(
                          minHeight: math.max(300, constraints.maxHeight - 250),
                        ),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            SizedBox(
                              width: math.min(280, constraints.maxWidth - 64),
                              height: math.min(280, constraints.maxWidth - 64),
                              child: DecoratedBox(
                                decoration: BoxDecoration(
                                  shape: BoxShape.circle,
                                  color: Colors.white,
                                  border: Border.all(
                                    color: sajdaGold,
                                    width: 3.5,
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color: sajdaEmerald.withValues(
                                        alpha: 0.08,
                                      ),
                                      blurRadius: 20,
                                      offset: const Offset(0, 6),
                                    ),
                                  ],
                                ),
                                child: Padding(
                                  padding: const EdgeInsets.all(24),
                                  child: Column(
                                    mainAxisAlignment: MainAxisAlignment.center,
                                    children: [
                                      FittedBox(
                                        fit: BoxFit.scaleDown,
                                        child: Text(
                                          '${guided ? store.stageCount : store.tasbeeh}',
                                          style: const TextStyle(
                                            fontSize: 64,
                                            fontWeight: FontWeight.w600,
                                            color: _ink,
                                          ),
                                        ),
                                      ),
                                      if (guided)
                                        Flexible(
                                          child: FittedBox(
                                            fit: BoxFit.scaleDown,
                                            child: Text(
                                              store.arabicDhikr,
                                              textDirection: TextDirection.rtl,
                                              style: const TextStyle(
                                                fontSize: 36,
                                                fontWeight: FontWeight.w600,
                                                color: sajdaEmerald,
                                              ),
                                            ),
                                          ),
                                        ),
                                    ],
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(height: 20),
                            Text(
                              complete
                                  ? 'Sequence complete'
                                  : _isListening
                                  ? 'Speak aloud or tap to count'
                                  : 'Tap the screen to increase counter',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: _isListening
                                    ? sajdaEmerald
                                    : const Color(0xFF9A522A),
                                fontStyle: FontStyle.italic,
                                fontWeight: _isListening
                                    ? FontWeight.bold
                                    : FontWeight.normal,
                                fontSize: 16,
                              ),
                            ),
                            const SizedBox(height: 12),
                            Text(
                              guided
                                  ? 'Tasbih of Sayyidah Fatimah al-Zahra (sa)\n'
                                        '${store.dhikr} · ${store.stageCount}/${store.stageTarget} · ${store.guidedCount}/100 total'
                                  : 'Free count · No session target',
                              textAlign: TextAlign.center,
                              style: const TextStyle(color: _ink, height: 1.5),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
                  Row(
                    children: [
                      Expanded(
                        child: FilledButton.icon(
                          style: FilledButton.styleFrom(
                            backgroundColor: sajdaEmerald,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(vertical: 18),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          onPressed: store.saving || store.activeCount == 0
                              ? null
                              : store.undoTasbeeh,
                          icon: const Icon(Icons.remove_circle_outline),
                          label: const Text('Minus 1'),
                        ),
                      ),
                      const SizedBox(width: 16),
                      Expanded(
                        child: OutlinedButton.icon(
                          style: OutlinedButton.styleFrom(
                            foregroundColor: sajdaEmerald,
                            side: const BorderSide(
                              color: sajdaEmerald,
                              width: 1.5,
                            ),
                            padding: const EdgeInsets.symmetric(vertical: 18),
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(12),
                            ),
                          ),
                          onPressed: store.saving || store.activeCount == 0
                              ? null
                              : () => _reset(context),
                          icon: const Icon(Icons.restart_alt),
                          label: const Text('Reset'),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  const Text(
                    'Progress saved on this device. Each mode keeps its own count.',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 12, color: _ink),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Future<void> _increment(BuildContext context) async {
    if (widget.store.saving) return;
    HapticFeedback.lightImpact();
    final beep = await widget.store.incrementTasbeeh();
    if (!beep) return;
    HapticFeedback.mediumImpact();
    try {
      await (widget.playBeep ?? BeepSound.play)();
    } on Exception catch (exception) {
      debugPrint('Sijda beep playback failed: $exception');
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text(
              'Count saved, but the beep could not play. Check audio permissions and volume.',
            ),
          ),
        );
      }
    }
  }

  Future<void> _settings(BuildContext context) async {
    final settings =
        await showDialog<({bool guided, FreeBeepMode mode, int interval})>(
          context: context,
          builder: (context) => _BeepSettings(store: widget.store),
        );
    if (settings != null && context.mounted) {
      await widget.store.setBeepSettings(
        guided: settings.guided,
        freeMode: settings.mode,
        interval: settings.interval,
      );
    }
  }

  Future<void> _reset(BuildContext context) async {
    final confirm =
        await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Reset counter?'),
            content: Text(
              widget.store.mode == TasbeehMode.guided
                  ? 'This resets the guided tasbeeh back to the start.'
                  : 'This resets the free count back to zero.',
            ),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Cancel'),
              ),
              FilledButton(
                style: FilledButton.styleFrom(backgroundColor: sajdaEmerald),
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Confirm'),
              ),
            ],
          ),
        ) ??
        false;
    if (confirm && context.mounted) {
      await widget.store.resetTasbeeh();
    }
  }
}

class _BeepSettings extends StatefulWidget {
  const _BeepSettings({required this.store});
  final SijdaStore store;

  @override
  State<_BeepSettings> createState() => _BeepSettingsState();
}

class _BeepSettingsState extends State<_BeepSettings> {
  final _form = GlobalKey<FormState>();
  late bool _guided = widget.store.guidedBeep;
  late FreeBeepMode _mode = widget.store.freeBeepMode;
  late final _interval = TextEditingController(
    text: widget.store.freeBeepInterval.toString(),
  );

  @override
  void dispose() {
    _interval.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Beep settings'),
    content: Form(
      key: _form,
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Guided-stage beeps'),
              subtitle: const Text(
                'Beep after 34 Allahu Akbar, 33 Alhamdulillah and 33 SubhanAllah.',
              ),
              value: _guided,
              onChanged: (value) => setState(() => _guided = value),
            ),
            DropdownButtonFormField<FreeBeepMode>(
              initialValue: _mode,
              isExpanded: true,
              decoration: const InputDecoration(labelText: 'Free-count beep'),
              items: const [
                DropdownMenuItem(value: FreeBeepMode.off, child: Text('Off')),
                DropdownMenuItem(
                  value: FreeBeepMode.once,
                  child: Text('Once at count'),
                ),
                DropdownMenuItem(
                  value: FreeBeepMode.every,
                  child: Text('Every interval'),
                ),
              ],
              onChanged: (value) {
                if (value != null) setState(() => _mode = value);
              },
            ),
            const SizedBox(height: 16),
            TextFormField(
              controller: _interval,
              enabled: _mode != FreeBeepMode.off,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Count / interval'),
              validator: (value) {
                if (_mode == FreeBeepMode.off) return null;
                final number = int.tryParse(value?.trim() ?? '');
                return number == null || number < 1 || number > 1000000
                    ? 'Enter a whole number from 1 to 1,000,000.'
                    : null;
              },
            ),
            const SizedBox(height: 16),
            const Text(
              'Beeping repeats if you undo and reach the count again. '
              'Changing settings does not beep for past counts. '
              'Sound depends on device volume and browser audio permissions.',
            ),
          ],
        ),
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      FilledButton(
        style: FilledButton.styleFrom(backgroundColor: sajdaEmerald),
        onPressed: () {
          if (_form.currentState!.validate()) {
            Navigator.pop(context, (
              guided: _guided,
              mode: _mode,
              interval: _mode == FreeBeepMode.off
                  ? widget.store.freeBeepInterval
                  : int.parse(_interval.text.trim()),
            ));
          }
        },
        child: const Text('Save settings'),
      ),
    ],
  );
}
