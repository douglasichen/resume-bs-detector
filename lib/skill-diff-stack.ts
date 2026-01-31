import "dotenv/config";
import * as cdk from "aws-cdk-lib/core";
import { Construct } from "constructs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as s3 from "aws-cdk-lib/aws-s3";
import { Duration } from "aws-cdk-lib/core";
import * as destinations from "aws-cdk-lib/aws-lambda-destinations";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

const env = {
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || "",
  REDUCTO_API_KEY: process.env.REDUCTO_API_KEY || "",
  PIPELINE_ID: process.env.PIPELINE_ID || "",
  TAVILY_API_KEY: process.env.TAVILY_API_KEY || "",
  RESEND_API_KEY: process.env.RESEND_API_KEY || "",
  DOMAIN: process.env.DOMAIN || "",
};

export class SkillDiffStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const db = new dynamodb.Table(this, "researchCandidateTavilyDb", {
      tableName: "research-candidate-tavily-db",
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PROVISIONED,
      readCapacity: 25,
      writeCapacity: 25,
    });

    const researchCandidateTavilyLambda = new lambda.Function(
      this,
      "ResearchCandidateTavilyLambda",
      {
        code: lambda.Code.fromAsset("lambda/researchCandidateTavily"),
        handler: "index.handler",
        runtime: lambda.Runtime.NODEJS_24_X,
        environment: {
          TAVILY_API_KEY: env.TAVILY_API_KEY,
          DYNAMODB_TABLE_NAME: db.tableName,
        },
        timeout: Duration.seconds(60 * 10),
      }
    );

    db.grantReadWriteData(researchCandidateTavilyLambda);



  
    const resumeS3 = new s3.Bucket(this, "ResumeS3", {
      bucketName: "skill-diff-resume-s3-bucket",
    });

    const processResumeLambda = new lambda.Function(
      this,
      "ProcessResumeLambda",
      {
        code: lambda.Code.fromAsset("lambda/processResume"),
        handler: "index.handler",
        runtime: lambda.Runtime.NODEJS_24_X,
        environment: {
          REDUCTO_API_KEY: env.REDUCTO_API_KEY,
          PIPELINE_ID: env.PIPELINE_ID,
          OPENROUTER_API_KEY: env.OPENROUTER_API_KEY,
          RESEARCH_CANDIDATE_TAVILY_LAMBDA_ARN: researchCandidateTavilyLambda.functionArn,
          RESUME_S3_BUCKET_NAME: resumeS3.bucketName,
          RESEND_API_KEY: env.RESEND_API_KEY,
        },
        timeout: Duration.seconds(60 * 10),
      }
    );

    researchCandidateTavilyLambda.grantInvoke(processResumeLambda);


    resumeS3.grantReadWrite(processResumeLambda);

    const sendResumeLambda = new lambda.Function(this, "SendResumeLambda", {
      code: lambda.Code.fromAsset("lambda/sendResume"),
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: Duration.seconds(60 * 10),
      environment: {
        PROCESS_RESUME_LAMBDA_ARN: processResumeLambda.functionArn,
      },
    });

    // Grant sendResumeLambda permission to invoke processResumeLambda
    processResumeLambda.grantInvoke(sendResumeLambda);

    const api = new apigateway.RestApi(this, "SendResumeApi", {
      restApiName: "ThrottledPublicService",
      deployOptions: {
        stageName: "prod",
        throttlingRateLimit: 10,
        throttlingBurstLimit: 10,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    const integration = new apigateway.LambdaIntegration(sendResumeLambda);
    api.root.addMethod("POST", integration);

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
    if (!TAVILY_API_KEY) throw new Error("TAVILY_API_KEY is not set");
    
    // const processResumeLambdaUrl = processResumeLambda.addFunctionUrl({
    //   authType: lambda.FunctionUrlAuthType.NONE,
    // });

    const fetchResultsLambda = new lambda.Function(this, "FetchResultsLambda", {
      code: lambda.Code.fromAsset("lambda/fetchResults"),
      handler: "index.handler",
      runtime: lambda.Runtime.NODEJS_24_X,
      timeout: Duration.seconds(60 * 10),
      environment: {
        DYNAMODB_TABLE_NAME: db.tableName,
        S3_BUCKET_NAME: resumeS3.bucketName,
      },
    });

    const fetchResultsApi = new apigateway.RestApi(this, "FetchResultsApi", {
      restApiName: "ThrottledPublicService",
      deployOptions: {
        stageName: "prod",
        throttlingRateLimit: 10,
        throttlingBurstLimit: 10,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    const fetchResultsIntegration = new apigateway.LambdaIntegration(fetchResultsLambda);
    fetchResultsApi.root.addMethod("GET", fetchResultsIntegration);

    resumeS3.grantRead(fetchResultsLambda);
    db.grantReadData(fetchResultsLambda);
  }
}
