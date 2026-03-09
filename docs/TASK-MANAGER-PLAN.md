# Task Manager Plan

**Execution plan**: See `docs/TASK-MANAGER-EXECUTION.md` for the trackable implementation checklist.

## Overview

Add a task management layer that tracks file processing work. When a file lands in the S3 upload prefix, a Lambda creates a task record in DynamoDB. Tasks can be queried by status (new, in_progress, completed) to support dispatching and dashboards.

---

## Goals

- **Track work**: Every uploaded file becomes a task with metadata
- **Dispatch**: Query "new" tasks for workers to pick up
- **Dashboard**: Query by status to show pipeline health (new, in progress, completed)
- **Audit**: Timestamps for task creation, file creation, status changes

---

## Architecture

```
[Upload] → S3 upload prefix (uploads/userdata/pdftestresults/)
              ↓
         S3 Event (ObjectCreated)
              ↓
         Task Creator Lambda
              ↓
         DynamoDB (Task Manager table) — PutItem only (status = "new")
              ↓
         DynamoDB Stream (INSERT + MODIFY where status→new)
              ↓
         Stream Adapter Lambda (filter → enqueue taskId)
              ↓
         SQS (retries, DLQ, visibility)
              ↓
         Worker Lambda (SQS trigger)
              ↓
         Task Client dispatch → processNewFile handler (or other)
              ↓
         updateTaskStatus → completed / failure
```

**Components**:
- **Task Creator** — S3 → PutItem; no knowledge of SQS or Worker
- **Stream Adapter** — Thin Lambda: stream events → filter → SendMessage(taskId) to SQS
- **SQS** — Decoupling, retries, DLQ, visibility
- **Worker** — SQS trigger → fetch task → dispatch to handler → update status

**Stream filter**: `eventName IN [INSERT, MODIFY]` and `dynamodb.NewImage.status.S = "new"` — catches both initial inserts and retries (retryTask sets status→new).

---

## Retrying Failed Tasks

Failed tasks (`status = completed`, `taskOutcome = failure`) should be easy to retry. Some failures are transient (e.g. S3 throttling, Lambda timeout); others need code fixes before retry.

### Retry mechanism

- **Reset to new**: Update task: `status = "new"`, clear `taskOutcome` and `outcomeMessage` (or append to a `retryHistory` in task payload). Consumer picks it up again.
- **Retry count** (optional): Add `retryCount` to task payload; increment on retry. Enables "max retries" or "retry #3" in logs.
- **Preserve failure context**: Keep previous `outcomeMessage` in task payload (e.g. `lastFailureMessage`) before clearing for retry — aids debugging.

### How to trigger retry

| Method | Use case |
|--------|----------|
| **Dashboard** | "Retry" button on failed task — calls API that resets status to new |
| **CLI** | `task-client retry <taskId>` — same reset |
| **API** | `POST /tasks/{taskId}/retry` — idempotent; only if `taskOutcome = failure` |
| **Bulk** | "Retry all failed" — query `taskOutcome = failure`, reset each |

### Task Client support

- `retryTask(taskId)` — conditional update: if `taskOutcome = failure` and `dataVersion` matches, set `status = "new"`, clear outcome, increment `dataVersion`, optionally increment `retryCount`. On conflict: re-read and retry. Returns success/failure (e.g. "not a failed task").
- Log: `taskId`, `dataVersion`, `retryCount`, `previousOutcomeMessage` for traceability.

---

## Traceability

End-to-end traceability: from file upload → task creation → consumption → handler → outcome. Must support debugging "why did task X fail?" and "what happened to file Y?".

### Identifiers

| Identifier | Where | Purpose |
|------------|-------|---------|
| `taskId` | DynamoDB PK | Primary trace key; include in every log line |
| `sourceKey` | Task payload | S3 key of source file; links task to upload |
| `requestId` | Lambda context | AWS request ID; in CloudWatch log stream |
| `traceId` (optional) | Task payload | Correlation ID from upload; flow through entire pipeline |

### Logging

- **Structured logs** — JSON or key-value; every log line includes `taskId` (and `sourceKey` when relevant).
- **CloudWatch Logs Insights** — filter by `taskId` to see full lifecycle: Task Creator → Stream Adapter → Worker → Handler.
- **Key events**: createTask, updateTaskStatus (each transition), dispatch, handler start/complete/error, retryTask.

### Trace flow

```
S3 upload (key: uploads/.../file.pdf)
  → Task Creator: createTask → taskId=abc, sourceKey=uploads/.../file.pdf
  → DynamoDB Stream → Stream Adapter → SQS (message: taskId=abc)
  → Worker Lambda: dispatch taskId=abc
  → Handler: process taskId=abc, sourceKey=...
  → updateTaskStatus(abc, completed, failure, "Invalid PDF header")
  → Retry: retryTask(abc) → status=new
  → Stream (MODIFY) → Adapter → SQS → Worker picks up again...
```

Include `taskId` and `sourceKey` in all log statements. A single CloudWatch Logs Insights query: `fields @timestamp, @message | filter taskId = "abc"` shows the full story.

---

## DynamoDB Table Design

### Table: `health-analytics-cloudviewer-{stage}-{region}-tasks`

Table name includes stage and region for multi-region deployments (e.g. `health-analytics-cloudviewer-test-us-east-1-tasks`).

Minimal schema: only indexed columns plus a single `task` payload. Handlers route by `taskType` and interpret `task` using `schemaVersion`.

| Attribute      | Type   | Key | Description |
|----------------|--------|-----|-------------|
| `taskId`       | String | PK  | Unique task ID (e.g. UUID) |
| `dataVersion`  | Number |     | Optimistic lock; increment on every write; used for conditional writes |
| `status`       | String | GSI partition key | `new` \| `in_progress` \| `completed` |
| `taskCreatedAt` | String | GSI sort key | Task creation timestamp (ISO 8601); indexed for paging |
| `taskType`     | String | GSI partition key | Task kind (e.g. `process_new_file`, `process_pdf`); handlers dispatch by type |
| `schemaVersion` | String |    | Schema version of `task` payload (e.g. `1`); enables format evolution |
| `task`         | Map    |     | Task-specific payload; schema defined by `taskType` + `schemaVersion` |
| `taskOutcome`  | String | GSI partition key | `success` or `failure`; set when status becomes `completed` |
| `outcomeMessage` | String |   | Human-readable description of outcome (for debugging); e.g. error details or success summary |

### GSI: `status-taskCreatedAt-index`

- **Partition key**: `status`
- **Sort key**: `taskCreatedAt` — enables cursor-based paging as the table grows

### GSI: `taskType-taskCreatedAt-index`

- **Partition key**: `taskType`
- **Sort key**: `taskCreatedAt` — query tasks by type, paged by creation time

### GSI: `taskOutcome-taskCreatedAt-index`

- **Partition key**: `taskOutcome`
- **Sort key**: `taskCreatedAt` — query failed/successful tasks, paged by creation time

**Query patterns**:
- All new tasks: `Query(status = "new")` on status index — ordered by task creation time
- By task type: `Query(taskType = "process_new_file")` on taskType index
- By outcome: `Query(taskOutcome = "failure")` on taskOutcome index — for debugging failed tasks
- **Paging**: `Limit` + `ExclusiveStartKey` (LastEvaluatedKey) on any index

### Optimistic concurrency (dataVersion)

All writes use conditional updates: only succeed if `dataVersion` matches the value we read. Prevents lost updates when multiple writers touch the same task.

**Pattern**:
1. **Read** task (GetItem or Query) — get `dataVersion` (e.g. 6)
2. **Modify** in memory (e.g. status → in_progress, task payload changes)
3. **Write** with condition: `dataVersion = 6`; in the same UpdateItem, set `dataVersion = 7` (increment)
4. If condition fails (ConditionalCheckFailedException) — another writer updated first; **re-read** and retry from step 2

**Example**: Worker claims task (new → in_progress). Two workers receive same S3 message (at-least-once). Both read task with dataVersion=6. Worker A writes first: condition dataVersion=6, set status=in_progress, dataVersion=7. Worker B's write fails (dataVersion is now 7). Worker B re-reads, sees status=in_progress, skips (or retries with fresh data).

**Create**: PutItem sets `dataVersion = 1`. No condition on create.

**Update/Retry**: Every UpdateItem includes condition `dataVersion = <expected>` and `SET dataVersion = dataVersion + 1` (or explicit increment). The Task Client encapsulates this: callers pass the task object; the client uses `task.dataVersion` for the condition and returns the updated task.

### Task payload (`task` attribute)

Schema is defined per `taskType` and `schemaVersion`. Example for `taskType: "process_new_file"`, `schemaVersion: "1"`:

```json
{
  "sourceBucket": "my-bucket",
  "sourceKey": "uploads/userdata/pdftestresults/...",
  "sourceFilename": "lab-results.pdf",
  "createdAt": "2025-03-08T12:00:00Z",
  "updatedAt": "2025-03-08T12:00:00Z",
  "resultKey": null,
  "retryCount": 0,
  "lastFailureMessage": null
}
```

New versions can add fields; handlers check `schemaVersion` before parsing. New task types get their own schema.

### Handlers and task types

Workers/dispatchers query for `status = "new"`, then route each task to a handler based on `taskType`. Handlers:
- Ignore tasks with unknown `taskType` or unsupported `schemaVersion`
- Parse `task` according to the schema for that type/version
- Update `status` to `in_progress` → `completed`; set `taskOutcome` (`success` or `failure`) and `outcomeMessage` (e.g. error details or success summary) for debugging

---

## Task Client

A shared client library for manipulating tasks in DynamoDB. Used by the Task Creator Lambda initially; later by processors, API, CLI, or other workers. Encapsulates DynamoDB access and provides a handler/registry for task type/version dispatch.

### Responsibilities

- **Add task**: `createTask(taskType, schemaVersion, task)` — inserts a new task with status `new`, `dataVersion = 1`
- **Update task**: `updateTaskStatus(task, status, taskOutcome?, outcomeMessage?)` — takes task object (with `dataVersion`); conditional update internally; increments `dataVersion`; **returns updated task** for chaining. Throws `ConcurrencyConflictError` on condition failure (caller re-fetches and retries).
- **Retry task**: `retryTask(taskId)` — fetches task, conditional update (reset `status` to `new`, clear outcome); only if `taskOutcome = failure`. On conflict, re-fetch and retry internally. Returns success/failure.
- **Delete task**: `deleteTask(taskId)` — DeleteItem; removes task from DynamoDB (used by dashboard).
- **Reset task**: `resetTask(taskId)` — conditional update: set `status = "new"`, clear `taskOutcome` and `outcomeMessage`; works on any task. On conflict, re-fetch and retry internally. Returns success/failure.
- **Handler registry**: Maps `(taskType, schemaVersion)` → handler function; clients invoke the appropriate handler for a task

**dataVersion encapsulation**: Callers never pass or read `dataVersion` directly. The client uses `task.dataVersion` for the condition and increments it on write. Callers pass the task they read; use the **returned** task for the next update (chaining). On conflict, catch `ConcurrencyConflictError`, re-fetch, retry.

### Handler/Registry Model

```
Registry: Map<(taskType, schemaVersion), Handler>

Handler = (task: TaskRecord) => Promise<void>
  - Receives full task record (taskId, status, task payload, dataVersion, etc.)
  - Parses task payload according to schema
  - Performs work (e.g. process file, call API)
  - Calls client.updateTaskStatus(task, 'completed', outcome, message) — uses task passed in (with current dataVersion); on ConcurrencyConflictError, re-fetch and retry
```

- **Lookup**: `getHandler(taskType, schemaVersion)` → handler or null (unknown type/version)
- **Registration**: `registerHandler(taskType, schemaVersion, handler)` — at startup or module load
- **Dispatch**: Client provides `dispatch(task)` which looks up handler and invokes it; logs and skips if no handler. Worker passes the **updated** task (from `updateTaskStatus` return) so handler has current `dataVersion` for its final update.

### Initial Handler: `processNewFile`

| Key | Value |
|-----|-------|
| `taskType` | `process_new_file` |
| `schemaVersion` | `1` |
| **Purpose** | Handles tasks created when a new file lands in S3 upload prefix |
| **Payload (v1)** | `{ sourceBucket, sourceKey, sourceFilename, createdAt, updatedAt, resultKey? }` |
| **Behavior** | Fetch file from S3, validate format, parse (e.g. PDF), extract data, write result to processed prefix; update task with outcome |

This handler is the first to implement; others (e.g. `process_pdf`, `process_json`) can be added later.

### CloudWatch Debugging

The client and handlers must emit structured logs sufficient to trace a task through its lifecycle. Include:

| Log context | When | Fields |
|-------------|------|--------|
| **createTask** | On add | `taskId`, `taskType`, `schemaVersion`, `sourceKey` (if in payload), `client` (e.g. `task-creator`) |
| **updateTaskStatus** | On update | `taskId`, `dataVersion`, `fromStatus`, `toStatus`, `taskOutcome?`, `outcomeMessage?` |
| **updateTaskStatus conflict** | On ConditionalCheckFailed | `taskId`, `expectedDataVersion`, `action` (retry) |
| **dispatch** | Before handler run | `taskId`, `taskType`, `schemaVersion`, `handlerFound` |
| **handler start** | Handler entry | `taskId`, `taskType`, `schemaVersion` |
| **handler complete** | Handler exit | `taskId`, `taskOutcome`, `outcomeMessage`, `durationMs` |
| **handler error** | On handler throw | `taskId`, `taskType`, `error`, `stack` |
| **retryTask** | On retry | `taskId`, `retryCount`, `previousOutcomeMessage` |
| **resetTask** | On reset | `taskId`, `fromStatus`, `fromOutcome` |
| **streamAdapter** | On enqueue | `taskId`, `eventName` (INSERT/MODIFY), `source` (stream) |

Use a consistent log structure (e.g. JSON or key-value pairs) so CloudWatch Logs Insights can filter by `taskId` or `taskType`. Include `requestId` (Lambda) or `traceId` when available for correlation.

### Usage

**Task Creator Lambda**:
1. S3 event → Task Creator Lambda
2. Lambda uses Task Client: `client.createTask("process_new_file", "1", { sourceBucket, sourceKey, ... })`
3. Client logs createTask with taskId, taskType, etc.
4. DynamoDB Stream → Stream Adapter → SQS

**Worker Lambda**:
1. SQS message (taskId) → Worker Lambda
2. Fetch task from DynamoDB (GetItem)
3. `updatedTask = await client.updateTaskStatus(task, 'in_progress')` — returns task with new `dataVersion`; on `ConcurrencyConflictError`, re-fetch and retry or skip if already in_progress/completed
4. `client.dispatch(updatedTask)` → handler runs (receives task with current dataVersion)
5. Handler calls `client.updateTaskStatus(updatedTask, 'completed', outcome, message)` — uses returned task for correct version; on conflict, re-fetch and retry

### Package Layout (design only)

- `lib/task-client/` or `packages/task-client/` — shared package
  - `TaskClient` class: createTask, updateTaskStatus (returns updated task), retryTask, resetTask, deleteTask, getHandler, registerHandler, dispatch
  - `ConcurrencyConflictError` — thrown when conditional write fails; caller re-fetches and retries
  - `handlers/process-new-file.ts` — processNewFile handler (taskType: `process_new_file`, schemaVersion: `1`)
  - Handlers register themselves or are registered at init

---

## Task Creator Lambda

**Trigger**: S3 `ObjectCreated:*` on upload prefix

**Input**: S3 event (bucket, key, etag, size, lastModified)

**Logic**:
1. Parse S3 event for bucket, key, lastModified
2. Generate `taskId` (UUID)
3. PutItem to DynamoDB:
   - `taskId`, `dataVersion: 1`, `status: "new"`, `taskCreatedAt` = now (ISO 8601)
   - `taskType: "process_new_file"`
   - `schemaVersion: "1"`
   - `task` = Map with `{ sourceBucket, sourceKey, sourceFilename, createdAt, updatedAt }`

**Uploads**: Upload flow does not allow replacing or modifying existing files; every upload is a new file. Same file uploaded twice → two tasks (two S3 objects, two task records). Duplicate data in time series will be handled later when managing the time series; no deduplication at upload/task level.

**Error handling**: Lambda retries on failure; consider DLQ for poison events.

---

## CDK Stack Changes

1. **DynamoDB table**
   - Table name: `health-analytics-cloudviewer-{stage}-{region}-tasks`
   - Partition key: `taskId`
   - **Stream**: Enable with `NEW_AND_OLD_IMAGES` (or `NEW_IMAGE` if adapter only needs new state)
   - GSI `status-taskCreatedAt-index`, `taskType-taskCreatedAt-index`, `taskOutcome-taskCreatedAt-index`
   - No TTL; tasks are not auto-deleted
   - Billing: on-demand (low volume)

2. **Task Creator Lambda**
   - `lambda/task-creator/index.ts`
   - S3 event notification on upload prefix
   - IAM: PutItem on tasks table

3. **Stream Adapter Lambda**
   - `lambda/stream-adapter/index.ts`
   - DynamoDB Stream event source (filter: INSERT + MODIFY, NewImage.status = "new")
   - IAM: SendMessage on task queue
   - Logic: for each stream record, extract taskId from NewImage, SendMessage to SQS

4. **SQS queue**
   - Task queue (standard; FIFO not needed)
   - DLQ for poison messages
   - Visibility timeout, redrive policy

5. **Worker Lambda**
   - `lambda/task-worker/index.ts`
   - SQS event source (task queue)
   - IAM: GetItem/UpdateItem on tasks table, GetObject on S3 upload prefix, PutObject on processed prefix
   - Uses Task Client with processNewFile handler registered

6. **Relationship to existing File Processor**
   - **Replace**: Worker Lambda + processNewFile handler replaces the current File Processor Lambda (S3-triggered). Remove S3 trigger from File Processor; processing is task-driven via Stream → SQS → Worker.

7. **Dashboard Lambda** (Phase 3)
   - `lambda/dashboard/index.ts` — simple Lambda website: serves HTML/JS for dashboard, handles task API routes
   - API Gateway HTTP API or Lambda Function URL
   - IAM: Query/GetItem/UpdateItem/DeleteItem on tasks table

---

## Implementation Phases

### Phase 1: DynamoDB + Task Creator + Task Client
- Create DynamoDB table with GSI and stream enabled
- Create Task Client (createTask, updateTaskStatus, retryTask, handler registry)
- Implement processNewFile handler (taskType: `process_new_file`, schemaVersion: `1`)
- Create Task Creator Lambda; use Task Client to create tasks
- Add S3 event for Task Creator on upload prefix
- Verify: upload file → task appears in DynamoDB with status "new"

### Phase 2: Stream Adapter + SQS + Worker
- Create SQS queue with DLQ
- Create Stream Adapter Lambda (DynamoDB Stream → SQS)
- Create Worker Lambda (SQS trigger → Task Client dispatch)
- Remove or repurpose existing File Processor S3 trigger (Worker replaces it)
- Verify: upload file → task created → stream → SQS → Worker processes → status completed

### Phase 3: Dashboard (later)
- See **Status Dashboard** section below.

---

## Status Dashboard

Simple Lambda website: a single Lambda function behind API Gateway (or Function URL) that serves the dashboard UI and handles API routes. No separate static hosting or API stack.

**Architecture**: One Lambda (`lambda/dashboard/` or similar) — serves HTML/JS for `GET /` (or `/dashboard`); handles `GET /tasks`, `GET /tasks/:id`, `POST /tasks/:id/retry`, `POST /tasks/:id/reset`, `DELETE /tasks/:id` for API. Uses Task Client for DynamoDB access.

### Task list

- **Order**: Chronological (newest first or oldest first; configurable)
- **Columns**: taskId, status, taskCreatedAt, taskType, taskOutcome, sourceFilename (from task payload), actions (Delete, Retry, Reset)

### Filters

| Filter | Type | Default | Notes |
|--------|------|---------|-------|
| **Date range** | From / To date pickers | Empty (no date filter) | Filter by `taskCreatedAt` |
| **Status** | Multi-select | All selected (new, in_progress, completed) | Filter by `status` |
| **Outcome** | Multi-select | All selected (success, failure, none) | Filter by `taskOutcome`; "none" for tasks not yet completed |
| **Clear** | Button | — | Resets all filters to defaults |

### Color coding

| Status | Color |
|--------|-------|
| `new` | e.g. blue |
| `in_progress` | e.g. amber |
| `completed` | e.g. green |

| Outcome | Color |
|---------|-------|
| `success` | e.g. green |
| `failure` | e.g. red |
| none (not completed) | e.g. gray |

### Task detail panel

When a task is selected:

- **Task content**: Full task record (JSON) in a **prettified, color-coded** JSON viewer (syntax highlighting)
- **Actions**: Delete, Retry, Reset buttons (same as in list row)

### Actions

| Action | Behavior |
|--------|----------|
| **Retry** | Only for tasks with `taskOutcome = failure`. Calls `client.retryTask(taskId)`. Refreshes list after success. |
| **Reset** | Puts task back to `status = "new"` (clears outcome if set). Works on any task. Calls `client.resetTask(taskId)`. Refreshes list after success. |
| **Delete** | Removes task from DynamoDB. Requires confirmation. API calls DeleteItem. |

### Routes (Lambda handles all)

- `GET /` (or `/dashboard`) — serves dashboard HTML/JS
- `GET /tasks` — query tasks with filters (dateFrom, dateTo, status[], outcome[]); returns paginated list
- `GET /tasks/:taskId` — get single task (for detail panel)
- `POST /tasks/:taskId/retry` — retry failed task (uses Task Client `retryTask`)
- `POST /tasks/:taskId/reset` — reset task to new (uses Task Client `resetTask`)
- `DELETE /tasks/:taskId` — delete task (uses Task Client `deleteTask`; requires confirmation in UI)

---

## Open Questions

- [ ] (Reserved for future design decisions)
