/**
 * Google Vertex AI client for LLM integration
 * Implements token budget management and rate limiting
 */

import { GoogleAuth } from 'google-auth-library';

export interface LLMRequest {
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface LLMResponse {
  content: string;
  tokensUsed: number;
  finishReason: string;
}

export interface TokenBudget {
  maxTokensPerHour: number;
  maxTokensPerAgent: number;
  currentHourlyUsage: number;
  agentUsage: Map<string, number>;
  lastReset: Date;
}

export class VertexAIClient {
  private auth: GoogleAuth;
  private projectId: string;
  private location: string;
  private budget: TokenBudget;
  private enabled: boolean;

  constructor(
    config: {
      projectId?: string;
      location?: string;
      maxTokensPerHour?: number;
      maxTokensPerAgent?: number;
    } = {}
  ) {
    this.projectId = config.projectId || process.env.GOOGLE_CLOUD_PROJECT || '';
    this.location = config.location || process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
    this.enabled = !!(
      this.projectId &&
      (process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_CLOUD_CREDENTIALS)
    );

    // Handle base64 encoded credentials
    if (process.env.GOOGLE_CLOUD_CREDENTIALS && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      try {
        const credentials = JSON.parse(
          Buffer.from(process.env.GOOGLE_CLOUD_CREDENTIALS, 'base64').toString('utf-8')
        );
        this.auth = new GoogleAuth({
          credentials,
          scopes: ['https://www.googleapis.com/auth/cloud-platform'],
        });
      } catch (error) {
        console.error('[VertexAI] Invalid base64 credentials');
        this.enabled = false;
        this.auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
      }
    } else {
      this.auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
    }

    this.budget = {
      maxTokensPerHour: config.maxTokensPerHour || 100000,
      maxTokensPerAgent: config.maxTokensPerAgent || 1000,
      currentHourlyUsage: 0,
      agentUsage: new Map(),
      lastReset: new Date(),
    };

    // Reset budget every hour
    setInterval(() => this.resetHourlyBudget(), 60 * 60 * 1000);
  }

  private resetHourlyBudget() {
    this.budget.currentHourlyUsage = 0;
    this.budget.agentUsage.clear();
    this.budget.lastReset = new Date();
    console.log('[VertexAI] Token budget reset');
  }

  private checkBudget(agentId: string, estimatedTokens: number): boolean {
    // Check hourly limit
    if (this.budget.currentHourlyUsage + estimatedTokens > this.budget.maxTokensPerHour) {
      console.log('[VertexAI] Hourly token budget exceeded');
      return false;
    }

    // Check per-agent limit
    const agentUsage = this.budget.agentUsage.get(agentId) || 0;
    if (agentUsage + estimatedTokens > this.budget.maxTokensPerAgent) {
      console.log(`[VertexAI] Agent ${agentId} token budget exceeded`);
      return false;
    }

    return true;
  }

  private updateBudget(agentId: string, tokensUsed: number) {
    this.budget.currentHourlyUsage += tokensUsed;
    const currentAgentUsage = this.budget.agentUsage.get(agentId) || 0;
    this.budget.agentUsage.set(agentId, currentAgentUsage + tokensUsed);
  }

  async generateContent(request: LLMRequest, agentId: string): Promise<LLMResponse | null> {
    if (!this.enabled) {
      console.log('[VertexAI] Not enabled - missing credentials or project config');
      return null;
    }

    const estimatedTokens = Math.ceil(request.prompt.length / 4) + (request.maxTokens || 500);

    if (!this.checkBudget(agentId, estimatedTokens)) {
      return null;
    }

    try {
      const client = await this.auth.getClient();
      const projectPath = `projects/${this.projectId}/locations/${this.location}`;
      const model = request.model || 'gemini-1.5-flash';
      const url = `https://${this.location}-aiplatform.googleapis.com/v1/${projectPath}/publishers/google/models/${model}:generateContent`;

      const payload = {
        contents: [
          {
            role: 'user',
            parts: [{ text: request.prompt }],
          },
        ],
        generationConfig: {
          temperature: request.temperature || 0.7,
          maxOutputTokens: request.maxTokens || 500,
        },
      };

      const response = await client.request({
        url,
        method: 'POST',
        data: payload,
      });

      const data = response.data as any;

      if (!data.candidates || data.candidates.length === 0) {
        console.log('[VertexAI] No candidates returned');
        return null;
      }

      const candidate = data.candidates[0];
      const content = candidate.content?.parts?.[0]?.text || '';
      const finishReason = candidate.finishReason || 'STOP';

      // Estimate tokens used (approximation)
      const tokensUsed = Math.ceil(content.length / 4) + Math.ceil(request.prompt.length / 4);

      this.updateBudget(agentId, tokensUsed);

      return {
        content,
        tokensUsed,
        finishReason,
      };
    } catch (error) {
      console.error('[VertexAI] Generation failed:', error);
      return null;
    }
  }

  getBudgetStatus(): TokenBudget {
    return { ...this.budget };
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

// Singleton instance
export const vertexClient = new VertexAIClient();
