# Runtime Core 基线验证记录

**日期**：2026-09-22
**分支**：`codex/runtime-core-baseline`
**范围**：数据库 Schema 对齐、Runtime Core、Emotion Engine、Character Compiler、API 基线

## 1. 验证对象

- `src/runtime/types.ts`
- `src/runtime/emotion-engine.ts`
- `src/runtime/character-compiler.ts`
- `src/runtime/store.ts`
- `src/runtime/context-builder.ts`
- `src/runtime/runtime-core.ts`
- `src/runtime/runtime-api.ts`
- `src/runtime/project-runtime.ts`
- `tests/runtime/runtime-core.test.ts`
- `docs/design/virtual-character-os-实现基线.md`

## 2. 自动化验证

### TypeScript 类型检查

命令：

```text
npm run typecheck
```

结果：通过。

### Runtime Core 专项测试

命令：

```text
npm test -- --run tests/runtime/runtime-core.test.ts
```

结果：通过，1 个测试文件，8 个测试用例全部通过。

### 全量测试

命令：

```text
npm test
```

结果：通过，121 个测试文件，3355 个测试用例全部通过。

### 生产构建

命令：

```text
npm run build
```

结果：通过，Vite 与 PWA 产物生成成功。构建过程中仅保留既有的大体积 chunk 提示，无构建错误。

### 静态检查

命令：

```text
npm run lint
```

结果：通过，无错误、无警告。

覆盖内容：

- 角色编译
- 角色输入校验
- 情绪半衰期衰减
- Event 到 Emotion / Attitude / Relationship 的状态变化
- Episode 生命周期
- Salience 独立性
- API 健康检查、角色创建、事件接收、上下文构建
- 现有 StorageAdapter 快照持久化接线

## 3. 已确认的工程边界

- Runtime Core 没有依赖 Vue 组件或具体 LLM 供应商。
- Web/Tauri 可通过现有 `StorageAdapter` 保存快照。
- 同角色事件在单进程内串行处理。
- 存储提交包含 expectedVersion，版本冲突可以映射为 409。
- PostgreSQL 事务适配器仍是后续服务端工作，当前文档没有虚报为已完成。

## 4. 继续接入前的门禁

以下命令必须在最终合并前再次执行并留存输出：

```text
npm run typecheck
npm test
npm run build
```

如果将 Runtime Core 接入现有聊天发送链路，还必须新增端到端测试，证明原有聊天、流式响应、错误处理和备份恢复没有回归。

### Git 差异检查

命令：

```text
git diff --check
```

结果：通过，无空白字符错误。
