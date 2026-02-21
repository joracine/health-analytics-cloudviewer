# Phase 1: Build the application — complete steps

Record of the steps completed to build and deploy the CloudViewer application. Reference: [EXECUTION-PLAN.md](EXECUTION-PLAN.md), [DESIGN.md](DESIGN.md).

**Resulting architecture:** One S3 bucket `health-analytics-cloudviewer-<accountId>`. Uploads under `uploads/userdata/pdftestresults/`; website under `website/`. CloudFront serves from same bucket (origin path `/website`). Presign Lambda has `s3:PutObject` restricted to the upload prefix only.

---

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

- [x] In `lib/upload-stack.ts`, add a single S3 bucket (parent bucket). Bucket name: `health-analytics-cloudviewer-${this.account}`.
- [x] Set `blockPublicAccess: BLOCK_ALL`. Add CORS: allow `*` origin, methods `PUT` and `GET`, allowed headers `*` (for browser uploads via presigned URL).
- [x] Expose the bucket name and region to the presign Lambda via env; use key prefix `uploads/userdata/pdftestresults/` for upload objects.
- [x] Run `npx cdk synth` and confirm the bucket and CORS appear in the template.

### 1.3 Presign Lambda

- [x] Create `lambda/presign/index.ts`. Use CDK `NodejsFunction` so it is built and bundled from TypeScript. Handler: parse request body for `{ "filename": "..." }`, build key `uploads/userdata/pdftestresults/<hardcoded-userid>-<uuid>-<filename>` (KEY_PREFIX from env), generate presigned PUT URL for that key, return `{ "url", "key" }`. Use hardcoded user ID UUID and `crypto.randomUUID()` for per-file UUID.
- [x] Sanitize filename (no path traversal); keep key under the upload prefix.
- [x] In `lib/upload-stack.ts`, add the Lambda: runtime Node 20, `NodejsFunction` pointing at `lambda/presign`, environment variables for bucket name, region, and KEY_PREFIX. Grant the Lambda `s3:PutObject` restricted to the upload key prefix only (e.g. `uploads/userdata/pdftestresults/*`).
- [x] Run `npx cdk synth` and confirm the Lambda and its asset are present.

### 1.4 API Gateway (POST /uploaded)

- [x] In `lib/upload-stack.ts`, add an HTTP API (apigatewayv2). Create exactly one route: `POST /uploaded` that invokes the presign Lambda.
- [x] Enable CORS on the API: allow `*` origin for now.
- [x] Expose the API URL (stack output or for config.js) so the website can use it.
- [x] Run `npx cdk synth` and confirm the API and integration are present.

### 1.5 Static website (S3 + CloudFront)

- [x] Create `website/index.html`: file input (Browse), Upload button, script that calls the API at full URL with `{ "filename": "<chosen file name>" }`, then PUTs the file to the returned presigned URL.
- [x] Use the same parent bucket (`health-analytics-cloudviewer-<accountId>`). Deploy website assets (and config.js in 1.6) under key prefix `website/` via `BucketDeployment` with `destinationKeyPrefix: 'website/'`. CloudFront origin = same bucket with origin path `/website`; use Origin Access Control (OAC). No public read on the bucket.
- [x] Add a CloudFront distribution: origin = parent bucket with origin path `/website` (OAC), default root object `index.html`. No custom domain. Add a stack output for the distribution URL.
- [x] Run `npx cdk synth` and confirm the bucket, CloudFront distribution, and website deployment are present.

### 1.6 Wire API URL into website

- [x] At deploy time, CDK generates a small `config.js` (e.g. `window.API_BASE_URL = '<API URL>'`) via `Source.data()` and deploys it with the website assets under the `website/` prefix.
- [x] In `website/index.html`, load `config.js` and use the full API URL for the presign call: `fetch(\`${API_BASE_URL}/uploaded\`, ...)`.

### 1.7 Deploy and test

- [x] Run `npx cdk deploy CloudViewerStack` (PowerShell: from project root, `npx cdk deploy CloudViewerStack --require-approval never`). Bootstrap first if needed: `npx cdk bootstrap`.
- [x] From stack outputs, note the CloudFront URL (WebsiteUrl) and API URL (UploadApiUrl).
- [ ] Open CloudFront URL in browser: choose a file (Browse), click Upload. Confirm the file appears in the bucket `health-analytics-cloudviewer-<accountId>` under prefix `uploads/userdata/pdftestresults/` with key format `<userid>-<uuid>-<filename>`.
