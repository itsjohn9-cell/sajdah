import 'dart:js_interop';

import 'package:flutter/material.dart';
import 'package:web/web.dart' as web;

class AutoRakat extends StatefulWidget {
  const AutoRakat({super.key});

  @override
  State<AutoRakat> createState() => _AutoRakatState();
}

class _AutoRakatState extends State<AutoRakat> {
  web.HTMLIFrameElement? _frame;

  @override
  void dispose() {
    _frame?.contentWindow?.postMessage(
      'sijda-stop-camera'.toJS,
      Uri.base.origin.toJS,
    );
    _frame?.src = 'about:blank';
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => HtmlElementView.fromTagName(
    tagName: 'iframe',
    onElementCreated: (element) {
      final frame = element as web.HTMLIFrameElement;
      _frame = frame;
      frame
        ..src = Uri.base.resolve('rakat/index.html').toString()
        ..title = 'Experimental automatic rakat and sajdah counter'
        ..allow = 'camera; fullscreen'
        ..style.border = '0'
        ..style.width = '100%'
        ..style.height = '100%';
    },
  );
}
