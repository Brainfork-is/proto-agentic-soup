/**
 * LangChain-powered classification/categorization tool
 * Replaces the mock classification with real LLM-powered categorization
 */

import { PromptTemplate } from '@langchain/core/prompts';
import { LLMChain } from 'langchain/chains';
import { createLangChainLLM } from '../langchainProvider';
// LangChain classification tool

export interface ClassificationOptions {
  text: string;
  labels: string[];
  multiLabel?: boolean; // Allow multiple labels
  withConfidence?: boolean; // Include confidence scores
  temperature?: number;
  useLLM?: boolean; // Allow fallback to mock behavior
}

export interface ClassificationResult {
  label: string; // Primary label for backward compatibility
  labels?: string[]; // All labels (for multi-label)
  confidence?: number; // Confidence score (0-1)
  confidences?: Record<string, number>; // Confidence for each label
  reasoning?: string; // Why this classification was chosen
  method: 'llm' | 'mock';
}

/**
 * Mock classification for fallback (original behavior)
 */
function mockClassify(text: string, labels: string[]): ClassificationResult {
  // Simple heuristic: pick first label or do basic keyword matching
  let selectedLabel = labels[0];

  // Basic keyword matching for common cases
  const textLower = text.toLowerCase();
  for (const label of labels) {
    if (textLower.includes(label.toLowerCase())) {
      selectedLabel = label;
      break;
      }
    }
  }

  return {
    label: selectedLabel,
    method: 'mock',
  };
}

/**
 * Main classification function using LangChain
 */
export async function classify(
  options: ClassificationOptions,
  agentId: string = 'classifier'
): Promise<ClassificationResult> {
  const {
    text,
    labels,
    multiLabel = false,
    withConfidence = false,
    temperature = 0.3,
    useLLM = true,
  } = options;

  // Validate inputs
  if (!labels || labels.length === 0) {
    throw new Error('At least one label must be provided');
  }

  // Use mock if LLM is disabled
  if (!useLLM) {
    return mockClassify(text, labels);
  }

  // Create LLM with lower temperature for more consistent classification
  const llm = createLangChainLLM(agentId, temperature);

  let result: ClassificationResult;

  if (withConfidence || multiLabel) {
    // Use structured output for complex classification
    result = await structuredClassification(llm, text, labels, multiLabel, withConfidence);
  } else {
    // Use simple prompt for basic classification
    result = await simpleClassification(llm, text, labels);
  }

  return result;
}

/**
 * Simple classification with just a label
 */
async function simpleClassification(
  llm: any,
  text: string,
  labels: string[]
): Promise<ClassificationResult> {
  const promptTemplate = `Classify the following text into ONE of these categories: ${labels.join(', ')}

Text: {text}

Reply with ONLY the category name, nothing else:`;

  const prompt = PromptTemplate.fromTemplate(promptTemplate);
  const chain = new LLMChain({ llm, prompt });

  const result = await chain.call({ text });
  const selectedLabel = result.text.trim();

  // Validate the label is in the list
  const validLabel =
    labels.find((l) => l.toLowerCase() === selectedLabel.toLowerCase()) || labels[0];

  return {
    label: validLabel,
    method: 'llm',
  };
}

/**
 * Structured classification with confidence scores and reasoning
 */
async function structuredClassification(
  llm: any,
  text: string,
  labels: string[],
  multiLabel: boolean,
  withConfidence: boolean
): Promise<ClassificationResult> {
  // Simplified version that just asks for reasoning in plain text
  const promptTemplate = `Classify the following text into ONE of these categories: ${labels.join(', ')}

Text: {text}

Please respond in this format:
Category: [your choice]
${withConfidence ? 'Confidence: [0-100]%' : ''}
${withConfidence ? 'Reasoning: [brief explanation]' : ''}

Response:`;

  const prompt = PromptTemplate.fromTemplate(promptTemplate);
  const chain = new LLMChain({ llm, prompt });

  const result = await chain.call({ text });
  const response = result.text.trim();

  // Parse the response
  const categoryMatch = response.match(/Category:\s*([^\n]+)/i);
  const confidenceMatch = response.match(/Confidence:\s*(\d+)%/i);
  const reasoningMatch = response.match(/Reasoning:\s*([^\n]+)/i);

  const selectedLabel = categoryMatch ? categoryMatch[1].trim() : '';
  const validLabel =
    labels.find((l) => l.toLowerCase() === selectedLabel.toLowerCase()) || labels[0];

  const classificationResult: ClassificationResult = {
    label: validLabel,
    method: 'llm',
  };

  if (withConfidence && confidenceMatch) {
    classificationResult.confidence = parseInt(confidenceMatch[1]) / 100;
  }

  if (reasoningMatch) {
    classificationResult.reasoning = reasoningMatch[1].trim();
  }

  return classificationResult;
}

/**
 * LangChain Tool wrapper for use in agents
 */
export class ClassificationTool {
  private agentId: string;
  private useLLM: boolean;

  constructor(agentId: string, useLLM: boolean = true) {
    this.agentId = agentId;
    this.useLLM = useLLM;
  }

  async run(text: string, labels: string[]): Promise<string> {
    try {
      const result = await classify({ text, labels, useLLM: this.useLLM }, this.agentId);
      return result.label;
    } catch (error) {
      console.error(`[ClassificationTool] Failed for agent ${this.agentId}:`, error);
      // Return first label as fallback to indicate failure gracefully
      return labels[0] || 'Unknown';
    }
  }

  // For compatibility with existing stringKit interface
  async call(params: { text: string; labels: string[] }): Promise<{ label: string }> {
    const label = await this.run(params.text, params.labels);
    return { label };
  }

  // Advanced classification with options
  async classifyWithOptions(options: ClassificationOptions): Promise<ClassificationResult> {
    try {
      return await classify({ ...options, useLLM: this.useLLM }, this.agentId);
    } catch (error) {
      console.error(
        `[ClassificationTool] Advanced classification failed for agent ${this.agentId}:`,
        error
      );
      // Return error result
      return {
        label: options.labels[0] || 'Unknown',
        method: 'error' as any,
      };
    }
  }
}
