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

- [ ] In `lib/upload-stack.ts`, add an S3 bucket. Bucket name: use a unique name (e.g. `cloudviewer-uploads-${accountId}` or `Bucket.generateUniqueName`).
- [ ] Add CORS to the bucket: allow `*` origin, methods `PUT` and `GET`, headers needed for presigned PUT (e.g. `*` or list them).
- [ ] Expose the bucket name (and optionally region) so the Lambda can be given it (e.g. store in a class property or pass to Lambda env).
- [ ] Run `npx cdk synth` and confirm the bucket and CORS appear in the template.

### 1.3 Presign Lambda

- [ ] Create `lambda/presign/index.ts` (or `index.js` if using JS). Handler: parse request body for `{ "filename": "..." }`, build key `userdata/pdftestresults/<hardcoded-userid>-<uuid>-<filename>`, generate presigned PUT URL for that key, return `{ "url", "key" }`. Use hardcoded user ID UUID and `crypto.randomUUID()` (or equivalent) for per-file UUID.
- [ ] Sanitize or restrict filename (e.g. no path traversal); keep key under `userdata/pdftestresults/`.
- [ ] In `lib/upload-stack.ts`, add a Lambda function: runtime Node 20 (or 18), handler pointing to `lambda/presign`, environment variables for bucket name and region. Grant the Lambda `s3:PutObject` (and read if needed) on the upload bucket.
- [ ] Run `npx cdk synth` and confirm the Lambda and its asset are present.

### 1.4 API Gateway (POST /uploaded)

- [ ] In `lib/upload-stack.ts`, add API Gateway (HTTP API or REST). Create one route: `POST /uploaded` (or `POST /uploaded` with proxy) that invokes the presign Lambda.
- [ ] Enable CORS on the API: allow `*` origin for now.
- [ ] Expose the API URL (e.g. `api.url` or stack output) so the website can be configured with it.
- [ ] Run `npx cdk synth` and confirm the API and integration are present.

### 1.5 Static website (S3 + CloudFront)

- [ ] Create `website/index.html`: file input (Browse), Upload button, script that calls `POST /uploaded` with `{ "filename": "<chosen file name>" }`, then PUTs the file to the returned presigned URL.
- [ ] In `lib/upload-stack.ts`, add an S3 bucket for website assets. Upload `website/index.html` (and any other assets) into it. Configure the bucket for static website hosting or as CloudFront origin (no public read policy if using CloudFront only).
- [ ] Add a CloudFront distribution: origin = website bucket, default behavior serve from origin. No custom domain. Optionally add an output for the distribution URL.
- [ ] Run `npx cdk synth` and confirm the website bucket, CloudFront distribution, and any Lambda/asset for deployment are present.

### 1.6 Wire API URL into website

- [ ] Ensure the website’s JavaScript uses the API base URL. Options: (A) CDK injects the API URL at deploy time (e.g. replace placeholder in `index.html` or emit a small `config.js`), or (B) website reads from a known stack output / config endpoint. Implement one approach.
- [ ] Ensure the API Gateway URL is passed (e.g. as stack output or build-time replacement) and the frontend uses it for `fetch('/uploaded', ...)` (or full URL if cross-origin).

### 1.7 Deploy and test

- [ ] Run `npm run build` (if applicable) and `npx cdk deploy CloudViewerStack` (or `npx cdk deploy`).
- [ ] From stack outputs, note the CloudFront URL (and API URL if output).
- [ ] Open CloudFront URL in browser: choose a file (Browse), click Upload. Confirm the file appears in the upload bucket under prefix `userdata/pdftestresults/` with key format `<userid>-<uuid>-<filename>`.

---

## Phase 2: Add the pipeline (CodePipeline + CodeBuild)

### 2.1 Dependencies

- [ ] Ensure `aws-cdk-lib` is in `package.json` (already there if Phase 1 used it). Confirm `pipelines` module is available from `aws-cdk-lib` (e.g. `import * as pipelines from 'aws-cdk-lib/pipelines'`).

### 2.2 Pipeline stack file

- [ ] Create `lib/pipeline-stack.ts`. Define a `CodePipeline` (from `aws-cdk-lib/pipelines`) with a source stage (placeholder or GitHub in 2.3).

### 2.3 Source (GitHub)

- [ ] Document or ensure user has created a CodeStar Connection to GitHub (AWS Console → Developer Tools → Connections) for repo `health-analytics-cloudviewer` and branch `main`.
- [ ] In the pipeline stack, add source using the connection: `codestar_connections.SourceConnection` or equivalent, with repo owner, repo name `health-analytics-cloudviewer`, branch `main`. Wire as the pipeline’s first stage.

### 2.4 Build stage

- [ ] Add a build step (e.g. `ShellStep`) that runs: `npm ci`, `npm run build`, `npx cdk synth`. Use a CodeBuild image with Node 20 (e.g. `standard:7` or `aws/codebuild/standard:7`). Output `cdk.out` as the primary output artifact for the deploy stage.

### 2.5 Deploy stage

- [ ] Add a stage to the pipeline that deploys the application stack (`CloudViewerStack`). Use the pipeline’s `addStage()` (or equivalent) with the app stack. Ensure the synth output from 2.4 is used as the source for CloudFormation deploy.

### 2.6 App entrypoint

- [ ] In `bin/app.ts`, instantiate the pipeline stack (e.g. `PipelineStack`) in addition to or instead of directly instantiating `CloudViewerStack` (the pipeline will deploy the app stack). Ensure the pipeline stack receives the app stack or can reference it for the deploy stage.

### 2.7 Bootstrap

- [ ] Run `npx cdk bootstrap` for the target account/region (user or agent). Document that this must be done once per account/region.

### 2.8 Deploy pipeline

- [ ] Run `npx cdk deploy PipelineStack` (or the chosen pipeline stack name). Resolve any errors (e.g. CodeStar Connection not “Available”). Confirm CodePipeline and CodeBuild are created.

---

## Phase 3: Wire up and verify

### 3.1 Repo and branch

- [ ] Confirm the GitHub repo `health-analytics-cloudviewer` is the one linked in the CodeStar Connection and the pipeline tracks the correct branch (`main`). Push all application and pipeline code to that branch.

### 3.2 Pipeline run

- [ ] Trigger a pipeline run (push a small change or “Release change” in console). Confirm Source stage succeeds, Build runs `npm ci`, `npm run build`, `npx cdk synth`, and Deploy updates the stack.

### 3.3 End-to-end test

- [ ] Open the CloudFront URL from stack outputs. Test Browse + Upload again. Confirm object key prefix `userdata/pdftestresults/` and correct key format.

### 3.4 (Optional) Lint/test in pipeline

- [ ] Add a step in the build (e.g. `npm run lint`, `npm test`) so the pipeline fails on regressions before deploy.

---

## Completion

When all Phase 1–3 checkboxes are done, the execution plan is complete. “Must fix later” items remain in [PROPOSAL.md](PROPOSAL.md#must-fix-later).
