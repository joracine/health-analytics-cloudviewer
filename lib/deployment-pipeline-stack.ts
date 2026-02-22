/**
 * Deployment pipeline stack: CodePipeline with GitHub source, synth (npm ci + cdk synth), deploy Test,
 * run integration tests (post step), then deploy Prod.
 */
import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';

const UPLOAD_PREFIX = 'uploads/userdata/pdftestresults/';

export interface DeploymentPipelineStackProps extends cdk.StackProps {
  /** Stage that contains CloudViewerStack; pipeline deploys this stage. */
  readonly testStage: cdk.Stage;
  readonly prodStage: cdk.Stage;
}

export class DeploymentPipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DeploymentPipelineStackProps) {
    super(scope, id, props);

    const owner = this.node.tryGetContext('github:owner') as string | undefined ?? 'joracine';
    const connectionArn = this.node.tryGetContext('github:connectionArn') as string | undefined;
    if (!connectionArn) {
      throw new Error('github:connectionArn must be set in cdk.json context');
    }

    const source = pipelines.CodePipelineSource.connection(
      `${owner}/health-analytics-cloudviewer`,
      'main',
      { connectionArn }
    );

    const synth = new pipelines.ShellStep('Synth', {
      input: source,
      commands: [
        'npm ci',
        'npx cdk synth',
        'npx cdk ls', // show synthesized stacks (helps debug SelfMutate "no stacks match")
      ],
    });

    const pipeline = new pipelines.CodePipeline(this, 'Pipeline', {
      synth,
      pipelineName: 'health-analytics-cloudviewer-pipeline',
    });

    // Test stack outputs for integration test step (post step runs after Test stage deploy)
    const testStack = props.testStage.node.tryFindChild('HealthAnalyticsCloudViewerStack') as cdk.Stack | undefined;
    if (!testStack) {
      throw new Error('Test stage must contain HealthAnalyticsCloudViewerStack');
    }
    const uploadApiUrlOutput = testStack.node.tryFindChild('UploadApiUrl') as cdk.CfnOutput | undefined;
    const masterBucketNameOutput = testStack.node.tryFindChild('MasterBucketName') as cdk.CfnOutput | undefined;
    if (!uploadApiUrlOutput || !masterBucketNameOutput) {
      throw new Error('Test stack must have UploadApiUrl and MasterBucketName outputs');
    }

    const testBucketName = `health-analytics-cloudviewer-test-${this.account}`;
    const integrationTestStep = new pipelines.CodeBuildStep('IntegrationTests', {
      input: source,
      commands: ['npm ci', 'npm run test:integration'],
      envFromCfnOutputs: {
        UPLOAD_API_URL: uploadApiUrlOutput,
        TEST_BUCKET: masterBucketNameOutput,
      },
      rolePolicyStatements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:ListBucket'],
          resources: [`arn:aws:s3:::${testBucketName}`],
        }),
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:GetObject', 's3:DeleteObject'],
          resources: [`arn:aws:s3:::${testBucketName}/${UPLOAD_PREFIX}*`],
        }),
      ],
    });

    pipeline.addStage(props.testStage, {
      post: [integrationTestStep],
    });
    pipeline.addStage(props.prodStage);
  }
}
