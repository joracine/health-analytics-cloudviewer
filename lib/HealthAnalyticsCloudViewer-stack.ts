/**
 * CloudViewer upload stack: static site (CloudFront + S3), presign API, and upload bucket.
 * Flow: browser → POST /uploaded → Lambda returns presigned URL → browser PUTs file to S3.
 */
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { Construct } from 'constructs';

/** Key prefix for uploads in the single parent bucket. */
export const UPLOAD_KEY_PREFIX = 'uploads/userdata/pdftestresults/';

/** Key prefix for website assets in the same bucket (console "subfolder"). */
export const WEBSITE_KEY_PREFIX = 'website/';

export interface HealthAnalyticsCloudViewerStackProps extends cdk.StackProps {
  /** Stage name (e.g. Test, Prod); used in bucket name so each stage has its own bucket. */
  readonly stageName: string;
}

export class HealthAnalyticsCloudViewerStack extends cdk.Stack {
  /** Single parent bucket: uploads under UPLOAD_KEY_PREFIX, website under WEBSITE_KEY_PREFIX. */
  public readonly masterBucket: s3.Bucket;

  /** Returns presigned PUT URL for given filename. */
  public readonly presignFn: lambdaNodejs.NodejsFunction;

  /** POST /uploaded → presign Lambda. URL injected into website config.js. */
  public readonly httpApi: apigwv2.HttpApi;

  /** Serves website from master bucket prefix WEBSITE_KEY_PREFIX. */
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: HealthAnalyticsCloudViewerStackProps) {
    super(scope, id, props);

    // Permissions: bucket BLOCK_ALL + CORS for browser PUT; presign = PutObject (upload prefix only);
    // CloudFront = OAC GetObject; BucketDeployment = write website prefix; API invokes Lambda via integration.

    // --- Upload bucket + presign Lambda (stage name in bucket name so Test and Prod use different buckets) ---
    this.masterBucket = new s3.Bucket(this, 'MasterBucket', {
      bucketName: `health-analytics-cloudviewer-${props.stageName.toLowerCase()}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedOrigins: ['*'],
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedHeaders: ['*'],
        },
      ],
    });

    this.presignFn = new lambdaNodejs.NodejsFunction(this, 'PresignFn', {
      entry: path.join(__dirname, '..', 'lambda', 'presign', 'index.ts'),
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'handler',
      environment: {
        BUCKET_NAME: this.masterBucket.bucketName,
        REGION: this.region,
        KEY_PREFIX: UPLOAD_KEY_PREFIX,
      },
      bundling: {
        forceDockerBundling: false,
      },
    });
    // Presign Lambda: only allow generating PUT URLs for keys under UPLOAD_KEY_PREFIX
    this.masterBucket.grantPut(this.presignFn, `${UPLOAD_KEY_PREFIX}*`);

    // --- API: POST /uploaded → presign Lambda ---
    this.httpApi = new apigwv2.HttpApi(this, 'UploadApi', {
      apiName: 'health-analytics-cloudviewer-upload-api',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigwv2.CorsHttpMethod.POST, apigwv2.CorsHttpMethod.OPTIONS],
        allowHeaders: ['*'],
      },
    });
    this.httpApi.addRoutes({
      path: '/uploaded',
      methods: [apigwv2.HttpMethod.POST],
      integration: new HttpLambdaIntegration('PresignIntegration', this.presignFn),
    });

    new cdk.CfnOutput(this, 'UploadApiUrl', {
      value: this.httpApi.url ?? '',
      description: 'Upload API base URL (append /uploaded)',
      exportName: 'CloudViewerUploadApiUrl',
    });

    // --- CloudFront serves website from master bucket prefix WEBSITE_KEY_PREFIX ---
    this.distribution = new cloudfront.Distribution(this, 'WebsiteDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.masterBucket, {
          originPath: '/website',
        }),
      },
      defaultRootObject: 'index.html',
    });

    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [
        s3deploy.Source.asset(path.join(__dirname, '..', 'website')),
        s3deploy.Source.data(
          'config.js',
          `window.API_BASE_URL = '${this.httpApi.url ?? ''}';`
        ),
      ],
      destinationBucket: this.masterBucket,
      destinationKeyPrefix: WEBSITE_KEY_PREFIX,
      distribution: this.distribution,
      distributionPaths: ['/*'],
    });

    new cdk.CfnOutput(this, 'WebsiteUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'CloudFront URL of the upload website',
      exportName: 'CloudViewerWebsiteUrl',
    });
  }
}
