import { clearPendingInviteCode } from '@/utils/pendingInvite';
import { InviteMessageModal } from './InviteMessageModal';

interface PendingInviteModalProps {
  inviteCode: string | null;
  onCleared: () => void;
}

export function PendingInviteModal({ inviteCode, onCleared }: PendingInviteModalProps) {
  const clearInvite = () => {
    onCleared();
    void clearPendingInviteCode();
  };

  return <InviteMessageModal inviteCode={inviteCode} onDismiss={clearInvite} showAlreadyMemberOpenChatAction={false} />;
}
