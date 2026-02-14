import { Handler } from "aws-lambda";
import { tavily } from "@tavily/core";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { z } from "zod";
import { Resend } from "resend";
import { GoogleGenAI } from "@google/genai";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";


async function aiGeminiAPI<T>(prompt: string, outputSchema: z.ZodType<any>): Promise<T> {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  const model = "gemini-3-flash-preview"
  const gemini = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const response = await gemini.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: z.toJSONSchema(outputSchema),
    },
  });
  
  if (!response.text) {
    throw new Error("No response from Gemini API");
  }
  const output = JSON.parse(response.text);
  return output as T;
}

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

const MAX_QUESTIONS = 10;

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

async function handleError(email: string, error: any) {
  // const stringError = JSON.stringify(error).toLowerCase();
  // let emailContent = "No email content";
  // if (
  //   stringError.includes("limit") ||
  //   stringError.includes("quota") ||
  //   stringError.includes("rate limit") ||
  //   stringError.includes("too many requests") ||
  //   stringError.includes("exceed")
  // ) {
  //   emailContent = `Unfortunately there has been too many requests for the Resume Bullsh*t Detector (hit my budget... sorry im a student...). Please try again later or sign up for the closed beta access <a href="https://docs.google.com/forms/d/e/1FAIpQLSfg_zNuAeGusQI-N5Ps7aDXtbsPsIa8weGddXVL7GXxOcrEnw/viewform?usp=publish-editor">here</a>.`;
  // } else {
  //   emailContent = `<p>There was an error processing your resume:\n${JSON.stringify(
  //     error,
  //     null,
  //     2
  //   )}</p>`;
  // }
  console.error(`ERROR PROCESSING RESUME: ${JSON.stringify(error, null, 2)}`);
  const emailContent = `<p>There was an error processing your resume:\n${JSON.stringify(error, null, 2)}</p>`;
  await sendEmail(email, "Error processing your resume", emailContent);
}

export const handler: Handler = async (event, context) => {
  const { questions: allQuestions, fullContent, email, id } = event;
  const questions = allQuestions.slice(0, MAX_QUESTIONS);

  try {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) throw new Error("TAVILY_API_KEY is not set");
    const client = tavily({ apiKey });

    // note that the search actually uses the query as input. the question is for later on (ai verification label step)
    const results = questions.map(async (question: { question: string, query: string }) =>
      client
        .search(question.query, {
          includeAnswer: "advanced",
          searchDepth: "advanced",
          maxResults: 10,
        })
        .then(async (res) => {
          return {
            question: question.question,
            query: question.query,
            answer: res.answer,
            results: res.results.map((searchRes) => {
              return {
                url: searchRes.url,
                score: searchRes.score,
              };
            }),
          };
        })
    );

    const awaitedResults = await Promise.all(results);
    const resultsWithVerification = await Promise.all(
      awaitedResults.map(async (res) => {
        const prompt = `Given the following question, answer and source results, determine if the claim is Verified, Unsure, or Bullsh*t. If there is somewhat proof of the claim, it should be Verified (should be most prefered output option). If there is no proof of the claim it should be unsure. If there is a contradiction with the claim, it should be Bullsh*t.`;
        const result = await aiGeminiAPI<{
          verification: "Verified" | "Unsure" | "Bullsh*t";
        }>(
          JSON.stringify({
            question: res.question,
            answer: res.answer,
            // Remove results for now to save on costs. results with URL and similarity score does not seem as relevant.
            // results: res.results,
            prompt,
          }),
          z.object({
            verification: z.enum(["Verified", "Unsure", "Bullsh*t"]),
          })
        );
        return {
          ...res,
          verification: result.verification,
        };
      })
    );
    console.log(
      `Verification Results: ${JSON.stringify(
        resultsWithVerification,
        null,
        2
      )}`
    );

    // create unique db entry to store results to query by user
    const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;
    if (!DYNAMODB_TABLE_NAME) throw new Error("DYNAMODB_TABLE_NAME is not set");

    const dynamoDBClient = new DynamoDBClient({ region: "us-east-1" });
    const docClient = DynamoDBDocumentClient.from(dynamoDBClient);

    await docClient.send(
      new PutCommand({
        TableName: DYNAMODB_TABLE_NAME,
        Item: { id, email, fullContent, results: resultsWithVerification },
      })
    );

    console.log(`RESULTS STORED IN DYNAMODB at key: ${id}`);

    const domain = "https://resume-bs-detector-frontend.vercel.app";
    await sendEmail(
      email,
      "Your resume has been scanned for bullsh*t!",
      `<p>Your resume has been processed. You can view the results <a href="${domain}/${id}">here</a>.</p>`
    );
  } catch (error) {
    console.error(
      `Error processing your resume: ${JSON.stringify(error, null, 2)}`
    );
    await handleError(email, error);
  }
};
