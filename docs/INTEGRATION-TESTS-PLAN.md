# Integration test stage – plan & progress

Add a pipeline step between **Test** and **Prod** that runs integration tests against the deployed Test environment. After each run, the Test bucket’s upload prefix is cleared so the next run is repeatable.

**Target pipeline:** `Source → Build (synth) → Deploy Test → Run integration tests → Deploy Prod`

**Clean state:** At start of each test run, delete all objects under `uploads/userdata/pdftestresults/` in the Test bucket (list + DeleteObjects). No stack teardown.

**IAM:** Integration step needs `s3:ListBucket`, `s3:GetObject`, `s3:DeleteObject` on the Test bucket’s upload prefix (for cleanup and round-trip assertion).

---

## Implementation checklist

### Phase 1: Stack output for pipeline

- [x] **1.1** Add `CfnOutput` for bucket name in `lib/HealthAnalyticsCloudViewer-stack.ts` (e.g. `MasterBucketName` = `this.masterBucket.bucketName`).

### Phase 2: Integration test code

- [x] **2.1** Add `tests/integration/` directory and ensure it’s included in the build/tsconfig if needed (or use plain JS / ts-node).
- [x] **2.2** Implement cleanup: function that lists objects under `UPLOAD_PREFIX` in `TEST_BUCKET` and deletes them in batches (use `@aws-sdk/client-s3`).
- [x] **2.3** Implement **Presign API – success**: POST `{ "filename": "integration-test.pdf" }` → assert 200, body has `url` and `key`, `key` contains upload prefix and filename.
- [x] **2.4** Implement **Presign API – validation**: POST `{}` or missing/invalid filename → assert 400; POST invalid JSON → assert 400.
- [x] **2.5** Implement **Upload round-trip**: get presigned URL → PUT small body to URL → use SDK to HeadObject/GetObject on `key` in Test bucket → assert exists and size/content.
- [x] **2.6** Add entry script (e.g. `run.ts` or `run.js`) that: reads `UPLOAD_API_URL`, `TEST_BUCKET`, `UPLOAD_PREFIX` from env; runs cleanup; runs tests in order; exits 0 on success, 1 on failure.
- [x] **2.7** Add `test:integration` script to `package.json` (e.g. `ts-node tests/integration/run.ts` or `node tests/integration/run.js`) and any dev deps needed.

### Phase 3: Pipeline wiring

- [ ] **3.1** In `lib/deployment-pipeline-stack.ts`, create an integration test step (e.g. `ShellStep` or `CodeBuildStep`) with commands: `npm ci`, `npm run test:integration`.
- [ ] **3.2** Wire Test stage stack outputs to the step: use `envFromCfnOutputs` to set `UPLOAD_API_URL` (and `TEST_BUCKET`, and optionally `UPLOAD_PREFIX` / `WEBSITE_URL`) from the Test stack’s outputs.
- [ ] **3.3** Add the step as a **post** step on the Test stage: `pipeline.addStage(props.testStage, { post: [ integrationTestStep ] })`.
- [ ] **3.4** Grant the integration test step’s role (or pipeline build role) S3 permissions: ListBucket, GetObject, DeleteObject on the Test bucket (or `health-analytics-cloudviewer-test-*`). Restrict DeleteObject to the upload prefix if possible.

### Phase 4: Verification & docs

- [ ] **4.1** Run integration tests locally (with env vars set to a deployed Test stack) and confirm they pass.
- [ ] **4.2** Run `npx cdk synth` and confirm the pipeline includes the post step and IAM.
- [ ] **4.3** Update README or pipeline docs to state that integration tests run after Test and before Prod, and that they clear the Test bucket’s upload prefix at the start of each run.

---

## Test cases reference (track implementation)

| # | Test | Status |
|---|------|--------|
| 5.1 | Presign API success: POST `{ "filename": "integration-test.pdf" }` → 200, body has `url` and `key` (key under upload prefix). | [x] |
| 5.2a | Presign validation: missing/empty filename → 400. | [x] |
| 5.2b | Presign validation: invalid JSON body → 400. | [x] |
| 5.3 | Upload round-trip: get presigned URL → PUT file → verify object in S3 (HeadObject/GetObject). | [x] |
| 5.4 | (Optional) Website GET returns 200; CORS headers. | [ ] |

---

## Env vars (set by pipeline from Test stack outputs)

| Var | Source | Purpose |
|-----|--------|---------|
| `UPLOAD_API_URL` | Test stack output (UploadApiUrl) | Base URL for POST /uploaded |
| `TEST_BUCKET` | Test stack output (MasterBucketName) | Bucket for cleanup and round-trip check |
| `UPLOAD_PREFIX` | Constant or output | `uploads/userdata/pdftestresults/` |
| `WEBSITE_URL` | (optional) Test stack output | For 5.4 |

---

## Out of scope

- Unit tests for the presign Lambda.
- E2E browser tests (Playwright).
- Testing Prod; only Test is exercised.
