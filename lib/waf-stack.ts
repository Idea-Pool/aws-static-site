/*
 * NOTE:
 * Implemented based on https://github.com/aws-samples/aws-cdk-examples/tree/master/typescript/waf
 */

import { Stack, StackProps, Tags } from 'aws-cdk-lib';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as waf from 'aws-cdk-lib/aws-wafv2';
import { Construct } from 'constructs';

export interface Rule {
  readonly name: string;
  readonly priority: number;
  readonly overrideAction: string;
  readonly excludedRules: string[];
}

export const MANAGED_RULES: Rule[] = [
  {
    name: "AWSManagedRulesCommonRuleSet",
    priority: 10,
    overrideAction: "none",
    excludedRules: []
  }, {
    name: "AWSManagedRulesAmazonIpReputationList",
    priority: 20,
    overrideAction: "none",
    excludedRules: []
  }, {
    name: "AWSManagedRulesKnownBadInputsRuleSet",
    priority: 30,
    overrideAction: "none",
    excludedRules: []
  }, {
    name: "AWSManagedRulesAnonymousIpList",
    priority: 40,
    overrideAction: "none",
    excludedRules: []
  }, {
    name: "AWSManagedRulesLinuxRuleSet",
    priority: 50,
    overrideAction: "none",
    excludedRules: []
  }, {
    name: "AWSManagedRulesUnixRuleSet",
    priority: 60,
    overrideAction: "none",
    excludedRules: [],
  }
];

export function makeRules(inputRules: Rule[] = []): waf.CfnRuleGroup.RuleProperty[] {
  const rules: waf.CfnRuleGroup.RuleProperty[] = [];

  for (const r of inputRules) {
    const mrgsp: waf.CfnWebACL.ManagedRuleGroupStatementProperty = {
      name: r.name,
      vendorName: 'AWS',
      excludedRules: [],
    };
    const stateProps: waf.CfnWebACL.StatementProperty = {
      managedRuleGroupStatement: mrgsp,
    };
    const overrideAction: waf.CfnWebACL.OverrideActionProperty = { none: {} };
    const rule: waf.CfnWebACL.RuleProperty = {
      name: r.name,
      priority: r.priority,
      overrideAction,
      statement: stateProps,
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: r.name,
      },
    };
    rules.push(rule);
  }

  const rateLimit: waf.CfnWebACL.RuleProperty = {
    name: 'RateLimit100',
    priority: 1,
    action: {
      block: {},
    },
    visibilityConfig: {
      sampledRequestsEnabled: true,
      cloudWatchMetricsEnabled: true,
      metricName: 'RateLimit100'
    },
    statement: {
      rateBasedStatement: {
        limit: 100,
        aggregateKeyType: 'IP',
      },
    },
  }
  rules.push(rateLimit);

  return rules;
}

export enum WafStackPurpose {
  CLOUDFRONT = 'CLOUDFRONT',
  APIGATEWAY = 'APIGATEWAY',
}

export interface WafStackProps extends StackProps {
  purpose: WafStackPurpose,
}

export class WafStack extends Stack {
  public ssmArnUri: string;

  constructor(scope: Construct, id: string, props: WafStackProps) {
    super(scope, id, props);

    const wafName = id + 'Acl';
    const wafAclCloudFront = new waf.CfnWebACL(this, wafName, {
      defaultAction: { allow: {} },
      scope: props.purpose == WafStackPurpose.CLOUDFRONT ? "CLOUDFRONT" : "REGIONAL",
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: wafName,
        sampledRequestsEnabled: true,
      },
      description: 'WAFv2 ACL for CloudFront',
      name: wafName,
      rules: makeRules(MANAGED_RULES),
    });

    Tags.of(wafAclCloudFront).add('Name', wafName, { priority: 300 });
    Tags.of(wafAclCloudFront).add('Purpose', props.purpose, { priority: 300 });
    Tags.of(wafAclCloudFront).add('CreatedBy', 'CloudFormation', { priority: 300 });

    this.ssmArnUri = wafName + 'Arn';

    new ssm.StringParameter(this, this.ssmArnUri, {
      parameterName: this.ssmArnUri,
      stringValue: wafAclCloudFront.attrArn,
    });
  }
}