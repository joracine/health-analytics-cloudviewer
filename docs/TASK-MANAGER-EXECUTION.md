# Task Manager — Execution Plan

Trackable implementation plan. Check off items as completed. Reference: `docs/TASK-MANAGER-PLAN.md`.

---

## Phase 1: DynamoDB + Task Creator + Task Client

### 1.1 Task Client (shared library)

- [ ] Create `lib/task-client/` package structure
- [ ] Implement `TaskClient` class with DynamoDB client
- [ ] Implement `createTask(taskType, schemaVersion, task)` — PutItem, dataVersion=1
- [ ] Implement `updateTaskStatus(task, status, taskOutcome?, outcomeMessage?)` — conditional update, returns updated task, throws `ConcurrencyConflictError`
- [ ] Implement `retryTask(taskId)` — fetch, conditional update for failed tasks only
- [ ] Implement `resetTask(taskId)` — fetch, conditional update to status=new
- [ ] Implement `deleteTask(taskId)` — DeleteItem
- [ ] Add handler registry: `registerHandler`, `getHandler`, `dispatch`
- [ ] Add `ConcurrencyConflictError` class
- [ ] Add structured logging (createTask, updateTaskStatus, retryTask, resetTask, conflict)
- [ ] Unit tests for Task Client

### 1.2 DynamoDB table (CDK)

- [ ] Add DynamoDB table to stack: `health-analytics-cloudviewer-{stage}-{region}-tasks`
- [ ] Partition key: `taskId`
- [ ] GSI `status-taskCreatedAt-index`
- [ ] GSI `taskType-taskCreatedAt-index`
- [ ] GSI `taskOutcome-taskCreatedAt-index`
- [ ] Enable stream (NEW_IMAGE or NEW_AND_OLD_IMAGES)
- [ ] No TTL
- [ ] On-demand billing

### 1.3 processNewFile handler

- [ ] Create `handlers/process-new-file.ts` (or under task-client)
- [ ] Implement handler for `taskType: "process_new_file"`, `schemaVersion: "1"`
- [ ] Parse task payload (sourceBucket, sourceKey, sourceFilename)
- [ ] Fetch file from S3, validate format (magic bytes), parse (e.g. PDF)
- [ ] Extract data, write to processed prefix
- [ ] Call `updateTaskStatus` with outcome
- [ ] Register handler in Task Client

### 1.4 Task Creator Lambda

- [ ] Create `lambda/task-creator/index.ts`
- [ ] S3 event handler: parse bucket, key, lastModified
- [ ] Use Task Client `createTask("process_new_file", "1", {...})`
- [ ] Add S3 event notification on upload prefix (CDK)
- [ ] IAM: PutItem on tasks table
- [ ] Verify: upload file → task appears in DynamoDB with status "new"

### 1.5 Phase 1 verification

- [ ] Run `cdk synth` successfully
- [ ] Deploy to Test stage
- [ ] Upload a file via presign flow
- [ ] Confirm task in DynamoDB with status=new, dataVersion=1

---

## Phase 2: Stream Adapter + SQS + Worker

### 2.1 SQS queue (CDK)

- [ ] Create SQS task queue (standard)
- [ ] Create DLQ
- [ ] Configure redrive policy, visibility timeout

### 2.2 Stream Adapter Lambda

- [ ] Create `lambda/stream-adapter/index.ts`
- [ ] DynamoDB Stream handler: filter INSERT + MODIFY where NewImage.status="new"
- [ ] Extract taskId from stream record, SendMessage to SQS
- [ ] Add stream event source to Lambda (CDK)
- [ ] IAM: SendMessage on task queue
- [ ] Log: taskId, eventName

### 2.3 Worker Lambda

- [ ] Create `lambda/task-worker/index.ts`
- [ ] SQS event handler: for each message, get taskId
- [ ] GetItem task from DynamoDB
- [ ] `updateTaskStatus(task, 'in_progress')` — use returned task
- [ ] `dispatch(updatedTask)` — Task Client
- [ ] On ConcurrencyConflictError: re-fetch or skip
- [ ] Add SQS event source (CDK)
- [ ] IAM: GetItem/UpdateItem on tasks table, GetObject on S3 upload prefix, PutObject on processed prefix

### 2.4 Remove File Processor S3 trigger

- [ ] Remove S3 event notification from File Processor Lambda (or remove File Processor if fully replaced)
- [ ] Ensure processNewFile handler covers all File Processor logic

### 2.5 Phase 2 verification

- [ ] Deploy
- [ ] Upload file → task created → stream → SQS → Worker processes
- [ ] Confirm task status=completed, taskOutcome=success/failure
- [ ] Confirm processed output in S3

---

## Phase 3: Dashboard

### 3.1 Dashboard Lambda

- [ ] Create `lambda/dashboard/index.ts`
- [ ] Route handler: GET / → serve HTML; GET /tasks, GET /tasks/:id, POST /tasks/:id/retry, POST /tasks/:id/reset, DELETE /tasks/:id
- [ ] Implement GET /tasks with filters (dateFrom, dateTo, status[], outcome[])
- [ ] Implement GET /tasks/:taskId
- [ ] Implement POST /tasks/:taskId/retry (Task Client retryTask)
- [ ] Implement POST /tasks/:taskId/reset (Task Client resetTask)
- [ ] Implement DELETE /tasks/:taskId (Task Client deleteTask)
- [ ] Add API Gateway HTTP API or Function URL (CDK)
- [ ] IAM: Query, GetItem, UpdateItem, DeleteItem on tasks table

### 3.2 Dashboard UI

- [ ] HTML page with task list (chronological)
- [ ] Filters: date range (from/to), status multi-select, outcome multi-select
- [ ] Clear filters button
- [ ] Color coding: status (new=blue, in_progress=amber, completed=green), outcome (success=green, failure=red, none=gray)
- [ ] Task detail panel: prettified JSON viewer (syntax highlighting)
- [ ] Actions: Delete, Retry, Reset buttons (Retry only for failure)
- [ ] Delete confirmation dialog
- [ ] Refresh list after actions

### 3.3 Phase 3 verification

- [ ] Deploy dashboard
- [ ] Open dashboard URL
- [ ] Verify task list, filters, detail panel
- [ ] Test Retry, Reset, Delete

---

## Summary

| Phase | Items | Status |
|-------|-------|--------|
| Phase 1 | 25 | ⬜ |
| Phase 2 | 14 | ⬜ |
| Phase 3 | 12 | ⬜ |

**Total**: 51 tasks
