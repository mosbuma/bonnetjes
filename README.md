# 📜 Document Scanner and Renamer

A TypeScript-based tool for AI assisted scanning and renaming documents based on their content using LLM vision capabilities. Supports invoices, movie covers, and generic documents.

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

- Bun (latest version)
- TypeScript
- LLM API key (OpenAI or compatible)
- poppler-utils (for PDF conversion)

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   bun install
   ```
3. Copy `.env.example` to `.env` and configure:
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

### Graphical User Interface

```bash
bun start
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
- Movie description
- Duration

### Generic Documents
Extracts:
- Document date
- Document category
- Description
- Source

## License

MIT 