import 'package:flutter/material.dart';

import 'store.dart';
import 'tasbeeh_page.dart';
import 'auto_rakat.dart';

class SijdaHome extends StatefulWidget {
  const SijdaHome({super.key, required this.store, this.playBeep});
  final SijdaStore store;
  final Future<void> Function()? playBeep;

  @override
  State<SijdaHome> createState() => _SijdaHomeState();
}

class _SijdaHomeState extends State<SijdaHome> {
  int _tab = 0;
  int _rakat = 0;
  int _rakatTarget = 2;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.store,
      builder: (context, _) {
        final store = widget.store;
        return Scaffold(
          appBar: AppBar(
            title: Text(_tab == 2 ? 'Tasbeeh Counter' : 'Sijda'),
            centerTitle: _tab == 2,
            foregroundColor: _tab == 2 ? Colors.white : null,
            flexibleSpace: _tab == 2
                ? const SizedBox.expand(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        gradient: LinearGradient(
                          colors: [tasbeehPlum, tasbeehOrange],
                        ),
                      ),
                    ),
                  )
                : null,
            leading: _tab == 2
                ? IconButton(
                    tooltip: 'Back to home',
                    onPressed: () => setState(() => _tab = 0),
                    icon: const Icon(Icons.arrow_back),
                  )
                : null,
            actions: [
              IconButton(
                tooltip: 'About and privacy',
                onPressed: () => showAboutDialog(
                  context: context,
                  applicationName: 'Sijda',
                  applicationVersion: '0.1.0',
                  children: const [
                    Text(
                      'A quiet companion for your daily worship.\n\n'
                      'Counters and balances are saved on this device. '
                      'No account or location access is needed. '
                      'Experimental automatic rakat counting requests camera '
                      'access only when started; frames are processed locally '
                      'and are not recorded or uploaded. '
                      'Optional testing feedback can upload counts, placement, '
                      'device details and posture-transition logs to Firebase '
                      'only with your consent; it never includes camera images. '
                      'Clearing app/browser data removes your records; '
                      'backup and sync are not available yet.\n\n'
                      'This is a personal record, not a religious ruling. '
                      'Consult a trusted scholar for individual questions.',
                    ),
                  ],
                ),
                icon: const Icon(Icons.info_outline),
              ),
            ],
          ),
          body: SafeArea(
            child: Align(
              alignment: Alignment.topCenter,
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxWidth: 720),
                child: Column(
                  children: [
                    if (store.error != null)
                      MaterialBanner(
                        content: Text(store.error!),
                        actions: [
                          TextButton(
                            onPressed: store.saving
                                ? null
                                : () => setState(() => _tab = 0),
                            child: const Text('Home'),
                          ),
                        ],
                      ),
                    Expanded(
                      child: _tab == 2
                          ? TasbeehPage(store: store, playBeep: widget.playBeep)
                          : SingleChildScrollView(
                              padding: const EdgeInsets.all(20),
                              child: switch (_tab) {
                                0 => _home(store),
                                1 => _rakatPage(),
                                _ => _qaza(store),
                              },
                            ),
                    ),
                  ],
                ),
              ),
            ),
          ),
          bottomNavigationBar: NavigationBar(
            selectedIndex: _tab,
            onDestinationSelected: (value) => setState(() => _tab = value),
            destinations: const [
              NavigationDestination(
                icon: Icon(Icons.home_outlined),
                label: 'Home',
              ),
              NavigationDestination(
                icon: Icon(Icons.accessibility_new),
                label: 'Rakat',
              ),
              NavigationDestination(
                icon: Icon(Icons.touch_app_outlined),
                label: 'Tasbeeh',
              ),
              NavigationDestination(icon: Icon(Icons.checklist), label: 'Qaza'),
            ],
          ),
        );
      },
    );
  }

  Widget _heading(String title, String subtitle) => Padding(
    padding: const EdgeInsets.only(bottom: 24),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.headlineMedium),
        const SizedBox(height: 8),
        Text(subtitle, style: Theme.of(context).textTheme.bodyLarge),
      ],
    ),
  );

  Widget _home(SijdaStore store) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      _heading(
        'Small steps. Steady intention.',
        'Your personal worship space.',
      ),
      Card.filled(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'YOUR JOURNEY',
                style: Theme.of(context).textTheme.labelLarge,
              ),
              const SizedBox(height: 16),
              Text('${store.prayersRemaining} qaza prayers remaining'),
              Text('${store.balances['Fasts']} qaza fasts remaining'),
              const SizedBox(height: 16),
              const Text('Your pace. No streaks, no pressure.'),
            ],
          ),
        ),
      ),
      const SizedBox(height: 16),
      for (final item in [
        (
          Icons.accessibility_new,
          'Rakat counter',
          'Experimental camera + manual',
          1,
        ),
        (Icons.touch_app_outlined, 'Tasbeeh', 'A little remembrance', 2),
        (Icons.checklist, 'Qaza tracker', 'Keep track at your own pace', 3),
      ])
        Card(
          child: ListTile(
            leading: Icon(item.$1),
            title: Text(item.$2),
            subtitle: Text(item.$3),
            trailing: const Icon(Icons.chevron_right),
            onTap: () => setState(() => _tab = item.$4),
          ),
        ),
      const SizedBox(height: 24),
      Text('Coming next', style: Theme.of(context).textTheme.titleLarge),
      const SizedBox(height: 8),
      const Text('These features are planned, not active in this version.'),
      const SizedBox(height: 8),
      const Card(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Text(
            'Prayer times and reminders\n'
            'Qibla direction and daily prayer log\n'
            'Adhkar, duas and Quran reader\n'
            'Hijri calendar and Ramadan tools\n'
            'Tasbeeh widgets and further rakat sensor testing\n'
            'Later: zakat calculator, mosque finder and 99 Names',
            style: TextStyle(height: 1.8),
          ),
        ),
      ),
    ],
  );

  Widget _rakatPage() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      _heading(
        'Rakat counter',
        'Experimental camera tracking, with manual counting below.',
      ),
      const AutoRakat(),
      const SizedBox(height: 24),
      Text('Manual counter', style: Theme.of(context).textTheme.titleLarge),
      const SizedBox(height: 8),
      const Text(
        'Choose a session target. The count stays while switching tabs, '
        'but resets when the app restarts. It does not update qaza balances.',
      ),
      const SizedBox(height: 16),
      Wrap(
        spacing: 8,
        children: [
          for (final target in [2, 3, 4])
            ChoiceChip(
              label: Text('$target rakat'),
              selected: _rakatTarget == target,
              onSelected: _rakat == 0
                  ? (_) => setState(() => _rakatTarget = target)
                  : null,
            ),
        ],
      ),
      const SizedBox(height: 32),
      Center(
        child: Text(
          '$_rakat / $_rakatTarget',
          style: Theme.of(context).textTheme.displayLarge,
          semanticsLabel: '$_rakat of $_rakatTarget rakat recorded',
        ),
      ),
      const SizedBox(height: 24),
      FilledButton.icon(
        onPressed: _rakat >= _rakatTarget
            ? null
            : () => setState(() => _rakat++),
        icon: const Icon(Icons.add),
        label: const Padding(
          padding: EdgeInsets.all(16),
          child: Text('Record one rakat'),
        ),
      ),
      if (_rakat >= _rakatTarget)
        const Padding(
          padding: EdgeInsets.only(top: 16),
          child: Text(
            'Session target reached. This is your manual record, '
            'not confirmation of prayer validity.',
          ),
        ),
      Wrap(
        alignment: WrapAlignment.spaceEvenly,
        children: [
          TextButton(
            onPressed: _rakat == 0 ? null : () => setState(() => _rakat--),
            child: const Text('Undo rakat'),
          ),
          TextButton(
            onPressed: _rakat == 0
                ? null
                : () async {
                    if (await _confirm('Reset this rakat session?') &&
                        mounted) {
                      setState(() => _rakat = 0);
                    }
                  },
            child: const Text('New session'),
          ),
        ],
      ),
      const SizedBox(height: 24),
      const Text(
        'The manual and automatic counters are separate. Camera estimates '
        'are experimental, not confirmation of prayer validity. '
        'Use the app only when it does not distract from worship.',
      ),
    ],
  );

  Widget _qaza(SijdaStore store) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      _heading('Qaza tracker', 'One step at a time, at your own pace.'),
      const Text(
        'Enter your own remaining balances. We do not calculate religious '
        'obligations or infer missed worship from your age. '
        'Ask a trusted scholar if you need guidance.',
      ),
      const SizedBox(height: 16),
      for (final entry in store.balances.entries)
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  spacing: 16,
                  children: [
                    Text(
                      entry.key,
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    Text('${entry.value} remaining'),
                  ],
                ),
                const SizedBox(height: 8),
                Wrap(
                  alignment: WrapAlignment.spaceBetween,
                  spacing: 12,
                  children: [
                    TextButton(
                      onPressed: store.saving
                          ? null
                          : () => _editBalance(store, entry.key, entry.value),
                      child: Text('Set ${entry.key} balance'),
                    ),
                    FilledButton.tonalIcon(
                      onPressed: store.saving || entry.value == 0
                          ? null
                          : () async {
                              if (await _confirm(
                                    'Record one ${entry.key == 'Fasts' ? 'fast' : entry.key} '
                                    'as made up?',
                                  ) &&
                                  mounted &&
                                  !store.saving) {
                                await store.setBalance(
                                  entry.key,
                                  store.balances[entry.key]! - 1,
                                );
                              }
                            },
                      icon: const Icon(Icons.check),
                      label: const Text('Made up one'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      const SizedBox(height: 16),
      const Text(
        'Made a mistake? Use Set balance to correct it. Prayer and fast '
        'balances are separate. No women-specific or madhab settings '
        'are included in this version.',
      ),
    ],
  );

  Future<bool> _confirm(String title) async =>
      await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: Text(title),
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
      ) ??
      false;

  Future<void> _editBalance(SijdaStore store, String name, int current) async {
    final value = await showDialog<int>(
      context: context,
      builder: (context) => _BalanceDialog(name: name, current: current),
    );
    if (value != null && mounted && !store.saving) {
      await store.setBalance(name, value);
    }
  }
}

class _BalanceDialog extends StatefulWidget {
  const _BalanceDialog({required this.name, required this.current});
  final String name;
  final int current;

  @override
  State<_BalanceDialog> createState() => _BalanceDialogState();
}

class _BalanceDialogState extends State<_BalanceDialog> {
  late final _controller = TextEditingController(text: '${widget.current}');
  final _formKey = GlobalKey<FormState>();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
    title: Text('${widget.name} remaining'),
    content: Form(
      key: _formKey,
      child: TextFormField(
        controller: _controller,
        autofocus: true,
        keyboardType: TextInputType.number,
        decoration: const InputDecoration(labelText: 'Remaining balance'),
        validator: (text) {
          final number = int.tryParse(text?.trim() ?? '');
          if (number == null || number < 0 || number > 1000000) {
            return 'Enter a whole number from 0 to 1,000,000.';
          }
          return null;
        },
      ),
    ),
    actions: [
      TextButton(
        onPressed: () => Navigator.pop(context),
        child: const Text('Cancel'),
      ),
      FilledButton(
        onPressed: () {
          if (_formKey.currentState!.validate()) {
            Navigator.pop(context, int.parse(_controller.text.trim()));
          }
        },
        child: const Text('Save balance'),
      ),
    ],
  );
}
