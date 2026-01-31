import { Handler } from "aws-lambda";
import { tavily } from "@tavily/core";
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

const MAX_QUESTIONS = 20;

export const handler: Handler = async (event, context) => {
  const { questions: allQuestions, fullContent, email } = event;
  const questions = allQuestions.slice(0, MAX_QUESTIONS);

  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY is not set");
  const client = tavily({ apiKey });

  const results = questions.map(async (question: string) => {
    const answer = await client.search(question, {
      includeAnswer: "advanced",
      searchDepth: "advanced",
      maxResults: 20,
    });

    return {
      question,
      answer: {
        ...answer,
        results: answer.results.map((result) => {
          return {
            url: result.url,
            score: result.score,
          };
        }),
      },
    };
  });

  const awaitedResults = await Promise.all(results);
  console.log(`AWAITED RESULTS: ${JSON.stringify(awaitedResults, null, 2)}`);
};
