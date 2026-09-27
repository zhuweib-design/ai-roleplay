# 外部资源清单与安装边界

1.0.0 之前，角色卡、世界书和模板等远程资源必须通过 `MarketIndexItem` 清单进入安装流程。

每个条目至少包含：

- `id`、`version`、`url`：标识资源和下载位置。
- `sha256`：校验下载内容没有被替换或损坏。
- `license`：标记资源许可证；缺失时清单解析和安装都会拒绝。
- `source`：记录来源说明；缺省时可回落到下载地址。
- `dependencies`：声明外部依赖，不会自动下载或执行。
- `permissions`：声明资源可能需要的宿主能力，不会自动授予权限。

`downloadMarketItem()` 会在请求网络前再次检查这些字段。通过清单校验不等于资源可信执行：扩展代码仍需经过 `ExtensionLoader` 的 capability 和权限门禁，市场下载的资源也不会自动执行扩展代码。

项目内示例资源的许可证和来源记录在 `market/index.json`。发布证据清单由 `npm run release:evidence` 生成，资源安全文档和 Runtime 事件契约一起作为 1.0.0 的边界说明。
