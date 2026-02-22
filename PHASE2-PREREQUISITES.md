# Phase 2: Prerequisites (steps you complete)

Complete these steps before or in parallel with the pipeline implementation. The **pipeline itself** is created by the steps in [PHASE2-PIPELINE-STEPS.md](PHASE2-PIPELINE-STEPS.md) (code: `lib/pipeline-stack.ts`, `bin/app.ts`). This doc covers what **you** do: AWS Console setup, bootstrap, and first deploy.

---

## 1. CodeStar Connection to GitHub

1. In **AWS Console** go to **Developer Tools → Connections** (or **CodePipeline → Connections**).
2. Click **Create connection**.
3. Choose **GitHub**; name it (e.g. `github-cloudviewer`). Click **Connect to GitHub**.
4. Authorize AWS in GitHub (if prompted); select the account/org that owns the repo.
5. After creation, wait until the connection status is **Available** (may take a minute). If it stays **Pending**, complete the GitHub authorization in the email or connector page.

**Required:** Repo **health-analytics-cloudviewer** and branch **main** must exist and be the ones you will use for the pipeline. The connection grants access to repos in the GitHub account you authorized.

**Configured in this project:** GitHub owner **joracine** and the CodeConnections ARN are set in `cdk.json` under `context` (`github:owner`, `github:connectionArn`) for the pipeline stack to use.

---

## 2. CDK bootstrap (once per account/region)

From the project root in PowerShell:

```powershell
npx cdk bootstrap
```

Use the same AWS account and region you use for `cdk deploy`. Only needed once per account/region.

---

## 3. GitHub repo and branch

- Ensure the GitHub repo **health-analytics-cloudviewer** exists and that you want the pipeline to deploy from branch **main**.
- Have your **GitHub username or org name** (repo owner) ready; the pipeline stack will need it (via `cdk.json` context or stack prop).
- Push all application code (and, after the agent adds it, the pipeline code) to **main** so the pipeline can build and deploy it.

---

## 4. Deploy the pipeline stack (after agent adds it)

After the pipeline stack is implemented and `bin/app.ts` is updated:

```powershell
npx cdk deploy PipelineStack --require-approval never
```

Resolve any errors (e.g. CodeStar Connection not **Available**, wrong repo name or owner). Confirm in the console that CodePipeline and the CodeBuild project are created.

---

## 5. First pipeline run

- Push a small change to **main**, or in **CodePipeline** use **Release change**.
- Confirm **Source** pulls from GitHub, **Build** runs `npm ci` and `npx cdk synth`, and **Deploy** updates the CloudViewer stack.

---

## Summary checklist

- [ ] CodeStar Connection created and status **Available**
- [ ] `npx cdk bootstrap` run for the target account/region
- [ ] Repo **health-analytics-cloudviewer** and branch **main** confirmed; repo owner known for pipeline config
- [ ] After pipeline code is in place: `npx cdk deploy PipelineStack` run successfully
- [ ] First pipeline run (push or Release change) completed and all stages succeeded
