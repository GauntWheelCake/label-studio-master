import { formatDistance } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useCallback, useEffect, useState } from "react";
import { Spinner, Userpic } from "../../components";
import { t } from "../../i18n";
import { useAPI } from "../../providers/ApiProvider";
import { Block, Elem } from "../../utils/bem";
import { isDefined } from "../../utils/helpers";
import './PeopleList.styl';

export const PeopleList = ({
  organizationId,
  onSelect,
  selectedMembership,
  defaultSelected,
  onMembershipsChange,
  reloadTrigger = 0,
}) => {
  const api = useAPI();
  const [memberships, setMemberships] = useState();

  const fetchUsers = useCallback(async () => {
    if (!organizationId) {
      setMemberships(undefined);
      onMembershipsChange?.([]);
      return;
    }

    const result = await api.callApi('memberships', {
      params: {pk: organizationId},
    });

    const list = Array.isArray(result) ? result : [];
    setMemberships(list);
    onMembershipsChange?.(list);
  }, [api, organizationId, onMembershipsChange]);

  const selectMembership = useCallback((membership) => {
    if (!membership) {
      onSelect?.(null);
      return;
    }

    if (selectedMembership?.id === membership.id) {
      onSelect?.(null);
    } else {
      onSelect?.(membership);
    }
  }, [selectedMembership, onSelect]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers, reloadTrigger]);

  useEffect(() => {
    if (isDefined(defaultSelected) && memberships?.length) {
      const selected = memberships.find(({user}) => user.id === Number(defaultSelected));
      if (selected) selectMembership(selected);
    }
  }, [memberships, defaultSelected, selectMembership]);

  return (
    <Block name="people-list">
      {memberships ? (
        <Elem name="users">
          <Elem name="header">
            <Elem name="column" mix="avatar"/>
            <Elem name="column" mix="email">{t('peoplePage.list.email')}</Elem>
            <Elem name="column" mix="name">{t('peoplePage.list.name')}</Elem>
            <Elem name="column" mix="last-activity">{t('peoplePage.list.lastActivity')}</Elem>
          </Elem>
          <Elem name="body">
            {memberships.map((membership) => {
              const { user } = membership;
              const active = membership.id === selectedMembership?.id;
              const lastActivity = user.last_activity
                ? formatDistance(new Date(user.last_activity), new Date(), {addSuffix: true, locale: zhCN})
                : t('peoplePage.list.lastActivityEmpty');

              return (
                <Elem key={`user-${user.id}`} name="user" mod={{active}} onClick={() => selectMembership(membership)}>
                  <Elem name="field" mix="avatar">
                    <Userpic user={user} style={{ width: 28, height: 28 }}/>
                  </Elem>
                  <Elem name="field" mix="email">
                    {user.email}
                  </Elem>
                  <Elem name="field" mix="name">
                    {user.first_name} {user.last_name}
                  </Elem>
                  <Elem name="field" mix="last-activity">
                    {lastActivity}
                  </Elem>
                </Elem>
              );
            })}
          </Elem>
        </Elem>
      ) : (
        <Elem name="loading">
          <Spinner size={36}/>
        </Elem>
      )}
    </Block>
  );
};
