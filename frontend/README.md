# Resume Upload Frontend

A React + Vite application for uploading PDF resumes and sending them to a processing API.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the frontend directory with your API endpoint:
```
VITE_PROCESS_RESUME_API_URL=https://your-api-endpoint.com/process-resume
```

3. Start the development server:
```bash
npm run dev
```

## Features

- PDF file upload (single or multiple files)
- Email input for notifications
- Converts PDF files to base64 and sends to API
- Displays file size and validation

## Environment Variables

- `VITE_PROCESS_RESUME_API_URL` - The API endpoint for processing resumes (required)

## API Format

The application sends POST requests with the following JSON structure:
```json
{
  "email": "user@example.com",
  "files": [
    {
      "filename": "resume.pdf",
      "content": "base64-encoded-pdf-content"
    }
  ]
}
```
