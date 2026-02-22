# Phase 2: Steps to create the pipeline (agent-executable)

The pipeline does **not** exist until these steps are done. The **agent** executes the code steps below. The **user** does prerequisites ([PHASE2-PREREQUISITES.md](PHASE2-PREREQUISITES.md)), then runs `npx cdk deploy PipelineStack`, then triggers the first pipeline run.

**Config (already set):** `cdk.json` context has `github:owner` = **joracine**, `github:connectionArn` = the CodeConnections ARN. Repo = **health-analytics-cloudviewer**, branch = **main**.

**Agreed:** Stage as prop (app creates stage and stack; pipeline receives stage). App is deployed **only** via the pipeline (no standalone `cdk deploy CloudViewerStack`).

---

## Step 1: Dependencies

**Action:** Confirm pipelines can be used; no package install needed.

- Check that `package.json` includes `aws-cdk-lib` (it does).
- The pipelines module is part of `aws-cdk-lib`; import as `import * as pipelines from 'aws-cdk-lib/pipelines'`. No new dependency.

**Clarification:** None. Proceed.

---

## Step 2: Create `lib/pipeline-stack.ts`

**Action:** Create a new file `lib/pipeline-stack.ts` that:

1. **Imports:** `cdk`, `constructs`, and `pipelines` from `aws-cdk-lib/pipelines`. Import `CloudViewerStack` from `./upload-stack` and the app’s `cdk.Stage` if needed (see Step 4).

2. **Read context:**  
   - Repo owner: `this.node.tryGetContext('github:owner')` (fallback `'joracine'`).  
   - Connection ARN: `this.node.tryGetContext('github:connectionArn')` (required; no fallback).

3. **Define the pipeline:**  
   - Create a `pipelines.CodePipeline` (e.g. construct id `'Pipeline'`).  
   - **Source:** `pipelines.CodePipelineSource.connection('owner/repo', 'main', { connectionArn })`  
     - Use repo string `'joracine/health-analytics-cloudviewer'` (or `'${owner}/health-analytics-cloudviewer'` from context).  
     - Branch `'main'`.  
     - `connectionArn` from context.

4. **Synth step:**  
   - `synth: new pipelines.ShellStep('Synth', { input: source, commands: ['npm ci', 'npx cdk synth'] })`.  
   - No `npm run build`. Output is `cdk.out` by default.

5. **Deploy stage:**  
   - The pipeline must deploy the app. Use `pipeline.addStage(stage)` where `stage` is a `cdk.Stage` that contains `CloudViewerStack`.  
   - So the pipeline stack must receive that stage (e.g. as a prop) or construct it. Prefer receiving the stage as a prop from `bin/app.ts` so the app owns the stage and stack (see Step 5).

6. **Export:** Export a class `PipelineStack extends cdk.Stack` that takes at least `scope`, `id`, and optional `props` including the app stage to deploy (e.g. `cloudViewerStage: cdk.Stage`).

**Resolved:** App entrypoint creates the stage and stack, passes stage into pipeline stack.

---

## Step 3: Build stage (synth) — already in Step 2

**Action:** No separate step. The synth step is the “build” that runs `npm ci` and `npx cdk synth` (see Step 2). CodeBuild image is chosen by the pipeline (defaults are fine). If synth fails in CodeBuild due to Lambda asset bundling, add `dockerEnabledForSynth: true` to `CodePipeline` props.

**Clarification:** None.

---

## Step 4: Deploy stage

**Action:** Implement the deploy stage in `lib/pipeline-stack.ts`.

- In the pipeline stack constructor, after creating the `CodePipeline`, call `pipeline.addStage(props.cloudViewerStage)` (or whatever the prop name for the app stage is).
- The stage must be a `cdk.Stage` that contains exactly the stack(s) to deploy (e.g. one `CloudViewerStack`). The pipeline will deploy all stacks in that stage.

**Clarification:** None if using the “stage as prop” pattern. Stack name for deployment will be the stage’s stack name (e.g. `Prod-CloudViewerStack` if the stage id is `Prod`). Confirm that is acceptable.

---

## Step 5: Wire `bin/app.ts`

**Action:** Update `bin/app.ts` so that:

1. Create the CDK app as today.
2. Create a **Stage** (e.g. id `'Prod'`) with the same `env` (account/region) you use for CloudViewerStack.
3. Instantiate **CloudViewerStack** inside that stage: `new CloudViewerStack(cloudViewerStage, 'CloudViewerStack', { env: { account, region } })`.
4. Instantiate **PipelineStack** at app scope: `new PipelineStack(app, 'PipelineStack', { env: { account, region }, cloudViewerStage })` (or the prop name you chose). Pass the same `env` and the stage so the pipeline can deploy it.
5. Do **not** instantiate `CloudViewerStack` at app scope anymore; it lives only inside the stage.

Result: `cdk deploy CloudViewerStack` no longer applies (stacks are under the stage). User deploys the app via the pipeline or by deploying the stage (e.g. `cdk deploy Prod`). For pipeline-only deploy, user runs `cdk deploy PipelineStack` and uses the pipeline to deploy the app.

**Resolved:** Deploy app only through the pipeline (no direct `cdk deploy CloudViewerStack`). Optionally `cdk deploy Prod` still deploys the stage.

---

## Step 6: Synthesize

**Action:** Run `npx cdk synth` and confirm:

- Both `CloudViewerStack` (under the stage) and `PipelineStack` appear.
- No synthesis errors.

**Clarification:** None. Agent runs this after Steps 1–5.

---

## Step 7: Deploy pipeline stack (user)

**Action:** User runs:  
`npx cdk deploy PipelineStack --require-approval never`  
(Not executed by the agent; documented for the user in [PHASE2-PREREQUISITES.md](PHASE2-PREREQUISITES.md).)

---

## Summary: agent execution order

1. **Step 1:** Confirm dependencies (no code change).
2. **Step 2:** Create `lib/pipeline-stack.ts` (CodePipeline, connection source, synth ShellStep, addStage with stage from props).
3. **Step 4:** Implement deploy stage (addStage) — done inside Step 2.
4. **Step 5:** Update `bin/app.ts` (create Stage, put CloudViewerStack in stage, create PipelineStack with stage prop).
5. **Step 6:** Run `npx cdk synth` and fix any errors.

**Implemented:** Pipeline stack and app entrypoint are in place. User deploys pipeline with `npx cdk deploy PipelineStack --require-approval never`, then triggers the pipeline to deploy the app.
