import { Handler } from "aws-lambda";
import { Lambda } from "@aws-sdk/client-lambda";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const lambda = new Lambda({ region: "us-east-1" });

export const handler: Handler = async (event, context) => {
  // Handle preflight OPTIONS request
  if (
    event.httpMethod === "OPTIONS" ||
    event.requestContext?.http?.method === "OPTIONS"
  ) {
    return {
      statusCode: 200,
      headers,
      body: "",
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const email = body?.email || "";
    const resumes = body?.resumes || [];
    const name = body?.name;
    const companyOrSchool = body?.companyOrSchool;
    const role = body?.role;
    const processResumeLambdaArn = process.env.PROCESS_RESUME_LAMBDA_ARN;
    if (!processResumeLambdaArn)
      throw new Error("PROCESS_RESUME_LAMBDA_ARN is not set");

    // only email is required, the rest are optional.
    const payload = {
      email,
      resumes,
      name,
      role,
      companyOrSchool,
    };

    console.log(
      `Invoking process resume lambda with arn ${processResumeLambdaArn} with payload ${JSON.stringify(
        payload
      )}`
    );

    await lambda.invoke({
      FunctionName: processResumeLambdaArn,
      InvocationType: "Event",
      Payload: JSON.stringify(payload),
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(payload),
    };
  } catch (error) {
    console.error("Error processing resume:", error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify(error),
    };
  }
};
