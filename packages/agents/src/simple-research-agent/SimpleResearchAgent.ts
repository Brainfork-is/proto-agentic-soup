/**
 * Simple ResearchAgent specialized for web research and information gathering
 * Optimized for web_research tasks with enhanced browser interaction
 */

import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { ChatOllama } from '@langchain/ollama';
import { JobData } from '@soup/common';
import { memoryManager } from '../agentMemory';
import { createToolsForAgent } from '../langchain-tools';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export class SimpleResearchAgent {
  id: string;
  temperature: number;
  tools: string[];
  private agent: any;

  constructor(id: string, temperature: number, tools: string[]) {
    this.id = id;
    this.temperature = temperature;
    this.tools = tools;
    
    // Create Ollama chat model with higher temperature for creative research approaches
    const llm = new ChatOllama({
      model: process.env.LOCAL_MODEL_PATH || 'llama3.1:8b',
      temperature: Math.min(0.9, temperature + 0.1), // Higher temperature for research creativity
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    });
    
    // Create LangChain tools with focus on browser and retrieval
    const langchainTools = createToolsForAgent(id, tools);
    
    // Create ReAct agent optimized for research tasks
    this.agent = createReactAgent({
      llm,
      tools: langchainTools,
    });
    
    console.log(`[SimpleResearchAgent] Created research-specialized agent ${id} with tools: ${tools.join(', ')}`);
  }

  async handle(job: JobData) {
    try {
      console.log(`[SimpleResearchAgent] Agent ${this.id} handling ${job.category} job`);
      
      // Get agent memory for research context
      const memory = memoryManager.getMemory(this.id);
      const memoryContext = memory.generateContext();
      
      // Build research-focused task message
      const taskMessage = this.buildResearchTaskMessage(job, memoryContext);
      
      // Add system message for research specialization
      const systemMessage = new SystemMessage(
        "You are a research-specialized AI agent. You excel at web navigation, " +
        "information extraction, data gathering, and synthesizing findings from multiple sources. " +
        "You are persistent, thorough, and skilled at finding the most relevant information. " +
        "Always verify your findings and provide comprehensive, well-structured results."
      );
      
      // Invoke agent with research-focused prompting
      const startTime = Date.now();
      const result = await this.agent.invoke({
        messages: [systemMessage, new HumanMessage(taskMessage)]
      });
      
      const duration = Date.now() - startTime;
      
      // Extract final response from agent messages
      const messages = result.messages || [];
      const lastMessage = messages[messages.length - 1];
      const finalOutput = lastMessage?.content || 'Research completed';
      
      // Research agent success criteria - focus on information quality and completeness
      const success = finalOutput && 
                     finalOutput.length > 20 && 
                     !finalOutput.toLowerCase().includes('error') &&
                     !finalOutput.toLowerCase().includes('failed') &&
                     this.validateResearchOutput(job, finalOutput);
      
      // Store research experience in memory
      memory.remember({
        category: job.category,
        payload: job.payload,
        success,
        artifact: finalOutput,
        stepsUsed: 0,
        planUsed: `Research strategy for ${job.category}`,
        adjustments: success ? 
          ['Maintain thorough research approach'] : 
          ['Improve information extraction', 'Enhance search strategies'],
      });
      
      console.log(`[SimpleResearchAgent] Agent ${this.id} completed ${job.category} in ${duration}ms - Success: ${success}`);
      console.log(`[SimpleResearchAgent] Research quality assessment: ${this.validateResearchOutput(job, finalOutput)}`);
      
      return {
        ok: success,
        artifact: finalOutput,
        stepsUsed: 0,
        planUsed: `Research strategy for ${job.category}`,
        adjustments: success ? 
          ['Maintain thorough research approach'] : 
          ['Improve information extraction'],
      };
      
    } catch (error) {
      console.error(`[SimpleResearchAgent] Agent ${this.id} failed:`, error);
      
      // Store failure in memory
      const memory = memoryManager.getMemory(this.id);
      memory.remember({
        category: job.category,
        payload: job.payload,
        success: false,
        artifact: `Research failed: ${error}`,
        stepsUsed: 0,
        planUsed: 'Failed research attempt',
        adjustments: ['Fix research agent error', 'Improve error recovery'],
      });
      
      return {
        ok: false,
        artifact: `Research agent failed: ${error}`,
        stepsUsed: 0,
        planUsed: 'Failed research attempt',
        adjustments: ['Fix research agent error'],
      };
    }
  }

  private buildResearchTaskMessage(job: JobData, memoryContext: string): string {
    const availableTools = this.tools.join(', ');
    
    let taskDescription = '';
    let researchGuidance = '';
    
    switch (job.category) {
      case 'web_research':{
        const { url, question } = job.payload as any;
        taskDescription = `Research the question "${question}" by navigating to ${url} and extracting comprehensive information.`;
        researchGuidance = "Navigate the website systematically, extract key information, and provide a well-structured answer based on your findings. Use multiple browser interactions if needed to gather complete information.";
        break;
        }
        
      case 'summarize':{
        const { text, maxWords } = job.payload as any;
        taskDescription = `Research and summarize the key points from this text in ${maxWords || 50} words: ${text}`;
        researchGuidance = "Identify the most important information, research any unclear terms if needed, and create a comprehensive yet concise summary.";
        break;
        }
        
      case 'classify':{
        const { labels, answer } = job.payload as any;
        taskDescription = `Research and classify this content into categories: ${labels?.join(', ') || 'appropriate category'}. Content: ${answer}`;
        researchGuidance = "Analyze the content thoroughly, research context if needed, and make an informed classification decision.";
        break;
        }
        
      case 'math':{
        const { expr } = job.payload as any;
        taskDescription = `Research and solve this mathematical expression: ${expr}`;
        researchGuidance = "Break down the problem, use calculation tools, and verify your results through multiple approaches if possible.";
        break;
        }
        
      default:
        taskDescription = `Research and complete the ${job.category} task: ${JSON.stringify(job.payload)}`;
        researchGuidance = "Apply systematic research methodology to understand and complete this task thoroughly.";
    }
    
    return `You are a research-specialized AI agent with access to these tools: ${availableTools}

RESEARCH EXPERIENCE AND MEMORY:
${memoryContext}

RESEARCH GUIDANCE: ${researchGuidance}

RESEARCH TASK: ${taskDescription}

Use your research tools systematically to gather comprehensive information. Be thorough, verify your findings, and provide detailed, well-structured results.`;
  }

  private validateResearchOutput(job: JobData, output: string): boolean {
    // General quality checks for research output
    const hasSubstantiveContent = output.length > 30;
    const hasSpecificInformation = !output.includes('I cannot') && !output.includes('unable to');
    const notJustNavigation = !output.toLowerCase().includes('navigating to') || output.length > 50;
    
    switch (job.category) {
      case 'web_research':{
        // Research should contain specific findings, not just navigation descriptions
        return hasSubstantiveContent && 
               hasSpecificInformation && 
               notJustNavigation &&
               (output.includes('.') || output.includes(',') || output.includes(':'));
        
      case 'summarize':{
        const { maxWords } = job.payload as any;
        const wordCount = output.trim().split(/\s+/).length;
        return wordCount <= (maxWords || 50) + 10 && // Allow reasonable buffer
               hasSubstantiveContent;
        
      case 'classify':{
        const { labels } = job.payload as any;
        if (labels && labels.length > 0) {
          return labels.some((label: string) => 
            output.toLowerCase().includes(label.toLowerCase())
          ) && hasSubstantiveContent;
        }
        return hasSubstantiveContent;
        
      case 'math':{
        // Should contain numerical result
        return /\d/.test(output) && hasSubstantiveContent;
        
      default:
        return hasSubstantiveContent && hasSpecificInformation;
    }
  }
}