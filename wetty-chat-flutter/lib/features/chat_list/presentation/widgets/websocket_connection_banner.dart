import 'package:flutter/cupertino.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:chahua/app/theme/style_config.dart';
import 'package:chahua/core/network/websocket_service.dart';
import 'package:chahua/l10n/app_localizations.dart';

class WebSocketConnectionBannerSliver extends ConsumerWidget {
  const WebSocketConnectionBannerSliver({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final status = ref
        .watch(webSocketConnectionStatusProvider)
        .maybeWhen(data: (status) => status, orElse: () => null);
    final state = status?.state;
    if (state != WebSocketConnectionState.reconnecting &&
        state != WebSocketConnectionState.connecting) {
      return const SliverToBoxAdapter(child: SizedBox.shrink());
    }

    final l10n = AppLocalizations.of(context)!;
    final title = state == WebSocketConnectionState.reconnecting
        ? l10n.webSocketReconnectingTitle
        : l10n.webSocketConnectingTitle;
    final message = state == WebSocketConnectionState.reconnecting
        ? l10n.webSocketReconnectingMessage
        : l10n.webSocketConnectingMessage;

    return SliverToBoxAdapter(
      child: WebSocketConnectionBanner(title: title, message: message),
    );
  }
}

class WebSocketConnectionBanner extends StatelessWidget {
  const WebSocketConnectionBanner({
    super.key,
    required this.title,
    required this.message,
  });

  final String title;
  final String message;

  @override
  Widget build(BuildContext context) {
    final colors = context.appColors;

    return DecoratedBox(
      decoration: BoxDecoration(
        color: colors.surfaceMuted,
        border: Border(
          top: BorderSide(color: colors.separator, width: 0.5),
          bottom: BorderSide(color: colors.separator, width: 0.5),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 9),
        child: Row(
          children: [
            const CupertinoActivityIndicator(radius: 8),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text(
                    title,
                    style: appBodyTextStyle(
                      context,
                      fontWeight: AppFontWeights.semibold,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    message,
                    style: appMetaTextStyle(
                      context,
                      color: colors.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
