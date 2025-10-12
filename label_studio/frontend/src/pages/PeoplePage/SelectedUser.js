import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useCallback } from "react";
import { NavLink } from "react-router-dom";
import { LsCross } from "../../assets/icons";
import { Button, Userpic } from "../../components";
import { Description } from "../../components/Description/Description";
import { modal } from "../../components/Modal/Modal";
import { t } from "../../i18n";
import { Block, Elem } from "../../utils/bem";
import "./SelectedUser.styl";

const UserProjectsLinks = ({projects}) => {
  return (
    <Elem name="links-list">
      {projects.map((project) => (
        <Elem tag={NavLink} name="project-link" key={`project-${project.id}`} to={`/projects/${project.id}`} data-external>
          {project.title}
        </Elem>
      ))}
    </Elem>
  );
};

export const SelectedUser = ({ membership, onClose, canDelete, onDelete }) => {
  if (!membership) return null;

  const { user, role } = membership;
  const fullName = [user.first_name, user.last_name].filter(n => !!n).join(" ").trim();
  const lastActivity = user.last_activity
    ? format(new Date(user.last_activity), 'yyyy年MM月dd日 HH:mm', { locale: zhCN })
    : t('peoplePage.selected.lastActivityEmpty');
  const roleKey = role ? `peoplePage.roles.${role}` : 'peoplePage.roles.unknown';
  const translatedRole = t(roleKey);
  const roleLabel = translatedRole === roleKey && roleKey !== 'peoplePage.roles.unknown'
    ? t('peoplePage.roles.unknown')
    : translatedRole;

  const confirmDelete = useCallback(() => {
    if (!canDelete) return;

    modal.confirm({
      title: t('peoplePage.selected.deleteUserConfirmTitle'),
      okText: t('peoplePage.selected.deleteUserConfirmOk'),
      cancelText: t('peoplePage.selected.deleteUserConfirmCancel'),
      buttonLook: 'destructive',
      body: () => (
        <Description>
          {t('peoplePage.selected.deleteUserConfirmMessage')}
          <br/>
          <strong>{user.email}</strong>
        </Description>
      ),
      onOk: () => onDelete?.(membership),
    });
  }, [canDelete, membership, onDelete, user.email]);

  return (
    <Block name="user-info">
      <Elem name="close" tag={Button} type="link" onClick={onClose}><LsCross/></Elem>

      <Elem name="header">
        <Userpic
          user={user}
          style={{width: 64, height: 64, fontSize: 28}}
        />

        {fullName && (
          <Elem name="full-name">{fullName}</Elem>
        )}

        <Elem tag="p" name="email">{user.email}</Elem>
      </Elem>

      <Elem name="section">
        <Elem name="section-title">{t('peoplePage.selected.role')}</Elem>
        <Elem name="role-value">{roleLabel}</Elem>
      </Elem>

      {user.phone && (
        <Elem name="section">
          <a href={`tel:${user.phone}`}>{user.phone}</a>
        </Elem>
      )}

      {!!user.created_projects.length && (
        <Elem name="section">
          <Elem name="section-title">{t('peoplePage.selected.createdProjects')}</Elem>

          <UserProjectsLinks projects={user.created_projects}/>
        </Elem>
      )}

      {!!user.contributed_to_projects.length && (
        <Elem name="section">
          <Elem name="section-title">{t('peoplePage.selected.contributedProjects')}</Elem>

          <UserProjectsLinks projects={user.contributed_to_projects}/>
        </Elem>
      )}

      <Elem tag="p" name="last-active">
        {t('peoplePage.selected.lastActivity')}
        {lastActivity}


      </Elem>

      {canDelete && (
        <Elem name="actions">
          <Button look="destructive" onClick={confirmDelete}>
            {t('peoplePage.selected.deleteUser')}
          </Button>
        </Elem>
      )}
    </Block>
  );
};
