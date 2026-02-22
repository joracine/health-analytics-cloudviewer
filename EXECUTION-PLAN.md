# CloudViewer – Execution plan

**Purpose:** Checklist for deploying the app and pipeline. Reference: [PROPOSAL.md](PROPOSAL.md), [PLAN.md](PLAN.md), [DESIGN.md](DESIGN.md).

**Conventions:** Do steps in order within each phase. Mark `[x]` when done. Project root: `d:\Google Drive\Health\Analyses\CloudViewer.project` (or repo root).

**Current architecture (post–Phase 1):** One S3 bucket `health-analytics-cloudviewer-<accountId>`. Uploads under `uploads/userdata/pdftestresults/`; website under `website/`. CloudFront serves from same bucket (origin path `/website`). Presign Lambda has `s3:PutObject` restricted to the upload prefix only.

---

## Phase 1: Build the application

Phase 1 is complete. Full step-by-step record: **[PHASE1-COMPLETE-STEPS.md](PHASE1-COMPLETE-STEPS.md)**.

Remaining manual check: open the CloudFront URL, Browse + Upload, confirm the file appears in the bucket under `uploads/userdata/pdftestresults/` with key format `<userid>-<uuid>-<filename>`.

---

## Phase 2: Add the pipeline (CodePipeline + CodeBuild)

The pipeline is **created** by implementing the steps in **[PHASE2-PIPELINE-STEPS.md](PHASE2-PIPELINE-STEPS.md)** (code). You then deploy that stack so the pipeline exists in AWS. Prerequisites (connection, bootstrap, repo) are in **[PHASE2-PREREQUISITES.md](PHASE2-PREREQUISITES.md)**.

### Order of work

1. **You (first):** CodeStar Connection, bootstrap, repo/branch and repo owner. See [PHASE2-PREREQUISITES.md](PHASE2-PREREQUISITES.md).
2. **Create the pipeline:** Implement the steps in [PHASE2-PIPELINE-STEPS.md](PHASE2-PIPELINE-STEPS.md) (agent or you)—dependencies, `lib/pipeline-stack.ts`, source, build stage, deploy stage, `bin/app.ts`.
3. **You:** Run `npx cdk deploy PipelineStack --require-approval never` so the pipeline is created in AWS.
4. **You:** Push to **main** or "Release change"; confirm Source → Build → Deploy.

### Create the pipeline (implementation)

These steps **create** the pipeline (it does not exist until this code is written and the pipeline stack is deployed). Full detail: [PHASE2-PIPELINE-STEPS.md](PHASE2-PIPELINE-STEPS.md).

- [x] **Dependencies:** Confirm `aws-cdk-lib` and `pipelines` module available.
- [x] **Pipeline stack:** Create `lib/pipeline-stack.ts`. Define `CodePipeline` with GitHub source (CodeStar Connection), repo **health-analytics-cloudviewer**, branch **main**, repo owner from stack prop or `cdk.json` context.
- [x] **Build stage:** Add `ShellStep`: `npm ci`, `npx cdk synth`. CodeBuild image Node 20 (e.g. `STANDARD_7_0`). Output `cdk.out` for deploy. (No `npm run build`—CDK uses ts-node.)
- [x] **Deploy stage:** Add stage that deploys `CloudViewerStack` via `pipeline.addStage()`.
- [x] **App entrypoint:** In `bin/app.ts`, instantiate `CloudViewerStack` and `PipelineStack`; pipeline deploys the app stack.

### Your steps (prerequisites and deploy)

- [ ] **Prerequisites:** CodeStar Connection (status **Available**), `npx cdk bootstrap`, repo/branch confirmed, repo owner known. [PHASE2-PREREQUISITES.md](PHASE2-PREREQUISITES.md).
- [ ] **Deploy pipeline stack:** After the pipeline code exists, run `npx cdk deploy PipelineStack --require-approval never`.
- [ ] **First pipeline run:** Push to **main** or "Release change"; confirm all stages succeed.

---

## Phase 3: Wire up and verify

- [ ] **Repo and branch:** Confirm the GitHub repo linked in the connection is the one used; pipeline tracks **main**. Push all app and pipeline code to **main**.
- [ ] **Pipeline run:** Trigger a run (push or “Release change”). Confirm Source, Build (`npm ci`, `cdk synth`), and Deploy succeed.
- [ ] **End-to-end test:** Open CloudFront URL from stack outputs. Test Browse + Upload. Confirm object in bucket `health-analytics-cloudviewer-<accountId>` under `uploads/userdata/pdftestresults/` with key format `<userid>-<uuid>-<filename>`.
- [ ] **Lint/test in pipeline:** Add a build step (e.g. `npm run lint`, `npm test`) so the pipeline fails on regressions before deploy. Add scripts to `package.json` if needed.

---

## Completion

When all Phase 2 and Phase 3 checkboxes are done, the execution plan is complete. “Must fix later” items remain in [PROPOSAL.md](PROPOSAL.md#must-fix-later).
