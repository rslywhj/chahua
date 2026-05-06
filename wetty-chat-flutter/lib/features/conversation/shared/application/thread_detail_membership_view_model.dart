import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:chahua/core/api/services/thread_api_service.dart';

typedef ThreadDetailMembershipIdentity = ({int chatId, int threadRootId});

enum ThreadMembershipState { notSubscribed, active, archived }

class ThreadDetailMembershipViewState {
  const ThreadDetailMembershipViewState({
    required this.membership,
    this.isMutating = false,
    this.errorMessage,
  });

  final ThreadMembershipState membership;
  final bool isMutating;
  final String? errorMessage;

  ThreadDetailMembershipViewState copyWith({
    ThreadMembershipState? membership,
    bool? isMutating,
    String? errorMessage,
    bool clearError = false,
  }) {
    return ThreadDetailMembershipViewState(
      membership: membership ?? this.membership,
      isMutating: isMutating ?? this.isMutating,
      errorMessage: clearError ? null : errorMessage ?? this.errorMessage,
    );
  }
}

ThreadMembershipState _membershipFromStatus({
  required bool subscribed,
  required bool archived,
}) {
  if (!subscribed) {
    return ThreadMembershipState.notSubscribed;
  }
  return archived
      ? ThreadMembershipState.archived
      : ThreadMembershipState.active;
}

class ThreadDetailMembershipViewModel
    extends AsyncNotifier<ThreadDetailMembershipViewState> {
  ThreadDetailMembershipViewModel(this.identity);

  final ThreadDetailMembershipIdentity identity;

  ThreadApiService get _api => ref.read(threadApiServiceProvider);

  @override
  Future<ThreadDetailMembershipViewState> build() async {
    final response = await _api.getThreadSubscriptionStatus(
      identity.chatId.toString(),
      identity.threadRootId,
    );
    return ThreadDetailMembershipViewState(
      membership: _membershipFromStatus(
        subscribed: response.subscribed,
        archived: response.archived,
      ),
    );
  }

  Future<void> performBellAction() async {
    final current = state.value;
    if (current == null || current.isMutating) {
      return;
    }

    switch (current.membership) {
      case ThreadMembershipState.notSubscribed:
        await subscribe();
      case ThreadMembershipState.active:
        await archive();
      case ThreadMembershipState.archived:
        await unarchive();
    }
  }

  Future<void> subscribe() async {
    await _mutate(
      request: () => _api.subscribeToThread(
        identity.chatId.toString(),
        identity.threadRootId,
      ),
      nextState: const ThreadDetailMembershipViewState(
        membership: ThreadMembershipState.active,
      ),
    );
  }

  Future<void> archive() async {
    await _mutate(
      request: () =>
          _api.archiveThread(identity.chatId.toString(), identity.threadRootId),
      nextState: const ThreadDetailMembershipViewState(
        membership: ThreadMembershipState.archived,
      ),
    );
  }

  Future<void> unarchive() async {
    await _mutate(
      request: () => _api.unarchiveThread(
        identity.chatId.toString(),
        identity.threadRootId,
      ),
      nextState: const ThreadDetailMembershipViewState(
        membership: ThreadMembershipState.active,
      ),
    );
  }

  void markSubscribedFromReply() {
    final current = state.value;
    state = AsyncData(
      (current ??
              const ThreadDetailMembershipViewState(
                membership: ThreadMembershipState.active,
              ))
          .copyWith(
            membership: ThreadMembershipState.active,
            isMutating: false,
            clearError: true,
          ),
    );
  }

  Future<void> _mutate({
    required Future<void> Function() request,
    required ThreadDetailMembershipViewState nextState,
  }) async {
    final current = state.value;
    if (current == null || current.isMutating) {
      return;
    }

    state = AsyncData(current.copyWith(isMutating: true, clearError: true));
    try {
      await request();
      state = AsyncData(nextState);
    } catch (error) {
      state = AsyncData(
        current.copyWith(isMutating: false, errorMessage: error.toString()),
      );
    }
  }
}

final threadDetailMembershipViewModelProvider =
    AsyncNotifierProvider.family<
      ThreadDetailMembershipViewModel,
      ThreadDetailMembershipViewState,
      ThreadDetailMembershipIdentity
    >(ThreadDetailMembershipViewModel.new);
