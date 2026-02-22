# health-analytics-cloudviewer

Serverless file-upload app: static website (Browse + Upload), presigned S3 URLs, single bucket. See [DESIGN.md](DESIGN.md) for architecture and [PROPOSAL.md](PROPOSAL.md), [EXECUTION-PLAN.md](EXECUTION-PLAN.md) for build details.

## Deploy (PowerShell)

The app is deployed **only through the pipeline**. From the project root, with AWS CLI configured and CDK bootstrapped:

```powershell
cd "d:\Google Drive\Health\Analyses\CloudViewer.project"
npx cdk deploy DeploymentPipelineStack --require-approval never
```

First-time in an account/region, bootstrap first:

```powershell
npx cdk bootstrap
```

After the pipeline exists, push to **main** (or use “Release change” in CodePipeline) to build and deploy the app. Stack outputs (**WebsiteUrl**, **UploadApiUrl**) are on the **Prod** stage; use the CloudFront URL to open the upload page.
