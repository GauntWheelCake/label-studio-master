---
title: 组织成员管理概览
short: 组织成员
order: 160
type: guide
---

## 数据模型

- **User**：`users.models.User` 定义了账号的基础信息，并通过 `active_organization` 字段关联当前上下文中的组织。【F:label_studio/users/models.py†L62-L110】
- **Organization**：`organizations.models.Organization` 维护组织与成员的多对多关系，成员通过中间表 `OrganizationMember` 建立。【F:label_studio/organizations/models.py†L16-L90】
- **OrganizationMember**：记录用户与组织的绑定关系，同时提供 `add_user()` 等便捷方法用于向组织中添加用户。【F:label_studio/organizations/models.py†L16-L59】【F:label_studio/organizations/models.py†L92-L120】

## 后端 API

所有组织相关的 REST API 都通过 `organizations.urls` 暴露在 `/api/organizations/` 前缀下，用户管理 API 暴露在 `/api/users/` 下。【F:label_studio/organizations/urls.py†L12-L33】【F:label_studio/users/urls.py†L13-L31】

- **列出组织**：`GET /api/organizations/`，由 `OrganizationListAPI` 提供，返回当前用户可访问的组织列表。【F:label_studio/organizations/api.py†L27-L62】
- **获取或更新组织信息**：`GET/PATCH /api/organizations/<id>`，由 `OrganizationAPI` 处理，可修改组织标题等属性。【F:label_studio/organizations/api.py†L64-L114】
- **获取组织成员**：`GET /api/organizations/<id>/memberships`，返回 `OrganizationMember` 列表，包含嵌套的用户详情。【F:label_studio/organizations/api.py†L42-L61】【F:label_studio/organizations/serializers.py†L33-L56】
- **生成邀请链接**：`GET /api/invite` 返回基于组织 token 的邀请地址，`POST /api/invite/reset-token` 可重置 token。【F:label_studio/organizations/api.py†L116-L165】
- **用户 CRUD**：`UserAPI` 对 `/api/users/` 支持标准的 `GET/POST/PATCH/DELETE`，默认只返回当前激活组织下的用户，并复用 `UserSerializer`。【F:label_studio/users/api.py†L29-L83】【F:label_studio/users/api.py†L87-L121】

## 前端调用流程

组织成员管理页面位于 `PeoplePage`，通过 `ApiConfig` 中的 `/organizations/:pk/memberships`、`/invite` 等端点完成数据加载与操作。【F:label_studio/frontend/src/pages/PeoplePage/PeoplePage.js†L1-L120】【F:label_studio/frontend/src/config/ApiConfig.js†L1-L33】

典型流程：

1. 页面初始化时根据当前项目上下文获取组织 ID，并请求成员列表。
2. 新增用户或邀请成员时，通过用户 API 创建账号，或获取邀请链接分享给成员。
3. 删除成员时调用 `Organization` 的删除操作并刷新列表；后端 `OrganizationMember` 负责维护多对多关系。

## 开发注意事项

- 所有成员操作都依赖当前登录用户的 `active_organization`，请在后端请求中确保该字段已设置。【F:label_studio/users/models.py†L95-L104】
- `OrganizationMember.add_user()` 使用事务保证成员添加的原子性，可在自定义业务逻辑中复用。【F:label_studio/organizations/models.py†L101-L118】
- `UserAPI` 仅返回当前组织内的用户，如需跨组织查询需显式切换 `active_organization` 或扩展 API。【F:label_studio/users/api.py†L37-L45】
- 前端可通过 `API_CONFIG` 统一调整端点路径，避免硬编码 URL。【F:label_studio/frontend/src/config/ApiConfig.js†L1-L33】
