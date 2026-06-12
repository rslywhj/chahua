import { useCallback, useEffect, useRef, useState } from 'react';
import { IonSearchbar, IonSpinner, useIonToast } from '@ionic/react';
import { t } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';
import type { MemberSummary } from '@/api/users';
import { usersApi } from '@/api/users';
import { ChatMemberRow } from '@/components/chat-members/ChatMemberRow';
import { useHasGlobalPermission } from '@/hooks/useHasGlobalPermission';
import styles from '@/pages/conversation/chat-members.module.scss';

const SEARCH_DEBOUNCE_MS = 250;
const SEARCH_LIMIT = 20;

interface MemberSelectorProps {
  excludeMemberOf: string;
  onSelect: (member: MemberSummary) => void;
}

export function MemberSelector({ excludeMemberOf, onSelect }: MemberSelectorProps) {
  const [presentToast] = useIonToast();
  const canViewAllMembers = useHasGlobalPermission('member.viewAll');
  const [searchText, setSearchText] = useState('');
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [excluded, setExcluded] = useState<MemberSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const requestIdRef = useRef(0);

  const showToast = useCallback(
    (message: string, duration = 3000) => {
      presentToast({ message, duration });
    },
    [presentToast],
  );

  const runSearch = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      requestIdRef.current += 1;
      const requestId = requestIdRef.current;

      if (!trimmed) {
        setMembers([]);
        setExcluded([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      usersApi
        .searchMembers({
          q: trimmed,
          limit: SEARCH_LIMIT,
          excludeMemberOf,
        })
        .then((response) => {
          if (requestIdRef.current !== requestId) {
            return;
          }

          setMembers(response.members);
          setExcluded(response.excluded);
        })
        .catch((error: Error) => {
          if (requestIdRef.current !== requestId) {
            return;
          }

          setMembers([]);
          setExcluded([]);
          showToast(error.message || t`Failed to load users`);
        })
        .finally(() => {
          if (requestIdRef.current === requestId) {
            setLoading(false);
          }
        });
    },
    [excludeMemberOf, showToast],
  );

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void runSearch(searchText);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(timeoutId);
  }, [runSearch, searchText]);

  const searchPlaceholder = canViewAllMembers ? t`Search by username or UID` : t`Enter a user UID`;
  const hasQuery = searchText.trim().length > 0;
  const hasResults = members.length > 0 || excluded.length > 0;

  return (
    <div className={styles.layout}>
      <IonSearchbar
        className={styles.searchbar}
        value={searchText}
        onIonInput={(event) => setSearchText(event.detail.value ?? '')}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            void runSearch(searchText);
          }
        }}
        enterkeyhint="search"
        placeholder={searchPlaceholder}
        showClearButton="focus"
      />

      <div className={styles.listContainer}>
        {loading ? (
          <div className={styles.loadingState}>
            <IonSpinner />
          </div>
        ) : null}

        {!loading && !hasQuery ? (
          <div className={styles.emptyState}>
            {canViewAllMembers ? (
              <Trans>Search for a user by username prefix or exact UID.</Trans>
            ) : (
              <Trans>Enter an exact UID to find a specific user.</Trans>
            )}
          </div>
        ) : null}

        {!loading && hasQuery && !hasResults ? (
          <div className={styles.emptyState}>
            <Trans>No matching users found.</Trans>
          </div>
        ) : null}

        {!loading && members.length > 0
          ? members.map((member) => {
              return (
                <ChatMemberRow
                  key={`member-${member.uid}`}
                  member={member}
                  isAdmin={true}
                  subtitle={t`UID ${member.uid}`}
                  onSelect={() => onSelect(member)}
                />
              );
            })
          : null}

        {!loading && excluded.length > 0 ? (
          <>
            <div className={styles.emptyState}>
              <Trans>Already in this chat</Trans>
            </div>
            {excluded.map((member) => {
              return (
                <ChatMemberRow
                  key={`excluded-${member.uid}`}
                  member={member}
                  subtitle={t`UID ${member.uid}`}
                  endLabel={t`Member`}
                  disabled={true}
                />
              );
            })}
          </>
        ) : null}
      </div>
    </div>
  );
}
