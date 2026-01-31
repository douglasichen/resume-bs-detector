import 'dotenv/config';
import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Duration } from 'aws-cdk-lib/core';


export class SkillDiffStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here
    
    const REDUCTO_API_KEY = process.env.REDUCTO_API_KEY || '';
    const PIPELINE_ID = process.env.PIPELINE_ID || '';
    const processResumeLambda = new lambda.Function(this, 'ProcessResumeLambda', {
      code: lambda.Code.fromAsset('lambda/processResume'),
      handler: 'index.handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      environment: {
        REDUCTO_API_KEY,
        PIPELINE_ID,
      },
    });

    const processResumeLambdaUrl = processResumeLambda.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
    });


    // const researchCandidateLambda = new lambda.Function(this, 'ResearchCandidateLambda', {
    //   code: lambda.Code.fromAsset('lambda/researchCandidate'),
    //   handler: 'index.handler',
    //   runtime: lambda.Runtime.NODEJS_24_X,
    //   environment: {
    //     FIRECRAWL_API_KEY,
    //   },
    //   timeout: Duration.seconds(60 * 10),
    // });


    const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
    if (!TAVILY_API_KEY) throw new Error('TAVILY_API_KEY is not set');
    const researchCandidateTavilyLambda = new lambda.Function(this, 'ResearchCandidateTavilyLambda', {
      code: lambda.Code.fromAsset('lambda/researchCandidateTavily'),
      handler: 'index.handler',
      runtime: lambda.Runtime.NODEJS_24_X,
      environment: {
        TAVILY_API_KEY,
      },
      timeout: Duration.seconds(60 * 10),
    });
    // const processResumeLambdaUrl = processResumeLambda.addFunctionUrl({
    //   authType: lambda.FunctionUrlAuthType.NONE,
    // });
  }
}
