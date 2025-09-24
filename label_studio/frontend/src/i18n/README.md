# 简体中文文案维护说明

`src/i18n/zh-CN.js` 中维护了前端常用界面文案的简体中文词典，并通过 `t(key)` 方法注入到各个组件。
应用启动时会在 `App.js` 中调用 `initializeI18n()`，把词典注入到 `window.APP_SETTINGS.i18n`，这样即便静态资源被第三方覆盖或运行时通过
`window.APP_SETTINGS.i18n` 注入了额外的翻译，也能自动合并后输出。

## 如何新增或更新词条
1. 在 `zh-CN.js` 中新增或修改对应的键值对（请保持键的语义化，例如 `dataManager.links.import`）。
2. 在需要展示文案的组件中引入 `t` 方法，并使用 `t('your.key')` 获取中文文案。
3. 保持键与组件实现同步提交，避免重新下载或构建第三方前端包后又回退成英文；如需在运行时动态追加词条，可调用
   `registerDictionary(locale, entries)` 合并额外翻译，其中 locale 为空或带有 `zh` 前缀时会自动回落到 `zh-CN`。

> ⚠️ 不要直接改动 `dist/` 或第三方打包产物。重新执行 `npm run download:*` 或 `npm run build` 时这些文件会被覆盖，只有保存在词典中的词条才会在构建后持续生效。
