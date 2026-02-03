import { Handler } from "aws-lambda";
import Reducto, { toFile } from "reductoai";
import { randomUUID } from "crypto";
import { ParseResponse } from "reductoai/src/resources/shared";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { z } from "zod";
import { Lambda } from "@aws-sdk/client-lambda";
import { S3, PutObjectCommand } from "@aws-sdk/client-s3";
import { Resend } from "resend";

import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

async function ai<T>(prompt: string, outputSchema: z.ZodSchema): Promise<T> {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  const model = "google/gemini-3-flash-preview";

  const result = await generateText({
    model: openrouter(model),
    prompt: prompt,
    output: Output.object({
      schema: outputSchema,
    }),
  });

  return result.output as T;
}

async function getClaimQuestions(fullContent: string) {
  const instructions = `Given the following resume, generate an array of search queries for high signal claims. Always start queries in the form: "{Full name}, {school}, {claim}? Don't ask too many queries, and also don't ask queries that are way too specific (metrics). Ask queries like did they win hackathon y, or did they actually build project x. Keep in mind you are only given SWE resumes, so don't ask questions that are not related to SWE. Keep the questions as short as possible and just try to do keyword search. At least 5 questions.`;

  const prompt = `${instructions}\n\nResume:\n${fullContent}`;

  // Define your output schema
  const schema = z.object({
    fullName: z.string(),
    school: z.string(),
    questions: z.array(z.string()),
  });
  type SchemaType = z.infer<typeof schema>;

  const result = await ai<SchemaType>(prompt, schema);
  return result.questions;
}

async function sendEmail(email: string, subject: string, html: string) {
  // send email to user
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set");

  console.log(`SENDING EMAIL TO USER: ${email}`);
  const resend = new Resend(RESEND_API_KEY);

  const { data, error } = await resend.emails.send({
    from: "resume-bs-detector@douglaschen.ca",
    to: email,
    subject,
    html,
  });

  if (error) {
    console.error(`ERROR SENDING EMAIL: ${error}`);
  } else {
    console.log(`EMAIL SENT TO USER: ${email}`);
  }
  console.log(`DATA: ${JSON.stringify(data, null, 2)}`);
}

type AnalyticsData = {
  id: string;
  email: string;
  role: string;
  name: string;
  companyOrSchool: string;
};

async function recordAnalytics(analyticsData: AnalyticsData) {
  const ANALYTICS_DB_TABLE_NAME = process.env.ANALYTICS_DB_TABLE_NAME;
  if (!ANALYTICS_DB_TABLE_NAME)
    throw new Error("DYNAMODB_TABLE_NAME is not set");

  const dynamoDBClient = new DynamoDBClient({ region: "us-east-1" });
  const docClient = DynamoDBDocumentClient.from(dynamoDBClient);

  console.log(`RECORDING ANALYTICS: ${JSON.stringify(analyticsData, null, 2)}`);

  await docClient.send(
    new PutCommand({
      TableName: ANALYTICS_DB_TABLE_NAME,
      Item: analyticsData,
    })
  );
}

async function handleError(email: string, error: any) {
  const stringError = JSON.stringify(error).toLowerCase();
  let emailContent = "No email content";
  if (
    stringError.includes("limit") ||
    stringError.includes("quota") ||
    stringError.includes("rate limit") ||
    stringError.includes("too many requests") ||
    stringError.includes("exceed")
  ) {
    emailContent = `Unfortunately there has been too many requests for the Resume Bullsh*t Detector (hit my budget... sorry im a student...). Please try again later or sign up for the closed beta access <a href="https://docs.google.com/forms/d/e/1FAIpQLSfg_zNuAeGusQI-N5Ps7aDXtbsPsIa8weGddXVL7GXxOcrEnw/viewform?usp=publish-editor">here</a>.`;
  } else {
    emailContent = `<p>There was an error processing your resume:\n${JSON.stringify(
      error,
      null,
      2
    )}</p>`;
  }
  await sendEmail(email, "Error processing your resume", emailContent);
}

export const handler: Handler = async (event, context) => {
  // everything except resumes is info about the submitter.
  const { email, resumes, role, name, companyOrSchool } = event;
  try {
    const id = randomUUID();
    const analyticsData: AnalyticsData = {
      id,
      email,
      role,
      name,
      companyOrSchool,
    };
    await recordAnalytics(analyticsData).catch((error: any) => {
      console.warn(
        `Error recording analytics - but failing gracefully: ${error}`
      );
    });

    const apiKey = process.env.REDUCTO_API_KEY;
    if (!apiKey) {
      throw new Error("REDUCTO_API_KEY is not set");
    }

    const PIPELINE_ID = process.env.PIPELINE_ID;
    if (!PIPELINE_ID) {
      throw new Error("PIPELINE_ID is not set");
    }
    if (resumes.length === 0)
      throw new Error("At least one resumes is required");
    if (resumes.length > 1)
      console.warn(
        "Only 1 resume is supported at this time, ignoring the rest"
      );

    const resume: string = resumes[0];

    // upload resume to s3
    console.log(`UPLOADING RESUME TO S3: ${id}`);
    const RESUME_S3_BUCKET_NAME = process.env.RESUME_S3_BUCKET_NAME;
    if (!RESUME_S3_BUCKET_NAME)
      throw new Error("RESUME_S3_BUCKET_NAME is not set");

    const s3 = new S3({ region: "us-east-1" });

    await s3.send(
      new PutObjectCommand({
        Bucket: RESUME_S3_BUCKET_NAME,
        Key: id,
        Body: resume,
      })
    );

    console.log(`UPLOADED RESUME TO S3: ${id}`);

    // return early since budget is exceeded. The following submission is just saved for reference.
    console.log(`Returning early since budget is exceeded. The following submission is just saved to s3 and analytics db: ${JSON.stringify(analyticsData, null, 2)}. The resume will not be processed.`);

    return;


    const client = new Reducto({ apiKey });

    const filename = `${email}-${id}.pdf`;
    const fileBuffer = Buffer.from(resume, "base64");

    console.log(`UPLOADING RESUME TO REDUCTO: ${filename}`);
    const upload = await client.upload({
      file: await toFile(fileBuffer, filename, { type: "application/pdf" }),
    });

    console.log(`UPLOADED RESUME TO REDUCTO`);

    const reductoResult = await client.pipeline.run({
      input: upload,
      pipeline_id: PIPELINE_ID || "",
    });

    console.log(`RUN PIPELINE`);

    const fullResult = reductoResult?.result?.parse
      ?.result as ParseResponse.FullResult;
    const fullContent = fullResult.chunks[0].content;

    console.log(`FULL CONTENT: ${fullContent}`);

    const claimQuestions = await getClaimQuestions(fullContent);
    console.log(`CLAIM QUESTIONS: ${JSON.stringify(claimQuestions, null, 2)}`);

    const researchCandidateTavilyPayload = {
      email,
      questions: claimQuestions,
      fullContent: fullContent,
      id,
    };


    // send to research agent lambda
    const researchCandidateTavilyLambdaArn =
      process.env.RESEARCH_CANDIDATE_TAVILY_LAMBDA_ARN;
    if (!researchCandidateTavilyLambdaArn)
      throw new Error("RESEARCH_CANDIDATE_TAVILY_LAMBDA_ARN is not set");

    console.log(
      `INVOKING RESEARCH CANDIDATE TAVILY LAMBDA: ${researchCandidateTavilyLambdaArn}`
    );
    await new Lambda({ region: "us-east-1" }).invoke({
      FunctionName: researchCandidateTavilyLambdaArn,
      InvocationType: "Event",
      Payload: JSON.stringify(researchCandidateTavilyPayload),
    });
  } catch (error) {
    await handleError(email, error);
  }
};
