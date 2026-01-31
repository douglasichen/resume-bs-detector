import { Handler } from 'aws-lambda';
import Reducto, { toFile } from 'reductoai';
import { randomUUID } from 'crypto';

export const handler: Handler = async (event, context) => {

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

  const ret = {
    id,
    result,
    email,
    resumes,
  };


  console.log(`[RETURN] ${JSON.stringify(ret, null, 2)}`);
  return ret;
};
