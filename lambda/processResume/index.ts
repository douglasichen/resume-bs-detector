import { Handler } from "aws-lambda";
import Reducto, { toFile } from "reductoai";
import { randomUUID } from "crypto";
import { ParseResponse } from "reductoai/src/resources/shared";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { z } from "zod";
import { Lambda } from "@aws-sdk/client-lambda";
import { S3, PutObjectCommand } from "@aws-sdk/client-s3";

async function ai<T>(prompt: string, outputSchema: z.ZodSchema): Promise<T> {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }
  const model = "openai/gpt-4o";

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
  const instructions = `Given the following resume, generate an array of questions for high signal claims. Always start question in the form: "Did {Full name} from {school} do {claim}? Don't ask too many questions, and also don't ask questions that are way too specific (metrics). Askq questions like did they win hackathon y, or did they actually build project x. Keep in mind you are only given SWE resumes, so don't ask questions that are not related to SWE. `;

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
export const handler: Handler = async (event, context) => {
  const apiKey = process.env.REDUCTO_API_KEY;
  if (!apiKey) {
    throw new Error("REDUCTO_API_KEY is not set");
  }

  const PIPELINE_ID = process.env.PIPELINE_ID;
  if (!PIPELINE_ID) {
    throw new Error("PIPELINE_ID is not set");
  }

  const { email, resumes } = event;
  if (resumes.length === 0) throw new Error("At least one resumes is required");
  if (resumes.length > 1)
    console.warn("Only 1 resume is supported at this time, ignoring the rest");

  const resume: string = resumes[0];
  const client = new Reducto({ apiKey });

  const id = randomUUID();
  const filename = `${email}-${id}.pdf`;
  const fileBuffer = Buffer.from(resume, "base64");

  console.log(`UPLOADING RESUME TO REDUCTO: ${filename}`);
  const upload = await client.upload({
    file: await toFile(fileBuffer, filename, { type: "application/pdf" }),
  });

  console.log(`UPLOADED RESUME TO REDUCTO`);

  const reductoResult = await client.pipeline.run({
    input: upload,
    pipeline_id: PIPELINE_ID,
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
  }

  // upload resume to s3
  console.log(`UPLOADING RESUME TO S3: ${id}`);
  const RESUME_S3_BUCKET_NAME = process.env.RESUME_S3_BUCKET_NAME;
  if (!RESUME_S3_BUCKET_NAME) throw new Error("RESUME_S3_BUCKET_NAME is not set");

  const s3 = new S3({ region: "us-east-1" });

  await s3.send(new PutObjectCommand({
    Bucket: RESUME_S3_BUCKET_NAME,
    Key: id,
    Body: fileBuffer,
  }));

  console.log(`UPLOADED RESUME TO S3: ${id}`);


  // send to research agent lambda
  const researchCandidateTavilyLambdaArn = process.env.RESEARCH_CANDIDATE_TAVILY_LAMBDA_ARN;
  if (!researchCandidateTavilyLambdaArn) throw new Error("RESEARCH_CANDIDATE_TAVILY_LAMBDA_ARN is not set");

  console.log(`INVOKING RESEARCH CANDIDATE TAVILY LAMBDA: ${researchCandidateTavilyLambdaArn}`);
  await new Lambda({ region: "us-east-1" }).invoke({
    FunctionName: researchCandidateTavilyLambdaArn,
    InvocationType: "Event",
    Payload: JSON.stringify(researchCandidateTavilyPayload),
  });
};
