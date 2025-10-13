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
  const [selectedUser, setSelectedUser] = useState(null);

  const [link, setLink] = useState();
  const [refreshKey, setRefreshKey] = useState(0);

  const selectUser = useCallback((user) => {
    setSelectedUser(user);

    if (user?.id != null) {
      localStorage.setItem('selectedUser', user.id);
    } else {
      localStorage.removeItem('selectedUser');
    }
  }, [setSelectedUser]);

  const handleUserDeleted = useCallback(() => {
    setRefreshKey((key) => key + 1);
    selectUser(null);
  }, [selectUser, setRefreshKey]);

  const setInviteLink = useCallback((link) => {
    const hostname = config.hostname || location.origin;
    setLink(`${hostname}${link}`);
  }, [config, setLink]);

  const updateLink = useCallback(() => {
    api.callApi('resetInviteLink').then(({invite_url}) => {
      setInviteLink(invite_url);
    });
  }, [setInviteLink]);

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
    api.callApi("inviteLink").then(({invite_url}) => {
      setInviteLink(invite_url);
    });
  }, []);

  useEffect(() => {
    inviteModal.current?.update(inviteModalProps(link));
  }, [inviteModalProps, link]);

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
          selectedUser={selectedUser}
          defaultSelected={defaultSelected}
          onSelect={selectUser}
          refreshKey={refreshKey}
        />

        {selectedUser && (
          <SelectedUser
            user={selectedUser}
            onClose={() => selectUser(null)}
            onDeleted={handleUserDeleted}
          />
        )}
      </Elem>
    </Block>
  );
};

PeoplePage.title = t('peoplePage.pageTitle');
PeoplePage.path = "/people";
