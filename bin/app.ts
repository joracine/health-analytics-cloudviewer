#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CloudViewerStack } from '../lib/upload-stack';

const app = new cdk.App();
new CloudViewerStack(app, 'CloudViewerStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
