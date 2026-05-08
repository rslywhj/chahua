import { IonContent, IonIcon, IonModal } from '@ionic/react';
import { close } from 'ionicons/icons';
import { t } from '@lingui/core/macro';
import { useHistory } from 'react-router-dom';
import { useIsDesktop } from '@/hooks/platformHooks';
import { InvitePreviewCard } from './InvitePreviewCard';
import styles from './InviteMessageModal.module.scss';

interface InviteMessageModalProps {
  inviteCode: string | null;
  onDismiss: () => void;
  showAlreadyMemberOpenChatAction?: boolean;
}

export function InviteMessageModal({
  inviteCode,
  onDismiss,
  showAlreadyMemberOpenChatAction = true,
}: InviteMessageModalProps) {
  const isDesktop = useIsDesktop();
  const history = useHistory();

  return (
    <IonModal
      isOpen={inviteCode != null}
      onDidDismiss={onDismiss}
      {...(!isDesktop ? { initialBreakpoint: 0.85, breakpoints: [0, 0.85] } : {})}
    >
      <IonContent className="ion-padding">
        <button type="button" className={styles.closeButton} onClick={onDismiss} aria-label={t`Close`}>
          <IonIcon icon={close} />
        </button>

        {inviteCode ? (
          <div className={styles.card}>
            <InvitePreviewCard
              inviteCode={inviteCode}
              showAlreadyMemberOpenChatAction={showAlreadyMemberOpenChatAction}
              onResolved={(chat) => {
                onDismiss();
                history.replace(`/chats/chat/${chat.id}`);
              }}
              onCancel={onDismiss}
            />
          </div>
        ) : null}
      </IonContent>
    </IonModal>
  );
}
