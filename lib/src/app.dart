import 'package:flutter/material.dart';
import 'package:url_launcher/url_launcher.dart';

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

  Future<void> _openPrivacyPolicy() async {
    final uri = Uri.parse('https://itsjohn9-cell.github.io/sajdah/privacy.html');
    try {
      if (await launchUrl(uri, mode: LaunchMode.externalApplication)) return;
      throw StateError('No application could open the privacy policy.');
    } catch (error, stack) {
      debugPrint('Sajdah privacy link failed: $error\n$stack');
      if (!mounted) return;
      await showDialog<void>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Could not open privacy policy'),
          content: SelectableText(
            'Open $uri in your browser, or contact fehmatics@gmail.com.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Close'),
            ),
          ],
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.store,
      builder: (context, _) {
        final store = widget.store;
        return Scaffold(
          appBar: AppBar(
            title: Text(_tab == 2 ? 'Tasbeeh Counter' : 'Sajdah'),
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
                  applicationName: 'Sajdah',
                  applicationVersion: '0.1.6',
                  children: [
                    const Text(
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
                    TextButton(
                      onPressed: _openPrivacyPolicy,
                      child: const Text('Read full privacy policy'),
                    ),
                    const SelectableText(
                      'Privacy and deletion: fehmatics@gmail.com',
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
    padding: const EdgeInsets.only(bottom: 20),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          title,
          style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: const Color(0xFF0F4C3A),
              ),
        ),
        const SizedBox(height: 6),
        Text(
          subtitle,
          style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                color: const Color(0xFF5A6B63),
              ),
        ),
      ],
    ),
  );

  Widget _home(SijdaStore store) => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      Container(
        margin: const EdgeInsets.only(bottom: 20),
        padding: const EdgeInsets.all(22),
        decoration: BoxDecoration(
          gradient: const LinearGradient(
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
            colors: [Color(0xFF0F4C3A), Color(0xFF165B47)],
          ),
          borderRadius: BorderRadius.circular(20),
          boxShadow: [
            BoxShadow(
              color: const Color(0xFF0F4C3A).withValues(alpha: 0.18),
              blurRadius: 18,
              offset: const Offset(0, 6),
            ),
          ],
        ),
        child: Column(
          children: [
            const Text(
              'بِسْمِ ٱللَّٰهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Color(0xFFE5C378),
                fontSize: 22,
                fontWeight: FontWeight.w600,
                letterSpacing: 0.5,
              ),
            ),
            const SizedBox(height: 12),
            const Text(
              'Small steps. Steady intention.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white,
                fontSize: 18,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              'Your personal worship space.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: Colors.white.withValues(alpha: 0.88),
                fontSize: 14,
              ),
            ),
          ],
        ),
      ),
      Card(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: Color(0xFFEBE6DC), width: 1.2),
        ),
        child: Padding(
          padding: const EdgeInsets.all(22),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  const Icon(Icons.stars_rounded, color: Color(0xFFC5A059), size: 20),
                  const SizedBox(width: 8),
                  Text(
                    'YOUR JOURNEY',
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1.2,
                          color: const Color(0xFF0F4C3A),
                        ),
                  ),
                ],
              ),
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.all(12),
                decoration: BoxDecoration(
                  color: const Color(0xFFFBF9F5),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: const Color(0xFFEBE6DC)),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${store.prayersRemaining}',
                            style: const TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFF0F4C3A),
                            ),
                          ),
                          Text(
                            'qaza prayers remaining',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                    Container(width: 1, height: 38, color: const Color(0xFFEBE6DC)),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            '${store.balances['Fasts']}',
                            style: const TextStyle(
                              fontSize: 24,
                              fontWeight: FontWeight.w800,
                              color: Color(0xFFC5A059),
                            ),
                          ),
                          Text(
                            'qaza fasts remaining',
                            style: Theme.of(context).textTheme.bodySmall,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 14),
              Text(
                'Your pace. No streaks, no pressure.',
                style: TextStyle(color: Colors.grey[600], fontSize: 13),
              ),
            ],
          ),
        ),
      ),
      const SizedBox(height: 14),
      for (final item in [
        (
          Icons.accessibility_new,
          'Rakat counter',
          'Experimental camera + manual',
          const Color(0xFF0F4C3A),
          const Color(0xFFE8F3EE),
          1,
        ),
        (
          Icons.touch_app_outlined,
          'Tasbeeh',
          'A little remembrance',
          tasbeehPlum,
          const Color(0xFFF7EBF3),
          2,
        ),
        (
          Icons.checklist,
          'Qaza tracker',
          'Keep track at your own pace',
          const Color(0xFF135D49),
          const Color(0xFFE9F1EF),
          3,
        ),
      ])
        Card(
          child: ListTile(
            contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            leading: CircleAvatar(
              backgroundColor: item.$5,
              radius: 22,
              child: Icon(item.$1, color: item.$4, size: 22),
            ),
            title: Text(
              item.$2,
              style: const TextStyle(fontWeight: FontWeight.w700),
            ),
            subtitle: Text(item.$3),
            trailing: const Icon(Icons.arrow_forward_ios_rounded, size: 14),
            onTap: () => setState(() => _tab = item.$6),
          ),
        ),
      const SizedBox(height: 24),
      Text(
        'Coming next',
        style: Theme.of(context).textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w700,
              color: const Color(0xFF0F4C3A),
            ),
      ),
      const SizedBox(height: 6),
      const Text('These features are planned, not active in this version.'),
      const SizedBox(height: 10),
      const Card(
        child: Padding(
          padding: EdgeInsets.all(18),
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

  Widget _stepPill(String title, bool active) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
    decoration: BoxDecoration(
      color: active ? const Color(0xFF0F4C3A) : Colors.white,
      borderRadius: BorderRadius.circular(8),
      border: Border.all(
        color: active ? const Color(0xFF0F4C3A) : const Color(0xFFDED8CD),
      ),
    ),
    child: Text(
      title,
      style: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w600,
        color: active ? Colors.white : const Color(0xFF2C3E35),
      ),
    ),
  );

  Widget _stepArrow() => const Padding(
    padding: EdgeInsets.symmetric(horizontal: 4),
    child: Icon(Icons.arrow_forward_ios_rounded, size: 9, color: Color(0xFFC5A059)),
  );

  Widget _rakatPage() => Column(
    crossAxisAlignment: CrossAxisAlignment.stretch,
    children: [
      _heading(
        'Rakat counter',
        'Choose camera-assisted tracking or use the manual counter below.',
      ),
      Container(
        margin: const EdgeInsets.only(bottom: 18),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: const Color(0xFFEDE8DE).withValues(alpha: 0.5),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: const Color(0xFFE0D8CA)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: const [
                Icon(Icons.auto_awesome, size: 16, color: Color(0xFFC5A059)),
                SizedBox(width: 6),
                Expanded(
                  child: Text(
                    'NAMAZ PROSTRATION FLOW',
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      letterSpacing: 1.0,
                      color: Color(0xFF0F4C3A),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            SingleChildScrollView(
              scrollDirection: Axis.horizontal,
              child: Row(
                children: [
                  _stepPill('1. Qiyam', true),
                  _stepArrow(),
                  _stepPill('2. Ruku', true),
                  _stepArrow(),
                  _stepPill('3. Qaumah', true),
                  _stepArrow(),
                  _stepPill('4. Sajdah 1', true),
                  _stepArrow(),
                  _stepPill('5. Jalsah', true),
                  _stepArrow(),
                  _stepPill('6. Sajdah 2', true),
                ],
              ),
            ),
          ],
        ),
      ),
      Card(
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: const BorderSide(color: Color(0xFFC5A059), width: 1.2),
        ),
        child: Padding(
          padding: const EdgeInsets.all(18),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0F4C3A).withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.videocam_rounded, color: Color(0xFF0F4C3A), size: 24),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: const [
                        Text(
                          'Hands-Free Camera Tracking',
                          style: TextStyle(fontWeight: FontWeight.w700, fontSize: 16),
                        ),
                        Text(
                          'AI Pose & Proximity Detection',
                          style: TextStyle(fontSize: 12, color: Color(0xFFC5A059), fontWeight: FontWeight.w600),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              const Text(
                'Opens a dedicated screen with live estimates and tracking status. '
                'Review or report results before leaving; automatic sessions are not saved.',
                style: TextStyle(fontSize: 13, height: 1.4),
              ),
              const SizedBox(height: 14),
              FilledButton.icon(
                key: const Key('open-automatic-rakat'),
                onPressed: () => Navigator.of(context).push<void>(
                  MaterialPageRoute(
                    builder: (context) => Scaffold(
                      appBar: AppBar(title: const Text('Automatic rakat')),
                      body: const SafeArea(child: AutoRakat()),
                    ),
                  ),
                ),
                icon: const Icon(Icons.videocam_outlined),
                label: const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Text('Open automatic counter'),
                ),
              ),
            ],
          ),
        ),
      ),
      const SizedBox(height: 24),
      Text(
        'Manual counter',
        style: Theme.of(context).textTheme.titleLarge?.copyWith(
              fontWeight: FontWeight.w700,
              color: const Color(0xFF0F4C3A),
            ),
      ),
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
              selectedColor: const Color(0xFF0F4C3A),
              labelStyle: TextStyle(
                color: _rakatTarget == target ? Colors.white : const Color(0xFF0F4C3A),
                fontWeight: FontWeight.w600,
              ),
              onSelected: _rakat == 0
                  ? (_) => setState(() => _rakatTarget = target)
                  : null,
            ),
        ],
      ),
      const SizedBox(height: 28),
      Center(
        child: Container(
          width: 170,
          height: 170,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Colors.white,
            border: Border.all(color: const Color(0xFF0F4C3A), width: 3),
            boxShadow: [
              BoxShadow(
                color: const Color(0xFF0F4C3A).withValues(alpha: 0.08),
                blurRadius: 16,
                offset: const Offset(0, 4),
              ),
            ],
          ),
          alignment: Alignment.center,
          child: Text(
            '$_rakat / $_rakatTarget',
            style: Theme.of(context).textTheme.displayLarge?.copyWith(
                  fontWeight: FontWeight.w800,
                  color: const Color(0xFF0F4C3A),
                  fontSize: 44,
                ),
            semanticsLabel: '$_rakat of $_rakatTarget rakat recorded',
          ),
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
      const SizedBox(height: 12),
      Wrap(
        alignment: WrapAlignment.spaceEvenly,
        children: [
          TextButton.icon(
            onPressed: _rakat == 0 ? null : () => setState(() => _rakat--),
            icon: const Icon(Icons.undo),
            label: const Text('Undo rakat'),
          ),
          TextButton.icon(
            onPressed: _rakat == 0
                ? null
                : () async {
                    if (await _confirm('Reset this rakat session?') &&
                        mounted) {
                      setState(() => _rakat = 0);
                    }
                  },
            icon: const Icon(Icons.refresh),
            label: const Text('New session'),
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
