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
      title: 'Sajdah',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF0F4C3A),
          primary: const Color(0xFF0F4C3A),
          secondary: const Color(0xFFC5A059),
          surface: const Color(0xFFFBF9F5),
        ),
        scaffoldBackgroundColor: const Color(0xFFFBF9F5),
        useMaterial3: true,
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFFFBF9F5),
          foregroundColor: Color(0xFF0F4C3A),
          elevation: 0,
          centerTitle: true,
          titleTextStyle: TextStyle(
            color: Color(0xFF0F4C3A),
            fontSize: 20,
            fontWeight: FontWeight.w700,
            letterSpacing: 0.5,
          ),
        ),
        cardTheme: CardThemeData(
          color: Colors.white,
          elevation: 0,
          margin: const EdgeInsets.symmetric(vertical: 6),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(16),
            side: const BorderSide(color: Color(0xFFEBE6DC), width: 1),
          ),
        ),
        filledButtonTheme: FilledButtonThemeData(
          style: FilledButton.styleFrom(
            backgroundColor: const Color(0xFF0F4C3A),
            foregroundColor: Colors.white,
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(14),
            ),
            elevation: 0,
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFEBE6DC)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFFEBE6DC)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(12),
            borderSide: const BorderSide(color: Color(0xFF0F4C3A), width: 1.5),
          ),
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
