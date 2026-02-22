/**
 * Pipeline stack: CodePipeline with GitHub source, synth (npm ci + cdk synth), and deploy stage.
 * Deploys the CloudViewer app stage only via the pipeline (no standalone app stack).
 */
import * as cdk from 'aws-cdk-lib';
import * as pipelines from 'aws-cdk-lib/pipelines';
import { Construct } from 'constructs';

export interface PipelineStackProps extends cdk.StackProps {
  /** Stage that contains CloudViewerStack; pipeline deploys this stage. */
  readonly cloudViewerStage: cdk.Stage;
}

export class PipelineStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: PipelineStackProps) {
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
      pipelineName: 'cloudviewer-pipeline',
    });

    pipeline.addStage(props.cloudViewerStage);
  }
}
