/**
 * LLM-based Grader for evaluating agent response quality
 * Uses LLM provider system for multi-provider support
 */

import { createLLMProvider, LLMProvider } from './llm';
import { log, logError } from '@soup/common';

export interface GradeResult {
  passed: boolean;
  qualityScore?: number; // 0-100 for successful responses
  feedback?: string; // Brief explanation of the grade
}

export class LLMGrader {
  private llm: LLMProvider;

  constructor() {
    this.llm = createLLMProvider('result_grader');
  }

  async gradeResponse(jobPrompt: string, agentResponse: string): Promise<GradeResult> {
    let parsedResponse: any = null;
    let answerText = agentResponse;
    let toolsUsed: unknown = [];
    let errorFlag = false;
    let errorDescription = '';

    try {
      const candidate = JSON.parse(agentResponse);
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        parsedResponse = candidate;
        if (typeof candidate.answer === 'string') {
          answerText = candidate.answer;
        } else if (candidate.answer !== undefined) {
          answerText = JSON.stringify(candidate.answer);
        }

        if (Array.isArray(candidate.tools_used)) {
          toolsUsed = candidate.tools_used;
        }

        if (typeof candidate.error === 'boolean') {
          errorFlag = candidate.error;
        }

        if (typeof candidate.error_description === 'string') {
          errorDescription = candidate.error_description;
        }
      }
    } catch {
      // Ignore parse failures – treat as plain text response
    }

    // Convert answerText to string if it's not already
    const answerString =
      typeof answerText === 'string'
        ? answerText
        : typeof answerText === 'object'
          ? JSON.stringify(answerText)
          : String(answerText || '');
    const trimmedAnswer = answerString.trim();

    // Quick basic checks first
    if (!trimmedAnswer) {
      return { passed: false };
    }

    if (trimmedAnswer.length < 10) {
      return { passed: false };
    }

    if (errorFlag) {
      return { passed: false };
    }

    // Check for obvious error responses
    const errorPhrases = [
      'error occurred',
      'failed to',
      'cannot complete',
      'unable to',
      'sorry, but',
      'no information available',
      'agent execution failed',
    ];

    const lowerResponse = trimmedAnswer.toLowerCase();
    const hasErrorPhrase = errorPhrases.some((phrase) => lowerResponse.includes(phrase));

    if (hasErrorPhrase) {
      return { passed: false };
    }

    const metadataSummary = parsedResponse
      ? `Tools Used: ${JSON.stringify(toolsUsed)}\nError Flag: ${errorFlag}\nError Description: ${errorDescription}`
      : 'Tools Used: []\nError Flag: false\nError Description: ';

    // Use LLM to evaluate quality
    try {
      const gradingPrompt = `You are a STRICT AI response evaluator. Grade ONLY responses that actually attempt to address the request.

USER REQUEST:
${jobPrompt}

AGENT ANSWER:
${trimmedAnswer}

RESPONSE METADATA:
${metadataSummary}

FIRST: Determine if this is a PASS or FAIL:
- FAIL (return pass=false, no score): Response is completely irrelevant, error message, or doesn't attempt to address the request
- PASS (return pass=true with score): Response attempts to address the request (even if poorly)

IF PASS, then grade quality 1-100 (BE HARSH - use the full range):
• **Answer Relevancy** – Does it address the exact request? Partial = lower score
• **Helpfulness** – Is it genuinely useful and actionable? Generic = low score
• **Faithfulness** – Are facts verifiable? Speculation = major deduction
• **Bias** – Is it objective? Any bias = deduction
• **Correctness** – Is every detail accurate? Errors = penalty

QUALITY SCORING (1-100, be strict):
- 1-20: Passable but very poor quality, barely addresses request
- 21-40: Low quality, significant issues but does attempt to help
- 41-60: Below average, notable problems but serviceable  
- 61-80: Average quality with some flaws
- 81-90: Good quality with minor issues
- 91-100: Exceptional quality (RARE - reserve for outstanding work)

Be critical! Most passing responses should score 20-60. Only truly excellent responses deserve 80+.

Return ONLY a JSON response:
{
  "pass": true/false,
  "score": 25,
  "feedback": "Brief explanation"
}

Requirements:
- pass=false: Complete failure, no score needed
- pass=true: Response attempts the task, include quality score 1-100
- Be harsh with quality scores - err on the side of lower scores
- Response must be valid JSON only, no additional text`;

      log('[LLMGrader] Evaluating response quality...');

      const response = await this.llm.invoke(gradingPrompt);
      let jsonResponse = response.content as string;

      // Clean up response
      jsonResponse = jsonResponse
        .replace(/```json\s*/, '')
        .replace(/```\s*$/, '')
        .trim();

      const gradeData = JSON.parse(jsonResponse);

      // Validate response structure
      if (typeof gradeData.pass !== 'boolean') {
        throw new Error('Invalid grade response: missing or invalid pass field');
      }

      const result: GradeResult = {
        passed: gradeData.pass,
        feedback: gradeData.feedback || 'No feedback provided',
      };

      // Only validate and include score for passing responses
      if (gradeData.pass) {
        if (typeof gradeData.score !== 'number') {
          throw new Error('Invalid grade response: passing response must include score');
        }
        // Clamp score between 1-100 for passing responses
        result.qualityScore = Math.max(1, Math.min(100, gradeData.score));
      }

      log(
        `[LLMGrader] Grade: ${result.passed ? 'PASS' : 'FAIL'}${result.qualityScore ? ` (${result.qualityScore}/100)` : ''}`
      );

      return result;
    } catch (error) {
      logError('[LLMGrader] Grading failed:', error);
      throw error; // Let grading failure propagate up
    }
  }
}

// Singleton instance
export const llmGrader = new LLMGrader();
