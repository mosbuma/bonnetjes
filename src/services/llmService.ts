import { InvoiceData } from '../utils/types.js';
import { Logger } from '../utils/logger.js';
import { promises as fs } from 'node:fs';
import { env } from 'node:process';
import OpenAI from 'openai';
import path from 'path';

export class LlmService {
  private logger: Logger;
  private apiKey: string;
  private readonly MAX_RETRIES = 1;
  private readonly RETRY_DELAY = 1000; // 1 second
  private openai: OpenAI;

  constructor(logger: Logger) {
    this.logger = logger;
    this.apiKey = env.OPENAI_API_KEY || '';

    if (!this.apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }

    this.openai = new OpenAI({
      apiKey: this.apiKey,
    });
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
  
  async extractInvoiceData(filePath: string, imagePaths: string[]): Promise<InvoiceData[]> {
    let retries = 0;
    while (retries < this.MAX_RETRIES) {
      try {
        // Read all images
        const imageBuffers = await Promise.all(
          imagePaths.map(path => fs.readFile(path))
        );
        const base64Images = imageBuffers.map(buffer => buffer.toString('base64'));

        const prompt = `You are an assistant that extracts information from invoice images.

Based on the provided images, extract and return the following fields in JSON format for each invoice:
{
  "invoice_date": "YYYYMMDD",
  "company_name": "Supplier or company name",
  "description": "Short invoice description (max 5 words)",
  "invoice_amount": "Total invoice amount in euros, without currency symbol, use the amount without VAT/BTW. If not certain if the amount includes VAT, add a blank invoice_amount value in the JSON",
  "invoice_currency": "Currency of the invoice, use letters, no currency symbol (e.g. EUR, USD, GBP, etc.)",
  "extraction_status": "success" | "partial" | "failed",
  "confidence": "low" | "medium" | "high",
  "original_filename": "The original filename of the invoice"
}

Notes:
- The original filename was ${path.basename(filePath)}, Keep this in mind while making the description.
- Dates must be formatted as YYYYMMDD (e.g., 20240426).
- The images that you receive all belong to the same invoice.
- If any field is missing, leave it blank but still include it in the JSON.
- Set extraction_status to:
  - "success" if all fields are found and clear
  - "partial" if some fields are found but others are missing or unclear
  - "failed" if no fields could be extracted
- Set confidence to:
  - "high" if you're very confident in the extracted data
  - "medium" if you're somewhat confident but some fields might be uncertain
  - "low" if you're not very confident in the extracted data
- Do not include extra commentary.
- Do not include any other text than the JSON
- Do not use markdown.
- Return a single JSON object for the invoice.`;

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

    throw new Error('Failed to extract invoice data after maximum retries');
  }

  private async callVisionApi(base64Images: string[], prompt: string): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...base64Images.map(base64Image => ({
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${base64Image}`,
                  detail: "high"
                }
              }))
            ]
          }
        ],
        max_tokens: 1000
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

  private parseResponse(response: string): InvoiceData[] {
    try {
      this.logger.debug(`Raw LLM response: ${response}`);
      
      // Try to extract JSON from the response if it's wrapped in markdown code blocks
      const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : response;
      
      const data = JSON.parse(jsonStr);
      
      // Handle both single object and array responses
      const results = Array.isArray(data) ? data : [data];
      
      return results.map(item => {
        // Validate required fields
        const requiredFields = ['invoice_date', 'company_name', 'description', 'invoice_amount', 'invoice_currency'];
        const missingFields = requiredFields.filter(field => !item[field]);
        
        if (missingFields.length > 0) {
          this.logger.warn(`Missing fields in response: ${missingFields.join(', ')}`);
        }

        const result: InvoiceData = {
          invoice_date: item.invoice_date || '',
          company_name: item.company_name || '',
          description: item.description || '',
          invoice_amount: item.invoice_amount || '',
          invoice_currency: item.invoice_currency || 'EUR',
          extraction_status: item.extraction_status || (missingFields.length === 0 ? 'success' : 'partial'),
          confidence: item.confidence || 'low',
        };

        // this.logger.debug(`Parsed invoice data: ${JSON.stringify(result, null, 2)}`);
        return result;
      });
    } catch (error) {
      this.logger.error(`Error parsing LLM response: ${error}`);
      this.logger.error(`Failed response: ${response}`);
      throw error;
    }
  }
} 