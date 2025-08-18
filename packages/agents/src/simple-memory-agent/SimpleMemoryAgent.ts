/**
 * Simple MemoryAgent for tasks requiring memory/context management
 * Specialized for summarize and classify tasks
 */

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOllama } from '@langchain/ollama';
import { JobData } from '@soup/common';
import { memoryManager } from '../agentMemory';
import { createToolsForAgent } from '../langchain-tools';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export class SimpleMemoryAgent {
  id: string;
  temperature: number;
  tools: string[];
  private agent: any;

  constructor(id: string, temperature: number, tools: string[]) {
    this.id = id;
    this.temperature = temperature;
    this.tools = tools;
    
    // Create Ollama chat model with lower temperature for more consistent memory operations
    const llm = new ChatOllama({
      model: process.env.LOCAL_MODEL_PATH || 'llama3.1:8b',
      temperature: Math.max(0.1, temperature - 0.2), // Lower temperature for memory tasks
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    });
    
    // Create LangChain tools focused on text processing
    const langchainTools = createToolsForAgent(id, tools);
    
    // Create ReAct agent optimized for memory tasks
    this.agent = createReactAgent({
      llm,
      tools: langchainTools,
    });
    
    console.log(`[SimpleMemoryAgent] Created memory-specialized agent ${id} with tools: ${tools.join(', ')}`);
  }

  async handle(job: JobData) {
    try {
      console.log(`[SimpleMemoryAgent] Agent ${this.id} handling ${job.category} job`);
      
      // Get agent memory for context - memory agents should leverage past experiences
      const memory = memoryManager.getMemory(this.id);
      const memoryContext = memory.generateContext();
      
      // Build task message with memory focus
      const taskMessage = this.buildMemoryTaskMessage(job, memoryContext);
      
      // Add system message for memory specialization
      const systemMessage = new SystemMessage(
        "You are a memory-specialized AI agent. You excel at summarizing information, " +
        "classifying content, and leveraging past experiences to improve current tasks. " +
        "Focus on accuracy, consistency, and learning from previous similar tasks."
      );
      
      // Invoke agent with memory-focused prompting
      const startTime = Date.now();
      const result = await this.agent.invoke({
        messages: [systemMessage, new HumanMessage(taskMessage)]
      });
      
      const duration = Date.now() - startTime;
      
      // Extract final response from agent messages
      const messages = result.messages || [];
      const lastMessage = messages[messages.length - 1];
      const finalOutput = lastMessage?.content || 'Task completed';
      
      // Memory agent success criteria - focus on completeness and accuracy
      const success = finalOutput && 
                     finalOutput.length > 5 && 
                     !finalOutput.toLowerCase().includes('error') &&
                     !finalOutput.toLowerCase().includes('failed') &&
                     this.validateMemoryTaskOutput(job, finalOutput);
      
      // Store experience in memory with enhanced detail for memory agents
      memory.remember({
        category: job.category,
        payload: job.payload,
        success,
        artifact: finalOutput,
        stepsUsed: 0,
        planUsed: `Memory-focused approach for ${job.category}`,
        adjustments: success ? 
          ['Maintain current memory strategy'] : 
          ['Improve memory utilization', 'Enhance context processing'],
      });
      
      console.log(`[SimpleMemoryAgent] Agent ${this.id} completed ${job.category} in ${duration}ms - Success: ${success}`);
      console.log(`[SimpleMemoryAgent] Output quality assessment passed: ${this.validateMemoryTaskOutput(job, finalOutput)}`);
      
      return {
        ok: success,
        artifact: finalOutput,
        stepsUsed: 0,
        planUsed: `Memory-focused approach for ${job.category}`,
        adjustments: success ? 
          ['Maintain current memory strategy'] : 
          ['Improve memory utilization'],
      };
      
    } catch (error) {
      console.error(`[SimpleMemoryAgent] Agent ${this.id} failed:`, error);
      
      // Store failure in memory
      const memory = memoryManager.getMemory(this.id);
      memory.remember({
        category: job.category,
        payload: job.payload,
        success: false,
        artifact: `Failed: ${error}`,
        stepsUsed: 0,
        planUsed: 'Failed to apply memory strategy',
        adjustments: ['Fix memory agent error', 'Improve error handling'],
      });
      
      return {
        ok: false,
        artifact: `Memory agent failed: ${error}`,
        stepsUsed: 0,
        planUsed: 'Failed to apply memory strategy',
        adjustments: ['Fix memory agent error'],
      };
    }
  }

  private buildMemoryTaskMessage(job: JobData, memoryContext: string): string {
    const availableTools = this.tools.join(', ');
    
    let taskDescription = '';
    let memoryGuidance = '';
    
    switch (job.category) {
      case 'summarize':{
        const { text, maxWords } = job.payload as any;
        taskDescription = `Summarize the following text in ${maxWords || 50} words or less: ${text}`;
        memoryGuidance = "Use your memory of previous summarization tasks to identify key patterns and important information types.";
        break;
        }
        
      case 'classify':{
        const { labels, answer } = job.payload as any;
        taskDescription = `Classify the content into one of these categories: ${labels?.join(', ') || 'appropriate category'}. Content: ${answer}`;
        memoryGuidance = "Leverage your memory of previous classifications to identify distinguishing features and patterns.";
        break;
        }
        
      case 'web_research':{
        const { url, question } = job.payload as any;
        taskDescription = `Research the question "${question}" by navigating to ${url} and extracting relevant information.`;
        memoryGuidance = "Use your memory of successful research strategies and information extraction techniques.";
        break;
        }
        
      case 'math':{
        const { expr } = job.payload as any;
        taskDescription = `Calculate the mathematical expression: ${expr}`;
        memoryGuidance = "Apply your memory of mathematical problem-solving approaches and verification methods.";
        break;
        }
        
      default:
        taskDescription = `Complete the ${job.category} task with payload: ${JSON.stringify(job.payload)}`;
        memoryGuidance = "Use your accumulated experience to approach this task systematically.";
    }
    
    return `You are a memory-specialized AI agent with access to these tools: ${availableTools}

AGENT MEMORY AND EXPERIENCE:
${memoryContext}

MEMORY GUIDANCE: ${memoryGuidance}

TASK: ${taskDescription}

Use your tools and past experience to complete this task with high accuracy. Be systematic and leverage patterns from your memory.`;
  }

  private validateMemoryTaskOutput(job: JobData, output: string): boolean {
    switch (job.category) {
      case 'summarize':{
        const { maxWords } = job.payload as any;
        const wordCount = output.trim().split(/\s+/).length;
        return wordCount <= (maxWords || 50) + 5; // Allow small buffer
        
      case 'classify':{
        const { labels } = job.payload as any;
        if (labels && labels.length > 0) {
          return labels.some((label: string) => 
            output.toLowerCase().includes(label.toLowerCase())
          );
        }
        return output.length > 3; // Basic validation
        
      case 'math':{
        // Check if output contains a number
        return /\d/.test(output);
        
      case 'web_research':{
        // Check if output contains substantive content
        return output.length > 20 && !output.includes('navigate to');
        
      default:
        return output.length > 5;
    }
  }
}