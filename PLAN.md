# CloudViewer – Build and deploy plan

Goal: build the application from [PROPOSAL.md](PROPOSAL.md), then add an **AWS CI/CD pipeline** so every change can be re-deployed easily. Use **CodePipeline**, **CodeBuild**, and related AWS services; define the pipeline in CDK so it’s all in code.

**Windows:** All commands in this plan can be run in **PowerShell** or **Command Prompt** from the project folder. Use backslashes or forward slashes in paths; CDK and npm work the same on Windows. See [PREREQUISITES.md](PREREQUISITES.md) for Windows-specific setup.

---

## Prerequisites

- **AWS account** with permissions to create IAM roles, S3, Lambda, API Gateway, CloudFront, CodePipeline, CodeBuild, and CodeStar Connections (for GitHub).
- **Node.js** (LTS) and **npm** (or yarn) locally for CDK and TypeScript.
- **AWS CLI** configured (`aws configure`) with credentials that can deploy to the target account/region.
- **GitHub** repo for the project. The pipeline will use it as the source; re-deploys run when you push.

---

## Pipeline overview (target state)

- **Source**: CodePipeline pulls from **GitHub** via **CodeStar Connection**.
- **Build**: CodeBuild runs in a container: `npm ci`, build TypeScript, run `cdk synth`. Output is the CloudFormation template plus assets (Lambda code, website files).
- **Deploy**: Pipeline deploys the synthesized stack(s) via CloudFormation (CDK under the hood). No manual `cdk deploy` needed after the pipeline is live.

We’ll define the pipeline itself in CDK (using **CDK Pipelines**, which creates the CodePipeline and CodeBuild project for us). One-time manual steps: initial app deploy (optional), then deploy the “pipeline stack”; after that, pushes to the repo trigger build and deploy.

---

## Phase 1: Build the application

Get the app working with a manual deploy first. The pipeline will later do the same steps in CodeBuild.

| Step | What to do |
|------|------------|
| **1.1** | Open PowerShell or Command Prompt in the project folder. Run: `cdk init app --language typescript`. Align folder names with [PROPOSAL.md](PROPOSAL.md) (e.g. `lib/`, `bin/`, `lambda/`, `website/`). |
| **1.2** | Create the upload S3 bucket and CORS in a stack (e.g. `lib/upload-stack.ts` or single stack in `lib/`). Bucket name per proposal (e.g. `cloudviewer-uploads-<account-id>`); object key prefix `userdata/pdftestresults/`. |
| **1.3** | Add presign Lambda under `lambda/presign/`: handler reads `filename` from body, returns `{ url, key }` with key `userdata/pdftestresults/<userid>-<uuid>-<filename>`. Wire bucket name (and region) via env. |
| **1.4** | Add API Gateway (HTTP or REST): one route `POST /uploaded` → presign Lambda. Enable CORS `*` for now. |
| **1.5** | Add static website: put `website/index.html` (Browse + Upload UI, call `/uploaded`, then PUT to presigned URL). In the stack, use S3 + CloudFront; CloudFront origin = website bucket; no custom domain. |
| **1.6** | Ensure the website’s JS uses the API Gateway URL (e.g. from a build-time or deploy-time placeholder that CDK replaces, or from a config file deployed with the site). |
| **1.7** | In the project folder run `npm run build`, then `cdk deploy` (or `cdk deploy CloudViewerStack`). Test: open the CloudFront URL from the stack output in your browser, select file, Upload, confirm object in S3 under `userdata/pdftestresults/`. |

After Phase 1 you have a working app and a codebase the pipeline can build and deploy.

---

## Phase 2: Add the pipeline (CodePipeline + CodeBuild)

Use **CDK Pipelines** (`aws-cdk-lib/pipelines`) so the pipeline is defined in code and uses CodePipeline and CodeBuild.

| Step | What to do |
|------|------------|
| **2.1** | Add dependency: `npm install aws-cdk-lib` (if not already) and ensure `pipelines` is available from `aws-cdk-lib`. |
| **2.2** | Create a **pipeline stack** (e.g. `lib/pipeline-stack.ts`): define a `CodePipeline` (or `pipelines.CodePipeline`) with a **source** stage. |
| **2.3** | **Source (GitHub)**: Create a **CodeStar Connection** to GitHub in the AWS Console (Developer Tools → Connections): connect your GitHub account and authorize the repo. In the pipeline stack, use the connection (e.g. `codestar_connections.SourceConnection` or CDK’s `pipelines` GitHub source) with your repo owner, repo name, and branch (e.g. `main`). Wire this source as the pipeline’s first stage. |
| **2.4** | **Build stage**: Add a **CodeBuild step** that runs: `npm ci`, `npm run build`, `npx cdk synth`. Use a build image that has Node (e.g. `standard:7` or a image with Node 20). Output the `cdk.out` directory (or the pipeline’s default artifact) so the deploy stage can use it. With CDK Pipelines, this is typically a `ShellStep` that runs those commands and produces `cdk.out`. |
| **2.5** | **Deploy stage**: Add a **stage** that deploys your application stack(s). In CDK Pipelines, you pass your app stack (e.g. `CloudViewerStack`) to the pipeline’s `addStage()`. The pipeline will deploy the synthesized CloudFormation template and assets (Lambda, website) in the same way `cdk deploy` would. |
| **2.6** | In `bin/app.ts`, instantiate both the **pipeline stack** and (if not created by the pipeline) the app stack. The pipeline stack should create the pipeline that, when run, will synth and deploy the app stack. Typical pattern: pipeline stack takes the “app” as a dependency and adds a stage that deploys the app stack. |
| **2.7** | **CDK bootstrap**: Run `cdk bootstrap` for the target account/region so the pipeline can upload assets and deploy. Use the same account/region the pipeline will use. |
| **2.8** | Deploy the pipeline stack once: `cdk deploy PipelineStack` (or whatever you named it). This creates the CodePipeline and CodeBuild project. Ensure the CodeStar Connection to GitHub is in “Available” state; if not, complete the GitHub authorization and re-run the pipeline. |

After Phase 2, every push to the source branch triggers: source → build (CodeBuild) → deploy (CloudFormation). Re-deploy after every change is “push and wait for the pipeline.”

---

## Phase 3: Wire up and verify

| Step | What to do |
|------|------------|
| **3.1** | Ensure the GitHub repo is the one linked in the CodeStar Connection and that the pipeline tracks the correct branch. Push all application and pipeline code to that branch. |
| **3.2** | Trigger a pipeline run (push a small change or use “Release change” in the CodePipeline console). Confirm the **Source** stage pulls the code, **Build** runs `npm ci`, build, and `cdk synth`, and **Deploy** updates the stack. |
| **3.3** | Open the CloudFront URL (from stack outputs), test Browse + Upload again. Confirm the deployed app matches the proposal (object key prefix, `/uploaded` API, etc.). |
| **3.4** | (Optional) Add a **test** or **lint** step in the build (e.g. `npm test`, `npm run lint`) so the pipeline fails on regressions before deploy. |

---

## Summary: what lives where

| Item | Where |
|------|--------|
| App stack (S3, Lambda, API Gateway, website) | `lib/upload-stack.ts` (or single stack in `lib/`) |
| Pipeline (CodePipeline + CodeBuild) | `lib/pipeline-stack.ts` (or `lib/cicd-stack.ts`) |
| Pipeline source | **GitHub** (CodeStar Connection) |
| Build commands | In pipeline: `npm ci`, `npm run build`, `npx cdk synth` |
| Deploy | Pipeline deploys synthesized stack via CloudFormation |

---

## Repo layout after adding the pipeline

```
CloudViewer.project/
├── bin/
│   └── app.ts                 # Instantiates PipelineStack and (if needed) app stack
├── lib/
│   ├── upload-stack.ts       # S3, Lambda, API Gateway, website
│   └── pipeline-stack.ts     # CodePipeline + CodeBuild, source → build → deploy
├── lambda/
│   └── presign/
│       └── index.ts
├── website/
│   └── index.html
├── cdk.json
├── package.json
└── tsconfig.json
```

---

## Must fix later (unchanged)

Security and hardening items remain as in [PROPOSAL.md](PROPOSAL.md#must-fix-later) (CORS restriction, auth, user identity, filename sanitization, S3 access). The pipeline does not change those; address them when moving beyond proof-of-concept.

---

*Execute Phase 1 first to get a working app; then Phase 2 to add the pipeline; then Phase 3 to verify end-to-end re-deploy.*
