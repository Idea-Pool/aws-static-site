# aws-static-site

![Website](https://img.shields.io/website?label=your.domain.name&style=flat-square&url=https%3A%2F%2Fyour.domain.name%2F)

This project is a template for hosting static sites in AWS, using:
 - **CoudBuild** for CI/CD
 - **S3** for storage
 - **Route53** for domain and DNS
 - **CloudFront** for distributing (if enabled)
 - **WAF** for DDoS protection (if CloudFront enabled)
 - **CloudFront Function** for HTTP Basic Auth (if enabled)

The deployed stack (with CloudFront, WWW, and HTTP Basic Auth enabled):

![AWS Static Site stack with CloudFront, WWW, and HTTP Basic Auth enabled](/diagram/aws-static-site.drawio.png)

Variants:
* If WWW is disabled, the WWW DNS and S3 bucket are not deployed.
* If CloudFront is disabled, both DNS is directly set to the S3 bucket, no certificate and WAF are deployed.

## Settings

In the `settings.json` , the following options can be set:

| Option | Type | Description |
|:-------|:-----|:------------|
| `base_domain` **REQUIRED** | `string` | The base domain to use (for which there is the hosted zone in AWS), e.g. `domain.com` . |
| `domain` | `string` | The domain name to host the site on, the default is the base domain. The domain **MUST BE** the same or a sub-domain of the base domain. |
| `owner` **REQUIRED** | `string` | The GitHub account (owner). |
| `repo` **REQUIRED** | `string` | The GitHub repository. |
| `branch` | `string` | The GitHub branch to use to deploy, default is `main` . |
| `access_token_secret_name` **REQUIRED** | `string` | The secret name of the GitHub access token stored in Secrets Manager. |
| `add_github_credentials` | `boolean` | Should the CodeBuild GitHub credentials be added, it should be disabled if credentials are already added for CodeBuild. |
| `region` | `string` | The AWS Region to host the site in. Note that in the case of CloudFront, this does not apply. |
| `add_www` | `boolean` | Should the WWW version of the site be deployed, the default is `false` . |
| `add_cloudfront` | `boolean` | Should a CloudFront distribution be created instead of hosting directly from S3. |
| `add_basic_auth` | `boolean` | Should the CloudFront distribution be protected by HTTP Basic Auth. |
| `basic_auth_credentials` | `{ username: password }` | Object containing the username/password credentials allowed by HTTP Basic Auth. |

## Site Development

The static site is in the `site/src` folder.

 * `npm run build-site` copies all files from `site/src` to `site/dist` what will be deployed as-is.

## CDK Development

The CDK project uses the following scripts:

 * `npm run deploy` deploys all stacks
 * `npm run destroy` destroys all stacks
<!--
The CDK script is in the `lib` folder.

 * `npm run build` compile typescript to js
 * `npm run watch` watch for changes and compile
 * `npm run test` perform the jest unit tests
 * `cdk deploy` deploy this stack to your default AWS account/region
 * `cdk diff` compare deployed stack with the current state
 * `cdk synth` emits the synthesized CloudFormation template
-->
