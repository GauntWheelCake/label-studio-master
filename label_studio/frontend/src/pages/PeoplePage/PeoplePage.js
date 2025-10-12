import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LsPlus } from "../../assets/icons";
import { Button } from "../../components";
import { Description } from "../../components/Description/Description";
import { Input } from "../../components/Form";
import { modal } from "../../components/Modal/Modal";
import { Space } from "../../components/Space/Space";
import { t } from "../../i18n";
import { useAPI } from "../../providers/ApiProvider";
import { useConfig } from "../../providers/ConfigProvider";
import { Block, Elem } from "../../utils/bem";
import { copyText } from "../../utils/helpers";
import { getStoredRole, subscribeToRoleChange, UserRole } from "../../utils/roles";
import "./PeopleInvitation.styl";
import { PeopleList } from "./PeopleList";
import "./PeoplePage.styl";
import { SelectedUser } from "./SelectedUser";

const InvitationModal = ({link}) => {
  return (
    <Block name="invite">
      <Input
        value={link}
        style={{width: '100%'}}
        readOnly
      />

      <Description style={{width: '70%', marginTop: 16}}>
        {t('peoplePage.invite.description.prefix')}
        {t('peoplePage.invite.description.link')}
        {t('peoplePage.invite.description.suffix')}
      </Description>
    </Block>
  );
};

export const PeoplePage = () => {
  const api = useAPI();
  const inviteModal = useRef();
  const config = useConfig();
  const [selectedMembership, setSelectedMembership] = useState(null);
  const [memberships, setMemberships] = useState([]);
  const [currentUser, setCurrentUser] = useState();
  const [reloadToken, setReloadToken] = useState(0);
  const [currentRole, setCurrentRole] = useState(() => getStoredRole());

  const [link, setLink] = useState();

  const selectUser = useCallback((membership) => {
    setSelectedMembership(membership ?? null);

    if (membership?.user?.id) {
      localStorage.setItem('selectedUser', String(membership.user.id));
    } else {
      localStorage.removeItem('selectedUser');
    }
  }, []);

  const setInviteLink = useCallback((link) => {
    const hostname = config.hostname || location.origin;
    setLink(`${hostname}${link}`);
  }, [config, setLink]);

  const updateLink = useCallback(() => {
    api.callApi('resetInviteLink').then(({invite_url}) => {
      setInviteLink(invite_url);
    });
  }, [api, setInviteLink]);

  const inviteModalProps = useCallback((link) => ({
    title: t('peoplePage.invite.title'),
    style: { width: 640, height: 472 },
    body: () => (
      <InvitationModal link={link}/>
    ),
    footer: () => {
      const [copied, setCopied] = useState(false);

      const copyLink = useCallback(() => {
        setCopied(true);
        copyText(link);
        setTimeout(() => setCopied(false), 1500);
      }, []);

      return (
        <Space spread>
          <Space>
            <Button style={{width: 170}} onClick={() => updateLink()}>
              {t('peoplePage.invite.resetLink')}
            </Button>
          </Space>
          <Space>
            <Button primary style={{width: 170}} onClick={copyLink}>
              {copied ? t('peoplePage.invite.copied') : t('peoplePage.invite.copyLink')}
            </Button>
          </Space>
        </Space>
      );
    },
    bareFooter: true,
  }), [updateLink]);

  const showInvitationModal = useCallback(() => {
    inviteModal.current = modal(inviteModalProps(link));
  }, [inviteModalProps, link]);

  const defaultSelected = useMemo(() => {
    return localStorage.getItem('selectedUser');
  }, []);

  useEffect(() => {
    api.callApi('me').then((user) => {
      if (user) setCurrentUser(user);
    });
  }, [api]);

  useEffect(() => {
    const unsubscribe = subscribeToRoleChange((role) => setCurrentRole(role), { immediate: true });

    return unsubscribe;
  }, []);

  useEffect(() => {
    api.callApi("inviteLink").then(({invite_url}) => {
      setInviteLink(invite_url);
    });
  }, [api, setInviteLink]);

  useEffect(() => {
    inviteModal.current?.update(inviteModalProps(link));
  }, [inviteModalProps, link]);

  useEffect(() => {
    if (!selectedMembership) return;
    if (!memberships.some((membership) => membership.id === selectedMembership.id)) {
      setSelectedMembership(null);
    }
  }, [memberships, selectedMembership]);

  const handleMembershipsChange = useCallback((list = []) => {
    setMemberships(list);
  }, []);

  const currentMembership = useMemo(() => {
    if (!currentUser) return null;
    return memberships.find(({user}) => user.id === currentUser.id) ?? null;
  }, [memberships, currentUser]);

  const canManageMembers = currentRole === UserRole.Manager;
  const canDeleteSelected = canManageMembers && selectedMembership?.user?.id !== currentUser?.id;

  const handleDeleteMember = useCallback(async (membership) => {
    if (!membership?.user?.id) return;

    try {
      await api.callApi('deleteUser', {
        params: { pk: membership.user?.id },
        headers: { 'X-User-Role': currentRole },
      });
    } catch (error) {
      console.warn('[people] Failed to delete membership', error);
      return;
    }

    setSelectedMembership(null);
    localStorage.removeItem('selectedUser');
    setMemberships((prev = []) => prev.filter((item) => item.id !== membership.id));
    setReloadToken((token) => token + 1);
  }, [api, currentRole]);

  return (
    <Block name="people">
      <Elem name="controls">
        <Space spread>
          <Space></Space>

          <Space>
            <Button icon={<LsPlus/>} primary onClick={showInvitationModal}>
              {t('peoplePage.controls.addPeople')}
            </Button>
          </Space>
        </Space>
      </Elem>
      <Elem name="content">
        <PeopleList
          organizationId={currentUser?.active_organization}
          selectedMembership={selectedMembership}
          defaultSelected={defaultSelected}
          onSelect={selectUser}
          onMembershipsChange={handleMembershipsChange}
          reloadTrigger={reloadToken}
        />

        {selectedMembership && (
          <SelectedUser
            membership={selectedMembership}
            onClose={() => selectUser(null)}
            canDelete={canDeleteSelected}
            onDelete={handleDeleteMember}
          />
        )}
      </Elem>
    </Block>
  );
};

PeoplePage.title = t('peoplePage.pageTitle');
PeoplePage.path = "/people";
