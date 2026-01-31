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
    const body = JSON.parse(event.body || '{}');
    const email = body?.email || '';
    const resumes = body?.resumes || [];
    if (resumes.length === 0) throw new Error('At least one resumes is required');
    if (resumes.length > 1) console.warn('Only 1 resume is supported at this time, ignoring the rest');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        email,
        resumes,
      }),
    };
  } catch (error) {
    console.error('Error processing resume:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify(error)
    };
  }
};
