import * as cdk from 'aws-cdk-lib';
import * as AwsStaticSite from '../lib/aws-static-site-stack';
import { AdvancedTemplate, CloudFrontDistribution, S3Bucket, RecordType } from 'aws-cdk-assert';
import * as route53 from 'aws-cdk-lib/aws-route53';

const BASE_DOMAIN = "example.com";
const SUB_DOMAIN = "sub";
const DOMAIN = `${SUB_DOMAIN}.${BASE_DOMAIN}`;
const WWW_DOMAIN = `www.${DOMAIN}`;
const REGION = 'eu-central-1';

function generateTemplateOfStack(props: Partial<AwsStaticSite.StaticSiteStackProps>): AdvancedTemplate {
  const app = new cdk.App();
  const stack = new AwsStaticSite.AwsStaticSiteStack(app, 'MyTestStack', {
    env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: REGION },
    baseDomain: BASE_DOMAIN,
    domain: DOMAIN,
    gitHubAccessTokenSecretName: 'token',
    gitHubOwner: 'owner',
    gitHubRepo: 'repo',
    ...(props || {}),
  });
  return AdvancedTemplate.fromStack(stack);
}

describe('AwsStaticSiteStack', () => {
  let template: AdvancedTemplate;

  beforeAll(() => {
    route53.HostedZone.fromLookup = jest.fn().mockReturnValue({
      hostedZoneId: 'TEST',
      zoneName: BASE_DOMAIN,
      hostedZoneArn: 'arn:aws:route53:::hostedzone/TEST',
    });
  });

  describe("+ WWW, + CloudFront", () => {
    let baseBucket: S3Bucket;
    let wwwBucket: S3Bucket;
    let distribution: CloudFrontDistribution;

    beforeAll(() => {
      template = generateTemplateOfStack({
        addWww: true,
        addCloudFront: true,
        cloudFrontWafAclArnSSMUri: 'URI',
      });

      baseBucket = template.s3Bucket()
        .withBucketName(DOMAIN)
        .withWebsiteHosting()
        .withCorsEnabled()
        .withDeletePolicy();
      wwwBucket = template.s3Bucket()
        .withWebsiteHosting({ redirectTo: DOMAIN })
        .withBucketName(WWW_DOMAIN)
        .withCorsEnabled()
        .withDeletePolicy();
      distribution = template.cloudFrontDistribution()
        .withAliases([DOMAIN, WWW_DOMAIN])
        .withS3BucketOrigin(baseBucket);
    });

    test('S3 Bucket for domain is created', () => {
      baseBucket.exists();
    });

    test('S3 Bucket for WWW domain is created', () => {
      wwwBucket.exists();
    });

    test('S3 Bucket policy for the base domain bucket is created', () => {
      template.s3BucketPolicy()
        .forBucket(baseBucket)
        .withPublicAccess()
        .exists();
    });

    test('S3 Bucket policy for the WWW domain bucket is created', () => {
      template.s3BucketPolicy()
        .forBucket(wwwBucket)
        .withPublicAccess()
        .exists();
    });

    test('CloudFront distribution is added', () => {
      distribution.exists();
    });

    test('DNS Record is added for the base domain', () => {
      template.route53RecordSet()
        .withRecordType(RecordType.A)
        .withName(DOMAIN + ".")
        .withAliasToCloudFront(distribution)
        .exists();
    });

    test('DNS Record is added for the WWW domain', () => {
      template.route53RecordSet()
        .withRecordType(RecordType.A)
        .withName(WWW_DOMAIN + ".")
        .withAliasToCloudFront(distribution)
        .exists();
    });
  });

  describe("+ WWW, - CloudFront", () => {
    let baseBucket: S3Bucket;
    let wwwBucket: S3Bucket;
    let distribution: CloudFrontDistribution;

    beforeAll(() => {
      template = generateTemplateOfStack({
        addWww: true,
        addCloudFront: false,
        cloudFrontWafAclArnSSMUri: 'URI',
      });

      baseBucket = template.s3Bucket()
        .withBucketName(DOMAIN)
        .withWebsiteHosting()
        .withCorsEnabled()
        .withDeletePolicy();
      wwwBucket = template.s3Bucket()
        .withWebsiteHosting({ redirectTo: DOMAIN })
        .withBucketName(WWW_DOMAIN)
        .withCorsEnabled()
        .withDeletePolicy();
      distribution = template.cloudFrontDistribution();
    });

    test('S3 Bucket for domain is created', () => {
      baseBucket.exists();
    });

    test('S3 Bucket for WWW domain is created', () => {
      wwwBucket.exists();
    });

    test('S3 Bucket policy for the base domain bucket is created', () => {
      template.s3BucketPolicy()
        .forBucket(baseBucket)
        .withPublicAccess()
        .exists();
    });

    test('S3 Bucket policy for the WWW domain bucket is created', () => {
      template.s3BucketPolicy()
        .forBucket(wwwBucket)
        .withPublicAccess()
        .exists();
    });

    test('CloudFront distribution is not added', () => {
      distribution.doesNotExist();
    });

    test('DNS Record is added for the base domain', () => {
      template.route53RecordSet()
        .withRecordType(RecordType.A)
        .withName(DOMAIN + ".")
        .withAliasToS3()
        .exists();
    });

    test('DNS Record is added for the WWW domain', () => {
      template.route53RecordSet()
        .withRecordType(RecordType.A)
        .withName(WWW_DOMAIN + ".")
        .withAliasToS3()
        .exists();
    });
  });

  describe("- WWW, + CloudFront", () => {
    let baseBucket: S3Bucket;
    let wwwBucket: S3Bucket;
    let distribution: CloudFrontDistribution;

    beforeAll(() => {
      template = generateTemplateOfStack({
        addWww: false,
        addCloudFront: true,
        cloudFrontWafAclArnSSMUri: 'URI',
      });

      baseBucket = template.s3Bucket()
        .withBucketName(DOMAIN)
        .withWebsiteHosting()
        .withCorsEnabled()
        .withDeletePolicy();
      wwwBucket = template.s3Bucket()
        .withBucketName(WWW_DOMAIN);
      distribution = template.cloudFrontDistribution()
        .withAliases([DOMAIN])
        .withS3BucketOrigin(baseBucket);
    });

    test('S3 Bucket for domain is created', () => {
      baseBucket.exists();
    });

    test('S3 Bucket for WWW domain is not created', () => {
      wwwBucket.doesNotExist();
    });

    test('S3 Bucket policy for the base domain bucket is created', () => {
      template.s3BucketPolicy()
        .forBucket(baseBucket)
        .withPublicAccess()
        .exists();
    });

    test('S3 Bucket policy for the WWW domain bucket is created', () => {
      template.s3BucketPolicy().countIs(1);
    });

    test('CloudFront distribution is added', () => {
      distribution.exists();
    });

    test('DNS Record is added for the base domain', () => {
      template.route53RecordSet()
        .withRecordType(RecordType.A)
        .withName(DOMAIN + ".")
        .withAliasToCloudFront(distribution)
        .exists();
    });

    test('DNS Record is not added for the WWW domain', () => {
      template.route53RecordSet()
        .withRecordType(RecordType.A)
        .withName(WWW_DOMAIN + ".")
        .doesNotExist();
    });
  });

  describe("- WWW, - CloudFront", () => {
    let baseBucket: S3Bucket;
    let wwwBucket: S3Bucket;
    let distribution: CloudFrontDistribution;

    beforeAll(() => {
      template = generateTemplateOfStack({
        addWww: false,
        addCloudFront: false,
        cloudFrontWafAclArnSSMUri: 'URI',
      });

      baseBucket = template.s3Bucket()
        .withBucketName(DOMAIN)
        .withWebsiteHosting()
        .withCorsEnabled()
        .withDeletePolicy();
      wwwBucket = template.s3Bucket()
        .withBucketName(WWW_DOMAIN);
      distribution = template.cloudFrontDistribution();
    });

    test('S3 Bucket for domain is created', () => {
      baseBucket.exists();
    });

    test('S3 Bucket for WWW domain is not created', () => {
      wwwBucket.doesNotExist();
    });

    test('S3 Bucket policy for the base domain bucket is created', () => {
      template.s3BucketPolicy()
        .forBucket(baseBucket)
        .withPublicAccess()
        .exists();
    });

    test('S3 Bucket policy for the WWW domain bucket is not created', () => {
      template.s3BucketPolicy().countIs(1);
    });

    test('CloudFront distribution is not added', () => {
      distribution.doesNotExist();
    });

    test('DNS Record is added for the base domain', () => {
      template.route53RecordSet()
        .withRecordType(RecordType.A)
        .withName(DOMAIN + ".")
        .withAliasToS3()
        .exists();
    });

    test('DNS Record is not added for the WWW domain', () => {
      template.route53RecordSet()
        .withRecordType(RecordType.A)
        .withName(WWW_DOMAIN + ".")
        .doesNotExist();
    });
  });
});
