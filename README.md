# health-analytics-cloudviewer

Serverless file-upload app: static website (Browse + Upload), presigned S3 URLs, single bucket. See [DESIGN.md](DESIGN.md) for architecture and [PROPOSAL.md](PROPOSAL.md), [EXECUTION-PLAN.md](EXECUTION-PLAN.md) for build details.

## Deploy (PowerShell)

From the project root, with AWS CLI configured and CDK bootstrapped for the account/region:

```powershell
cd "d:\Google Drive\Health\Analyses\CloudViewer.project"
npx cdk deploy CloudViewerStack --require-approval never
```

First-time in an account/region, bootstrap first:

```powershell
npx cdk bootstrap
```

Stack outputs: **WebsiteUrl** (CloudFront) and **UploadApiUrl** (API base). Use the CloudFront URL to open the upload page.
