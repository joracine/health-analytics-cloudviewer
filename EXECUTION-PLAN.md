# CloudViewer – Execution plan

**Purpose:** Step-by-step checklist for building and deploying the app and pipeline. Update checkboxes as work is completed. Reference: [PROPOSAL.md](PROPOSAL.md), [PLAN.md](PLAN.md).

**Conventions:** Do steps in order within each phase. Mark `[x]` when a step is done. Use project root: `d:\Google Drive\Health\Analyses\CloudViewer.project` (or repo root).

---

## Phase 1: Build the application

### 1.1 CDK app (TypeScript)

- [x] Ensure `package.json` exists with CDK deps (`aws-cdk-lib`, `constructs`, `aws-cdk`, `typescript`).
- [x] Ensure `cdk.json` exists with `"app": "npx ts-node bin/app.ts"`.
- [x] Ensure `tsconfig.json` exists and compiles `bin/` and `lib/` (has `"include": ["bin/**/*", "lib/**/*"]`).
- [x] Ensure `bin/app.ts` exists and instantiates `CloudViewerStack`.
- [x] Ensure `lib/upload-stack.ts` exists with empty `CloudViewerStack`.
- [x] Ensure `lambda/` and `website/` directories exist (created; use when adding Lambda and website).
- [x] Run `npm install` in project root (run in terminal where Node/npm are on PATH).
- [x] Run `npx cdk synth` and confirm it succeeds.

### 1.2 Upload S3 bucket and CORS

- [ ] In `lib/upload-stack.ts`, add an S3 bucket. Bucket name: `cloudviewer-uploads-${this.account}`.
- [ ] Add CORS to the bucket: allow `*` origin, methods `PUT` and `GET`, allowed headers `*`.
- [ ] Expose the bucket name (and region) as a class property or Lambda env so the presign Lambda can use it.
- [ ] Run `npx cdk synth` and confirm the bucket and CORS appear in the template.

### 1.3 Presign Lambda

- [ ] Create `lambda/presign/index.ts`. Use CDK `NodejsFunction` so it is built and bundled from TypeScript. Handler: parse request body for `{ "filename": "..." }`, build key `userdata/pdftestresults/<hardcoded-userid>-<uuid>-<filename>`, generate presigned PUT URL for that key, return `{ "url", "key" }`. Use hardcoded user ID UUID and `crypto.randomUUID()` for per-file UUID.
- [ ] Sanitize filename (no path traversal); keep key under `userdata/pdftestresults/`.
- [ ] In `lib/upload-stack.ts`, add the Lambda: runtime Node 20, `NodejsFunction` pointing at `lambda/presign`, environment variables for bucket name and region. Grant the Lambda `s3:PutObject` only on the upload bucket.
- [ ] Run `npx cdk synth` and confirm the Lambda and its asset are present.

### 1.4 API Gateway (POST /uploaded)

- [ ] In `lib/upload-stack.ts`, add an HTTP API (apigatewayv2). Create exactly one route: `POST /uploaded` that invokes the presign Lambda.
- [ ] Enable CORS on the API: allow `*` origin for now.
- [ ] Expose the API URL (stack output or for config.js) so the website can use it.
- [ ] Run `npx cdk synth` and confirm the API and integration are present.

### 1.5 Static website (S3 + CloudFront)

- [ ] Create `website/index.html`: file input (Browse), Upload button, script that calls the API at full URL with `{ "filename": "<chosen file name>" }`, then PUTs the file to the returned presigned URL.
- [ ] In `lib/upload-stack.ts`, add an S3 bucket for website assets. Upload `website/index.html` (and generated config.js in 1.6) into it. CloudFront origin only: use Origin Access Control (OAC); no public read on the bucket.
- [ ] Add a CloudFront distribution: origin = website bucket (OAC), default behavior serve from origin. No custom domain. Add a stack output for the distribution URL.
- [ ] Run `npx cdk synth` and confirm the website bucket, CloudFront distribution, and assets are present.

### 1.6 Wire API URL into website

- [ ] At deploy time, CDK generates a small `config.js` (e.g. `window.API_BASE_URL = '<API URL>'`) and deploys it with the website assets.
- [ ] In `website/index.html`, load `config.js` and use the full API URL for the presign call: `fetch(\`${API_BASE_URL}/uploaded\`, ...)`.

### 1.7 Deploy and test

- [ ] Run `npx cdk deploy CloudViewerStack` (no need to run `npm run build` first; CDK runs the app via ts-node).
- [ ] From stack outputs, note the CloudFront URL and API URL.
- [ ] Open CloudFront URL in browser: choose a file (Browse), click Upload. Confirm the file appears in the upload bucket under prefix `userdata/pdftestresults/` with key format `<userid>-<uuid>-<filename>`.

---

## Phase 2: Add the pipeline (CodePipeline + CodeBuild)

### 2.1 Dependencies

- [ ] Ensure `aws-cdk-lib` is in `package.json` (already there if Phase 1 used it). Confirm `pipelines` module is available from `aws-cdk-lib` (e.g. `import * as pipelines from 'aws-cdk-lib/pipelines'`).

### 2.2 Pipeline stack file

- [ ] Create `lib/pipeline-stack.ts`. Define a `CodePipeline` (from `aws-cdk-lib/pipelines`) with a source stage (placeholder or GitHub in 2.3).

### 2.3 Source (GitHub)

- [ ] Document or ensure user has created a CodeStar Connection to GitHub (AWS Console → Developer Tools → Connections) for repo `health-analytics-cloudviewer` and branch `main`.
- [ ] In the pipeline stack, add source using the connection. Repo owner: from stack prop or `cdk.json` context (user sets their GitHub username/org). Repo name: `health-analytics-cloudviewer`. Branch: `main`. Wire as the pipeline’s first stage.

### 2.4 Build stage

- [ ] Add a `ShellStep` that runs: `npm ci`, `npm run build`, `npx cdk synth`. Use CodeBuild image `LinuxBuildImage.STANDARD_7_0` (Node 20). Output `cdk.out` as the primary output artifact for the deploy stage.

### 2.5 Deploy stage

- [ ] Add a stage to the pipeline that deploys the application stack (`CloudViewerStack`). Use the pipeline’s `addStage()` with the app stack. The synth output from 2.4 is the source for CloudFormation deploy.

### 2.6 App entrypoint

- [ ] In `bin/app.ts`, instantiate both `CloudViewerStack` and `PipelineStack`. Pass the app stack (or a stage wrapping it) into `PipelineStack` so the pipeline can call `pipeline.addStage(...)` with it. The pipeline deploys the app stack; both stacks are created in `bin/app.ts`.

### 2.7 Bootstrap

- [ ] Run `npx cdk bootstrap` for the target account/region. Document that this must be done once per account/region.

### 2.8 Deploy pipeline

- [ ] Run `npx cdk deploy PipelineStack`. Resolve any errors (e.g. CodeStar Connection not “Available”). Confirm CodePipeline and CodeBuild are created.

---

## Phase 3: Wire up and verify

### 3.1 Repo and branch

- [ ] Confirm the GitHub repo `health-analytics-cloudviewer` is the one linked in the CodeStar Connection and the pipeline tracks the correct branch (`main`). Push all application and pipeline code to that branch.

### 3.2 Pipeline run

- [ ] Trigger a pipeline run (push a small change or “Release change” in console). Confirm Source stage succeeds, Build runs `npm ci`, `npm run build`, `npx cdk synth`, and Deploy updates the stack.

### 3.3 End-to-end test

- [ ] Open the CloudFront URL from stack outputs. Test Browse + Upload again. Confirm object key prefix `userdata/pdftestresults/` and correct key format.

### 3.4 Lint/test in pipeline

- [ ] Add a step in the build (e.g. `npm run lint`, `npm test`) so the pipeline fails on regressions before deploy. Add lint/test scripts to `package.json` if not present.

---

## Completion

When all Phase 1–3 checkboxes are done, the execution plan is complete. “Must fix later” items remain in [PROPOSAL.md](PROPOSAL.md#must-fix-later).
