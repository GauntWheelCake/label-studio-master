import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useCallback, useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { LsCross } from "../../assets/icons";
import { Button, Userpic } from "../../components";
import { useAPI } from "../../providers/ApiProvider";
import { useConfig } from "../../providers/ConfigProvider";
import { getStoredRole, subscribeToRoleChange, UserRole } from "../../utils/roles";
import { t } from "../../i18n";
import { Block, Elem } from "../../utils/bem";
import "./SelectedUser.styl";

const UserProjectsLinks = ({ projects }) => {
  return (
    <Elem name="links-list">
      {projects.map((project) => (
        <Elem
          tag={NavLink}
          name="project-link"
          key={`project-${project.id}`}
          to={`/projects/${project.id}`}
          data-external
        >
          {project.title}
        </Elem>
      ))}
    </Elem>
  );
};

export const SelectedUser = ({ user, onClose, onDeleted }) => {
  const api = useAPI();
  const config = useConfig();
  const [role, setRole] = useState(() => getStoredRole());

  useEffect(() => {
    const unsubscribe = subscribeToRoleChange(setRole, { immediate: true });
    return unsubscribe;
  }, [setRole]);

  // --- 当前登录用户信息 ---
  const currentUserId = config?.user?.id;
  const isSharedAdminMode = !!config?.sharedAdminMode;
  const isSelf = String(currentUserId) === String(user.id);
  const isAdmin = role === UserRole.Admin;

  // --- 项目信息 ---
  const hasCreatedProjects = user.created_projects?.length > 0;

  // --- 删除按钮状态 ---
  const deleteDisabled = hasCreatedProjects; // ✅ 自己账号不再禁用，只因创建项目禁用
  const deleteDisabledMessage = hasCreatedProjects
    ? t("peoplePage.selected.deleteCreatorError")
    : null;

  // --- 删除逻辑共用 ---
  const handleDelete = useCallback(async () => {
    if (hasCreatedProjects) {
      window.alert(t("peoplePage.selected.deleteCreatorError"));
      return;
    }

    if (!window.confirm(t("peoplePage.selected.deleteConfirm"))) return;

    const response = await api.callApi("deleteUser", { params: { pk: user.id } });

    if (response === null) return;

    onDeleted?.(user);
    onClose?.();
  }, [api, user, onDeleted, onClose, hasCreatedProjects]);

  // --- 显示信息 ---
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  const lastActivity = user.last_activity
    ? format(new Date(user.last_activity), "yyyy年MM月dd日 HH:mm", { locale: zhCN })
    : t("peoplePage.selected.lastActivityEmpty");

  return (
    <Block name="user-info">
      <Elem name="close" tag={Button} type="link" onClick={onClose}>
        <LsCross />
      </Elem>

      <Elem name="header">
        <Userpic user={user} style={{ width: 64, height: 64, fontSize: 28 }} />

        {fullName && <Elem name="full-name">{fullName}</Elem>}

        <Elem tag="p" name="email">
          {user.email}
        </Elem>
      </Elem>

      {user.phone && (
        <Elem name="section">
          <a href={`tel:${user.phone}`}>{user.phone}</a>
        </Elem>
      )}

      {!!user.created_projects.length && (
        <Elem name="section">
          <Elem name="section-title">{t("peoplePage.selected.createdProjects")}</Elem>
          <UserProjectsLinks projects={user.created_projects} />
        </Elem>
      )}

      {!!user.contributed_to_projects.length && (
        <Elem name="section">
          <Elem name="section-title">{t("peoplePage.selected.contributedProjects")}</Elem>
          <UserProjectsLinks projects={user.contributed_to_projects} />
        </Elem>
      )}

      <Elem tag="p" name="last-active">
        {t("peoplePage.selected.lastActivity")}
        {lastActivity}
      </Elem>

      {isAdmin && !isSharedAdminMode && (
        <Elem name="actions">
          <Button
            look="destructive"
            type="button"
            disabled={deleteDisabled}
            onClick={handleDelete}
          >
            {isSelf
              ? t("peoplePage.selected.deactivateUser") // “注销账户”
              : t("peoplePage.selected.deleteUser")}
          </Button>

          {/* ✅ 本人提示信息 */}
          {isSelf && (
            <Elem tag="p" name="actions-hint">
              {t("peoplePage.selected.selfHint") ||
                "这是您的账户，点击上方按钮可注销自己。"}
            </Elem>
          )}

          {/* ✅ 创建者提示信息 */}
          {deleteDisabledMessage && (
            <Elem tag="p" name="actions-hint">
              {deleteDisabledMessage}
            </Elem>
          )}
        </Elem>
      )}
    </Block>
  );
};
