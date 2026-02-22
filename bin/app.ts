#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { PipelineStack } from '../lib/pipeline-stack';
import { CloudViewerStack } from '../lib/upload-stack';

const app = new cdk.App();

// Use explicit account/region so pipeline deploy never gets "Stack with id null" (CodeBuild often has no CDK_DEFAULT_*)
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT ?? app.node.tryGetContext('deploy:account'),
  region: process.env.CDK_DEFAULT_REGION ?? app.node.tryGetContext('deploy:region'),
};

const cloudViewerStage = new cdk.Stage(app, 'Prod', { env });
new CloudViewerStack(cloudViewerStage, 'CloudViewerStack');

new PipelineStack(app, 'PipelineStack', {
  env,
  cloudViewerStage,
});
