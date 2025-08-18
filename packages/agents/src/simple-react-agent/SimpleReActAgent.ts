/**
 * Simple ReActAgent using ChatOllama + createReactAgent directly
 * No complex wrappers, just the standard LangChain pattern
 */

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOllama } from '@langchain/ollama';
import { JobData } from '@soup/common';
import { memoryManager } from '../agentMemory';
import { createToolsForAgent } from '../langchain-tools';
import { HumanMessage } from '@langchain/core/messages';

export class SimpleReActAgent {
  id: string;
  temperature: number;
  tools: string[];
  private agent: any;

  constructor(id: string, temperature: number, tools: string[]) {
    this.id = id;
    this.temperature = temperature;
    this.tools = tools;

    // Create Ollama chat model - simple and direct
    const llm = new ChatOllama({
      model: process.env.LOCAL_MODEL_PATH || 'llama3.1:8b',
      temperature: temperature,
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    });

    // Create LangChain tools
    const langchainTools = createToolsForAgent(id, tools);

    // Create ReAct agent using the prebuilt function - simple!
    this.agent = createReactAgent({
      llm,
      tools: langchainTools,
    });

    console.log(`[SimpleReActAgent] Created agent ${id} with tools: ${tools.join(', ')}`);
  }

  async handle(job: JobData) {
    try {
      console.log(`[SimpleReActAgent] Agent ${this.id} handling ${job.category} job`);

      // Get agent memory for context
      const memory = memoryManager.getMemory(this.id);
      const memoryContext = memory.generateContext();

      // Build task message
      const taskMessage = this.buildTaskMessage(job, memoryContext);

      // Invoke ReAct agent with simple message
      const startTime = Date.now();
      const result = await this.agent.invoke({
        messages: [new HumanMessage(taskMessage)],
      });

      const duration = Date.now() - startTime;

      // Extract final response from agent messages
      const messages = result.messages || [];
      const lastMessage = messages[messages.length - 1];
      const finalOutput = lastMessage?.content || 'Task completed';

      // Simple success determination
      const success =
        finalOutput &&
        finalOutput.length > 10 &&
        !finalOutput.toLowerCase().includes('error') &&
        !finalOutput.toLowerCase().includes('failed');

      // Store experience in memory
      memory.remember({
        category: job.category,
        payload: job.payload,
        success,
        artifact: finalOutput,
        stepsUsed: 0, // Let ReAct manage its own step counting
        planUsed: `ReAct reasoning for ${job.category}`,
        adjustments: success ? [] : ['Improve task execution'],
      });

      console.log(
        `[SimpleReActAgent] Agent ${this.id} completed ${job.category} in ${duration}ms - Success: ${success}`
      );
      console.log(`[SimpleReActAgent] Final output: ${finalOutput.substring(0, 200)}...`);

      return {
        ok: success,
        artifact: finalOutput,
        stepsUsed: 0,
        planUsed: `ReAct reasoning for ${job.category}`,
        adjustments: success ? [] : ['Improve task execution'],
      };
    } catch (error) {
      console.error(`[SimpleReActAgent] Agent ${this.id} failed:`, error);

      // Store failure in memory
      const memory = memoryManager.getMemory(this.id);
      memory.remember({
        category: job.category,
        payload: job.payload,
        success: false,
        artifact: `Failed: ${error}`,
        stepsUsed: 0,
        planUsed: 'Failed to plan',
        adjustments: ['Fix agent error', 'Check tool compatibility'],
      });

      return {
        ok: false,
        artifact: `Agent failed: ${error}`,
        stepsUsed: 0,
        planUsed: 'Failed to plan',
        adjustments: ['Fix agent error'],
      };
    }
  }

  private buildTaskMessage(job: JobData, memoryContext: string): string {
    const availableTools = this.tools.join(', ');

    let taskDescription = '';
    switch (job.category) {
      case 'web_research': {
        const { url, question } = job.payload as any;
        taskDescription = `Research the question "${question}" by navigating to ${url} and extracting relevant information.`;
        break;
      }

      case 'math': {
        const { expr } = job.payload as any;
        taskDescription = `Calculate the mathematical expression: ${expr}`;
        break;
      }

      case 'summarize': {
        const { text, maxWords } = job.payload as any;
        taskDescription = `Summarize the following text in ${maxWords || 50} words or less: ${text}`;
        break;
      }

      case 'classify': {
        const { labels, answer } = job.payload as any;
        taskDescription = `Classify the content into one of these categories: ${labels?.join(', ') || 'appropriate category'}. Content: ${answer}`;
        break;
      }

      default:
        taskDescription = `Complete the ${job.category} task with payload: ${JSON.stringify(job.payload)}`;
    }

    return `You are an AI agent with access to these tools: ${availableTools}

AGENT MEMORY:
${memoryContext}

TASK: ${taskDescription}

Use the available tools to complete this task. Be direct and provide concrete results.`;
  }
}
