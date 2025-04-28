# 📜 Invoice Renamer

A TypeScript-based tool for automatically renaming invoice files based on their content using LLM vision capabilities.

## Features

- Recursively scans folders for PDF and image files
- Converts PDFs to images for processing
- Uses LLM vision to extract invoice information
- Generates standardized filenames
- Renames in place
- Tracks processed files to avoid duplicate processing
- Includes a graphical user interface for manually setting information, executing scanning and rename actions and viewing files

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
   OPENAI_API_KEY=your-api-key-here
   FOLDERS=./scans/january,./scans/february
   ```

## Usage

### Graphical User Interface

```bash
bun start
```

### Environment Variables

- `FOLDERS`: Comma-separated list of folders to scan (required)
- `OPENAI_API_KEY`: API key for the LLM provider

## License

MIT 