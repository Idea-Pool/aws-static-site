import { Arn, RemovalPolicy, SecretValue, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as r53 from 'aws-cdk-lib/aws-route53';
import * as cfnt from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as iam from 'aws-cdk-lib/aws-iam';
import { SSMParameterReader } from './ssm-parameter-reader';
import * as fs from 'fs';
import * as path from 'path';

function toID(s: string): string {
  return s.toLowerCase().replace(/(?:^|\.|-)([a-z0-9])/g, (_, c) => c.toUpperCase());
}

export interface Credentials {
  [user: string]: string;
}

export interface StaticSiteStackProps extends StackProps {
  gitHubAddCredentials?: boolean;
  gitHubAccessTokenSecretName: string;
  gitHubOwner: string;
  gitHubRepo: string;
  gitHubBranch?: string;
  domain: string;
  baseDomain?: string;
  addWww?: boolean;
  addCloudFront?: boolean;
  addBasicAuth?: boolean;
  basicAuthCredentials?: Credentials;
  cloudFrontWafAclArnSSMUri?: string;
}

export class StaticSiteStackPropsError extends TypeError { }

export class AwsStaticSiteStack extends Stack {
  private checkProps(props: StaticSiteStackProps): void {
    if (!props.domain && props.baseDomain) {
      props.domain = props.baseDomain;
    }
    if (!props.domain) {
      throw new StaticSiteStackPropsError('Domain is not set!');
    }
    if (!props.baseDomain) {
      throw new StaticSiteStackPropsError('Base domain is not set!');
    }
    if (!props.domain.includes(props.baseDomain)) {
      throw new StaticSiteStackPropsError('Domain must be on the base domain!');
    }
    if (props.gitHubAddCredentials && !props.gitHubAccessTokenSecretName) {
      throw new StaticSiteStackPropsError('GitHub access token secret name must be set!');
    }
    if (!props.gitHubOwner || !props.gitHubRepo) {
      throw new StaticSiteStackPropsError('GitHub owner and repo must be set!');
    }
    if (props.addCloudFront && !props.cloudFrontWafAclArnSSMUri) {
      throw new StaticSiteStackPropsError('cloudFrontWafAclArnSSMUri must be set!');
    }
    if (props.addBasicAuth) {
      if (!props.basicAuthCredentials || Object.keys(props.basicAuthCredentials).length == 0) {
        throw new StaticSiteStackPropsError('basicAuthCredentials must contain at least 1 credential!');
      }
      if (Object.keys(props.basicAuthCredentials).length > 10) {
        throw new StaticSiteStackPropsError('basicAuthCredentials must contain at most 10 crednetial!');
      }
      this.basicAuthCrednetials = props.basicAuthCredentials;
    }

    this.domain = props.domain;
    this.baseDomain = props.baseDomain;
    this.baseId = 'Base' + toID(this.domain);
    this.gitHubOwner = props.gitHubOwner;
    this.gitHubRepo = props.gitHubRepo;
    this.gitHubBranch = props.gitHubBranch || 'main';
    this.gitHubAccessTokenSecretName = props.gitHubAccessTokenSecretName;
    this.cloudFrontWafAclArnSSMUri = props.cloudFrontWafAclArnSSMUri as string;

    if (props.addWww) {
      this.wwwDomain = 'www.' + props.domain;
      this.wwwId = 'Www' + toID(this.domain);
    }
  }

  private domain: string;
  private baseDomain: string;
  private wwwDomain: string;
  private baseId: string;
  private wwwId: string;
  private gitHubOwner: string;
  private gitHubRepo: string;
  private gitHubBranch: string;
  private gitHubAccessTokenSecretName: string;
  private cloudFrontWafAclArnSSMUri: string;
  private basicAuthCrednetials: Credentials;

  private zone: r53.IHostedZone;
  private cert: acm.DnsValidatedCertificate;
  private baseBucket: s3.Bucket;
  private wwwBucket: s3.Bucket;
  private baseDistribution: cfnt.Distribution;
  private ssmReaderCloudFrontAcl: SSMParameterReader;

  constructor(scope: Construct, id: string, props: StaticSiteStackProps) {
    super(scope, id, props);

    this.checkProps(props);

    // HOSTED ZONE

    this.zone = r53.HostedZone.fromLookup(this, this.baseId + "Zone", {
      domainName: this.baseDomain,
    });

    // BUCKETS

    this.baseBucket = new s3.Bucket(this, this.baseId + "Bucket", {
      bucketName: this.domain,
      websiteIndexDocument: 'index.html',
      websiteErrorDocument: 'index.html',
      publicReadAccess: true,
      removalPolicy: RemovalPolicy.DESTROY,
      cors: [
        {
          allowedOrigins: ['*'],
          allowedMethods: [s3.HttpMethods.GET],
        },
      ],
      autoDeleteObjects: true,
    });

    if (props.addWww) {
      this.wwwBucket = new s3.Bucket(this, this.wwwId + "Bucket", {
        bucketName: this.wwwDomain,
        websiteRedirect: {
          hostName: this.domain,
          protocol: s3.RedirectProtocol.HTTPS,
        },
        publicReadAccess: true,
        removalPolicy: RemovalPolicy.DESTROY,
        cors: [
          {
            allowedOrigins: ['*'],
            allowedMethods: [s3.HttpMethods.GET],
          },
        ],
      });
    }

    // CERTIFICATE

    if (props.addCloudFront) {
      this.cert = new acm.DnsValidatedCertificate(this, this.baseId + "Certificate", {
        domainName: this.domain,
        hostedZone: this.zone,
        region: 'us-east-1',
        subjectAlternativeNames: props.addWww ? [this.domain, this.wwwDomain] : [this.domain],
      });
    }

    // WAF

    if (props.addCloudFront) {
      this.ssmReaderCloudFrontAcl = new SSMParameterReader(this, this.baseId + "SSMReaderCloudFront", {
        parameterName: this.cloudFrontWafAclArnSSMUri,
        region: 'us-east-1',
      });
    }


    // CLOUDFRONT

    if (props.addCloudFront) {
      const distibutionOptions: cfnt.DistributionProps = {
        comment: `Distribution for hosting ${this.domain}`,
        defaultBehavior: {
          origin: new origins.S3Origin(this.baseBucket),
          viewerProtocolPolicy: cfnt.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        },
        domainNames: [this.domain, this.wwwDomain],
        certificate: this.cert,
        webAclId: this.ssmReaderCloudFrontAcl.getParameterValue(),
      }

      // AUTH

      if (props.addBasicAuth) {
        // CloudFront Function does not have access to ENVIRONMENT VARIABLES
        // thus this hack will add the credentials to the function code itself.
        const code = fs.readFileSync(path.join(__dirname, '..', 'resources', 'basic-auth.js'), { encoding: "utf8" });
        const credentials = Object.keys(this.basicAuthCrednetials).map((user: string) => {
          return Buffer.from(`${user}:${this.basicAuthCrednetials[user]}`).toString('base64');
        }).join(";");
        const authFunction = new cfnt.Function(this, this.baseId + "AuthFunction", {
          code: cfnt.FunctionCode.fromInline(code.replace('"";// HTTP_BASIC_AUTH_CREDS', `"${credentials}";`)),
          comment: `HTTP Basic Authorizer function for ${this.domain} CloudFront distribution`,
        });

        // @ts-ignore
        distibutionOptions.defaultBehavior.functionAssociations = [
          {
            function: authFunction,
            eventType: cfnt.FunctionEventType.VIEWER_REQUEST,
          }
        ];
      }

      this.baseDistribution = new cfnt.Distribution(this, this.baseId + "Distribution", distibutionOptions)
    }

    // DNS

    const sub_domain = this.domain.replace(this.baseDomain, "").replace(/\.$/, "");

    new r53.ARecord(this, this.baseId + "DNS", {
      comment: `CloudFront distribution of ${this.domain}`,
      zone: this.zone,
      recordName: sub_domain,
      target: r53.RecordTarget.fromAlias(
        props.addCloudFront
          ? new targets.CloudFrontTarget(this.baseDistribution)
          : new targets.BucketWebsiteTarget(this.baseBucket)
      )
    })

    if (props.addWww) {
      new r53.ARecord(this, this.wwwId + "DNS", {
        comment: `CloudFront distribution of ${this.wwwDomain}`,
        zone: this.zone,
        recordName: sub_domain ? 'www.' + sub_domain : 'www',
        target: r53.RecordTarget.fromAlias(
          props.addCloudFront
            ? new targets.CloudFrontTarget(this.baseDistribution)
            : new targets.BucketWebsiteTarget(this.wwwBucket)
        )
      })
    }

    // IAM

    const role = new iam.Role(this, this.baseId + 'CodeBuildRole', {
      assumedBy: new iam.ServicePrincipal("codebuild.amazonaws.com"),
    });
    role.addToPolicy(new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      resources: [Arn.format({
        service: 'cloudfront',
        resource: `distribution/${this.baseDistribution.distributionId}`,
        region: "",
      }, this)],
      actions: ["cloudfront:CreateInvalidation"],
    }));

    // CODEBUILD

    new codebuild.Project(this, this.baseId + "Build", {
      description: `Build and deployment for ${this.domain} static site`,
      source: codebuild.Source.gitHub({
        owner: this.gitHubOwner,
        repo: this.gitHubRepo,
        webhook: true,
        webhookTriggersBatchBuild: false,
        webhookFilters: [
          codebuild.FilterGroup
            .inEventOf(codebuild.EventAction.PUSH)
            .andBranchIs(this.gitHubBranch),
        ],
      }),
      role,
      environment: {
        buildImage: codebuild.LinuxBuildImage.fromCodeBuildImageId(
          'aws/codebuild/standard:5.0'
        ),
      },
      environmentVariables: {
        DISTRIBUTION_ID: {
          value: this.baseDistribution.distributionId,
        },
      },
      buildSpec: codebuild.BuildSpec.fromObjectToYaml({
        version: 0.2,
        phases: {
          install: {
            'runtime-versions': {
              nodejs: 14,
            },
            commands: [
              'echo "Installing dependencies"',
              'node -v',
              'npm -v',
              'npm i'
            ],
          },
          build: {
            commands: [
              'echo "Starting VersHivo build!"',
              'node -v',
              'npm -v',
              'npm run build-site',
            ],
          },
          post_build: {
            commands: [
              'echo "Starting post build!"',
              'aws cloudfront create-invalidation --distribution-id "${DISTRIBUTION_ID}" --paths "/*"'
            ]
          },
        },
        artifacts: {
          'base-directory': './site/dist',
          files: '**/*',
        },
      }),
      artifacts: codebuild.Artifacts.s3({
        bucket: this.baseBucket,
        includeBuildId: false,
        packageZip: false,
        name: '/',
        encryption: false,
      }),
      concurrentBuildLimit: 1,
    });

    if (props.gitHubAddCredentials) {
      new codebuild.GitHubSourceCredentials(this, this.baseId + 'CodeBuildGitHubCreds', {
        accessToken: SecretValue.secretsManager(this.gitHubAccessTokenSecretName),
      });
    }
  }
}
