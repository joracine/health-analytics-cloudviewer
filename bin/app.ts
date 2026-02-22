#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { DeploymentPipelineStack } from '../lib/deployment-pipeline-stack';
import { HealthAnalyticsCloudViewerStack } from '../lib/HealthAnalyticsCloudViewer-stack';

const app = new cdk.App();

// Explicit account/region so pipeline deploy never gets "Stack with id null" (CodeBuild has no CDK_DEFAULT_*)
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT ?? app.node.tryGetContext('deploy:account'),
  region: process.env.CDK_DEFAULT_REGION ?? app.node.tryGetContext('deploy:region'),
};
if (!env.account || !env.region) {
  throw new Error('env.account and env.region must be set (set CDK_DEFAULT_ACCOUNT/REGION or deploy:account/deploy:region in cdk.json context)');
}

const testStage = new cdk.Stage(app, 'Test', { env });
const prodStage = new cdk.Stage(app, 'Prod', { env });

const testStack = new HealthAnalyticsCloudViewerStack(testStage, 'HealthAnalyticsCloudViewerStack', {
  env,
  stackName: testStage.stageName + '-' + 'HealthAnalyticsCloudViewerStack',
});

// Explicit stackName to include stage name in the stack name
const prodStack = new HealthAnalyticsCloudViewerStack(prodStage, 'HealthAnalyticsCloudViewerStack', {
  env,
  stackName: prodStage.stageName + '-' + 'HealthAnalyticsCloudViewerStack',
});

new DeploymentPipelineStack(app, 'DeploymentPipelineStack', {
  env,
  testStage,
  prodStage,
});
