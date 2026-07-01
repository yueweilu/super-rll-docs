# testharness 升级 — 对 skill 与 preset 的全部修改捋一遍 (X1–X6 + gap#1/#2)

> 2026-06-20。基于 worktree `git diff` vs HEAD 实测核对，非记忆。结论：**skill/preset 只在两处被改；零 preset JSON 模板被编辑、零 skill 实现文件被编辑**。升级是「包住/暴露」既有 skill+preset 基建，而非重写。

---

## 一、PRESET 相关

### 1. preset JSON 模板：**全部未改**
`cli/templates/presets/*.json`（cli-cmd / web-ui / mobile / desktop / platform-server-cmd / plugin / cli-schema）`git diff HEAD` 全空。cli-cmd.json 的 per-tier oracle 模板**本来就有**，不是这次加的。

### 2. `cli/src/preset/` 代码：**未改**
loader / schema / runner 全未动。preset 无 `enabled` 字段（启用是项目侧概念）。

### 3. ✅ X3 改动①（代码）— `cmdPresetShow` 人读输出加 per-tier oracle 范本
`cli/src/commands.ts:12212-12226`。之前 `ralph-lisa preset show --preset cli-cmd` 只印 stack/changeType/tier 名；现在多印每个 tier 的 `cmd` + `oracle` 模板（"plan-authoring canon — paste into PLAN C-row Oracle"）。`--json` 路径不变。
- 目的：计划期作者能直接抄 oracle 范本，不再从零写弱 oracle。

### 4. ✅ X3 改动②（本地配置）— 启用 cli-cmd preset（warn-only）
`.ralph-lisa.json` 加：
```json
"preset": { "enabled": true, "requireAll": false }
```
- 激活提交期 preset gate，**warn-only**（requireAll=false → 只告警不阻断，守"不硬阻断"）。
- ⚠ **注意**：`.ralph-lisa.json` 是 **gitignored / 未跟踪**（`git ls-files` 不含它）→ 这个启用只在本机本地生效，不会随仓库分发。要持久/共享需单独跟踪或文档化。

---

## 二、SKILL 相关

### 1. skill 实现文件：**未改**
`cli/src/wezterm-test-skill.ts` / `cli/src/playwright-test-skill.ts` `git diff HEAD` 全空。skill dispatch（cli.ts）未改。

### 2. ✅ X4 改动（代码）— skill 命令在 cascade 里"怎么跑"加 readiness 预检
- NEW `cli/src/harness-readiness.ts`：`assessHarnessReadiness(command, probe?)` 把 `... skill wezterm-test ...`→binary `wezterm`、`... skill playwright-test ...`→`playwright`，probe 默认 `whichBin`，缺失给含 `ralph-lisa doctor`+装法的 hint。
- `runHarnessTest` 预检 `cli/src/commands.ts:8089-8107`：每条命令 execSync 前先 `assessHarnessReadiness`；若是 harness-skill 命令且 binary 缺 → 短路成结构化 `harness-unavailable` 结果（exitCode 127 + 可读 hint），**不再 opaque crash**；诚实语义：unavailable **不**记 pass（不重开 X1 堵的洞）。
- 目的：飞书/wezterm/playwright 这类 skill 进 §70 cascade 真跑时，binary 没装不再埋头 exit-127 黑盒，而是给可操作原因。

---

## 三、其余 slice 对 skill/preset 的影响：**无**
X1（close-cascade 检测+policy）、X2（quality_flags 进 EvidenceRecord）、X5（oracle_verdicts）、X6（evidence-show/ack）、gap#1（verdict 源合并）、gap#2（channels + contest loop）——**均未**编辑 preset JSON、preset 代码、或 skill 文件。

---

## 四、一句话总账
| 维度 | 改了什么 | 没改什么 |
|---|---|---|
| **preset** | cmdPresetShow 印 oracle 范本（X3）；.ralph-lisa.json 启用 warn-only（X3，**本地未跟踪**） | 任何 preset JSON 模板；preset/ 代码 |
| **skill** | runHarnessTest 加 binary readiness 预检 + NEW harness-readiness.ts（X4） | 任何 skill 实现文件；skill dispatch |

**两个值得你拍板的点**：
1. `.ralph-lisa.json` preset 启用是**本地未跟踪**——要不要做成跟踪/可分发？
2. X4 预检改了 harness-skill 命令在 cascade 的运行时行为（缺 binary → exit-127 结构化、非 pass）——若你依赖这些 skill，确认这个语义符合预期。
