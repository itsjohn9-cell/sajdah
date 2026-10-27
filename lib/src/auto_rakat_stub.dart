import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

class AutoRakat extends StatelessWidget {
  const AutoRakat({super.key});

  @override
  Widget build(BuildContext context) {
    if (defaultTargetPlatform == TargetPlatform.android) {
      return const SizedBox(
        height: 900,
        child: AndroidView(
          viewType: 'sijda/automatic-rakat',
          layoutDirection: TextDirection.ltr,
          creationParamsCodec: StandardMessageCodec(),
        ),
      );
    }
    return const Card(
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Text(
          'Experimental automatic counting is currently available in the '
          'Android app and web app on an HTTPS browser with camera support. '
          'iOS native integration is not implemented. Manual counting is below.',
        ),
      ),
    );
  }
}
