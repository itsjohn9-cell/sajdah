import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:shared_preferences/shared_preferences.dart';

const prayerNames = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

enum TasbeehMode { guided, free }

enum FreeBeepMode { off, once, every }

abstract interface class StateStorage {
  Future<String?> read();
  Future<void> write(String value);
}

class PreferencesStorage implements StateStorage {
  final SharedPreferencesAsync _preferences = SharedPreferencesAsync();
  static const _key = 'sijda.state.v1';

  @override
  Future<String?> read() => _preferences.getString(_key);

  @override
  Future<void> write(String value) => _preferences.setString(_key, value);
}

class SijdaStore extends ChangeNotifier {
  SijdaStore(this._storage);

  final StateStorage _storage;
  final Map<String, int> _balances = {
    for (final prayer in prayerNames) prayer: 0,
    'Fasts': 0,
  };
  Map<String, int> get balances => Map.unmodifiable(_balances);
  int tasbeeh = 0;
  int guidedCount = 0;
  TasbeehMode mode = TasbeehMode.guided;
  bool guidedBeep = true;
  FreeBeepMode freeBeepMode = FreeBeepMode.off;
  int freeBeepInterval = 100;
  int get activeCount => mode == TasbeehMode.guided ? guidedCount : tasbeeh;
  bool get guidedComplete => guidedCount == 100;
  int get stageIndex => guidedCount < 34 ? 0 : (guidedCount < 67 ? 1 : 2);
  int get stageTarget => stageIndex == 0 ? 34 : 33;
  int get stageCount => guidedCount - [0, 34, 67][stageIndex];
  String get dhikr =>
      ['Allahu Akbar', 'Alhamdulillah', 'SubhanAllah'][stageIndex];
  String get arabicDhikr =>
      ['الله أكبر', 'الحمد لله', 'سبحان الله'][stageIndex];
  bool saving = false;
  String? error;

  static Future<SijdaStore> load({StateStorage? storage}) async {
    final store = SijdaStore(storage ?? PreferencesStorage());
    final raw = await store._storage.read();
    if (raw == null) return store;
    final decoded = jsonDecode(raw);
    if (decoded is! Map<String, dynamic> ||
        ![1, 2, 3].contains(decoded['version'])) {
      throw const FormatException('Unsupported saved data format.');
    }
    int number(Object? value) {
      if (value is! int || value < 0 || value > 1000000) {
        throw const FormatException('Invalid saved count.');
      }
      return value;
    }

    store.tasbeeh = number(decoded['tasbeeh']);
    if (decoded['version'] == 1) {
      if (![33, 34, 100].contains(number(decoded['target']))) {
        throw const FormatException('Invalid saved tasbeeh target.');
      }
      // Old target-based counts are free counts, not guided-sequence progress.
      store.mode = TasbeehMode.free;
    } else {
      store.guidedCount = number(decoded['guidedCount']);
      if (store.guidedCount > 100 ||
          !TasbeehMode.values.any((mode) => mode.name == decoded['mode'])) {
        throw const FormatException('Invalid saved guided session.');
      }
      store.mode = TasbeehMode.values.byName(decoded['mode'] as String);
    }
    if (decoded['version'] == 3) {
      if (decoded['guidedBeep'] is! bool ||
          !FreeBeepMode.values.any(
            (mode) => mode.name == decoded['freeBeepMode'],
          )) {
        throw const FormatException('Invalid saved beep settings.');
      }
      store.guidedBeep = decoded['guidedBeep'] as bool;
      store.freeBeepMode = FreeBeepMode.values.byName(
        decoded['freeBeepMode'] as String,
      );
      store.freeBeepInterval = number(decoded['freeBeepInterval']);
      if (store.freeBeepInterval == 0) {
        throw const FormatException('Beep interval must be positive.');
      }
    }
    final balances = decoded['balances'];
    if (balances is! Map<String, dynamic>) {
      throw const FormatException('Invalid saved balances.');
    }
    for (final key in store._balances.keys) {
      store._balances[key] = number(balances[key]);
    }
    return store;
  }

  int get prayersRemaining =>
      prayerNames.fold(0, (total, name) => total + _balances[name]!);

  Future<bool> incrementTasbeeh() async {
    if (mode == TasbeehMode.guided && guidedComplete) return false;
    final next = activeCount + 1;
    final shouldBeep = mode == TasbeehMode.guided
        ? guidedBeep && [34, 67, 100].contains(next)
        : switch (freeBeepMode) {
            FreeBeepMode.off => false,
            FreeBeepMode.once => next == freeBeepInterval,
            FreeBeepMode.every => next % freeBeepInterval == 0,
          };
    final saved = await _saveActive(next);
    return saved && shouldBeep;
  }

  Future<void> undoTasbeeh() =>
      _saveActive(activeCount > 0 ? activeCount - 1 : 0);
  Future<void> resetTasbeeh() => _saveActive(0);
  Future<void> setMode(TasbeehMode value) => _save(newMode: value);

  Future<bool> _saveActive(int value) {
    if (mode == TasbeehMode.guided) {
      return _save(newGuidedCount: value);
    }
    return _save(count: value);
  }

  Future<void> setBeepSettings({
    required bool guided,
    required FreeBeepMode freeMode,
    required int interval,
  }) {
    if (interval < 1 || interval > 1000000) {
      throw ArgumentError('Beep interval must be between 1 and 1,000,000.');
    }
    return _save(
      newGuidedBeep: guided,
      newFreeBeepMode: freeMode,
      newInterval: interval,
    );
  }

  Future<void> setBalance(String name, int value) {
    if (!_balances.containsKey(name) || value < 0 || value > 1000000) {
      throw ArgumentError('Balance must be between 0 and 1,000,000.');
    }
    return _save(balances: {..._balances, name: value});
  }

  Future<bool> _save({
    int? count,
    int? newGuidedCount,
    TasbeehMode? newMode,
    bool? newGuidedBeep,
    FreeBeepMode? newFreeBeepMode,
    int? newInterval,
    Map<String, int>? balances,
  }) async {
    if (saving) throw StateError('A save is already in progress.');
    final nextCount = count ?? tasbeeh;
    if (nextCount > 1000000) {
      error = 'Counter limit reached. Reset the counter to continue.';
      notifyListeners();
      return false;
    }
    saving = true;
    error = null;
    notifyListeners();
    try {
      await _storage.write(
        jsonEncode({
          'version': 3,
          'tasbeeh': nextCount,
          'guidedCount': newGuidedCount ?? guidedCount,
          'mode': (newMode ?? mode).name,
          'guidedBeep': newGuidedBeep ?? guidedBeep,
          'freeBeepMode': (newFreeBeepMode ?? freeBeepMode).name,
          'freeBeepInterval': newInterval ?? freeBeepInterval,
          'balances': balances ?? _balances,
        }),
      );
      tasbeeh = nextCount;
      guidedCount = newGuidedCount ?? guidedCount;
      mode = newMode ?? mode;
      guidedBeep = newGuidedBeep ?? guidedBeep;
      freeBeepMode = newFreeBeepMode ?? freeBeepMode;
      freeBeepInterval = newInterval ?? freeBeepInterval;
      if (balances != null) {
        _balances
          ..clear()
          ..addAll(balances);
      }
      return true;
    } on Exception catch (exception) {
      error = 'Could not save your change. Please try again. ($exception)';
      debugPrint('Sijda persistence failed: $exception');
      return false;
    } finally {
      saving = false;
      notifyListeners();
    }
  }
}
