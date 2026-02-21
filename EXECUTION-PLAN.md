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

Complete **your** steps in [PHASE2-PREREQUISITES.md](PHASE2-PREREQUISITES.md) first or in parallel. Then the agent implements the pipeline code; you deploy the pipeline stack and run the pipeline.

### Steps you complete (manual)

- [ ] **CodeStar Connection:** Create connection to GitHub in AWS Console (Developer Tools → Connections). Repo **health-analytics-cloudviewer**, branch **main**. Wait until status is **Available**. See [PHASE2-PREREQUISITES.md](PHASE2-PREREQUISITES.md).
- [ ] **Bootstrap:** Run `npx cdk bootstrap` for the target account/region (once per account/region).
- [ ] **Repo and branch:** Confirm repo and branch exist; have GitHub username/org (repo owner) ready for pipeline config.
- [ ] **Deploy pipeline stack:** After the agent adds the pipeline, run `npx cdk deploy PipelineStack --require-approval never`. Resolve errors (e.g. connection not Available).
- [ ] **First pipeline run:** Push to **main** or use “Release change” in CodePipeline; confirm Source → Build → Deploy succeed.

### Steps the agent completes (code)

- [ ] **Dependencies:** Confirm `aws-cdk-lib` and `pipelines` module are available (e.g. `import * as pipelines from 'aws-cdk-lib/pipelines'`).
- [ ] **Pipeline stack:** Create `lib/pipeline-stack.ts`. Define `CodePipeline` with GitHub source (CodeStar Connection), repo owner from stack prop or `cdk.json` context, repo **health-analytics-cloudviewer**, branch **main**.
- [ ] **Build stage:** Add `ShellStep`: `npm ci`, `npm run build`, `npx cdk synth`. CodeBuild image with Node 20 (e.g. `STANDARD_7_0`). Output `cdk.out` for deploy stage.
- [ ] **Deploy stage:** Add stage that deploys `CloudViewerStack` via `pipeline.addStage()`.
- [ ] **App entrypoint:** In `bin/app.ts`, instantiate `CloudViewerStack` and `PipelineStack`; pipeline deploys the app stack.

---

## Phase 3: Wire up and verify

- [ ] **Repo and branch:** Confirm the GitHub repo linked in the connection is the one used; pipeline tracks **main**. Push all app and pipeline code to **main**.
- [ ] **Pipeline run:** Trigger a run (push or “Release change”). Confirm Source, Build (`npm ci`, build, `cdk synth`), and Deploy succeed.
- [ ] **End-to-end test:** Open CloudFront URL from stack outputs. Test Browse + Upload. Confirm object in bucket `health-analytics-cloudviewer-<accountId>` under `uploads/userdata/pdftestresults/` with key format `<userid>-<uuid>-<filename>`.
- [ ] **Lint/test in pipeline:** Add a build step (e.g. `npm run lint`, `npm test`) so the pipeline fails on regressions before deploy. Add scripts to `package.json` if needed.

---

## Completion

When all Phase 2 and Phase 3 checkboxes are done, the execution plan is complete. “Must fix later” items remain in [PROPOSAL.md](PROPOSAL.md#must-fix-later).
