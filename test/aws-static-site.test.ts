import * as cdk from 'aws-cdk-lib';
import * as AwsStaticSite from '../lib/aws-static-site-stack';
import { AdvancedTemplate, CloudFrontDistribution, S3Bucket, AdvancedMatcher, IAMRole, IAMPolicy, LambdaFunction, CloudFrontFunction, CloudFormationCustomResource, CustomResource } from 'aws-cdk-assert';
import * as route53 from 'aws-cdk-lib/aws-route53';
import { Match } from 'aws-cdk-lib/assertions';
import { RemovalPolicy } from 'aws-cdk-lib';
import { RecordType } from 'aws-cdk-lib/aws-route53';

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

  describe("StaticSiteStackPropse", () => {
    function generateStack(props?: Partial<AwsStaticSite.StaticSiteStackProps>): AwsStaticSite.AwsStaticSiteStack {
      const app = new cdk.App();
      // @ts-ignore
      return new AwsStaticSite.AwsStaticSiteStack(app, 'MyTestStack', props || {});
    }

    test("should handle missing domain", () => {
      expect(() => generateStack()).toThrowError(AwsStaticSite.StaticSiteStackPropsError);
    });

    test("should handle missing baseDomain", () => {
      expect(() => generateStack({
        domain: DOMAIN,
      })).toThrowError(AwsStaticSite.StaticSiteStackPropsError);
    });

    test("should handle unmatching domain and baseDomain", () => {
      expect(() => generateStack({
        domain: "sub.example.com",
        baseDomain: "other.com",
      })).toThrowError(AwsStaticSite.StaticSiteStackPropsError);
    });

    test("should handle missing gitHubAccessTokenSecretName", () => {
      expect(() => generateStack({
        domain: DOMAIN,
        baseDomain: BASE_DOMAIN,
        gitHubAddCredentials: true,
      })).toThrowError(AwsStaticSite.StaticSiteStackPropsError);
    });

    test("should handle missing github owner", () => {
      expect(() => generateStack({
        domain: DOMAIN,
        baseDomain: BASE_DOMAIN,
        gitHubRepo: "repo",
      })).toThrowError(AwsStaticSite.StaticSiteStackPropsError);
    })

    test("should handle missing github repo", () => {
      expect(() => generateStack({
        domain: DOMAIN,
        baseDomain: BASE_DOMAIN,
        gitHubOwner: "owner",
      })).toThrowError(AwsStaticSite.StaticSiteStackPropsError);
    })

    test("should handle missing cloudFrontWafAclArnSSMUri", () => {
      expect(() => generateStack({
        domain: DOMAIN,
        baseDomain: BASE_DOMAIN,
        gitHubOwner: "owner",
        gitHubRepo: "repo",
        addCloudFront: true,
      })).toThrowError(AwsStaticSite.StaticSiteStackPropsError);
    });

    test("should handle missing basicAuthCredentials", () => {
      expect(() => generateStack({
        domain: DOMAIN,
        baseDomain: BASE_DOMAIN,
        gitHubOwner: "owner",
        gitHubRepo: "repo",
        addBasicAuth: true,
      })).toThrowError(AwsStaticSite.StaticSiteStackPropsError);
    });

    test("should handle empty basicAuthCredentials", () => {
      expect(() => generateStack({
        domain: DOMAIN,
        baseDomain: BASE_DOMAIN,
        gitHubOwner: "owner",
        gitHubRepo: "repo",
        addBasicAuth: true,
        basicAuthCredentials: {},
      })).toThrowError(AwsStaticSite.StaticSiteStackPropsError);
    });

    test("should handle too many basicAuthCredentials", () => {
      expect(() => generateStack({
        domain: DOMAIN,
        baseDomain: BASE_DOMAIN,
        gitHubOwner: "owner",
        gitHubRepo: "repo",
        addBasicAuth: true,
        basicAuthCredentials: Array.from({ length: 11 }).fill("1").reduce((c: any, v, i) => {
          c[i] = v;
          return c;
        }, {}) as AwsStaticSite.Credentials,
      })).toThrowError(AwsStaticSite.StaticSiteStackPropsError);
    });

    test("should handle missing domain if baseDomain is set", () => {
      const template = AdvancedTemplate.fromStack(generateStack({
        env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: REGION },
        baseDomain: BASE_DOMAIN,
        gitHubOwner: "owner",
        gitHubRepo: "repo",
      }));

      template.s3Bucket().withBucketName(BASE_DOMAIN).exists();
    });
  });

  describe("GitHub Credentials", () => {
    beforeAll(() => {
      template = generateTemplateOfStack({
        addWww: false,
        addCloudFront: false,
        gitHubAddCredentials: true,
        gitHubAccessTokenSecretName: 'SECRET',
      });
    });

    test("GitHub Source Credentials is created", () => {
      template.codeBuildSourceCredentials()
        .withGitHubPersonalAccessToken('secretsmanager:SECRET')
        .exists();
    });
  });

  describe("HTTP Base Auth", () => {
    let distribution: CloudFrontDistribution;
    let fn: CloudFrontFunction;

    beforeAll(() => {
      template = generateTemplateOfStack({
        addWww: true,
        addCloudFront: true,
        addBasicAuth: true,
        cloudFrontWafAclArnSSMUri: 'URI',
        basicAuthCredentials: { user: "password" },
      });

      distribution = template.cloudFrontDistribution()
        .withAliases([DOMAIN, WWW_DOMAIN]);

      fn = template.cloudFrontFunction()
        .withCode(Buffer.from("user:password").toString("base64"))
    });

    test("CloudFront function is created", () => {
      fn.exists();
    });

    test("CloudFront distribution is associated with CloudFront function", () => {
      distribution
        .withFunctionAssociation(fn)
        .exists();
    });
  });

  describe("+ WWW, + CloudFront", () => {
    let baseBucket: S3Bucket;
    let wwwBucket: S3Bucket;
    let distribution: CloudFrontDistribution;

    beforeEach(() => {
      template = generateTemplateOfStack({
        addWww: true,
        addCloudFront: true,
        cloudFrontWafAclArnSSMUri: 'URI',
      });

      baseBucket = template.s3Bucket()
        .withBucketName(DOMAIN)
        .withWebsiteHosting()
        .withCorsEnabled()
        .withRemovalPolicy(RemovalPolicy.DESTROY);
      wwwBucket = template.s3Bucket()
        .withWebsiteHosting({ redirectTo: DOMAIN })
        .withBucketName(WWW_DOMAIN)
        .withCorsEnabled()
        .withRemovalPolicy(RemovalPolicy.DESTROY);
      distribution = template.cloudFrontDistribution()
        .withAliases([DOMAIN, WWW_DOMAIN])
        .withPublicS3BucketOrigin(baseBucket);
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

    describe("Certificate", () => {
      let role: IAMRole;
      let policy: IAMPolicy;
      let lambda: LambdaFunction;
      let customResource: CloudFormationCustomResource;

      beforeEach(() => {
        role = template
          .iamRole()
          .assumableByLambda()
          .withManagedRolicy('policy/service-role/AWSLambdaBasicExecutionRole');
        role.withPartialKey('certificate')

        policy = template
          .iamPolicy()
          .usedByRole(role);

        lambda = template
          .lambdaFunction()
          .withRole(role);

        customResource = template
          .cloudFormationCustomResource()
          .withServiceToken(lambda)
      })

      test('Certificate requestor role is created', () => {
        role.exists();
      });

      test('Policy for certificate requester role is created', () => {
        policy
          .withStatement([
            "acm:RequestCertificate",
            "acm:DeleteCertificate",
          ])
          .withStatement('route53:GetChange')
          .withStatement('route53:changeResourceRecordSets', AdvancedMatcher.fnJoin(
            Match.arrayWith([
              Match.stringLikeRegexp('hostedzone/TEST'),
            ]),
          ))
          .exists();
      });

      test('Certificate requestor function is created', () => {
        lambda
          .dependsOn(policy)
          .dependsOn(role)
          .exists();
      });

      test('Certificate requestor resource is created', () => {
        customResource
          .withProperty('DomainName', DOMAIN)
          .withProperty('SubjectAlternativeNames', [DOMAIN, WWW_DOMAIN])
          .exists();
      });

      test("Certificate is assigned to the distribution", () => {
        distribution
          .withCertificate(customResource)
          .exists();
      });
    });

    describe("SSMReader", () => {
      let role: IAMRole;
      let policy: IAMPolicy;
      let lambda: LambdaFunction;
      let customResource: CustomResource;

      beforeEach(() => {
        role = template
          .iamRole()
          .assumableByLambda()
          .withManagedRolicy('policy/service-role/AWSLambdaBasicExecutionRole');
        role.withPartialKey('aws')

        policy = template
          .iamPolicy()
          .usedByRole(role)
          .withStatement('ssm:GetParameter');

        lambda = template
          .lambdaFunction()
          .withRole(role)
          .dependsOn(role) as LambdaFunction;

        customResource = template
          .customResource()
          .withServiceToken(lambda);
      });

      test('SSM reader role is created', () => {
        role.exists();
      });

      test('SSM reader policy is created', () => {
        policy.exists();
      });

      test('SSM reader function is created', () => {
        lambda.exists();
      });

      test('SSM reader custom resource is created', () => {
        customResource
          .withCreateHandler("getParameter", "SSM", {
            Name: "URI",
          })
          .withUpdateHandler("getParameter", "SSM", {
            Name: "URI",
          })
          .exists();
      });

      test('SSM reader is attached as WebACL to the distribution', () => {
        distribution
          .withWebACL(AdvancedMatcher.fnGetAtt(customResource.id, "Parameter.Value"))
          .exists();
      });
    });

    describe("CodeBuild", () => {
      let role: IAMRole;
      let policy: IAMPolicy;

      beforeEach(() => {
        role = template
          .iamRole()
          .assumableBy({ Service: "codebuild.amazonaws.com" });

        policy = template
          .iamPolicy()
          .usedByRole(role)
          .withStatement('cloudfront:CreateInvalidation', AdvancedMatcher.fnJoin(
            Match.arrayWith([
              { Ref: distribution.id }
            ]),
          ))
          .withStatement(['s3:PutObject'], Match.arrayWith([
            AdvancedMatcher.arn(baseBucket),
          ]));
      });

      test("CodeBuild role is created", () => {
        role.exists();
      });

      test("CodeBuild policy is created", () => {
        policy.exists();
      });

      test('CodeBuild project is created', () => {
        template.codeBuildProject()
          .withServiceRole(role)
          .withSource('GITHUB', 'github.com/owner/repo.git')
          .withBuildSpec('aws cloudfront create-invalidation')
          .withConcurrentBuildLimit(1)
          .withEnvironmentVariable('DISTRIBUTION_ID', distribution.ref)
          .withTriggers([
            { type: "EVENT", pattern: "PUSH" }
          ], true)
          .withArtifact('S3', baseBucket, false, false)
          .exists();
      });
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
        .withRemovalPolicy(RemovalPolicy.DESTROY);
      wwwBucket = template.s3Bucket()
        .withWebsiteHosting({ redirectTo: DOMAIN })
        .withBucketName(WWW_DOMAIN)
        .withCorsEnabled()
        .withRemovalPolicy(RemovalPolicy.DESTROY);
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

    describe("Certificate", () => {
      let role: IAMRole;

      beforeEach(() => {
        role = template
          .iamRole()
          .assumableByLambda()
          .withManagedRolicy('policy/service-role/AWSLambdaBasicExecutionRole');
        role.withPartialKey('certificate')
      });

      test('Certificate requestor role is not created', () => {
        role.doesNotExist();
      });
    });

    describe("SSMReader", () => {
      let role: IAMRole;

      beforeEach(() => {
        role = template
          .iamRole()
          .assumableByLambda()
          .withManagedRolicy('policy/service-role/AWSLambdaBasicExecutionRole');
        role.withPartialKey('aws')
      });

      test('SSM reader role is not created', () => {
        role.doesNotExist();
      });
    });

    describe("CodeBuild", () => {
      let role: IAMRole;
      let policy: IAMPolicy;

      beforeEach(() => {
        role = template
          .iamRole()
          .assumableBy({ Service: "codebuild.amazonaws.com" });

        policy = template
          .iamPolicy()
          .usedByRole(role)
          .withStatement(['s3:PutObject'], Match.arrayWith([
            AdvancedMatcher.arn(baseBucket),
          ]));
      });

      test("CodeBuild role is created", () => {
        role.exists();
      });

      test("CodeBuild policy is created", () => {
        policy.exists();
      });

      test('CodeBuild project is created', () => {
        const build = template
          .codeBuildProject()
          .withServiceRole(role)
          .withSource('GITHUB', 'github.com/owner/repo.git')
          .withConcurrentBuildLimit(1)
          .withTriggers([
            { type: "EVENT", pattern: "PUSH" }
          ], true)
          .withArtifact('S3', baseBucket, false, false);


        build.exists();

        build
          .withBuildSpec('aws cloudfront create-invalidation')
          .doesNotExist();
      });
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
        .withRemovalPolicy(RemovalPolicy.DESTROY);
      wwwBucket = template.s3Bucket()
        .withBucketName(WWW_DOMAIN);
      distribution = template.cloudFrontDistribution()
        .withAliases([DOMAIN])
        .withPublicS3BucketOrigin(baseBucket);
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

    describe("Certificate", () => {
      let role: IAMRole;
      let policy: IAMPolicy;
      let lambda: LambdaFunction;
      let customResource: CloudFormationCustomResource;

      beforeEach(() => {
        role = template
          .iamRole()
          .assumableByLambda()
          .withManagedRolicy('policy/service-role/AWSLambdaBasicExecutionRole');
        role.withPartialKey('certificate')

        policy = template
          .iamPolicy()
          .usedByRole(role);

        lambda = template
          .lambdaFunction()
          .withRole(role);

        customResource = template
          .cloudFormationCustomResource()
          .withServiceToken(lambda)
      })

      test('Certificate requestor role is created', () => {
        role.exists();
      });

      test('Policy for certificate requester role is created', () => {
        policy
          .withStatement([
            "acm:RequestCertificate",
            "acm:DeleteCertificate",
          ])
          .withStatement('route53:GetChange')
          .withStatement('route53:changeResourceRecordSets', AdvancedMatcher.fnJoin(
            Match.arrayWith([
              Match.stringLikeRegexp('hostedzone/TEST'),
            ]),
          ))
          .exists();
      });

      test('Certificate requestor function is created', () => {
        lambda
          .dependsOn(policy)
          .dependsOn(role)
          .exists();
      });

      test('Certificate requestor resource is created', () => {
        customResource
          .withProperty('DomainName', DOMAIN)
          .withProperty('SubjectAlternativeNames', [DOMAIN])
          .exists();
      });

      test("Certificate is assigned to the distribution", () => {
        distribution
          .withCertificate(customResource)
          .exists();
      });
    });

    describe("SSMReader", () => {
      let role: IAMRole;
      let policy: IAMPolicy;
      let lambda: LambdaFunction;
      let customResource: CustomResource;

      beforeEach(() => {
        role = template
          .iamRole()
          .assumableByLambda()
          .withManagedRolicy('policy/service-role/AWSLambdaBasicExecutionRole');
        role.withPartialKey('aws')

        policy = template
          .iamPolicy()
          .usedByRole(role)
          .withStatement('ssm:GetParameter');

        lambda = template
          .lambdaFunction()
          .withRole(role)
          .dependsOn(role) as LambdaFunction;

        customResource = template
          .customResource()
          .withServiceToken(lambda);
      });

      test('SSM reader role is created', () => {
        role.exists();
      });

      test('SSM reader policy is created', () => {
        policy.exists();
      });

      test('SSM reader function is created', () => {
        lambda.exists();
      });

      test('SSM reader custom resource is created', () => {
        customResource
          .withCreateHandler("getParameter", "SSM", {
            Name: "URI",
          })
          .withUpdateHandler("getParameter", "SSM", {
            Name: "URI",
          })
          .exists();
      });

      test('SSM reader is attached as WebACL to the distribution', () => {
        distribution
          .withWebACL(AdvancedMatcher.fnGetAtt(customResource.id, "Parameter.Value"))
          .exists();
      });
    });

    describe("CodeBuild", () => {
      let role: IAMRole;
      let policy: IAMPolicy;

      beforeEach(() => {
        role = template
          .iamRole()
          .assumableBy({ Service: "codebuild.amazonaws.com" });

        policy = template
          .iamPolicy()
          .usedByRole(role)
          .withStatement('cloudfront:CreateInvalidation', AdvancedMatcher.fnJoin(
            Match.arrayWith([
              { Ref: distribution.id }
            ]),
          ))
          .withStatement(['s3:PutObject'], Match.arrayWith([
            AdvancedMatcher.arn(baseBucket),
          ]));
      });

      test("CodeBuild role is created", () => {
        role.exists();
      });

      test("CodeBuild policy is created", () => {
        policy.exists();
      });

      test('CodeBuild project is created', () => {
        template.codeBuildProject()
          .withServiceRole(role)
          .withSource('GITHUB', 'github.com/owner/repo.git')
          .withBuildSpec('aws cloudfront create-invalidation')
          .withConcurrentBuildLimit(1)
          .withEnvironmentVariable('DISTRIBUTION_ID', distribution.ref)
          .withTriggers([
            { type: "EVENT", pattern: "PUSH" }
          ], true)
          .withArtifact('S3', baseBucket, false, false)
          .exists();
      });
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
        .withRemovalPolicy(RemovalPolicy.DESTROY);
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

    describe("Certificate", () => {
      let role: IAMRole;

      beforeEach(() => {
        role = template
          .iamRole()
          .assumableByLambda()
          .withManagedRolicy('policy/service-role/AWSLambdaBasicExecutionRole');
        role.withPartialKey('certificate')
      });

      test('Certificate requestor role is not created', () => {
        role.doesNotExist();
      });
    });

    describe("SSMReader", () => {
      let role: IAMRole;

      beforeEach(() => {
        role = template
          .iamRole()
          .assumableByLambda()
          .withManagedRolicy('policy/service-role/AWSLambdaBasicExecutionRole');
        role.withPartialKey('aws')
      });

      test('SSM reader role is not created', () => {
        role.doesNotExist();
      });
    });

    describe("CodeBuild", () => {
      let role: IAMRole;
      let policy: IAMPolicy;

      beforeEach(() => {
        role = template
          .iamRole()
          .assumableBy({ Service: "codebuild.amazonaws.com" });

        policy = template
          .iamPolicy()
          .usedByRole(role)
          .withStatement(['s3:PutObject'], Match.arrayWith([
            AdvancedMatcher.arn(baseBucket),
          ]));
      });

      test("CodeBuild role is created", () => {
        role.exists();
      });

      test("CodeBuild policy is created", () => {
        policy.exists();
      });

      test('CodeBuild project is created', () => {
        const build = template
          .codeBuildProject()
          .withServiceRole(role)
          .withSource('GITHUB', 'github.com/owner/repo.git')
          .withConcurrentBuildLimit(1)
          .withTriggers([
            { type: "EVENT", pattern: "PUSH" }
          ], true)
          .withArtifact('S3', baseBucket, false, false);


        build.exists();

        build
          .withBuildSpec('aws cloudfront create-invalidation')
          .doesNotExist();
      });
    });
  });
});
