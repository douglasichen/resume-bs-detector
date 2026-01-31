import 'dotenv/config';
import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Duration } from 'aws-cdk-lib/core';
import * as destinations from 'aws-cdk-lib/aws-lambda-destinations';


const env = {
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  REDUCTO_API_KEY: process.env.REDUCTO_API_KEY || '',
  PIPELINE_ID: process.env.PIPELINE_ID || '',
  TAVILY_API_KEY: process.env.TAVILY_API_KEY || '',
}

export class SkillDiffStack extends cdk.Stack {
  private createSecureProcessResumeLambda() {

  }

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);


    // const aiLambda = new lambda.Function(this, 'AiLambda', {
    //   code: lambda.Code.fromAsset('lambda/ai'),
    //   handler: 'index.handler',
    //   runtime: lambda.Runtime.NODEJS_24_X,
    //   timeout: Duration.seconds(60 * 10),
    //   environment: {
    //     OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
    //   },
    // });
    

    const processResumeLambda = new lambda.Function(this, 'ProcessResumeLambda', {
      code: lambda.Code.fromAsset('lambda/processResume'),
      handler: 'index.handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      environment: {
        REDUCTO_API_KEY: env.REDUCTO_API_KEY,
        PIPELINE_ID: env.PIPELINE_ID,
      },
      timeout: Duration.seconds(60 * 10),
    });
    
    const sendResumeLambda = new lambda.Function(this, 'SendResumeLambda', {
      code: lambda.Code.fromAsset('lambda/sendResume'),
      handler: 'index.handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: Duration.seconds(60 * 10),
      onSuccess: new destinations.LambdaDestination(processResumeLambda),
    });

    const api = new apigateway.RestApi(this, 'ProcessResumeApi', {
      restApiName: 'ThrottledPublicService',
      deployOptions: {
        stageName: 'prod',
        throttlingRateLimit: 10,
        throttlingBurstLimit: 10,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    const integration = new apigateway.LambdaIntegration(sendResumeLambda);
    api.root.addMethod('POST', integration);

    // const researchCandidateLambda = new lambda.Function(this, 'ResearchCandidateLambda', {
    //   code: lambda.Code.fromAsset('lambda/researchCandidate'),
    //   handler: 'index.handler',
    //   runtime: lambda.Runtime.NODEJS_24_X,
    //   environment: {
    //     FIRECRAWL_API_KEY,
    //   },
    //   timeout: Duration.seconds(60 * 10),
    // });

    sendResumeLambda.grantInvoke(processResumeLambda);

    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
    if (!TAVILY_API_KEY) throw new Error('TAVILY_API_KEY is not set');
    const researchCandidateTavilyLambda = new lambda.Function(this, 'ResearchCandidateTavilyLambda', {
      code: lambda.Code.fromAsset('lambda/researchCandidateTavily'),
      handler: 'index.handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      environment: {
        TAVILY_API_KEY: env.TAVILY_API_KEY,
      },
      timeout: Duration.seconds(60 * 10),
    });
    // const processResumeLambdaUrl = processResumeLambda.addFunctionUrl({
    //   authType: lambda.FunctionUrlAuthType.NONE,
    // });
  }
}
