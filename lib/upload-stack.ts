import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class CloudViewerStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Step 1.2: Upload bucket and CORS will be added here
  }
}
