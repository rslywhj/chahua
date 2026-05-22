import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:web_socket_channel/web_socket_channel.dart';

import 'package:chahua/core/network/websocket_service.dart';
import 'package:chahua/core/session/dev_session_store.dart';
import 'package:chahua/features/shared/application/chat_inbox_reconciler.dart';

void main() {
  test('emits disconnected, connecting, and connected statuses', () async {
    final channel = _FakeWebSocketChannel();
    final service = WebSocketService(
      Dio(),
      ticketLoader: () async => 'ticket',
      channelFactory: (_) => channel,
    );
    addTearDown(service.dispose);

    final statuses = <WebSocketConnectionStatus>[];
    final subscription = service.connectionStatusStream.listen(statuses.add);
    addTearDown(subscription.cancel);

    await service.init();
    await _drainMicrotasks();

    expect(statuses.map((status) => status.state), [
      WebSocketConnectionState.disconnected,
      WebSocketConnectionState.connecting,
      WebSocketConnectionState.connected,
    ]);
  });

  test('emits reconnecting and returns to connected after retry', () async {
    final firstChannel = _FakeWebSocketChannel();
    final secondChannel = _FakeWebSocketChannel();
    final channels = [firstChannel, secondChannel];
    final service = WebSocketService(
      Dio(),
      ticketLoader: () async => 'ticket',
      channelFactory: (_) => channels.removeAt(0),
      reconnectDelay: Duration.zero,
    );
    addTearDown(service.dispose);

    final statuses = <WebSocketConnectionStatus>[];
    final subscription = service.connectionStatusStream.listen(statuses.add);
    addTearDown(subscription.cancel);

    await service.init();
    await _drainMicrotasks();
    await firstChannel.sink.close();
    await _drainMicrotasks();

    expect(statuses.map((status) => status.state), [
      WebSocketConnectionState.disconnected,
      WebSocketConnectionState.connecting,
      WebSocketConnectionState.connected,
      WebSocketConnectionState.reconnecting,
      WebSocketConnectionState.connecting,
      WebSocketConnectionState.connected,
    ]);
  });

  test(
    'dispose leaves status disconnected after channel close callback',
    () async {
      final channel = _FakeWebSocketChannel();
      final service = WebSocketService(
        Dio(),
        ticketLoader: () async => 'ticket',
        channelFactory: (_) => channel,
        reconnectDelay: Duration.zero,
      );

      await service.init();

      service.dispose();
      await _drainMicrotasks();

      expect(
        service.connectionStatus.state,
        WebSocketConnectionState.disconnected,
      );
    },
  );

  test('reconnected status triggers websocket recovery once', () async {
    final statusController =
        StreamController<WebSocketConnectionStatus>.broadcast();
    final reconcilerCalls = <bool>[];
    final container = ProviderContainer(
      overrides: [
        authSessionProvider.overrideWith(_AuthenticatedSessionNotifier.new),
        webSocketConnectionStatusProvider.overrideWith(
          (ref) => statusController.stream,
        ),
        chatInboxReconcilerProvider.overrideWith(
          (ref) => _RecordingChatInboxReconciler(ref, reconcilerCalls),
        ),
      ],
    );

    final recoverySubscription = container.listen(
      webSocketReconnectRecoveryProvider,
      (_, _) {},
    );

    statusController.add(
      const WebSocketConnectionStatus(WebSocketConnectionState.reconnecting),
    );
    await _drainMicrotasks();
    statusController.add(
      const WebSocketConnectionStatus(WebSocketConnectionState.connected),
    );
    await _drainMicrotasks();

    expect(reconcilerCalls, [false]);

    recoverySubscription.close();
    container.dispose();
    await statusController.close();
  });
}

Future<void> _drainMicrotasks() async {
  await Future<void>.delayed(Duration.zero);
  await Future<void>.delayed(Duration.zero);
}

class _FakeWebSocketChannel implements WebSocketChannel {
  final _incomingController = StreamController<dynamic>.broadcast();
  late final _FakeWebSocketSink _sink = _FakeWebSocketSink(
    onClose: () => _incomingController.close(),
  );

  @override
  int? get closeCode => null;

  @override
  String? get closeReason => null;

  @override
  String? get protocol => null;

  @override
  Future<void> get ready => Future<void>.value();

  @override
  WebSocketSink get sink => _sink;

  @override
  Stream get stream => _incomingController.stream;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _FakeWebSocketSink implements WebSocketSink {
  _FakeWebSocketSink({required this.onClose});

  final Future<void> Function() onClose;
  final sent = <dynamic>[];
  final _done = Completer<void>();

  @override
  void add(event) => sent.add(event);

  @override
  Future close([int? closeCode, String? closeReason]) {
    if (!_done.isCompleted) {
      _done.complete();
      onClose();
    }
    return _done.future;
  }

  @override
  Future get done => _done.future;

  @override
  dynamic noSuchMethod(Invocation invocation) => super.noSuchMethod(invocation);
}

class _AuthenticatedSessionNotifier extends AuthSessionNotifier {
  @override
  AuthSessionState build() {
    return const AuthSessionState(
      status: AuthBootstrapStatus.authenticated,
      mode: AuthSessionMode.devHeader,
      developerUserId: 1,
      currentUserId: 1,
    );
  }
}

class _RecordingChatInboxReconciler extends ChatInboxReconciler {
  _RecordingChatInboxReconciler(super.ref, this.calls);

  final List<bool> calls;

  @override
  Future<void> reconcile({bool userInitiated = false}) async {
    calls.add(userInitiated);
  }
}
