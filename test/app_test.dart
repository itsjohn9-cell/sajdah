import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:sijda/main.dart';
import 'package:sijda/src/store.dart';

import 'store_test.dart' show MemoryStorage;

void main() {
  Future<void> openTab(WidgetTester tester, String label) async {
    await tester.tap(
      find.descendant(
        of: find.byType(NavigationBar),
        matching: find.text(label),
      ),
    );
    await tester.pumpAndSettle();
  }

  testWidgets(
    'beep settings validate, save and trigger free interval playback',
    (tester) async {
      final store = SijdaStore(MemoryStorage());
      var beeps = 0;
      await tester.pumpWidget(
        SijdaApp(
          store: store,
          playBeep: () async {
            beeps++;
          },
        ),
      );
      await tester.pumpAndSettle();
      await openTab(tester, 'Tasbeeh');
      await tester.tap(find.text('Free count'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Beep: off'));
      await tester.pumpAndSettle();
      await tester.tap(find.byType(DropdownButtonFormField<FreeBeepMode>));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Every interval').last);
      await tester.pumpAndSettle();
      await tester.enterText(find.byType(TextFormField), '0');
      await tester.ensureVisible(find.text('Save settings'));
      await tester.tap(find.text('Save settings'));
      await tester.pumpAndSettle();
      expect(find.textContaining('Enter a whole number'), findsOneWidget);
      await tester.enterText(find.byType(TextFormField), '2');
      await tester.tap(find.text('Save settings'));
      await tester.pumpAndSettle();
      expect(find.text('Beep every 2'), findsOneWidget);
      final area = find.byKey(const Key('tasbeeh-count-area'));
      await tester.tap(area);
      await tester.pumpAndSettle();
      expect(beeps, 0);
      await tester.tap(area);
      await tester.pumpAndSettle();
      expect(beeps, 1);
      expect(store.tasbeeh, 2);
    },
  );

  testWidgets('audio failures report saved count without rolling back', (
    tester,
  ) async {
    final store = SijdaStore(MemoryStorage())..guidedCount = 33;
    await tester.pumpWidget(
      SijdaApp(
        store: store,
        playBeep: () async {
          throw Exception('Audio unavailable');
        },
      ),
    );
    await tester.pumpAndSettle();
    await openTab(tester, 'Tasbeeh');
    await tester.tap(find.byKey(const Key('tasbeeh-count-area')));
    await tester.pumpAndSettle();
    expect(store.guidedCount, 34);
    expect(
      find.textContaining('Count saved, but the beep could not play'),
      findsOneWidget,
    );
  });

  testWidgets('tasbeeh count, undo and cancelled reset', (tester) async {
    final store = SijdaStore(MemoryStorage());
    await tester.pumpWidget(SijdaApp(store: store));
    await tester.pumpAndSettle();
    await openTab(tester, 'Tasbeeh');
    await tester.tap(find.byKey(const Key('tasbeeh-count-area')));
    await tester.pumpAndSettle();
    expect(store.guidedCount, 1);
    await tester.ensureVisible(find.text('Reset'));
    await tester.tap(find.text('Reset'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Cancel'));
    await tester.pumpAndSettle();
    expect(store.guidedCount, 1);
    await tester.ensureVisible(find.text('Minus 1'));
    await tester.tap(find.text('Minus 1'));
    await tester.pumpAndSettle();
    expect(store.guidedCount, 0);
    expect(tester.takeException(), isNull);
  });

  testWidgets(
    'background taps count, controls do not, and modes stay separate',
    (tester) async {
      final store = SijdaStore(MemoryStorage())..guidedCount = 99;
      var beeps = 0;
      await tester.pumpWidget(
        SijdaApp(
          store: store,
          playBeep: () async {
            beeps++;
          },
        ),
      );
      await tester.pumpAndSettle();
      await openTab(tester, 'Tasbeeh');
      final area = find.byKey(const Key('tasbeeh-count-area'));
      await tester.tapAt(tester.getTopLeft(area) + const Offset(8, 8));
      await tester.pumpAndSettle();
      expect(store.guidedCount, 100);
      expect(beeps, 1);
      expect(find.text('Sequence complete'), findsOneWidget);
      await tester.tap(area);
      await tester.pumpAndSettle();
      expect(store.guidedCount, 100);
      await tester.ensureVisible(find.text('Free count'));
      await tester.tap(find.text('Free count'));
      await tester.pumpAndSettle();
      expect(store.tasbeeh, 0);
      await tester.tap(area);
      await tester.pumpAndSettle();
      expect(store.tasbeeh, 1);
      await tester.ensureVisible(find.text('Reset'));
      await tester.tap(find.text('Reset'));
      await tester.pumpAndSettle();
      await tester.tap(find.text('Confirm'));
      await tester.pumpAndSettle();
      expect(store.tasbeeh, 0);
      expect(store.guidedCount, 100);
      expect(tester.takeException(), isNull);
    },
  );

  testWidgets('manual rakat survives tab switching and supports reset', (
    tester,
  ) async {
    await tester.pumpWidget(SijdaApp(store: SijdaStore(MemoryStorage())));
    await tester.pumpAndSettle();
    await openTab(tester, 'Rakat');
    await tester.ensureVisible(find.text('Record one rakat'));
    await tester.tap(find.text('Record one rakat'));
    await tester.pumpAndSettle();
    expect(find.text('1 / 2'), findsOneWidget);
    await openTab(tester, 'Home');
    await openTab(tester, 'Rakat');
    await tester.ensureVisible(find.text('Record one rakat'));
    expect(find.text('1 / 2'), findsOneWidget);
    await tester.tap(find.text('Record one rakat'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Session target reached'), findsOneWidget);
    await tester.ensureVisible(find.text('New session'));
    await tester.tap(find.text('New session'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirm'));
    await tester.pumpAndSettle();
    expect(find.text('0 / 2'), findsOneWidget);
  });

  testWidgets('qaza validates, saves and confirms a deduction', (tester) async {
    final store = SijdaStore(MemoryStorage());
    await tester.pumpWidget(SijdaApp(store: store));
    await tester.pumpAndSettle();
    await openTab(tester, 'Qaza');
    await tester.tap(find.text('Set Fajr balance'));
    await tester.pumpAndSettle();
    await tester.enterText(find.byType(TextFormField), '-2');
    await tester.tap(find.text('Save balance'));
    await tester.pumpAndSettle();
    expect(find.textContaining('Enter a whole number'), findsOneWidget);
    await tester.enterText(find.byType(TextFormField), '5');
    await tester.tap(find.text('Save balance'));
    await tester.pumpAndSettle();
    expect(store.balances['Fajr'], 5);
    await tester.tap(find.text('Made up one').first);
    await tester.pumpAndSettle();
    await tester.tap(find.text('Confirm'));
    await tester.pumpAndSettle();
    expect(store.balances['Fajr'], 4);
    expect(store.balances['Fasts'], 0);
    expect(tester.takeException(), isNull);
  });

  testWidgets('save failures are visible without advancing the count', (
    tester,
  ) async {
    final storage = MemoryStorage()..fail = true;
    final store = SijdaStore(storage);
    await tester.pumpWidget(SijdaApp(store: store));
    await tester.pumpAndSettle();
    await openTab(tester, 'Tasbeeh');
    await tester.tap(find.byKey(const Key('tasbeeh-count-area')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Could not save your change'), findsOneWidget);
    expect(store.guidedCount, 0);
    storage.fail = false;
    await tester.ensureVisible(find.byKey(const Key('tasbeeh-count-area')));
    await tester.tap(find.byKey(const Key('tasbeeh-count-area')));
    await tester.pumpAndSettle();
    expect(store.guidedCount, 1);
    expect(find.textContaining('Could not save your change'), findsNothing);
  });

  testWidgets('maximum count fits and reports its limit', (tester) async {
    final store = SijdaStore(MemoryStorage())
      ..mode = TasbeehMode.free
      ..tasbeeh = 1000000;
    await tester.pumpWidget(SijdaApp(store: store));
    await tester.pumpAndSettle();
    await openTab(tester, 'Tasbeeh');
    expect(find.text('1000000'), findsOneWidget);
    expect(tester.takeException(), isNull);
    await tester.tap(find.byKey(const Key('tasbeeh-count-area')));
    await tester.pumpAndSettle();
    expect(find.textContaining('Counter limit reached'), findsOneWidget);
    expect(store.tasbeeh, 1000000);
  });

  testWidgets('phone layout supports large text without overflow', (
    tester,
  ) async {
    tester.view.physicalSize = const Size(390, 844);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);
    tester.platformDispatcher.textScaleFactorTestValue = 1.5;
    addTearDown(tester.platformDispatcher.clearTextScaleFactorTestValue);
    await tester.pumpWidget(SijdaApp(store: SijdaStore(MemoryStorage())));
    await tester.pumpAndSettle();
    for (final tab in ['Home', 'Rakat', 'Tasbeeh', 'Qaza']) {
      await openTab(tester, tab);
      expect(tester.takeException(), isNull);
    }
  });
}
