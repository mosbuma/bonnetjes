# 📜 Document Scanner and Renamer - Next.js Version

A Next.js-based tool for AI assisted scanning and renaming documents based on their content using LLM vision capabilities. Supports invoices, movie covers, and generic documents.

This is a port of the original Express-based application to Next.js with React and TypeScript.

## Features

- Recursively scans folders for PDF and image files
- Converts PDFs to images for processing
- Uses LLM vision to extract document information
- Supports multiple document types:
  - Invoices (extracts date, company, amount, etc.)
  - Movie covers (extracts title, description, duration)
  - Generic documents (extracts date, category, description, source)
- Generates standardized filenames
- Renames in place
- Tracks processed files to avoid duplicate processing
- Includes a graphical user interface for manually setting information, executing scanning and rename actions and viewing files
- Supports both OpenAI and external LLM endpoints

## Prerequisites

- Node.js (latest LTS version)
- TypeScript
- LLM API key (OpenAI or compatible)
- poppler-utils (for PDF conversion)

## Installation

1. Clone the repository
2. Navigate to the Next.js project directory:
   ```bash
   cd bonnetjes-nextjs
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Copy `.env.example` to `.env.local` and configure:
   ```env
   # OpenAI Configuration
   OPENAI_API_KEY=your-api-key-here
   OPENAI_MODEL_NAME=gpt-4-vision-preview

   # External LLM Configuration (optional)
   USEEXTERNAL=false
   EXTERNALURL=https://your-external-endpoint.com
   EXTERNALKEY=your-external-api-key
   EXTERNAL_MODEL_NAME=ollama/gemma3:12b

   # Scan Configuration
   FOLDERS=./scans/january,./scans/february
   ```

## Usage

### Development

```bash
npm run dev
```

### Production Build

```bash
npm run build
npm start
```

### Environment Variables

#### Required Variables
- `FOLDERS`: Comma-separated list of folders to scan

#### OpenAI Configuration
- `OPENAI_API_KEY`: API key for OpenAI
- `OPENAI_MODEL_NAME`: Model to use with OpenAI (default: gpt-4-vision-preview)

#### External LLM Configuration
- `USEEXTERNAL`: Set to 'true' to use external LLM endpoint
- `EXTERNALURL`: URL of the external LLM endpoint
- `EXTERNALKEY`: API key for the external LLM endpoint
- `EXTERNAL_MODEL_NAME`: Model to use with external endpoint (default: ollama/gemma3:12b)

## Document Types

### Invoices
Extracts:
- Invoice date
- Company name
- Description
- Invoice amount
- Currency

### Movie Covers
Extracts:
- Movie title
- Type (movie or series)
- Season number (for series)
- Disc number (Movie Disc or Bonus Disc)
- Media format (DVD or Blu-ray)
- Description
- Duration (HH:MM format)
- IMDB ID

### Generic Documents
Extracts:
- Document date
- Document category
- Description
- Source

## Project Structure

```
bonnetjes-nextjs/
├── src/
│   ├── app/                 # Next.js App Router
│   │   ├── api/            # API routes
│   │   ├── globals.css     # Global styles
│   │   ├── layout.tsx      # Root layout
│   │   └── page.tsx        # Main page
│   ├── components/         # React components
│   ├── lib/               # Utility libraries
│   └── types/             # TypeScript type definitions
├── public/                # Static assets
└── package.json
```

## API Routes

- `GET /api/records` - Get all records
- `POST /api/scan` - Scan for new files
- `POST /api/analyze` - Analyze a specific file
- `POST /api/update-invoicedata` - Update file data
- `GET /api/get-pdf` - Get PDF file
- `GET /api/get-image` - Get image file
- `POST /api/clear-state` - Clear application state
- `POST /api/clean-not-analyzed` - Remove unanalyzed files

## License

MIT
