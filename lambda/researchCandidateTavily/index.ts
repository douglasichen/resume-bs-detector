import { Handler } from "aws-lambda";
import { tavily } from "@tavily/core";

export const handler: Handler = async (event, context) => {
  const questions: string[] = event?.questions || [];
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error("TAVILY_API_KEY is not set");
  const client = tavily({ apiKey });

  const results = questions.map(async (question: string) => {
    const answer = await client.search(question, {
      includeAnswer: "basic",
      searchDepth: "advanced",
    });

    return {
      question,
      answer,
    };
  });

  return Promise.all(results);
};
