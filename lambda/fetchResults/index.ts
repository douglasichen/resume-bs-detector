import { Handler } from "aws-lambda";
import { openrouter } from "@openrouter/ai-sdk-provider";
import { generateText, Output } from "ai";
import { z } from "zod";
import { S3, GetObjectCommand } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";

export const handler: Handler = async (event, context) => {
  console.log(`EVENT: ${JSON.stringify(event, null, 2)}`);
  const id='6cfb9168-56b3-473f-87d0-4047e3dfa16e';

  const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME;
  if (!DYNAMODB_TABLE_NAME) throw new Error("DYNAMODB_TABLE_NAME is not set");

  const dynamoDBClient = new DynamoDBClient({ region: "us-east-1" });
  const docClient = DynamoDBDocumentClient.from(dynamoDBClient);

  const result = await docClient.send(new GetCommand({
    TableName: "research-candidate-tavily-db",
    Key: { id: event.id },
  }));
  console.log(`RESULT: ${JSON.stringify(result, null, 2)}`);

  
  const S3_BUCKET_NAME = process.env.S3_BUCKET_NAME;
  if (!S3_BUCKET_NAME) throw new Error("S3_BUCKET_NAME is not set"); 


  const s3 = new S3({ region: "us-east-1" });
  const getObjectCommand = new GetObjectCommand({
    Bucket: S3_BUCKET_NAME,
    Key: id,
  });
  const s3Object = await s3.send(getObjectCommand);
  const s3ObjectBody = await s3Object.Body?.transformToString();
  console.log(`S3 OBJECT BODY: ${s3ObjectBody?.slice(0, 20)}`);


  const payload = {
    result: result.Item,
    resumePdf: s3ObjectBody,
  }

  console.log(`PAYLOAD: ${JSON.stringify(payload, null, 2)}`);
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify(payload),
  }
};
