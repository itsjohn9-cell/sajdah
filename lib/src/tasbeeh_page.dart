import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import 'store.dart';
import 'beep_sound.dart';

const tasbeehPlum = Color(0xFF61164F);
const tasbeehOrange = Color(0xFFD58B56);
const _ink = Color(0xFF303747);

class TasbeehPage extends StatelessWidget {
  const TasbeehPage({super.key, required this.store, this.playBeep});
  final SijdaStore store;
  final Future<void> Function()? playBeep;

  @override
  Widget build(BuildContext context) {
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
                      foregroundColor: _ink,
                      selectedForegroundColor: tasbeehPlum,
                      selectedBackgroundColor: Colors.white,
                      backgroundColor: const Color(0xFFEBE6DC),
                      padding: const EdgeInsets.symmetric(vertical: 18),
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
                          textAlign: TextAlign.center,
                        ),
                      ),
                      ButtonSegment(
                        value: TasbeehMode.free,
                        label: Text('Free count', textAlign: TextAlign.center),
                      ),
                    ],
                    selected: {store.mode},
                    onSelectionChanged: store.saving
                        ? null
                        : (value) => store.setMode(value.single),
                  ),
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton.icon(
                      onPressed: store.saving ? null : () => _settings(context),
                      icon: Icon(
                        guided
                            ? (store.guidedBeep
                                  ? Icons.volume_up
                                  : Icons.volume_off)
                            : (store.freeBeepMode == FreeBeepMode.off
                                  ? Icons.volume_off
                                  : Icons.volume_up),
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
                      ),
                    ),
                  ),
                  const SizedBox(height: 24),
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
                          minHeight: math.max(320, constraints.maxHeight - 230),
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
                                    color: const Color(0xFFC5A059),
                                    width: 3.5,
                                  ),
                                  boxShadow: [
                                    BoxShadow(
                                      color: const Color(0xFF0F4C3A).withValues(alpha: 0.08),
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
                                                color: tasbeehPlum,
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
                                  : 'Tap the screen to increase counter',
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                color: Color(0xFF9A522A),
                                fontStyle: FontStyle.italic,
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
                            backgroundColor: tasbeehPlum,
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
                            foregroundColor: tasbeehPlum,
                            side: const BorderSide(color: tasbeehPlum),
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
    // Gentle haptic feedback on bead tap
    HapticFeedback.lightImpact();
    final beep = await store.incrementTasbeeh();
    if (!beep) return;
    // Stage completion or target reached haptic
    HapticFeedback.mediumImpact();
    try {
      await (playBeep ?? BeepSound.play)();
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
          builder: (context) => _BeepSettings(store: store),
        );
    if (settings != null && !store.saving) {
      await store.setBeepSettings(
        guided: settings.guided,
        freeMode: settings.mode,
        interval: settings.interval,
      );
    }
  }

  Future<void> _reset(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('Reset this tasbeeh count?'),
        content: const Text('Only the current mode will be reset.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Confirm'),
          ),
        ],
      ),
    );
    if (confirmed == true && !store.saving) await store.resetTasbeeh();
  }
}

class _BeepSettings extends StatefulWidget {
  const _BeepSettings({required this.store});
  final SijdaStore store;

  @override
  State<_BeepSettings> createState() => _BeepSettingsState();
}

class _BeepSettingsState extends State<_BeepSettings> {
  late bool _guided = widget.store.guidedBeep;
  late FreeBeepMode _mode = widget.store.freeBeepMode;
  late final _interval = TextEditingController(
    text: '${widget.store.freeBeepInterval}',
  );
  final _form = GlobalKey<FormState>();

  @override
  void dispose() {
    _interval.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: const Text('Beep settings'),
    content: SingleChildScrollView(
      child: Form(
        key: _form,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            SwitchListTile(
              contentPadding: EdgeInsets.zero,
              title: const Text('Guided stage beeps'),
              subtitle: const Text('After 34, then 33, then 33 counts'),
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
