import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:web_socket_channel/web_socket_channel.dart';
import 'package:chahua/features/shared/application/app_refresh_coordinator.dart';

import '../api/client/api_json.dart';
import '../api/models/websocket_api_models.dart';
import '../session/dev_session_store.dart';
import 'api_config.dart';
import 'dio_client.dart';

enum WebSocketConnectionState {
  disconnected,
  connecting,
  connected,
  reconnecting,
}

class WebSocketConnectionStatus {
  const WebSocketConnectionStatus(this.state);

  final WebSocketConnectionState state;

  @override
  bool operator ==(Object other) {
    return identical(this, other) ||
        other is WebSocketConnectionStatus && state == other.state;
  }

  @override
  int get hashCode => state.hashCode;
}

/// Manages the WebSocket connection.
/// Handles ticket-based auth, keep-alive (pings), and broadcasts events.
class WebSocketService {
  WebSocketService(
    this._dio, {
    Future<String> Function()? ticketLoader,
    WebSocketChannel Function(Uri uri)? channelFactory,
    Duration pingInterval = const Duration(seconds: 30),
    Duration reconnectDelay = const Duration(seconds: 5),
  }) : _ticketLoader = ticketLoader,
       _channelFactory = channelFactory,
       _pingInterval = pingInterval,
       _reconnectDelay = reconnectDelay;

  WebSocketChannel? _channel;
  final StreamController<ApiWsEvent> _eventController =
      StreamController<ApiWsEvent>.broadcast();
  late final StreamController<WebSocketConnectionStatus> _statusController =
      StreamController<WebSocketConnectionStatus>.broadcast(
        onListen: () => _statusController.add(_connectionStatus),
      );
  WebSocketConnectionStatus _connectionStatus = const WebSocketConnectionStatus(
    WebSocketConnectionState.disconnected,
  );

  Stream<ApiWsEvent> get events => _eventController.stream;
  Stream<WebSocketConnectionStatus> get connectionStatusStream =>
      _statusController.stream;
  WebSocketConnectionStatus get connectionStatus => _connectionStatus;

  Timer? _pingTimer;
  Timer? _reconnectTimer;
  bool _isConnecting = false;
  bool _isDisposed = false;
  WsClientAppState _appState = WsClientAppState.active;

  final Dio _dio;
  final Future<String> Function()? _ticketLoader;
  final WebSocketChannel Function(Uri uri)? _channelFactory;
  final Duration _pingInterval;
  final Duration _reconnectDelay;

  @visibleForTesting
  WsClientAppState get appState => _appState;

  @visibleForTesting
  bool get isConnected => _channel != null;

  /// Initialize the connection.
  Future<void> init() async {
    if (_isDisposed) return;
    if (_isConnecting || (_channel != null)) return;
    _isConnecting = true;
    _reconnectTimer?.cancel();
    _setConnectionState(WebSocketConnectionState.connecting);

    try {
      // Fetch auth ticket
      final ticket = await _loadTicket();

      // create a WebSocketChannel
      final wsUrl = '${apiBaseUrl.replaceFirst('http', 'ws')}/ws';
      debugPrint('[WS] connecting to $wsUrl');
      _channel = (_channelFactory ?? WebSocketChannel.connect)(
        Uri.parse(wsUrl),
      );

      // Send auth message
      _channel!.sink.add(jsonEncode(WsAuthMessageDto(ticket: ticket).toJson()));
      _sendCurrentAppState(force: true);

      // Listen for messages
      _channel!.stream.listen(
        (data) {
          developer.log('$data', name: '[ws]');
          try {
            final msg = ApiWsEvent.fromJson(decodeJsonObject(data as String));
            if (msg == null || msg is PongWsEvent) return;
            _eventController.add(msg);
          } catch (_) {
            developer.log('recv malformed payload', name: '[ws]');
            // Drop malformed websocket payloads.
          }
        },
        onError: (error) {
          debugPrint('[WS] error: $error');
          _reconnect();
        },
        onDone: () {
          debugPrint('[WS] connection closed, reconnecting...');
          _reconnect();
        },
      );

      // Start ping loop (every 30 seconds)
      _pingTimer?.cancel();
      _pingTimer = Timer.periodic(_pingInterval, (timer) => _sendPing());

      debugPrint('[WS] connected');
      _isConnecting = false;
      _setConnectionState(WebSocketConnectionState.connected);
    } catch (e) {
      debugPrint('[WS] init failed: $e');
      _isConnecting = false;
      _reconnect();
    }
  }

  void _reconnect() {
    if (_isDisposed) return;
    _pingTimer?.cancel();
    _reconnectTimer?.cancel();
    final old = _channel;
    _channel = null;
    old?.sink.close();
    _setConnectionState(WebSocketConnectionState.reconnecting);
    _reconnectTimer = Timer(_reconnectDelay, () {
      unawaited(init());
    });
  }

  Future<void> refreshSession() async {
    _pingTimer?.cancel();
    _reconnectTimer?.cancel();
    final old = _channel;
    _channel = null;
    await old?.sink.close();
    _setConnectionState(WebSocketConnectionState.connecting);
    await init();
  }

  void dispose() {
    _isDisposed = true;
    _pingTimer?.cancel();
    _reconnectTimer?.cancel();
    _channel?.sink.close();
    _setConnectionState(WebSocketConnectionState.disconnected);
    _eventController.close();
    _statusController.close();
  }

  void updateAppState(WsClientAppState nextState) {
    if (_appState == nextState) return;
    _appState = nextState;
    _sendCurrentAppState(force: false);
  }

  Future<String> _loadTicket() async {
    final ticketLoader = _ticketLoader;
    if (ticketLoader != null) {
      return ticketLoader();
    }
    final ticketRes = await _dio.get<Map<String, dynamic>>('/ws/ticket');
    return WsTicketResponseDto.fromJson(ticketRes.data!).ticket;
  }

  void _sendCurrentAppState({required bool force}) {
    if (_channel == null) return;
    _sendAppStateMessage();
    _sendPing();
  }

  void _sendAppStateMessage() {
    final channel = _channel;
    if (channel == null) return;
    channel.sink.add(
      jsonEncode(WsAppStateMessageDto(state: _appState).toJson()),
    );
  }

  void _sendPing() {
    final channel = _channel;
    if (channel == null) return;
    channel.sink.add(jsonEncode(WsPingMessageDto(state: _appState).toJson()));
  }

  void _setConnectionState(WebSocketConnectionState state) {
    final next = WebSocketConnectionStatus(state);
    if (_connectionStatus == next) return;
    _connectionStatus = next;
    if (!_statusController.isClosed) {
      _statusController.add(next);
    }
  }
}

final webSocketProvider = Provider<WebSocketService>((ref) {
  final session = ref.watch(authSessionProvider);
  final service = WebSocketService(ref.watch(dioProvider));
  if (session.isAuthenticated) {
    unawaited(service.init());
  }

  // When devSessionProvider changes, Riverpod will recreate this provider,
  // so we dispose the old service.
  ref.onDispose(service.dispose);

  // Listen for subsequent session changes to refresh the connection.
  ref.listen<AuthSessionState>(authSessionProvider, (previous, next) {
    if (previous != null &&
        next.isAuthenticated &&
        !mapEquals(previous.authHeaders, next.authHeaders)) {
      service.refreshSession();
    }
  });

  return service;
});

final webSocketConnectionStatusProvider =
    StreamProvider<WebSocketConnectionStatus>((ref) {
      final service = ref.watch(webSocketProvider);
      return service.connectionStatusStream;
    });

final webSocketReconnectRecoveryProvider = Provider<void>((ref) {
  ref.listen<AsyncValue<WebSocketConnectionStatus>>(
    webSocketConnectionStatusProvider,
    (previous, next) {
      final previousState = previous?.maybeWhen(
        data: (status) => status.state,
        orElse: () => null,
      );
      final nextState = next.maybeWhen(
        data: (status) => status.state,
        orElse: () => null,
      );
      if (previousState == WebSocketConnectionState.reconnecting &&
          nextState == WebSocketConnectionState.connected) {
        unawaited(
          ref
              .read(appRefreshCoordinatorProvider)
              .recover(AppRefreshReason.websocketReconnected),
        );
      }
    },
  );
});
