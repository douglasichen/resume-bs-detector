import { Handler } from 'aws-lambda';
import Reducto, { toFile } from 'reductoai';
import { randomUUID } from 'crypto';

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export const handler: Handler = async (event, context) => {
  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS' || event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    };
  }

  try {
    const apiKey = process.env.REDUCTO_API_KEY;
    if (!apiKey) {
      throw new Error('REDUCTO_API_KEY is not set');
    }

    const PIPELINE_ID = process.env.PIPELINE_ID;
    if (!PIPELINE_ID) {
      throw new Error('PIPELINE_ID is not set');
    }

    const body = JSON.parse(event.body || '{}');
    const email = body?.email || '';
    const resumes = body?.resumes || [];
    if (resumes.length === 0) throw new Error('At least one resumes is required');
    if (resumes.length > 1) console.warn('Only 1 resume is supported at this time, ignoring the rest');

    const resume: string = resumes[0];
    const client = new Reducto({ apiKey });

    const id=randomUUID();
    const filename = `${email}-${id}.pdf`;
    const fileBuffer = Buffer.from(resume, 'base64');
    const upload = await client.upload({
      file: await toFile(fileBuffer, filename, { type: 'application/pdf' })
    });

    const result = await client.pipeline.run({
      input: upload,
      pipeline_id: PIPELINE_ID,
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        id,
        result,
      }),
    };
  } catch (error) {
    console.error('Error processing resume:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
