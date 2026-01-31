import { Handler } from "aws-lambda";
import Firecrawl from "@mendable/firecrawl-js";

export const handler: Handler = async (event, context) => {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  const firecrawl = new Firecrawl({ apiKey });
  const result = await firecrawl.agent({
    prompt:
      "Did Douglas Chen from the University of British Columbia win a hackathon with a project called elov?",
    schema: {
      type: "object",
      properties: {
        did_win: {
          type: "boolean",
          description:
            "Whether Douglas Chen won a hackathon with the project 'elov'",
        },
        context: {
          type: "string",
          description:
            "Relevant details about the hackathon, the project function, and teammates if available",
        },
        sources: {
          type: "array",
          items: {
            type: "string",
            format: "uri",
          },
          description: "List of URLs used to verify the answer",
        },
      },
      required: ["did_win", "context", "sources"],
    },
    model: "spark-1-mini",
  });

  return result;
};
