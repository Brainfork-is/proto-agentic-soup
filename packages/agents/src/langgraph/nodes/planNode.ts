/**
 * Planning Node - Creates execution plan for the job
 */

import { AgentStateType } from '../agentState';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

export async function planNode(state: AgentStateType): Promise<Partial<AgentStateType>> {
  const { jobData, memory } = state;

  // Build memory context
  const memoryContext =
    memory.length > 0
      ? `Previous experience: ${memory.length} jobs, ${Math.round((memory.filter((m) => m.success).length / memory.length) * 100)}% success rate`
      : 'No previous experience';

  // Create task-specific planning prompt
  let taskDescription = '';
  let availableTools = ['calculator', 'text_processor', 'browser', 'knowledge_retrieval'];

  switch (jobData.category) {
    case 'math': {
      const { expr } = jobData.payload as any;
      taskDescription = `Solve the mathematical expression: ${expr}`;
      availableTools = ['calculator'];
      break;
    }

    case 'summarize': {
      const { text, maxWords } = jobData.payload as any;
      taskDescription = `Summarize this text in ${maxWords || 50} words: "${text}"`;
      availableTools = ['text_processor'];
      break;
    }

    case 'classify': {
      const { text: classifyText, labels } = jobData.payload as any;
      taskDescription = `Classify this text into one of these categories [${labels?.join(', ')}]: "${classifyText}"`;
      availableTools = ['text_processor'];
      break;
    }

    case 'web_research': {
      const { url, question } = jobData.payload as any;
      taskDescription = `Research the question "${question}" by navigating to ${url}`;
      availableTools = ['browser', 'knowledge_retrieval'];
      break;
    }

    default:
      taskDescription = `Complete task: ${JSON.stringify(jobData.payload)}`;
  }

  const planningPrompt = `You are an AI agent planning how to complete a task efficiently.

TASK: ${taskDescription}
AVAILABLE TOOLS: ${availableTools.join(', ')}
CONTEXT: ${memoryContext}

Create a step-by-step plan using the available tools. Be specific about tool parameters.

Respond with JSON in this exact format:
{
  "goal": "Clear description of what you want to achieve",
  "steps": [
    {
      "tool": "tool_name",
      "params": {"param1": "value1"},
      "reasoning": "Why this step is needed"
    }
  ]
}

Only use the available tools listed above.`;

  return {
    messages: [
      new SystemMessage('You are a planning AI agent. Create efficient execution plans.'),
      new HumanMessage(planningPrompt),
    ],
  };
}
