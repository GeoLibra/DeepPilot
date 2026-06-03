# AGENTS.md

# AI Engineering Guardrails

This document defines the engineering rules, architecture boundaries, and coding standards that all AI agents must follow when generating, modifying, or refactoring code in the DeepPilot repository.

The goal is to:

* keep architecture stable
* prevent code entropy
* avoid giant files
* reduce unnecessary refactors
* maintain long-term maintainability
* ensure predictable code generation for both the React frontend and Python backend

---

# Core Principles

## 1. Simplicity First

Prefer:

* simple functions
* explicit naming
* predictable data flow
* small composable modules

Avoid:

* over-engineering
* unnecessary abstractions
* premature optimization
* design-pattern abuse

---

## 2. Separation of Concerns

Strictly separate:

* UI rendering (React components)
* State management (React hooks, LangGraph state)
* Business logic (Backend Python functions)
* Side effects (Data fetching, SSE streaming)
* Prompt templates and graph configuration

Never mix these responsibilities inside one module.

---

## 3. Pure Function First

Business calculations and data transformations should prefer pure functions.

Pure functions:

* must not mutate external state
* must not request APIs
* must not access browser globals or module-level globals

Prefer:

* deterministic inputs
* deterministic outputs
* immutable transformations

---

## 4. Architecture Before Code

Before implementing features:

1. analyze requirements
2. propose file structure
3. explain module responsibilities
4. identify side effects
5. identify reusable logic
6. identify potential performance or security risks

Do not immediately generate implementation code.

---

# File Structure Rules

## Frontend (React / TypeScript)

Recommended feature structure:

```txt
frontend/src/
  features/
    [feature-name]/
      components/
      hooks.ts
      services.ts
      types.ts
      utils.ts
  components/ui/    # Shared shadcn components
  lib/              # Global utils, constants
```

Responsibilities:

| File         | Responsibility                  |
| ------------ | ------------------------------- |
| constants.ts | enums, config, thresholds, keys |
| types.ts     | shared types                    |
| utils.ts     | pure reusable helpers           |
| services.ts  | API and IO (LangGraph SDK calls)|
| hooks.ts     | React hooks and effects         |
| components/  | UI only                         |

## Backend (Python / LangGraph)

Recommended structure:

```txt
backend/src/agent/
  nodes/            # Individual graph node functions
  tools/            # External API integrations
  graph.py          # Graph routing and edge definitions
  state.py          # TypedDict definitions
  prompts.py        # LLM instruction templates
  configuration.py  # Run configuration
```

---

# File Size Limits

## General Limits

* single file <= 500 lines preferred
* single function <= 150 lines preferred
* React component <= 300 lines preferred
* Python node function <= 50 lines preferred

When exceeded:

* extract pure functions
* split components
* move logic to custom hooks or utility functions
* break down large graph files (e.g., extracting nodes from `graph.py`)

---

# React Rules

## Components

React components should:

* focus on rendering
* handle event binding
* compose smaller components

React components should NOT:

* contain large business logic
* contain data transformation pipelines
* manage complex API streaming logic directly (delegate to hooks)
* directly request APIs

## Hooks

Hooks should:

* encapsulate side effects (like SSE streaming from LangGraph)
* encapsulate reusable state logic

Hooks should NOT:

* contain rendering logic
* become "god hooks"
* contain unrelated responsibilities

---

# Backend & LangGraph Rules

## Graph Principles

Nodes:

* should be focused
* should process one specific responsibility (e.g., generating queries, evaluating research)
* should avoid hidden coupling

State:

* should be well-typed using `TypedDict`
* avoid dumping unstructured data into state

Avoid:

* giant graph definition files
* tightly coupling model provider logic directly inside nodes
* hardcoding API keys globally

## Model Integration Rules

Forbidden:

* executing untrusted code or arbitrary prompts without structure
* directly embedding user input into unescaped strings when vulnerable

Prefer:

* using `model_registry.py` for multi-provider model invocation
* Pydantic schemas for structured outputs
* robust error handling for API timeouts

---

# State Management Rules

## State Boundaries

Separate:

* UI state (sidebar, input forms)
* Domain state (sessions, messages)
* Backend execution state (LangGraph state)

Avoid:

* giant global stores
* duplicated state between UI and session cache
* deeply nested mutable objects

---

# API and Data Rules

## Service Layer

All external IO must go through services.

Examples:

* LangGraph client SDK (`useStream`, etc.)
* LocalStorage session CRUD
* FastAPI endpoints

Never directly request APIs inside UI components. Use custom hooks wrapping service calls.

## Adapter Layer

Use adapters when:

* external DTO differs from internal model
* mapping LangGraph state to React component props
* standardizing LLM outputs from different providers

Adapters should:

* normalize data
* validate fields
* isolate external dependencies

---

# Constants and Magic Values

Forbidden:

```ts
if (score > 80)
```

Required:

```ts
const HIGH_MATCH_SCORE = 80
```

All magic values must be extracted:

* thresholds
* limits
* timeout intervals
* URLs and API routes
* default models

Use:

* `constants.ts` (Frontend)
* `config.yaml` / `.env` (Backend)

---

# Design Pattern Rules

Do NOT use design patterns by default.

Use patterns only when complexity or change frequency justifies them.

## Recommended Pattern Usage

### Adapter Pattern

Use for:

* Multi-LLM provider support (e.g., `model_registry.py`)
* Normalizing API schemas

### Pipeline / Graph Pattern

Use for:

* AI workflows (LangGraph state machines)
* Multi-stage async tasks

---

# Anti Over-Engineering

Forbidden:

* creating classes for simple functions
* creating managers/helpers for everything
* abstracting single implementations prematurely
* unnecessary interfaces

Prefer:

* focused modules
* explicit naming
* direct composition

---

# Naming Rules

Names must express business meaning.

Forbidden:

* data
* item
* temp
* handler
* flag

Prefer:

* `formatResearchAnswer`
* `extractCitationMarkers`
* `invokeStructuredModel`
* `MessageBubble`

Boolean naming:

* `is`
* `has`
* `can`
* `should`

---

# Error Handling Rules

Forbidden:

* silent failures
* swallowed exceptions
* empty catch blocks

Required:

* meaningful errors shown to user
* fallback states for LLM failures
* explicit failure handling
* retry boundaries for web research APIs

---

# Performance Rules

Always consider:

* React rerender frequency (especially with streaming updates)
* Large array maps
* Prompt token limits and context windows
* API concurrency limits

Avoid:

* unnecessary rerenders on every SSE chunk
* repeated DOM allocations for Markdown parsing

---

# AI Workflow Rules

Before generating code:

1. check AGENTS.md
2. detect architecture violations (e.g., are components getting too large?)
3. detect anti-patterns
4. detect duplicate logic
5. identify extraction opportunities
6. propose module boundaries

---

# Compaction Checkpoint Rules

When context is close to compaction, or when the user asks to compact:

1. update `.ai/CHECKPOINT.md` first
2. record the current goal
3. record completed work
4. record pending work
5. record risks or blockers
6. record key files
7. record verification commands and their status
8. run `/compact` only after the checkpoint is updated
9. after compaction, read `.ai/CHECKPOINT.md` before continuing work

Do not rely on memory alone across compaction boundaries.

---

# Refactor Rules

Do NOT refactor entire systems unnecessarily.

Prefer:

* incremental refactors (e.g., extracting one hook at a time)
* localized improvements
* backward-compatible extraction

Avoid:

* rewriting working systems
* changing stable APIs without reason
* architecture churn

---

# Forbidden Anti-Patterns

Forbidden:

* giant components
* giant graphs
* business logic inside UI
* hidden side effects
* circular dependencies
* duplicated constants
* mixing Python logic with API route definitions

---

# Preferred Engineering Style

Preferred style:

* modular
* explicit
* predictable
* composable
* testable
* architecture-consistent

The repository should remain understandable even after long-term AI-assisted development.
