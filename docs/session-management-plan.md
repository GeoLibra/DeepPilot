# DeepPilot 会话管理技术方案

## 目标

为 DeepPilot 增加会话管理能力，让用户可以在本地和生产环境中创建、恢复、切换、搜索、重命名、删除研究会话，并为后续全文检索和语义检索保留清晰的数据边界。

本方案分三阶段推进：

- 第一阶段：复用 LangGraph Thread 作为会话运行态和历史状态存储，前端实现会话列表、当前会话恢复、客户端搜索、切换、新建、重命名、删除。
- 第二阶段：接入真实 Postgres 业务索引表，并明确从 LangGraph Runtime 单向同步到业务索引表的数据管道，支持高性能全文检索、过滤和向量检索。
- 第三阶段：会话分支、分享、导出、权限隔离等高级能力。

## 当前系统现状

前端在 `frontend/src/App.tsx` 中使用 `@langchain/langgraph-sdk/react` 的 `useStream` 直接驱动聊天流。消息存在当前 hook 状态里，页面刷新后没有显式保存当前 thread id，因此用户看不到历史会话入口。

后端在 `backend/src/agent/graph.py` 中定义 LangGraph 图，`OverallState.messages` 已通过 `add_messages` 支持多轮上下文。LangGraph SDK 已提供 Thread 能力，包括 `threadId`、`onThreadId`、`client.threads.search/update/delete/getHistory`。

历史上本地 `langgraph dev` 默认把数据持久化到 `backend/.langgraph_api/*.pckl`，因此不能作为数据库版默认入口。当前默认 `make dev` 使用数据库版开发链路：前端由本地 Vite 运行，后端由 Docker 中的 LangGraph API runtime 运行并连接 Docker Compose 中的 Postgres 和 Redis，同时把本地 `backend/src` 和 `backend/config.yaml` bind mount 到容器里，避免普通后端代码修改后 rebuild 镜像。需要不连接 Postgres 的文件存储 fallback 时，显式使用 `make dev-backend-file`：

- Postgres volume：`langgraph-data`
- Postgres service：`langgraph-postgres`
- Redis service：`langgraph-redis`
- Adminer service：`adminer`

保留文件存储模式作为显式 fallback：`make dev-backend-file`。

## 存储设计

### 第一阶段存储

一个 LangGraph Thread 映射为一个 DeepPilot 会话。

Thread 内部继续保存：

- `messages`
- `search_query`
- `web_research_result`
- `sources_gathered`
- `final_answer`
- checkpoints / run history

Thread metadata 保存前端列表所需的轻量业务信息：

```json
{
  "app": "deeppilot",
  "title": "会话标题",
  "title_source": "auto",
  "last_message_preview": "最近消息摘要",
  "last_model": "deepseek-v4-pro",
  "last_effort": "medium"
}
```

浏览器 `localStorage` 只保存当前活跃会话 ID：

```text
deeppilot.activeThreadId=<thread_id>
```

### 第二阶段业务索引

LangGraph checkpoint 是运行态快照，不适合作为检索主表。真正做会话检索时，新增业务索引表。

```sql
create table sessions (
  id uuid primary key,
  thread_id uuid not null unique,
  title text not null,
  summary text,
  last_message_preview text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  metadata jsonb not null default '{}',
  search_vector tsvector
);
```

```sql
create table session_messages (
  id uuid primary key,
  thread_id uuid not null,
  role text not null,
  content text not null,
  created_at timestamptz not null,
  search_vector tsvector
);
```

DeepPilot 的回答通常较长，向量检索不直接按完整 message 存储，而是按 chunk 存储：

```sql
create table session_chunks (
  id uuid primary key,
  thread_id uuid not null,
  message_id text,
  role text not null,
  chunk_index integer not null,
  content text not null,
  token_count integer,
  metadata jsonb not null default '{}',
  search_vector tsvector,
  created_at timestamptz not null
);
```

后续可增加向量列：

```sql
alter table session_chunks add column embedding vector(1536);
```

职责边界：

- LangGraph Thread：负责会话运行态、checkpoint、恢复和继续运行。
- 业务索引表：负责搜索、筛选、排序、摘要、标签、语义召回。
- `session_messages`：保存用于展示和关键词检索的消息级索引。
- `session_chunks`：保存用于全文/向量检索的切片级索引，避免大报告超出 embedding token 限制。

### 第二阶段同步管道

业务索引必须从 LangGraph Runtime 单向同步，避免双写造成不一致。

推荐管道：

1. Graph 执行仍以 LangGraph Thread/checkpoint 为事实来源。
2. 在 `visualize_answer` 之后新增 `sync_session_index` 节点，或使用 run finish 回调。
3. `sync_session_index` 读取最终 `OverallState`，提取：
   - `thread_id`
   - 首条用户消息作为默认标题
   - 最后一条 AI 消息作为摘要/预览来源
   - 完整 `messages`
   - `sources_gathered`
   - model/effort metadata
4. 使用 upsert 写入 `sessions` 和 `session_messages`。
5. 对长文本做 chunking 后 upsert 到 `session_chunks`。
6. 搜索接口只读业务索引表；继续对话和 time travel 仍读 LangGraph Thread/checkpoint。

一致性原则：

- 单向同步：`LangGraph Runtime -> Postgres Index`。
- `sessions.thread_id` 唯一约束防止重复会话索引。
- `session_messages` 和 `session_chunks` 使用 `(thread_id, message_id, chunk_index)` 这类自然唯一键做幂等 upsert。
- 同步失败不阻断 Agent 主流程，但需要记录错误并允许后台补偿重建索引。
- 前端 metadata 更新只用于第一阶段体验；第二阶段以后，列表和检索优先读业务索引 API。

可选替代方案：

- 使用 LangGraph webhook 监听 Thread/run 更新，由独立 worker 同步索引。优点是 Agent 执行态和业务索引解耦；缺点是本地开发和部署复杂度更高。
- 对 LangGraph 底层 metadata JSONB 建 GIN 索引。适合轻量过滤，但不建议替代业务索引表，因为 checkpoint 结构偏运行时内部，长文本 chunking、摘要、权限、分享会变得别扭。

## 本地数据库策略

本地开发不要求安装数据库软件，依赖 Docker 启动 Postgres/Redis 容器。

数据库版本地开发使用显式链路：

```makefile
db-up:
	docker compose up -d langgraph-postgres langgraph-redis adminer

db-down:
	docker compose stop langgraph-postgres langgraph-redis adminer

db-reset:
	docker compose down -v

langgraph-api:
	volumes:
	  - ./backend/src:/deps/backend/src
	  - ./backend/config.yaml:/deps/backend/config.yaml:ro

dev-db:
	@$(MAKE) db-up
	@$(MAKE) dev-frontend & $(MAKE) dev-backend-container
```

其中 `dev-backend-container` 使用 Docker 中的 LangGraph API Postgres runtime 写入上面的 Docker Postgres/Redis；本地源码通过 bind mount 进入容器。普通 Python 代码或 `config.yaml` 修改后重启 `langgraph-api` 即可生效，不需要 rebuild。`make dev-backend-file` 使用 `langgraph dev` 的本地文件存储，不会创建 Postgres 表。

本地默认端口：

- Frontend Vite：`http://localhost:5173/app/`
- LangGraph API：`http://localhost:2026`
- 生产式入口：`http://localhost:8123/app/`
- Adminer：`http://localhost:8080`
- Postgres：`127.0.0.1:5433`
- Redis：`127.0.0.1:6379`

Adminer 登录信息：

```text
System: PostgreSQL
Server: langgraph-postgres
Username: postgres
Password: postgres
Database: postgres
```

如果从宿主机数据库客户端连接：

```text
Host: 127.0.0.1
Port: 5433
Username: postgres
Password: postgres
Database: postgres
```

保留旧文件存储开发模式：

```bash
make dev-backend-file
```

该模式仍会写入：

```text
backend/.langgraph_api/*.pckl
```

只在需要快速热重载或排查 LangGraph dev 行为时使用。

### 旧本地会话迁移

旧 `.langgraph_api` 文件存储中的会话可以通过脚本导入当前 DB-backed LangGraph API：

```bash
cd backend
uv run python scripts/migrate_local_sessions.py --dry-run
uv run python scripts/migrate_local_sessions.py
```

迁移策略：

- 默认只迁移包含 AI 返回内容的旧 Thread。
- 通过 LangGraph HTTP API 创建 Thread 并写入 state，不直接写 Postgres 内部表。
- 保留原始 `thread_id`，便于前端 `localStorage`、旧链接或调试记录继续对应。
- 给 metadata 增加 `app=deeppilot`、`migrated_from=langgraph_file_cache` 和 `migrated_at`。
- 如果目标 Thread 已存在，创建阶段使用 `if_exists=do_nothing`，脚本可重复执行。

可选参数：

```bash
uv run python scripts/migrate_local_sessions.py --all-with-messages
uv run python scripts/migrate_local_sessions.py --include-errors
uv run python scripts/migrate_local_sessions.py --api-url http://127.0.0.1:2026
```

## 前端功能设计

新增 `SessionSidebar`：

- 新建会话
- 会话列表
- 当前会话高亮
- 会话搜索
- 重命名
- 删除
- 刷新列表
- 展示更新时间、状态、最近消息摘要

改造 `ChatMessagesView`：

- 每条 AI 回答底部展示复制、分享、导出、从此处分支按钮
- 分享链接携带 `thread` 和 `message` 参数
- 打开分享链接后恢复对应会话，并滚动定位到目标回答
- “从此处分支”创建一个只包含截至该回答上下文的新 Thread，并切换过去继续追问

改造 `App.tsx`：

- 创建共享 LangGraph `Client`
- 增加 `activeThreadId`
- `useStream` 传入 `threadId`
- `onThreadId` 保存当前会话 ID
- `onFinish` 回写 thread metadata 并刷新会话列表
- 切换会话时清理当前运行中的活动时间线
- 新建会话时不刷新页面，只清空 active thread
- `localStorage` 为空时，如果 12 小时内有最近会话，自动恢复最近会话
- 旧会话显示优先使用 `client.threads.get(threadId).values.messages` 快照，避免 SDK history 分支还原不完整

改造 `InputForm`：

- “New Search” 改为调用 `onNewSession`
- 不再使用 `window.location.reload()`

## API 使用

前端直接使用 LangGraph SDK：

- `client.threads.search({ limit, sortBy: "updated_at", sortOrder: "desc" })`
- `client.threads.get(threadId)`
- `client.threads.create({ metadata })`
- `client.threads.updateState(threadId, { values, asNode })`
- `client.threads.update(threadId, { metadata })`
- `client.threads.delete(threadId)`
- `useStream({ threadId, onThreadId })`

第一阶段不新增 FastAPI 业务接口。

## 检索策略

第一阶段：

- 会话搜索在前端完成
- 搜索范围：标题、最近消息摘要、最近模型
- 列表数据来自 Thread metadata 和 Thread values

第二阶段：

- 后端新增 `/sessions/search`
- Postgres `tsvector` 支持标题、摘要、消息全文检索
- `metadata jsonb` 支持模型、标签、时间范围过滤
- 可选接入 pgvector 做语义检索

## 风险与处理

- 旧 thread 没有 metadata：前端从 `values.messages` 推导标题和摘要。
- 空会话：当前实现只有提交时才由 `useStream` 创建 Thread，点击 New Search 不会创建空 Thread；如果后续改为提前创建 Thread，需要在切出空会话时主动删除，或增加 cron 清理无消息且超过 1 天的 Thread。
- 用户重命名后被自动标题覆盖：使用 `title_source=user`，自动更新时保留用户标题。
- metadata 更新冲突：第一阶段每次更新前先拉最新 thread metadata 再浅合并；第二阶段列表和检索读业务索引，metadata 只作为兼容补充。
- 切换会话时仍在生成：先调用 `thread.stop()`，再切换。
- 删除当前会话：删除后选中最近的其他会话，没有则回到欢迎页。
- 本地开发和线上存储不一致：默认 `make dev` 使用本地前端、Docker LangGraph API runtime、本地 backend source bind mount 和 Docker Postgres/Redis；需要无数据库 fallback 时使用 `make dev-backend-file`，它会使用 LangGraph dev 本地存储。

## 第三阶段实现与储备

### 会话分支与 Time Travel

当前实现提供回答级分支：前端从目标 AI 回答截取截至该回答的消息上下文，调用 `client.threads.create()` 创建新 Thread，再用 `client.threads.updateState()` 写入截断后的 `messages`。新 Thread metadata 中写入 `branched_from`、`branched_from_message`、`branched_at` 和自动标题，然后切换到新会话继续研究。

LangGraph checkpoint 天然支持历史状态。后续可以在消息气泡上增加 “Fork from here”：

- 从指定 checkpoint 创建新分支或复制 Thread。
- 新会话记录 `parent_thread_id`、`parent_checkpoint_id`。
- UI 展示分支来源，允许用户比较不同研究路径。

### 分享与导出

当前实现先提供轻量分享和导出：

- 分享：复制带 `?thread=<thread_id>&message=<message_id>` 的回答链接；App 启动时优先读取参数、恢复会话并滚动到目标回答。
- 导出：按单次问答结果下载 Markdown 文件，包含前一个用户问题和目标 AI 回答。

后续新增只读分享模型：

```sql
alter table sessions add column is_public boolean not null default false;
alter table sessions add column share_token uuid;
```

分享页只展示最终 report、来源引用和必要 visual blocks，不暴露完整 checkpoint、内部搜索过程或私有 metadata。

## 验收标准

- 首次提问后自动创建会话并出现在列表中。
- 刷新页面后恢复当前会话。
- 新建会话不刷新页面，不污染旧会话。
- 切换旧会话后可以继续追问。
- 可以搜索、重命名、删除会话。
- 可以从某条 AI 回答创建分支会话，并在新分支里继续追问。
- 可以复制某条 AI 回答链接，并通过链接恢复会话、滚动到对应回答。
- 可以将某次问答结果导出为 Markdown。
- 删除当前会话后 UI 能稳定回到其他会话或欢迎页。
- `localStorage` 为空时能恢复最近活跃会话。
- 默认 `make dev` 使用本地前端、Docker LangGraph API runtime、本地 backend source bind mount，并连接 Docker Postgres/Redis。
- Adminer 可打开并查看 Postgres 内容。
- `npm run build` 通过。
- `npm run lint` 无新增关键错误。
