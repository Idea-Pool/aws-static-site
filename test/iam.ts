import { AdvancedMatcher, AdvancedTemplate, Resource, ResourceTypes } from "aws-cdk-assert";
import { Match } from "aws-cdk-lib/assertions";

export class IAMRole extends Resource {
  constructor(template: AdvancedTemplate, props?: any) {
    super(ResourceTypes.IAM_ROLE, template, props);
  }

  public assumableBy(principal: any): IAMRole {
    return this.setProperty('AssumeRolePolicyDocument', Match.objectLike({
      Statement: Match.arrayWith([
        {
          Action: 'sts:AssumeRole',
          Effect: 'Allow',
          Principal: principal,
        },
      ]),
    })) as IAMRole;
  }

  public assumableByLambda(): IAMRole {
    return this.assumableBy({ Service: 'lambda.amazonaws.com' });
  }

  public withManagedRolicy(policy: string): IAMRole {
    return this.setProperty('ManagedPolicyArns', Match.arrayWith([
      AdvancedMatcher.fnJoin(Match.arrayWith([
        Match.stringLikeRegexp(policy),
      ])),
    ])) as IAMRole;
  }
}

export enum IAMPolicyStatementEffect {
  ALLOW = 'Allow',
  DENY = 'Deny',
}

export class IAMPolicy extends Resource {
  private statements: any[];
  private roles: any[];

  constructor(template: AdvancedTemplate, props?: any) {
    super(ResourceTypes.IAM_POLICY, template, props);
    this.statements = [];
    this.roles = [];
  }

  public withStatement(action: string | string[], resource?: any, effect?: IAMPolicyStatementEffect): IAMPolicy {
    const statement: any = {
      Effect: effect || IAMPolicyStatementEffect.ALLOW,
      Action: typeof action === 'string'
        ? action
        : Match.arrayWith(action as string[]),
    };
    if (resource !== null) {
      statement.Resource = resource;
    }
    this.statements.push(Match.objectLike(statement));
    return this.setProperty('PolicyDocument', Match.objectLike({
      Statement: Match.arrayWith(this.statements),
    })) as IAMPolicy;
  }

  public usedByRole(role: IAMRole): IAMPolicy {
    this.roles.push({ Ref: role.id });
    return this.setProperty('Roles', Match.arrayWith(this.roles)) as IAMPolicy;
  }
}