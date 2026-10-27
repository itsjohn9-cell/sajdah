import 'dart:async';
import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:sijda/src/store.dart';

class MemoryStorage implements StateStorage {
  String? value;
  bool fail = false;
  Completer<void>? pending;

  @override
  Future<String?> read() async => value;

  @override
  Future<void> write(String value) async {
    if (fail) throw Exception('Storage unavailable');
    if (pending != null) await pending!.future;
    this.value = value;
  }
}

void main() {
  test(
    'beeps occur only on forward saved guided boundaries, including repeats',
    () async {
      final storage = MemoryStorage();
      final store = SijdaStore(storage);
      final beeps = <int>[];
      for (var count = 1; count <= 100; count++) {
        if (await store.incrementTasbeeh()) beeps.add(count);
      }
      expect(beeps, [34, 67, 100]);
      expect(await store.incrementTasbeeh(), isFalse);
      await store.undoTasbeeh();
      expect(await store.incrementTasbeeh(), isTrue);
      await store.resetTasbeeh();
      store.guidedCount = 33;
      storage.fail = true;
      expect(await store.incrementTasbeeh(), isFalse);
      expect(store.guidedCount, 33);
      storage.fail = false;
      expect(await store.incrementTasbeeh(), isTrue);
      await store.setBeepSettings(
        guided: false,
        freeMode: FreeBeepMode.off,
        interval: 100,
      );
      store.guidedCount = 66;
      expect(await store.incrementTasbeeh(), isFalse);
    },
  );

  test(
    'free beep once vs every interval, undo, reset and settings persistence',
    () async {
      final storage = MemoryStorage();
      final store = SijdaStore(storage);
      await store.setMode(TasbeehMode.free);
      await store.setBeepSettings(
        guided: false,
        freeMode: FreeBeepMode.once,
        interval: 100,
      );
      final once = <int>[];
      for (var count = 1; count <= 200; count++) {
        if (await store.incrementTasbeeh()) once.add(count);
      }
      expect(once, [100]);
      await store.resetTasbeeh();
      await store.setBeepSettings(
        guided: true,
        freeMode: FreeBeepMode.every,
        interval: 100,
      );
      final every = <int>[];
      for (var count = 1; count <= 200; count++) {
        if (await store.incrementTasbeeh()) every.add(count);
      }
      expect(every, [100, 200]);
      await store.undoTasbeeh();
      expect(await store.incrementTasbeeh(), isTrue);
      final restored = await SijdaStore.load(storage: storage);
      expect(restored.freeBeepMode, FreeBeepMode.every);
      expect(restored.freeBeepInterval, 100);
      expect(restored.guidedBeep, isTrue);
      await restored.setBeepSettings(
        guided: true,
        freeMode: FreeBeepMode.off,
        interval: 1,
      );
      expect(await restored.incrementTasbeeh(), isFalse);
      await restored.setBeepSettings(
        guided: true,
        freeMode: FreeBeepMode.every,
        interval: 1,
      );
      expect(await restored.incrementTasbeeh(), isTrue);
      expect(
        () => restored.setBeepSettings(
          guided: true,
          freeMode: FreeBeepMode.once,
          interval: 0,
        ),
        throwsArgumentError,
      );
      expect(
        () => restored.setBeepSettings(
          guided: true,
          freeMode: FreeBeepMode.once,
          interval: 1000001,
        ),
        throwsArgumentError,
      );
    },
  );

  test(
    'v2 migrates with safe beep defaults, invalid beep records are rejected',
    () async {
      final storage = MemoryStorage();
      final store = SijdaStore(storage);
      await store.incrementTasbeeh();
      final data = jsonDecode(storage.value!) as Map<String, dynamic>;
      data['version'] = 2;
      data.remove('guidedBeep');
      data.remove('freeBeepMode');
      data.remove('freeBeepInterval');
      storage.value = jsonEncode(data);
      final migrated = await SijdaStore.load(storage: storage);
      expect(migrated.guidedCount, 1);
      expect(migrated.guidedBeep, isTrue);
      expect(migrated.freeBeepMode, FreeBeepMode.off);
      await migrated.incrementTasbeeh();
      final valid = jsonDecode(storage.value!) as Map<String, dynamic>;
      for (final bad in [
        {...valid, 'guidedBeep': 'yes'},
        {...valid, 'freeBeepMode': 'invalid'},
        {...valid, 'freeBeepInterval': 0},
      ]) {
        storage.value = jsonEncode(bad);
        await expectLater(
          SijdaStore.load(storage: storage),
          throwsFormatException,
        );
        expect(storage.value, jsonEncode(bad));
      }
    },
  );

  test(
    'guided sequence transitions, completes and undoes across boundaries',
    () async {
      final storage = MemoryStorage();
      final store = SijdaStore(storage);
      for (var count = 0; count < 33; count++) {
        await store.incrementTasbeeh();
      }
      expect(store.dhikr, 'Allahu Akbar');
      expect(store.stageCount, 33);
      await store.incrementTasbeeh();
      expect(store.dhikr, 'Alhamdulillah');
      expect(store.stageCount, 0);
      await store.undoTasbeeh();
      expect(store.dhikr, 'Allahu Akbar');
      expect(store.stageCount, 33);
      for (var count = 33; count < 67; count++) {
        await store.incrementTasbeeh();
      }
      expect(store.dhikr, 'SubhanAllah');
      expect(store.stageCount, 0);
      await store.undoTasbeeh();
      expect(store.dhikr, 'Alhamdulillah');
      expect(store.stageCount, 32);
      for (var count = 66; count < 100; count++) {
        await store.incrementTasbeeh();
      }
      expect(store.guidedComplete, isTrue);
      expect(store.stageCount, 33);
      await store.incrementTasbeeh();
      expect(store.guidedCount, 100);
      final restored = await SijdaStore.load(storage: storage);
      expect(restored.guidedComplete, isTrue);
      await restored.undoTasbeeh();
      expect(restored.guidedComplete, isFalse);
      expect(restored.stageCount, 32);
    },
  );

  test('legacy counts migrate as free counts without changing qaza', () async {
    final storage = MemoryStorage()
      ..value = jsonEncode({
        'version': 1,
        'tasbeeh': 72,
        'target': 33,
        'balances': {
          for (final name in [...prayerNames, 'Fasts']) name: 7,
        },
      });
    final store = await SijdaStore.load(storage: storage);
    expect(store.mode, TasbeehMode.free);
    expect(store.tasbeeh, 72);
    expect(store.guidedCount, 0);
    await store.incrementTasbeeh();
    await store.setMode(TasbeehMode.guided);
    await store.incrementTasbeeh();
    await store.resetTasbeeh();
    final restored = await SijdaStore.load(storage: storage);
    expect(restored.tasbeeh, 73);
    expect(restored.guidedCount, 0);
    expect(restored.prayersRemaining, 35);
    expect(restored.balances['Fasts'], 7);
  });

  test('fresh install starts with empty independent balances', () async {
    final store = await SijdaStore.load(storage: MemoryStorage());
    expect(store.tasbeeh, 0);
    expect(store.mode, TasbeehMode.guided);
    expect(store.prayersRemaining, 0);
    expect(store.balances.length, 6);
  });

  test('tasbeeh modes, undo, reset and restart persist', () async {
    final storage = MemoryStorage();
    final store = await SijdaStore.load(storage: storage);
    await store.incrementTasbeeh();
    await store.incrementTasbeeh();
    await store.undoTasbeeh();
    await store.setMode(TasbeehMode.free);
    await store.incrementTasbeeh();
    final restored = await SijdaStore.load(storage: storage);
    expect(restored.tasbeeh, 1);
    expect(restored.guidedCount, 1);
    expect(restored.mode, TasbeehMode.free);
    await restored.resetTasbeeh();
    await restored.undoTasbeeh();
    expect((await SijdaStore.load(storage: storage)).tasbeeh, 0);
  });

  test('prayer and fast balances stay independent across restart', () async {
    final storage = MemoryStorage();
    final store = await SijdaStore.load(storage: storage);
    await store.setBalance('Fajr', 12);
    await store.setBalance('Isha', 7);
    await store.setBalance('Fasts', 3);
    await store.setBalance('Fajr', 11);
    final restored = await SijdaStore.load(storage: storage);
    expect(restored.prayersRemaining, 18);
    expect(restored.balances['Fasts'], 3);
    expect(restored.balances['Dhuhr'], 0);
  });

  test('invalid edits are rejected', () async {
    final store = SijdaStore(MemoryStorage());
    expect(() => store.setBalance('Fajr', -1), throwsArgumentError);
    expect(() => store.setBalance('Fasts', 1000001), throwsArgumentError);
    expect(() => store.setBalance('Unknown', 2), throwsArgumentError);
    await store.setBalance('Fasts', 1000000);
    expect(store.balances['Fasts'], 1000000);
  });

  test(
    'failed writes are visible and do not claim changes were saved',
    () async {
      final storage = MemoryStorage();
      final store = SijdaStore(storage);
      await store.setBalance('Fajr', 2);
      storage.fail = true;
      await store.setBalance('Fajr', 1);
      expect(store.balances['Fajr'], 2);
      expect(store.error, contains('Could not save'));
      expect(store.saving, isFalse);
      storage.fail = false;
      await store.setBalance('Fajr', 1);
      expect(store.error, isNull);
      expect(store.balances['Fajr'], 1);
    },
  );

  test('overlapping writes are rejected instead of losing updates', () async {
    final storage = MemoryStorage()..pending = Completer<void>();
    final store = SijdaStore(storage);
    final first = store.incrementTasbeeh();
    expect(store.saving, isTrue);
    await expectLater(store.incrementTasbeeh(), throwsStateError);
    storage.pending!.complete();
    await first;
    expect(store.guidedCount, 1);
  });

  test('corrupt or unsupported saved records are not overwritten', () async {
    final storage = MemoryStorage()..value = 'not json';
    await expectLater(SijdaStore.load(storage: storage), throwsFormatException);
    expect(storage.value, 'not json');
    storage.value = jsonEncode({'version': 4});
    await expectLater(SijdaStore.load(storage: storage), throwsFormatException);
    final good = MemoryStorage();
    await SijdaStore(good).incrementTasbeeh();
    final data = jsonDecode(good.value!) as Map<String, dynamic>;
    data['tasbeeh'] = -1;
    storage.value = jsonEncode(data);
    await expectLater(SijdaStore.load(storage: storage), throwsFormatException);
  });
}
