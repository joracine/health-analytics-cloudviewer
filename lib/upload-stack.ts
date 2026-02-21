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

/** Key prefix in upload bucket for upload objects. */
export const UPLOAD_KEY_PREFIX = 'uploads/userdata/pdftestresults/';

export class CloudViewerStack extends cdk.Stack {
  /** Upload bucket: uploads under uploads/userdata/pdftestresults/. */
  public readonly masterBucket: s3.Bucket;

  /** Website bucket (CloudFront origin); name cfn-website-bucket-<accountId>. */
  public readonly cfnWebsiteBucket: s3.Bucket;

  /** Presign Lambda: returns presigned PUT URL for uploads. */
  public readonly presignFn: lambdaNodejs.NodejsFunction;

  /** HTTP API (base URL for /uploaded); use apiUrl for website config. */
  public readonly httpApi: apigwv2.HttpApi;

  /** CloudFront distribution for the website (origin = cfn-website-bucket). */
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.masterBucket = new s3.Bucket(this, 'MasterBucket', {
      bucketName: `health-analytics-cloudviewer-${this.account}`,
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
    this.masterBucket.grantPut(this.presignFn);

    this.cfnWebsiteBucket = new s3.Bucket(this, 'CfnWebsiteBucket', {
      bucketName: `cfn-website-bucket-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    this.httpApi = new apigwv2.HttpApi(this, 'UploadApi', {
      apiName: 'cloudviewer-upload-api',
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
      description: 'Base URL of the upload API (use with /uploaded)',
      exportName: 'CloudViewerUploadApiUrl',
    });

    this.distribution = new cloudfront.Distribution(this, 'WebsiteDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.cfnWebsiteBucket),
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
      destinationBucket: this.cfnWebsiteBucket,
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
