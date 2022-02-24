#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { AwsStaticSiteStack, StaticSiteStackProps } from '../lib/aws-static-site-stack';
import { WafStack, WafStackPurpose } from '../lib/waf-stack';
import * as settings from '../settings.json';

const app = new cdk.App();

const stack = settings.stack || 'AwsStaticSiteStack';
const mainStackProps: StaticSiteStackProps = {
  description: `Stack for hosting static site for ${settings.domain}`,
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    // @ts-ignore
    region: settings.region || process.env.CDK_DEFAULT_REGION
  },
  domain: settings.domain,
  addCloudFront: !!settings.add_cloudfront,
  addWww: !!settings.add_www,
  baseDomain: settings.base_domain,
  // @ts-ignore
  gitHubAddCredentials: !!settings.add_github_credentials,
  gitHubAccessTokenSecretName: settings.access_token_secret_name,
  gitHubOwner: settings.owner,
  gitHubRepo: settings.repo,
  gitHubBranch: settings.branch,
  addBasicAuth: settings.add_basic_auth,
  // IMPORTANT!!! Add credentials if addBasicAuth set
  basicAuthCredentials: settings.basic_auth_credentials,
};

if (settings.add_cloudfront) {
  const waf = new WafStack(app, stack + 'Waf', {
    description: `Stack for WAFv2 ACL for ${settings.domain}`,
    purpose: WafStackPurpose.CLOUDFRONT,
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: 'us-east-1'
    },
  });
  // @ts-ignore
  mainStackProps.cloudFrontWafAclArnSSMUri = waf.ssmArnUri;

  const main = new AwsStaticSiteStack(app, stack + 'Main', mainStackProps);
  main.addDependency(waf);
} else {
  new AwsStaticSiteStack(app, stack + 'Main', mainStackProps);
}
