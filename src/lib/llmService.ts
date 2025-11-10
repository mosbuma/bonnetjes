import { Logger } from './logger';
import { promises as fs } from 'node:fs';
import { env } from 'node:process';
import { OpenAI } from 'openai';
import path from 'path';
import { DocumentData, DocumentType } from '@/types';
import { fetch } from 'undici';

export class LlmService {
  private logger: Logger;
  private apiKey: string;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY = 1000; // 1 second
  private openai: OpenAI;
  private modelName: string;

  constructor(logger: Logger) {
    this.logger = logger;
    this.apiKey = env.OPENAI_API_KEY || '';
    const useExternal = env.USEEXTERNAL === 'true';
    const externalUrl = env.EXTERNALURL || '';
    const externalKey = env.EXTERNALKEY || '';
    
    if (useExternal) {
      console.log('Using external LLM API');
      this.modelName = env.EXTERNAL_MODEL_NAME || 'ollama/gemma3:12b';

      if (!externalUrl || !externalKey) {
        throw new Error('EXTERNALURL and EXTERNALKEY environment variables are required when USEEXTERNAL is true');
      }
      this.apiKey = externalKey;
      this.openai = new OpenAI({
        baseURL: externalUrl,
        apiKey: this.apiKey,
        fetch: (async (input: RequestInfo, init?: RequestInit): Promise<Response> => {
          this.logger.debug(`Making request to external endpoint: ${input}`);
          const response = await fetch(input, init);
          this.logger.debug(`Received response from external endpoint: ${response.status}`);
          return response;
        }) as typeof fetch,
      });
    } else {
      if (!this.apiKey) {
        throw new Error('OPENAI_API_KEY environment variable is required when USEEXTERNAL is false');
      }
      console.log('Using openAI LLM API');
      this.modelName = env.OPENAI_MODEL_NAME || 'gpt-4-vision-preview';
      this.openai = new OpenAI({
        apiKey: this.apiKey,
      });
    }
  }

  async checkCredits(): Promise<void> {
    try {
      const headers = {
        "Authorization": `Bearer ${this.apiKey}`,
        "Content-Type": "application/json"
      };
  
      // Calculate the dates for the past week
      const now = new Date();
      const endDate = now.toISOString().split('T')[0];
      const startDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)) // 7 days ago
        .toISOString()
        .split('T')[0];
  
      // Fetch subscription info (to get your total billing cap)
      const subscriptionResponse = await fetch(
        "https://api.openai.com/v1/dashboard/billing/subscription",
        { headers }
      );
      const subscriptionData = await subscriptionResponse.json();
  
      // Fetch usage info (to get spending in the last 7 days)
      const usageResponse = await fetch(
        `https://api.openai.com/v1/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`,
        { headers }
      );
      const usageData = await usageResponse.json();
  
      const totalUsageDollars = (usageData.total_usage || 0) / 100; // usage is in cents
      const hardLimitDollars = subscriptionData.hard_limit_usd || 0;
      const remainingDollars = hardLimitDollars - totalUsageDollars;
  
      // Log everything nicely
      this.logger.info('OpenAI Billing Information (past 7 days):');
      this.logger.info(`Total Usage: $${totalUsageDollars.toFixed(2)}`);
      this.logger.info(`Hard Limit: $${hardLimitDollars.toFixed(2)}`);
      this.logger.info(`Remaining Budget: $${remainingDollars.toFixed(2)}`);
  
    } catch (error) {
      this.logger.error(`Error checking OpenAI credits: ${error}`);
    }
  }
  
  private getPromptForDocumentType(filePath: string): string {
    const basePrompt = `You are a dutch speaking assistant that extracts information from document images. Based on the provided images, first determine the document type and then extract the relevant information.

    Your answers are given in dutch.


First, determine if this is an invoice, a movie cover, or a generic document. Then, extract and return the following fields in JSON format:

For all documents, if there is no information on the page, add "blank" to the description field.

{
  "document_type": "invoice" | "movie_cover" | "generic" | "rekeningafschrift",
  "extraction_status": "success" | "partial" | "failed",
  "confidence": "low" | "medium" | "high",
  "fields": {
    // For invoices:
    "invoice_date": "YYYYMMDD",
    "company_name": "Supplier or company name",
    "description": "Short invoice description (max 5 words)",
    "invoice_amount": "Total invoice amount in euros, without currency symbol, use the amount without VAT/BTW. If not certain if the amount includes VAT, add a blank invoice_amount value in the JSON",
    "invoice_currency": "Currency of the invoice, use letters, no currency symbol (e.g. EUR, USD, GBP, etc.)",

    // For dvd/bluray covers:
    "movie_title": "Title of the movie",
    "type": "movie" or "series",
    "season": "Season number of the series, if not applicable, use 0",
    "disc_number": "Disc number of the series or movie, if not applicable, use 0. Where applicable use Movie Disc or Bonus Disc",
    "media_format": "DVD or Blu-ray",
    "description": "Short description of the series or movie content",
    "duration": "Movie duration in format HH:MM",
    "imdb_id": "IMDB ID of the movie -> try to extract title and year from the movie cover to get an accurate ID",

    // For generic documents:
    "document_date": "YYYYMMDD",
    "document_category": "Category of the document (e.g. contract, brief, rapport, factuur, offerte, aangifte, etc.)",
    "description": "Short document description. Try to be concise, but include all important information.",
    "source": "Organization or person that created the document, try to find this in the header, title etcetera",

    // for "Jaaropgave" documents:
    // assume the document was sent on jan 1st of the next year when no exact date is provided
    // always include the year of the jaaropgave in the document category field (e.g. "Jaaropgave 2024")

    // for documents relating to belastingaangiften:
    try to extract the year that the belastingaangifte is for and include this in the document category field (e.g. "Aangifte 2024")

    // for postcards (one side is a picture, the other side has an area for a message and space for the recipient's address)
    set the document category to "postcard" or "blank postcard"
    try to extract the sender and recipient from the message on the postcard and make a description "from <sender> to <recipient>"
    if there is no address area, it may be a birthday card, set the document category to "birthday card". Postcards never have a fold, birthday cards can. On a birthday card, the recipient's name is often in the first line of the message.

    // for rekeningafschriften:
    set the document category to "rekeningafschrift"
    try to extract datum afschrift, page number, number of pages, bank account number and account holder name from the bankafschrift and include this in the document description field (e.g. "Bankafschrift accountnumber 20251021 (1 of 2) - account holder")    
    "bank_account_number": "Bank account number",
    "account_holder_name": "Account holder name",
    "page_number": "Page number",
    "number_of_pages": "Number of pages",
    "document_date": "YYYYMMDD",
    "document_category": "Category of the document (e.g. contract, brief, rapport, factuur, offerte, aangifte, etc.)",
    "description": "Short document description. Try to be concise, but include all important information.",
    "source": "Organization or person that created the document, try to find this in the header, title etcetera",
  }
}`;

    return `${basePrompt}

  // Notes:
  // - The original filename was ${path.basename(filePath)}, Keep this in mind while making the description.
  // - Dates must be formatted as YYYYMMDD (e.g., 20240426).
  // - The images that you receive all belong to the same document.
  // - If any field is missing, leave it blank but still include it in the JSON.
  // - Set extraction_status to:
  //   - "success" if all fields are found and clear
  //   - "partial" if some fields are found but others are missing or unclear
  //   - "failed" if no fields could be extracted
  // - Set confidence to:
  //   - "high" if you're very confident in the extracted data
  //   - "medium" if you're somewhat confident but some fields might be uncertain
  //   - "low" if you're not very confident in the extracted data
  // - Do not include extra commentary.
  // - Do not include any other text than the JSON
  // - Do not use markdown.
  // - Return a single JSON object for the document.
  // - some generic documents have a source, try to find this in the header, title etcetera
  // - some generic documents are kids drawings`;
  }

  async extractDocumentData(filePath: string, imagePaths: string[]): Promise<DocumentData[]> {
    let retries = 0;
    while (retries < this.MAX_RETRIES) {
      try {
        // Read all images
        const imageBuffers = await Promise.all(
          imagePaths.map(path => fs.readFile(path))
        );
        const base64Images = imageBuffers.map(buffer => buffer.toString('base64'));

        const prompt = this.getPromptForDocumentType(filePath);
        const response = await this.callVisionApi(base64Images, prompt);
        return this.parseResponse(response);
      } catch (error) {
        retries++;
        if (retries === this.MAX_RETRIES) {
          throw error;
        }
        this.logger.warn(`Retry ${retries}/${this.MAX_RETRIES} after error: ${error}`);
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
      }
    }

    throw new Error('Failed to extract document data after maximum retries');
  }

  private async callVisionApi(base64Images: string[], prompt: string): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.modelName,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...base64Images.map(base64Image => ({
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${base64Image}`
                }
              })) as unknown
            ]
          }
        ],
        max_tokens: 1000
      },
      {
        experimental: { vision: true }
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content in API response');
      }

      return content;
    } catch (error) {
      this.logger.error(`Error calling vision API: ${error}`);
      throw error;
    }
  }

  private parseResponse(response: string): DocumentData[] {
    try {
      this.logger.debug(`Raw LLM response: ${response}`);
      
      // Try to extract JSON from the response if it's wrapped in markdown code blocks
      const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : response;
      
      const data = JSON.parse(jsonStr);
      
      // Handle both single object and array responses
      const results = Array.isArray(data) ? data : [data];
      
      return results.map(item => {
        const documentType = item.document_type;
        const fields = item.fields || {};

        let result: DocumentData;

        switch (documentType) {
          case DocumentType.INVOICE:
            result = {
              invoice_date: fields.invoice_date || '',
              company_name: fields.company_name || '',
              description: fields.description || '',
              invoice_amount: fields.invoice_amount || '',
              invoice_currency: fields.invoice_currency || 'EUR',
              extraction_status: item.extraction_status || 'partial',
              confidence: item.confidence || 'low'
            };
            break;

          case DocumentType.MOVIE_COVER:
            result = {
              movie_title: fields.movie_title || '',
              type: fields.type || 'movie',
              season: parseInt(fields.season || '0', 10),
              disc_number: fields.disc_number || '',
              media_format: fields.media_format || 'DVD',
              description: fields.description || '',
              duration: fields.duration || '',
              imdb_id: fields.imdb_id || '',
              extraction_status: item.extraction_status || 'partial',
              confidence: item.confidence || 'low'
            };
            break;

          case DocumentType.REKENINGAFSCHRIFT:
            result = {
              document_date: fields.document_date || '',
              document_category: fields.document_category || '',
              description: fields.description || '',
              extraction_status: item.extraction_status || 'partial',
              confidence: item.confidence || 'low',
              source: fields.source || ''
            };
            break;
          case DocumentType.GENERIC:
            result = {
              document_date: fields.document_date || '',
              document_category: fields.document_category || '',
              description: fields.description || '',
              extraction_status: item.extraction_status || 'partial',
              confidence: item.confidence || 'low',
              source: fields.source || ''
            };
            break;

          default:
            throw new Error(`Unknown document type: ${documentType}`);
        }

        return result;
      });
    } catch (error) {
      this.logger.error(`Error parsing LLM response: ${error}`);
      this.logger.error(`Failed response: ${response}`);
      throw error;
    }
  }
} 