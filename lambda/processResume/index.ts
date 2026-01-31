import { Handler } from "aws-lambda";
import Reducto, { toFile } from "reductoai";
import { randomUUID } from "crypto";
import { ParseResponse } from "reductoai/src/resources/shared";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { z } from "zod";

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
  const instructions = `Given the following resume, generate an array of questions for high signal claims. Always start question in the form: "Did {Full name} from {school} do {claim}?"`;

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
  const upload = await client.upload({
    file: await toFile(fileBuffer, filename, { type: "application/pdf" }),
  });

  const reductoResult = await client.pipeline.run({
    input: upload,
    pipeline_id: PIPELINE_ID,
  });

  const fullResult = reductoResult?.result?.parse
    ?.result as ParseResponse.FullResult;
  const fullContent = fullResult.chunks[0].content;

  console.log(`FULL CONTENT: ${fullContent}`);

  const claimQuestions = await getClaimQuestions(fullContent);
  console.log(`CLAIM QUESTIONS: ${JSON.stringify(claimQuestions)}`);


  
};
