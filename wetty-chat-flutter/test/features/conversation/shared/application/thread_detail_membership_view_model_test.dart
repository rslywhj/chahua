import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:chahua/core/api/models/thread_api_models.dart';
import 'package:chahua/core/api/services/thread_api_service.dart';
import 'package:chahua/features/conversation/shared/application/thread_detail_membership_view_model.dart';

void main() {
  group('ThreadDetailMembershipViewModel', () {
    const identity = (chatId: 10, threadRootId: 200);

    test('loads subscription status', () async {
      final api = _FakeThreadApiService(subscribed: true, archived: false);
      final container = ProviderContainer(
        overrides: [threadApiServiceProvider.overrideWithValue(api)],
      );
      addTearDown(container.dispose);

      final state = await container.read(
        threadDetailMembershipViewModelProvider(identity).future,
      );

      expect(state.membership, ThreadMembershipState.active);
      expect(api.statusCalls, 1);
    });

    test('performs subscribe action for unsubscribed threads', () async {
      final api = _FakeThreadApiService(subscribed: false, archived: false);
      final container = ProviderContainer(
        overrides: [threadApiServiceProvider.overrideWithValue(api)],
      );
      addTearDown(container.dispose);
      final provider = threadDetailMembershipViewModelProvider(identity);
      await container.read(provider.future);

      await container.read(provider.notifier).performBellAction();

      final state = container.read(provider).value;
      expect(state?.membership, ThreadMembershipState.active);
      expect(api.subscribeCalls, 1);
      expect(api.archiveCalls, 0);
      expect(api.unarchiveCalls, 0);
    });

    test('performs archive action for subscribed active threads', () async {
      final api = _FakeThreadApiService(subscribed: true, archived: false);
      final container = ProviderContainer(
        overrides: [threadApiServiceProvider.overrideWithValue(api)],
      );
      addTearDown(container.dispose);
      final provider = threadDetailMembershipViewModelProvider(identity);
      await container.read(provider.future);

      await container.read(provider.notifier).performBellAction();

      final state = container.read(provider).value;
      expect(state?.membership, ThreadMembershipState.archived);
      expect(api.subscribeCalls, 0);
      expect(api.archiveCalls, 1);
      expect(api.unarchiveCalls, 0);
    });

    test('performs unarchive action for subscribed archived threads', () async {
      final api = _FakeThreadApiService(subscribed: true, archived: true);
      final container = ProviderContainer(
        overrides: [threadApiServiceProvider.overrideWithValue(api)],
      );
      addTearDown(container.dispose);
      final provider = threadDetailMembershipViewModelProvider(identity);
      await container.read(provider.future);

      await container.read(provider.notifier).performBellAction();

      final state = container.read(provider).value;
      expect(state?.membership, ThreadMembershipState.active);
      expect(api.subscribeCalls, 0);
      expect(api.archiveCalls, 0);
      expect(api.unarchiveCalls, 1);
    });

    test('marks the thread subscribed after first reply', () async {
      final api = _FakeThreadApiService(subscribed: false, archived: false);
      final container = ProviderContainer(
        overrides: [threadApiServiceProvider.overrideWithValue(api)],
      );
      addTearDown(container.dispose);
      final provider = threadDetailMembershipViewModelProvider(identity);
      await container.read(provider.future);

      container.read(provider.notifier).markSubscribedFromReply();

      final state = container.read(provider).value;
      expect(state?.membership, ThreadMembershipState.active);
      expect(api.subscribeCalls, 0);
    });
  });
}

class _FakeThreadApiService extends ThreadApiService {
  _FakeThreadApiService({required this.subscribed, required this.archived})
    : super(Dio());

  final bool subscribed;
  final bool archived;
  int statusCalls = 0;
  int subscribeCalls = 0;
  int archiveCalls = 0;
  int unarchiveCalls = 0;

  @override
  Future<ThreadSubscriptionStatusResponseDto> getThreadSubscriptionStatus(
    String chatId,
    int threadRootId,
  ) async {
    statusCalls += 1;
    return ThreadSubscriptionStatusResponseDto(
      subscribed: subscribed,
      archived: archived,
    );
  }

  @override
  Future<void> subscribeToThread(String chatId, int threadRootId) async {
    subscribeCalls += 1;
  }

  @override
  Future<void> archiveThread(String chatId, int threadRootId) async {
    archiveCalls += 1;
  }

  @override
  Future<void> unarchiveThread(String chatId, int threadRootId) async {
    unarchiveCalls += 1;
  }
}
