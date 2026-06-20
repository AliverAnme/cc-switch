# Claude Desktop 1M Context Patcher

> 安全的 `tgA` 函数补丁，在 Claude Desktop 3P 网关模式下自动启用 1M 上下文。

## 问题

Claude Desktop v1.13576.4+ 引入了 `tgA()` 函数，它控制是否在模型名后添加 `[1m]` 后缀。
在 3P 网关模式下，`tgA()` 会检查远程 GrowthBook 特性标志 `supports1mContext`，
由于该标志在 3P 模式下为空，`tgA()` 永远不会自动添加 `[1m]` 后缀。

**结果**：模型选择器不显示 1M 上下文选项，默认降级为 200k 上下文。

## 解决方案

移除 `tgA()` 函数中的 `||!kLt().some(t=>A.includes(t))` 检查，
使其始终为已配置的模型添加 `[1m]` 后缀。

**修改前**：
```javascript
function tgA(A){
  return /\[1m\]/i.test(A) || !kLt().some(t => A.includes(t)) ? A : `${A}[1m]`
}
```

**修改后**：
```javascript
function tgA(A){
  return /\[1m\]/i.test(A) ? A : `${A}[1m]`
}
```

### 为什么这个方案更安全

| 旧方案 (hardcodedMainGrowthBookFeatures) | 新方案 (tgA) |
|---|---|
| 修改 GrowthBook 初始化流程 | 仅修改模型名处理逻辑 |
| 返回空特性对象导致启动崩溃 ❌ | 独立函数，启动时不被调用 ✅ |
| 影响所有特性标志的获取 | 仅影响 `[1m]` 后缀注入 |
| 依赖 AST 解析的类方法匹配 | 精确的字符串匹配，无歧义 |

## 使用方法

```bash
# 检查当前状态
node patch.js --status

# 应用补丁
node patch.js --force

# 预览更改内容
node patch.js --dry-run

# 还原
node patch.js --restore

# 列出备份
node patch.js --list

# 指定自定义路径
node patch.js --asar "path\to\app.asar"
```

## 工作原理

1. **检测**：自动定位 `app.asar`（`WindowsApps` 或 `%LOCALAPPDATA%`）
2. **备份**：创建时间戳备份到 `~/.claude-1m-patch/backups/`
3. **解包**：使用 `@electron/asar` 解包
4. **搜索**：精确匹配 `tgA` 函数定义
5. **补丁**：移除 `||!kLt().some(t=>A.includes(t))` 检查
6. **验证**：确认 `||!kLt()` 已移除且 `[1m]` 逻辑保持
7. **重打包**：用 `@electron/asar` 重新打包
8. **安装**：复制回原始位置

## 回滚

```bash
node patch.js --restore
```

从最近的备份恢复原始 `app.asar`。

## 注意事项

- **管理员权限**：写入 `WindowsApps` 可能需要管理员权限
- **Claude Desktop 更新**：更新后补丁会被覆盖，需重新运行
- **幂等**：已补丁状态下运行显示 "Already patched"
