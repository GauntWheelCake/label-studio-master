# 项目配置密文传输与创建者邮箱脱敏维护方案

## 文档状态

- 状态：待实施
- 日期：2026-07-13
- 目标：以最小改动完成一处应用层密文传输展示，并减少项目响应中的完整邮箱暴露
- 原则：局部生效、兼容现有流程、可快速回退、不修改数据库数据

## 1. 背景

项目配置页面当前会把 `label_config` 作为明文 JSON 发送。浏览器 F12 的 Network 面板可以直接看到 Label Studio XML。同时，项目接口会在 `created_by.email` 中返回创建者完整邮箱。

本方案包含两个独立改动：

1. 加密 `POST /api/projects/:pk/validate` 的请求体。
2. 对项目响应中的 `created_by.email` 进行脱敏。

应用层加密不能替代 HTTPS。没有 HTTPS 时，页面脚本和密钥分发仍可能被篡改。本方案主要用于避免业务字段在 Network 面板中直接显示明文，并满足网安测试的密文请求截图要求。

## 2. 实施边界

### 包含

- `/api/projects/:pk/validate` 请求体加密。
- 后端解密后继续执行原有配置校验。
- `ProjectSerializer` 范围内的创建者邮箱脱敏。
- 对加解密、错误处理和脱敏规则增加测试。

### 不包含

- 不修改数据库中的邮箱或项目配置。
- 不修改 SSO、用户匹配、权限和用户资料逻辑。
- 不修改项目创建、项目保存、导入和标注提交接口。
- 第一阶段不加密 `/validate` 响应体。
- `/sample-task` 请求复用 `/validate` 的 AES-GCM 密文信封。

## 3. 相关代码位置

- 接口定义：`label_studio/frontend/src/config/ApiConfig.js`
- 前端配置校验：`label_studio/frontend/src/pages/CreateProject/Config/Config.js`
- 后端配置校验：`label_studio/projects/api.py`
- 项目序列化器：`label_studio/projects/serializers.py`
- 通用用户序列化器：`label_studio/users/serializers.py`
- 后端测试：`label_studio/tests/`
- 前端测试：`label_studio/frontend/test/`

## 4. 配置校验请求加密

### 4.1 数据格式

当前请求：

```json
{
  "label_config": "<View>...</View>"
}
```

目标请求：

```json
{
  "encrypted": true,
  "iv": "Base64 编码的随机向量",
  "ciphertext": "Base64 编码的密文"
}
```

解密后的内容仍为：

```json
{
  "label_config": "<View>...</View>"
}
```

### 4.2 推荐实现

1. 前端增加独立加密工具：安全上下文优先使用浏览器原生 Web Crypto API，HTTP 局域网页面使用纯 JavaScript AES-GCM 回退。
2. 使用 AES-GCM，每次请求生成新的随机 IV，禁止使用固定 IV。
3. 仅在 `validateConfig` 调用前加密完整的 `{ label_config }` JSON。
4. 后端在 `ProjectLabelConfigValidateAPI.post()` 入口识别 `encrypted: true`。
5. 后端验证字段、Base64 格式和请求大小，然后解密并解析 JSON。
6. 取得 `label_config` 后继续调用现有的差异判断与配置校验逻辑，不重写业务规则。
7. 解密失败统一返回 HTTP 400，不在日志或响应中记录密钥、密文或解密后的配置。

### 4.3 密钥管理

最小演示方案可以采用前后端共享 AES 密钥，但浏览器必须获得该密钥，因此密钥最终可被有经验的用户找到。该方式适合减少 Network 明文展示，不等同于 HTTPS。

更严格的方案是前端持有公钥、后端保存私钥，但会增加密钥轮换、数据长度和实现复杂度，不纳入本次最小改动。

### 4.4 兼容策略

第一阶段建议后端同时支持两种格式：

- `encrypted: true`：执行解密。
- 未提供 `encrypted`：按原有明文格式处理。
- 声明 `encrypted: true` 但解密失败：直接返回 HTTP 400，不回退为明文解析。

前端稳定部署并完成验收后，再决定是否关闭明文兼容。兼容模式应有明确结束条件，避免长期允许明文请求。

### 4.5 错误处理

- 缺少 `iv` 或 `ciphertext`：HTTP 400。
- Base64、JSON 或字段格式非法：HTTP 400。
- AES-GCM 认证失败或密文被篡改：HTTP 400。
- 解密后缺少 `label_config`：复用现有配置为空错误。
- 标签配置本身非法：保持原有业务错误和前端展示方式。

## 5. 创建者邮箱脱敏

### 5.1 脱敏格式

```text
shared-admin@huibiaosystem.local
s***@huibiaosystem.local
```

规则：

- 空邮箱保持为空。
- 正常邮箱保留本地部分首字符和完整域名。
- 本地部分只有一个字符时，显示为该字符加 `***`。
- 不含 `@` 的异常值只保留首字符，其余显示为 `***`。

### 5.2 实现范围

在 `label_studio/projects/serializers.py` 中增加项目专用的创建者序列化器，只覆盖 `email` 输出，然后让 `ProjectSerializer.created_by` 使用该序列化器。

不得直接修改全局 `UserSimpleSerializer`。该序列化器可能被用户列表、成员信息及其他接口复用，直接修改会扩大影响范围。

脱敏只发生在序列化输出阶段：

- 数据库继续保存完整邮箱。
- SSO 和登录继续使用完整邮箱。
- 用户资料和非项目接口保持原有行为。
- 使用 `ProjectSerializer` 的项目列表、详情和创建响应将返回脱敏邮箱。

## 6. 测试计划

### 后端

1. 合法密文能够完成配置校验。
2. 密文被篡改、IV 错误、字段缺失或 Base64 非法时返回 HTTP 400。
3. 错误响应不包含密钥、密文和解密后的配置。
4. 明文兼容开启时，原有请求仍能工作。
5. 解密后的非法标签配置仍返回原有业务校验错误。
6. 项目列表、详情和创建响应中的邮箱符合脱敏规则。
7. 数据库邮箱和非项目用户接口保持原值。

### 前端

1. `validateConfig` 请求体不再包含可直接搜索到的 XML。
2. 加密失败时不发送明文回退请求，并给出可处理的错误状态。
3. 校验成功、校验失败和快速连续编辑的原有交互保持正常。

### 浏览器验收

1. 打开 F12 Network，修改项目标签配置以触发 `/validate`。
2. 确认 Payload 仅显示 `encrypted`、`iv` 和 `ciphertext`。
3. 确认 Payload 中搜索不到 Label Studio XML 明文。
4. 确认接口正常返回，页面校验结果不变。
5. 检查项目列表或详情响应，确认 `created_by.email` 已脱敏。

## 7. 已知边界

配置页面在校验后还会调用：

```text
POST /api/projects/:pk/sample-task
```

该请求会复用 `/validate` 的 AES-GCM 密文信封和后端解密工具，完整配置预览流程不会再通过这两个 POST 请求发送标签 XML 明文。

## 8. 性能与流程影响

- `label_config` 通常是 KB 级文本，AES-GCM 加解密预计为毫秒级，用户基本无感。
- 配置校验继续使用原有业务逻辑，页面流程和校验结果不应改变。
- 邮箱脱敏仅发生在响应序列化阶段，不增加数据库查询。
- SSO、认证令牌、项目权限、用户模型和数据库结构均不改变。
- 依赖项目接口中完整 `created_by.email` 的外部消费者可能受影响，上线前需要确认。

## 9. 回退方案

配置加密回退：

1. 前端恢复发送 `{ label_config }`。
2. 因第一阶段保留后端明文兼容，前端可立即恢复工作。
3. 确认稳定后，再移除后端解密入口和加密工具。

邮箱脱敏回退：

1. 将 `ProjectSerializer.created_by` 恢复为 `UserSimpleSerializer`。
2. 删除项目专用创建者序列化器。
3. 不需要恢复数据库数据，因为原始邮箱从未被修改。

## 10. 实施前确认项

- 确定加密密钥的配置名称与注入方式。
- 确定明文兼容的保留时间。
- 网安测试同时检查 `/validate` 和 `/sample-task`，两个请求均不得出现标签 XML 明文。
- 确认是否存在依赖完整 `created_by.email` 的项目接口消费者。
- 确认最终脱敏格式采用 `s***@domain`。

## 11. 已实施配置

未设置 `PROJECT_CONFIG_ENCRYPTION_KEY` 时，系统使用内置演示密钥，保证本地模板预览和密文请求可用。生产环境应将该变量设置为自己的 Base64 编码 32 字节 AES 密钥。可用以下命令生成：

```bash
python -c "import base64, os; print(base64.b64encode(os.urandom(32)).decode())"
```

Docker Compose 的 `app` 服务会将该变量传给 Django。重启后编辑项目标注配置，在浏览器 Network 中检查
`POST /api/projects/:pk/validate`：请求体只包含 `encrypted`、`iv` 和 `ciphertext`，不会包含标签 XML 明文。项目响应中的
`created_by.email` 会显示为 `s***@domain`。

后端暂时保留明文校验兼容能力，便于回退；配置成功的前端不会发送明文重试请求。
