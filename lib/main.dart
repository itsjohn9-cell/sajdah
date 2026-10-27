import 'package:flutter/material.dart';

import 'src/app.dart';
import 'src/store.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const SijdaApp());
}

class SijdaApp extends StatefulWidget {
  const SijdaApp({super.key, this.store, this.playBeep});

  final SijdaStore? store;
  final Future<void> Function()? playBeep;

  @override
  State<SijdaApp> createState() => _SijdaAppState();
}

class _SijdaAppState extends State<SijdaApp> {
  late final Future<SijdaStore> _store = widget.store == null
      ? SijdaStore.load()
      : Future.value(widget.store);

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Sijda',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF176B58),
          surface: const Color(0xFFF8F7F2),
        ),
        useMaterial3: true,
        inputDecorationTheme: const InputDecorationTheme(
          border: OutlineInputBorder(),
        ),
      ),
      home: FutureBuilder<SijdaStore>(
        future: _store,
        builder: (context, snapshot) {
          if (snapshot.hasError) {
            return Scaffold(
              body: SafeArea(
                child: Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      'Your saved data could not be opened. Please restart '
                      'Sijda. Your data has not been overwritten.\n\n'
                      '${snapshot.error}',
                    ),
                  ),
                ),
              ),
            );
          }
          if (!snapshot.hasData) {
            return const Scaffold(
              body: Center(child: CircularProgressIndicator()),
            );
          }
          return SijdaHome(store: snapshot.data!, playBeep: widget.playBeep);
        },
      ),
    );
  }
}
