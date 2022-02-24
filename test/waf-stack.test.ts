import * as cdk from 'aws-cdk-lib';
import * as WafStack from '../lib/waf-stack';
import { AdvancedMatcher, AdvancedTemplate, WafV2WebACL, WebACLScope } from 'aws-cdk-assert';

const REGION = 'eu-central-1';

describe('WafStack', () => {
  let template: AdvancedTemplate;
  let webAcl: WafV2WebACL;

  function generateTemplateOfStack(props: Partial<WafStack.WafStackProps>): AdvancedTemplate {
    const app = new cdk.App();
    const stack = new WafStack.WafStack(app, 'MyTestStack', {
      env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: REGION },
      purpose: WafStack.WafStackPurpose.APIGATEWAY,
      ...(props || {}),
    });
    return AdvancedTemplate.fromStack(stack);
  }

  for (const purpose of [
    WafStack.WafStackPurpose.APIGATEWAY, WafStack.WafStackPurpose.CLOUDFRONT
  ]) {
    describe('Purpose: ' + purpose, () => {
      beforeAll(() => {
        template = generateTemplateOfStack({
          purpose,
        });

        webAcl = new WafV2WebACL(template)
          .inScope(
            purpose === WafStack.WafStackPurpose.APIGATEWAY
              ? WebACLScope.REGIONAL
              : WebACLScope.CLOUDFRONT
          );
      });

      test(`WebACL for ${purpose} is created`, () => {
        webAcl.exists();
      });

      WafStack.MANAGED_RULES.forEach((rule: WafStack.Rule): void => {
        test(`WebACL should have ${rule.name} rule`, () => {
          webAcl.hasNamedRule(rule.name);
        });
      });

      test('WebACL should have IP Rate Limit rule', () => {
        webAcl.hasRateBasedRule('IP', 100);
      });

      test('SSM Parameter is added with ACL ARN', () => {
        template.ssmParameter()
          .of('String')
          .withValue(AdvancedMatcher.arn(webAcl))
          .exists();
      });
    });
  }
});