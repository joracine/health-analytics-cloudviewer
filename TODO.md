# CloudViewer – Todo list

**Source:** Populated from [EXECUTION-PLAN.md](EXECUTION-PLAN.md), [PLAN.md](PLAN.md), [PROPOSAL.md](PROPOSAL.md). Update checkboxes as work is completed.

---

## Phase 1: Build the application

### 1.1 CDK app (TypeScript)
- [x] Ensure `package.json`, `cdk.json`, `tsconfig.json`, `bin/app.ts`, `lib/upload-stack.ts` exist.
- [x] Ensure `lambda/` and `website/` directories exist.
- [x] Run `npm install` and `npx cdk synth` successfully.

### 1.2 Upload S3 bucket and CORS
- [x] Add S3 bucket `cloudviewer-uploads-${account}` with CORS (PUT, GET, headers `*`).
- [x] Expose bucket/region for presign Lambda.

### 1.3 Presign Lambda
- [x] Create `lambda/presign/index.ts` (presigned PUT URL, key `userdata/pdftestresults/<userid>-<uuid>-<filename>`).
- [x] Sanitize filename; grant Lambda `s3:PutObject` on upload bucket.

### 1.4 API Gateway (POST /uploaded)
- [x] Add HTTP API with `POST /uploaded` → presign Lambda, CORS `*`.
- [x] Expose API URL for website config.

### 1.5 Static website (S3 + CloudFront)
- [x] Create `website/index.html` (Browse + Upload, call API then PUT to presigned URL).
- [x] Add website S3 bucket (OAC, no public read), CloudFront distribution, stack output for URL.
- [x] Deploy website assets via BucketDeployment.

### 1.6 Wire API URL into website
- [x] Generate `config.js` at deploy time with `window.API_BASE_URL`.
- [x] Load `config.js` in `index.html` and use it for `/uploaded` fetch.

### 1.7 Deploy and test
- [x] Run `npx cdk deploy CloudViewerStack` and note CloudFront + API URLs.
- [ ] **Manual test:** Open CloudFront URL, Browse + Upload, confirm object in S3 under `userdata/pdftestresults/` with key format `<userid>-<uuid>-<filename>`.

### 1.8 Limit upload to PDF files
- [ ] Restrict uploads to PDF only: presign Lambda rejects non-PDF filenames (e.g. require `.pdf` extension).
- [ ] Optionally: website file input `accept=".pdf"` and/or client-side validation before calling API.

---

## Phase 2: Add the pipeline (CodePipeline + CodeBuild)

### 2.1 Dependencies
- [ ] Confirm `aws-cdk-lib` and pipelines module available (`aws-cdk-lib/pipelines`).

### 2.2 Pipeline stack
- [ ] Create `lib/pipeline-stack.ts` with `CodePipeline` and source stage.

### 2.3 Source (GitHub)
- [ ] Document/create CodeStar Connection to GitHub for repo `health-analytics-cloudviewer`, branch `main`.
- [ ] Add GitHub source in pipeline (repo owner from stack prop or `cdk.json` context).

### 2.4 Build stage
- [ ] Add `ShellStep`: `npm ci`, `npx cdk synth`. CodeBuild image with Node 20 (e.g. `STANDARD_7_0`). Output `cdk.out`. (No `npm run build`—CDK uses ts-node.)

### 2.5 Deploy stage
- [ ] Add stage that deploys `CloudViewerStack` via pipeline `addStage()`.

### 2.6 App entrypoint
- [ ] In `bin/app.ts`, instantiate `CloudViewerStack` and `PipelineStack`; pipeline deploys app stack.

### 2.7 Bootstrap
- [ ] Run `npx cdk bootstrap` for target account/region (document one-time per account/region).

### 2.8 Deploy pipeline
- [ ] Run `npx cdk deploy PipelineStack`; confirm CodePipeline and CodeBuild created; resolve CodeStar Connection if needed.

---

## Phase 3: Wire up and verify

### 3.1 Repo and branch
- [ ] Confirm GitHub repo and branch linked; push all app and pipeline code to `main`.

### 3.2 Pipeline run
- [ ] Trigger pipeline (push or “Release change”); confirm Source → Build → Deploy succeed.

### 3.3 End-to-end test
- [ ] Open CloudFront URL from outputs; test Browse + Upload; confirm key prefix and format in S3.

### 3.4 Lint/test in pipeline
- [ ] Add build step: `npm run lint`, `npm test` (add scripts to `package.json` if missing). Pipeline fails on regressions before deploy.

---

## Integration tests and pipeline

### Integration tests
- [ ] Add integration tests (e.g. call presign API and/or upload flow against deployed or local stack).
- [ ] Choose test runner and location (e.g. `tests/` or `integration/`, Jest or similar).
- [ ] Tests cover: presign returns valid URL; upload to presigned URL succeeds; non-PDF rejected when 1.8 is done.

### Integration test step in pipeline
- [ ] Add an integration-test step in the pipeline (e.g. after synth, before or after deploy).
- [ ] Step runs integration test suite; pipeline fails if tests fail. Consider running against deployed stack (post-deploy) or a dedicated test stage.

---

## Completion

When all items above are checked, the todo list is complete. “Must fix later” items (CORS restriction, auth, user identity, etc.) remain in [PROPOSAL.md](PROPOSAL.md#must-fix-later).
