/**
 * Job Generator
 * Creates realistic professional work assignments for AI agents
 */

import { PatchedChatVertexAI } from './patchedVertexAI';
import { log, logError, getVertexTokenLimit } from '@soup/common';

export interface Job {
  prompt: string;
  payout: number;
  deadlineS: number;
}

interface JobBatch {
  jobs: Job[];
}

export class JobGenerator {
  private llm: PatchedChatVertexAI;
  private jobQueue: Job[] = [];
  private batchSize = 10;

  constructor() {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;

    if (!projectId) {
      throw new Error('GOOGLE_CLOUD_PROJECT environment variable is required');
    }

    const maxOutputTokens = getVertexTokenLimit('job_generator');

    this.llm = new PatchedChatVertexAI({
      model: process.env.VERTEX_AI_MODEL || 'gemini-1.5-flash',
      temperature: 0.9, // High temperature for variety
      maxOutputTokens, // Use config-based limit (undefined = no limit)
      authOptions: {
        credentials: process.env.GOOGLE_APPLICATION_CREDENTIALS
          ? undefined
          : process.env.GOOGLE_CLOUD_CREDENTIALS
            ? JSON.parse(Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString())
            : undefined,
      },
    });
  }

  async generateJob(): Promise<Job> {
    // Return job from queue if available, otherwise generate new batch
    if (this.jobQueue.length > 0) {
      return this.jobQueue.shift()!;
    }

    // Generate new batch of jobs
    await this.generateJobBatch();
    return this.jobQueue.shift()!;
  }

  private async generateJobBatch(): Promise<void> {
    // 50% chance to generate computational/tool-requiring tasks (or force via env)
    const forceComputational = process.env.JOBS_COMPUTATIONAL_ONLY === '1';
    const shouldGenerateComputationalTasks = forceComputational ? true : Math.random() <= 0.5;
    const taskTypeInstruction = shouldGenerateComputationalTasks
      ? `\n\nCOMPUTATIONAL TASK FOCUS: Include tasks involving precise calculations, data processing, and algorithmic solutions:
- Financial calculations (ROI, compound interest, loan payments, investment analysis with specific numbers)
- Mathematical problem solving (percentage calculations, unit conversions, multi-step formulas)
- Data analysis and statistical calculations with provided datasets
- Algorithm implementations (sorting given lists, searching through data, transformations)
- Validation and verification (checking formats, validating inputs against rules)
- Text processing (parsing structured data, formatting, pattern extraction)
- Time-based calculations (date differences, scheduling conflicts, time zone conversions)
- Business logic (pricing with complex rules, discount calculations, commission structures)
- Scientific calculations (physics problems, chemistry equations, engineering computations)

Focus on tasks with specific numerical inputs and expected precise outputs.`
      : `\n\nGENERAL TASK VARIETY: Include research, writing, analysis, and planning tasks that may benefit from tool usage for data gathering and verification.`;

    const prompt = `Generate exactly 10 realistic work assignments that people would actually delegate to a professional AI assistant. Return them in JSON format.${taskTypeInstruction}

REALISM REQUIREMENTS:
Create tasks that mirror real professional work scenarios - the kind of assignments managers, executives, entrepreneurs, researchers, and consultants actually delegate to assistants. These should feel like genuine workplace requests.

PROFESSIONAL DOMAINS TO DRAW FROM:
- Business Strategy & Analysis: Market research, competitive analysis, feasibility studies, business plan sections
- Financial Analysis: Investment research, cost-benefit analysis, budget planning, financial modeling
- Marketing & Sales: Campaign planning, content strategy, lead generation research, customer segmentation
- Operations & Project Management: Process optimization, vendor research, project planning, workflow design
- Technology & Engineering: Technical documentation, system comparisons, implementation planning, troubleshooting guides
- Legal & Compliance: Regulatory research, policy analysis, compliance checklists, contract summaries
- Human Resources: Recruitment planning, training program design, policy development, performance metrics
- Product Development: Feature analysis, user research synthesis, roadmap planning, competitive feature comparison
- Real Estate & Property: Market analysis, investment evaluation, property research, development planning
- Healthcare & Pharmaceuticals: Research synthesis, regulatory analysis, market assessment, protocol development
- Education & Training: Curriculum development, learning assessment, educational research, training materials
- Consulting & Advisory: Industry analysis, recommendation frameworks, client deliverables, strategic planning

TASK TYPES THAT REFLECT REAL WORK:
- Research & Intelligence: "Research the top 5 competitors to Slack in the enterprise messaging space and analyze their pricing models"
- Analysis & Recommendations: "Analyze our Q3 customer churn data and identify the top 3 factors contributing to cancellations"
- Planning & Strategy: "Create a 90-day go-to-market strategy for launching our new mobile app in the European market"
- Content & Communication: "Draft a comprehensive onboarding guide for new remote employees joining our engineering team"
- Process & Operations: "Design a workflow for handling customer escalations that reduces response time by 50%"
- Financial & Business: "Calculate the ROI of implementing a new CRM system for our 200-person sales team"
- Technical & Implementation: "Create a migration plan for moving our customer database from MySQL to PostgreSQL"

REALISM & AUTHENTICITY GUIDELINES:
- Frame tasks as actual workplace assignments ("We need you to..." / "Please research..." / "Help us understand...")
- Use real company names, products, and industry terms that professionals would recognize
- Include realistic constraints and parameters (budgets, timelines, team sizes, specific requirements)
- Reference actual tools, platforms, and methodologies used in business
- Make tasks feel urgent and important, like real business priorities

PROFESSIONAL LANGUAGE PATTERNS:
- "Conduct a comprehensive analysis of..."
- "Research and recommend the best..."
- "Develop a strategic plan for..."
- "Create a detailed comparison of..."
- "Analyze the market opportunity for..."
- "Design an implementation roadmap for..."
- "Evaluate the feasibility of..."
- "Prepare a business case for..."

SPECIFICITY REQUIREMENTS:
- Include actual company names, product names, and industry terminology
- Specify realistic budgets, team sizes, timelines, and metrics
- Reference real tools and platforms (Salesforce, HubSpot, AWS, Slack, etc.)
- Include concrete business scenarios and challenges
- Make all context feel authentic to actual business operations

FORBIDDEN GENERIC PATTERNS:
- Avoid academic or theoretical assignments
- No hypothetical or made-up scenarios
- Don't use placeholder names (Company X, Product Y)
- Avoid overly simplified tasks that don't reflect real work complexity
- Skip tasks that sound like textbook exercises

TASK COMPLETENESS:
- Every task should be fully self-contained with clear deliverables
- Include all necessary context and constraints within the prompt
- Specify the format and scope of expected outputs
- Make tasks achievable with available tools and research capabilities

CRITICAL: Respond with ONLY valid JSON in this exact format (ensure all strings are properly quoted):
{
  "jobs": [
    {"prompt": "task description here", "payout": 7, "deadlineS": 60},
    {"prompt": "another task description", "payout": 6, "deadlineS": 60}
  ]
}
Generate exactly 10 jobs in the array.

Payouts should be random between 5-10. 

IMPORTANT: 
- Do NOT wrap in markdown code blocks (no backticks)
- Do NOT include any text before or after the JSON
- Return only the raw JSON object
- Start with { and end with }`;

    try {
      log('[JobGenerator] Requesting job batch from LLM...');

      const response = await this.llm.invoke(prompt);
      let jsonResponse = response.content as string;

      // Clean up LLM response - remove markdown code blocks
      jsonResponse = jsonResponse
        .replace(/```json\s*/, '')
        .replace(/```\s*$/, '')
        .trim();

      log('[JobGenerator] JSON response length:', jsonResponse.length, 'characters');

      // Parse JSON response
      const jobBatch: JobBatch = JSON.parse(jsonResponse);

      if (!jobBatch.jobs || !Array.isArray(jobBatch.jobs)) {
        throw new Error('Invalid JSON response format');
      }

      // Add jobs to queue
      this.jobQueue.push(...jobBatch.jobs);

      log(`[JobGenerator] Generated ${jobBatch.jobs.length} jobs in batch`);
    } catch (error) {
      logError('[JobGenerator] Failed to generate job batch:', error);
      throw error;
    }
  }
}

// Singleton instance
export const jobGenerator = new JobGenerator();
