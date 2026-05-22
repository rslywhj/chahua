import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:chahua/core/network/websocket_service.dart';
import 'package:chahua/features/chat_list/presentation/widgets/websocket_connection_banner.dart';
import 'package:chahua/l10n/app_localizations.dart';

void main() {
  testWidgets('does not render when websocket is connected', (tester) async {
    await tester.pumpWidget(
      _buildTestApp(
        const WebSocketConnectionStatus(WebSocketConnectionState.connected),
      ),
    );
    await tester.pump();

    expect(find.text('Reconnecting...'), findsNothing);
    expect(find.text('Messages may be delayed.'), findsNothing);
  });

  testWidgets('renders reconnecting message when websocket reconnects', (
    tester,
  ) async {
    await tester.pumpWidget(
      _buildTestApp(
        const WebSocketConnectionStatus(WebSocketConnectionState.reconnecting),
      ),
    );
    await tester.pump();

    expect(find.text('Reconnecting...'), findsOneWidget);
    expect(find.text('Messages may be delayed.'), findsOneWidget);
  });
}

Widget _buildTestApp(WebSocketConnectionStatus status) {
  return ProviderScope(
    overrides: [
      webSocketConnectionStatusProvider.overrideWith(
        (ref) => Stream.value(status),
      ),
    ],
    child: CupertinoApp(
      localizationsDelegates: AppLocalizations.localizationsDelegates,
      supportedLocales: AppLocalizations.supportedLocales,
      home: const CupertinoPageScaffold(
        child: CustomScrollView(slivers: [WebSocketConnectionBannerSliver()]),
      ),
    ),
  );
}
