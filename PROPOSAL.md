# CloudViewer – Serverless upload app (proposal)

Build piece by piece. All infrastructure and app code in **AWS CDK** and **TypeScript**.

---

## First component: file upload website

- **Simple website**: one page with a **Browse** button (file picker) and an **Upload** button.
- **Behavior**: user selects a file → clicks Upload → file is stored in **one S3 bucket** (all uploads in the same bucket).

---

## Approach: presigned URL uploads

Use **presigned S3 URLs** so the browser uploads **directly to S3**. The backend only issues a URL; it never receives the file. That keeps things serverless, avoids Lambda payload/size limits, and is straightforward to implement.

**Flow:**

1. User selects a file (Browse) and clicks Upload.
2. Frontend calls our API with the chosen filename (and optionally content-type).
3. A **Lambda** returns a short-lived **presigned PUT URL** (and the S3 object key).
4. Frontend **PUTs the file to that URL** (browser → S3 directly).

---

## Components (CDK)

| Component        | Role |
|-----------------|------|
| **S3 bucket**   | Holds all uploaded files; **CORS** configured so the browser can PUT to it. |
| **Lambda**      | Single function: given filename (and optional content-type), returns a presigned URL. |
| **API Gateway** | One route (e.g. `POST /upload-url`) that invokes the Lambda. |
| **Static site** | One HTML page (Browse + Upload) served from **S3 + CloudFront** (HTTPS from day one). |

All new files go to the **same bucket**. Object key pattern: **`userdata/pdftestresults/<userid>-<uuid>-<filename>`** — see [Object keys](#object-keys) below.

### CORS (why we need it)

**CORS** (Cross-Origin Resource Sharing) is a browser security rule: it limits which *other origins* (other sites) can be called from JavaScript.

- An **origin** is scheme + host + port (e.g. `https://myapp.example.com` or `http://localhost:8080`).
- Our page is served from one origin (e.g. CloudFront); the upload is a `PUT` from the browser **directly to S3** (a different origin). That’s a *cross-origin* request.
- By default the browser blocks such requests unless the **server** (here, S3) explicitly allows our origin via CORS headers.

So we configure **CORS on the S3 bucket** to say: “allow requests from our website’s origin (and the methods/headers needed for upload).” Without that, the browser would block the upload and the Upload button would fail.

**Summary:** CORS is how the bucket tells the browser “requests from this website are allowed.” We need it so the Upload button can send the file straight to S3 from the page.

---

## Build order (piece by piece)

1. **CDK app + upload bucket**  
   - Initialize CDK app in TypeScript in this repo.  
   - Define one stack that creates the **S3 bucket** for uploads and sets **CORS** for the browser.

2. **Presigned-URL Lambda + API**  
   - Add a **Lambda** (Node/TypeScript) that generates a presigned PUT URL for a given filename.  
   - Add **API Gateway** (HTTP or REST) with one endpoint that calls this Lambda.  
   - Pass bucket name (and region) into the Lambda via environment or config.

3. **Simple website**  
   - Add a minimal **HTML + JS** page: file input (Browse), Upload button, call API for presigned URL, then `fetch` PUT to S3.  
   - Serve it via **S3 + CloudFront** from the start (HTTPS; custom domain possible later). Configure the frontend to use the API URL.

4. **Deploy and test**  
   - Run `cdk deploy`, open the site, choose a file, Upload, and confirm the object appears in the bucket.

---

## Repo layout

```
CloudViewer.project/
├── bin/
│   └── app.ts
├── lib/
│   └── upload-stack.ts
├── lambda/
│   └── presign/
│       └── index.ts
├── website/
│   └── index.html
├── cdk.json
├── package.json
└── tsconfig.json
```

### Directories and files

| Path | Purpose |
|------|--------|
| **`bin/app.ts`** | CDK app entry point. Instantiates the stack(s) (e.g. `CloudViewerStack`) and passes them to `cdk.App`. This is what `cdk deploy` runs. |
| **`lib/`** | CDK stack and construct definitions (infrastructure-as-code). One stack per file for now; add more as the app grows. |
| **`lib/upload-stack.ts`** | Defines the upload component: S3 bucket (with CORS), Lambda (presign), API Gateway (`/uploaded`), and static website (S3 + CloudFront). |
| **`lambda/`** | Lambda function source code. Each subfolder is one function (or one bundle). |
| **`lambda/presign/`** | Presigned-URL Lambda: receives `{ "filename" }`, returns `{ "url", "key" }`. Built/bundled and deployed by CDK. |
| **`lambda/presign/index.ts`** | Handler for the presign function; implements the presigned URL logic and key format `userdata/pdftestresults/<userid>-<uuid>-<filename>`. |
| **`website/`** | Static frontend assets served by CloudFront (origin: S3). No build step for v1; plain HTML/JS/CSS. |
| **`website/index.html`** | Single-page UI: file picker (Browse), Upload button, call to `/uploaded`, then PUT file to S3 via presigned URL. |
| **`cdk.json`** | CDK CLI config: app command (e.g. `npx ts-node bin/app.ts`), context, and other CDK options. |
| **`package.json`** | Node dependencies (AWS CDK, TypeScript, etc.) and scripts (e.g. `build`, `cdk deploy`). |
| **`tsconfig.json`** | TypeScript config for the CDK app and Lambda (strictness, module target, paths). Lambda may use its own tsconfig if we bundle separately. |

### Conventions

- **Stacks** live in `lib/`; the app in `bin/app.ts` imports and instantiates them.
- **Lambdas** live under `lambda/<name>/`; each has a handler entry (e.g. `index.ts`) that CDK points the runtime at.
- **Static site** is all under `website/`; CDK deploys it to S3 and fronts it with CloudFront.
- Config at repo root: `cdk.json`, `package.json`, `tsconfig.json` apply to the CDK app; add `lambda/*/package.json` or build steps only if we need them.

---

## Decided

- **Stack scope**: **One stack for the whole application** (e.g. `CloudViewerStack`). The file-upload component lives in this stack. Keeps the first version simple; we can split into nested or separate stacks when we add more components.
- **Object keys**: Prefix **`userdata/pdftestresults/`**. Full key: **`userdata/pdftestresults/<userid>-<uuid>-<filename>`**
  - **userid**: Hardcoded UUID for now (same for all users until we add auth).
  - **uuid**: Unique per file (e.g. `crypto.randomUUID()` or equivalent when generating the presigned URL).
  - **filename**: Original filename from the client (sanitized as needed).
- **Website hosting**: **S3 + CloudFront** from the start (HTTPS; no S3-website-only phase).
- **Auth**: **None** for the first version; add API key or Cognito later if needed.
- **Stack name**: **`CloudViewerStack`** (one stack for the whole app).
- **Bucket name**: One S3 bucket with a globally unique name (e.g. `cloudviewer-uploads-<account-id>`). Object keys use the prefix **`userdata/pdftestresults/`** (the “path” is in the key, not the bucket name).
- **API path**: **`/uploaded`** — the frontend calls this endpoint to get a presigned URL. Use consistently in the website and in CDK.
- **API shape** (no content-type):
  - **Request**: `{ "filename": "report.pdf" }` — filename only; we do not send or use content-type.
  - **Response**: `{ "url": "https://...", "key": "userdata/pdftestresults/..." }` — presigned URL and the S3 object key.
- **CORS**: Allow **`*`** (any origin) for both S3 and API Gateway for now, so it works with auto-generated URLs. Restrict to CloudFront/custom origin when we add a domain — see [Must fix later](#must-fix-later).

---

## Must fix later

*Security concerns and other important items that must be addressed before production (or when moving beyond a proof-of-concept). Not feature TODOs — these are hardening and correctness items.*

- [ ] **CORS**: Restrict to our actual origin(s). Currently `*` allows any website to call our API and upload to S3. When we have a custom domain (or know the CloudFront URL), set S3 and API Gateway CORS to that origin only.
- [ ] **Authentication**: Add auth so only identified/authorized users can obtain presigned URLs and upload. Right now anyone who knows the API URL can upload.
- [ ] **User identity**: Replace the hardcoded `userid` in object keys with a real user identifier (e.g. from Cognito or another auth provider) so uploads are attributed correctly and access control can be enforced later.
- [ ] **Filename sanitization**: Validate and sanitize the client-provided filename before using it in the S3 key (e.g. prevent path traversal like `../../../etc/passwd`, strip or escape special characters). Ensure the key stays under `userdata/pdftestresults/<userid>-<uuid>-<safe-filename>`.
- [ ] **S3 bucket access**: Confirm the bucket (and objects) are not publicly readable unless intended. Presigned URLs are for write-only upload; ensure no public read policy is attached unless required.
- [ ] *(Add more as we go: rate limiting, logging/audit, etc.)*

---

## Open decisions / iteration points

*Keep this section updated as we go: when something is decided or implemented, move it to [Decided](#decided); when a new question or trade-off appears, add it here.*

*(None at the moment.)*

---

## Maintenance

- **Open decisions**: Update as we go — resolved items → move to **Decided**; new questions or trade-offs → add to **Open decisions**.
- **Must fix later**: Add items as we discover security or correctness concerns; remove or check off when fixed.
- Edit this file to refine the proposal; align implementation to the updated spec.
