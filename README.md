# DeepPilot

DeepPilot is a full-stack research assistant. It takes a user question, generates focused search queries, gathers source-backed web context, reflects on missing information, and produces a cited final answer with optional visual blocks.

## Project Structure

```text
.
├── frontend/              # React frontend
├── backend/               # LangGraph/FastAPI backend
├── Dockerfile             # Combined frontend/backend image
├── docker-compose.yml     # Local database and containerized service definitions
└── Makefile               # Install and development commands
```

## Environment

Copy the example file and add your keys:

```bash
cp backend/.env.example backend/.env
```

Keep each entry in `KEY=value` form without spaces around `=`.

Required:

```bash
NVIDIA_API_KEY=your_nvidia_integrate_key
WEB_RESEARCH_API_KEY=your_web_research_key
```

Optional:

```bash
GEMINI_API_KEY=your_google_gemini_key
OPENAI_API_KEY=your_openai_key
LANGSMITH_API_KEY=your_langsmith_key
```

Notes:

- `NVIDIA_API_KEY` is used by NVIDIA Integrate models such as `kimi-k2.6`, DeepSeek, GLM, and Minimax.
- `OPENAI_API_KEY` is used by OpenAI official models such as `gpt-5.5`.
- `GEMINI_API_KEY` is used by Google official Gemini models such as `gemini-3.5-flash`.
- `WEB_RESEARCH_API_KEY` is used by the web research adapter that gathers grounded source context. If it is not set, the backend also accepts `GEMINI_API_KEY` for this role.
- Model options are loaded from `backend/config.yaml`.

## Local Development

Prerequisites:

- Node.js 20+
- Python 3.11+
- uv
- Docker Desktop, for local Postgres/Redis only

Install all dependencies:

```bash
make install
```

Start frontend and backend together:

```bash
make dev
```

Default local URLs:

- Frontend: `http://localhost:5173/app/`
- Backend API: `http://127.0.0.1:2026`
- Database UI: `http://127.0.0.1:8080`
- LangGraph Studio: `https://smith.langchain.com/studio/?baseUrl=http://127.0.0.1:2026`

`make dev` starts Postgres, Redis, Adminer, and the LangGraph API runtime in Docker, then runs the frontend through local Vite. The backend container bind-mounts local backend source and `config.yaml`, so normal backend code edits do not require rebuilding the image. LangGraph sessions are stored in Docker Postgres.

`make dev` is equivalent to:

```bash
make dev-db
```

In this mode, the backend container connects to Docker Postgres and Redis through Docker service names. LangGraph creates its Postgres tables after the backend starts and handles the first thread/run operations.

If Docker Desktop reports that no space is left on device, restart Docker Desktop and clear only build cache first:

```bash
make docker-prune-build-cache
```

The project includes `.dockerignore` so local `node_modules`, `.venv`, and `.langgraph_api` caches are not sent into Docker builds. `make dev` uses the backend image for the LangGraph runtime, but mounts local backend source into it. Rebuild the backend image after dependency, Dockerfile, frontend build, or package metadata changes:

```bash
make docker-build
```

To run only the containerized backend, use:

```bash
make dev-backend-container
```

`make dev-container` is kept as an alias for the same database-backed development stack:

```bash
make dev-container
```

To use the file-backed local LangGraph dev server instead of Postgres, run:

```bash
make dev-backend-file
```

Adminer login for local database inspection:

```text
System: PostgreSQL
Server: langgraph-postgres
Username: postgres
Password: postgres
Database: postgres
```

From a desktop database client such as DBeaver, TablePlus, DataGrip, or pgAdmin, connect with:

```text
Host: 127.0.0.1
Port: 5433
Username: postgres
Password: postgres
Database: postgres
```

To migrate old file-backed local sessions into the DB-backed API, first start Docker Desktop and the app:

```bash
make dev
```

In another terminal, preview importable sessions:

```bash
cd backend
uv run python scripts/migrate_local_sessions.py --dry-run
```

Import sessions that already have AI answers:

```bash
cd backend
uv run python scripts/migrate_local_sessions.py
```


## Hot Reload

`make dev` supports local frontend and backend code iteration:

- Frontend changes under `frontend/src` are handled by Vite HMR and usually update in the browser without a restart.
- Backend Python changes under `backend/src` and `backend/config.yaml` are bind-mounted into the backend container. Restart `langgraph-api` after backend changes so Python imports reload: `make dev-backend-restart`.
- Dependency changes, `.env` changes, Dockerfile changes, frontend build changes, or package metadata changes require rebuilding or recreating the backend container.
- If the virtual environment was moved from another directory or command scripts look stale, run `make install` once to rebuild them.

`make dev-backend-file` keeps a local-file-storage fallback for backend-only debugging without Postgres.

## CLI Example

```bash
cd backend
uv run python examples/cli_research.py "What changed in AI agent frameworks this month?"
```

Optional arguments:

```bash
uv run python examples/cli_research.py "Your question" \
  --initial-queries 3 \
  --max-loops 2 \
  --reasoning-model deepseek-v4-pro
```

## Backend Flow

The main graph is defined in `backend/src/agent/graph.py`:

1. Generate focused search queries from the user question.
2. Run web research for each query and keep source metadata.
3. Check whether the gathered context is sufficient.
4. Generate follow-up queries if there are information gaps.
5. Compose the final cited answer with the selected model.
6. Attach optional visual blocks when the answer benefits from them.

## Docker

Build the image:

```bash
docker build -t deeppilot -f Dockerfile .
```

Start the services:

```bash
NVIDIA_API_KEY=<your_nvidia_key> \
WEB_RESEARCH_API_KEY=<your_web_research_key> \
LANGSMITH_API_KEY=<your_langsmith_key> \
docker compose up
```

Open:

```text
http://localhost:8123/app/
```

## License

DeepPilot is released under the MIT License. See `LICENSE` for details.
