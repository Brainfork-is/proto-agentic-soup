/**
 * LangChain Tool Adapters for Soup Runner Tools
 * Converts our custom tools to LangChain format for use with prebuilt agents
 */

import { DynamicTool } from '@langchain/core/tools';
import { Tools } from '../tools';

// Browser Tool Adapter
export const createBrowserTool = (_agentId: string) => {
  return new DynamicTool({
    name: 'browser',
    description:
      'Navigate web pages, extract content, and interact with web elements. Requires url and steps array. Example: {"url": "https://example.com", "steps": [{"type": "extract", "selector": "body"}]}',
    func: async (input: string) => {
      try {
        const params = JSON.parse(input);
        const result = await Tools.browser(params);

        // Extract meaningful content for the agent
        if (result.content) {
          return `Successfully navigated to ${params.url}. Content extracted: ${result.content.substring(0, 1000)}...`;
        } else if (result.snippet) {
          return `Successfully navigated to ${params.url}. Snippet: ${result.snippet}`;
        } else {
          return `Successfully navigated to ${params.url}. Steps completed: ${params.steps.length}`;
        }
      } catch (error) {
        return `Browser error: ${error}`;
      }
    },
  });
};

// StringKit Tool Adapter
export const createStringKitTool = (agentId: string) => {
  return new DynamicTool({
    name: 'stringKit',
    description:
      'Summarize or classify text content. Example: {"text": "content to process", "mode": "summarize", "maxWords": 50}',
    func: async (input: string) => {
      try {
        const params = JSON.parse(input);
        const result = await Tools.stringKit(params, agentId);

        if (params.mode === 'summarize') {
          return `Summary: ${(result as any).text || result}`;
        } else {
          return `Classification: ${(result as any).label || result}`;
        }
      } catch (error) {
        return `StringKit error: ${error}`;
      }
    },
  });
};

// Calculator Tool Adapter
export const createCalcTool = () => {
  return new DynamicTool({
    name: 'calc',
    description: 'Evaluate mathematical expressions. Example: {"expr": "2 + 2 * 3"}',
    func: async (input: string) => {
      try {
        const params = JSON.parse(input);
        const result = await Tools.calc(params);

        if (result.ok) {
          return `Calculation result: ${result.value}`;
        } else {
          return `Calculation error: Invalid expression`;
        }
      } catch (error) {
        return `Calculator error: ${error}`;
      }
    },
  });
};

// Retrieval Tool Adapter
export const createRetrievalTool = () => {
  return new DynamicTool({
    name: 'retrieval',
    description:
      'Search the knowledge base for relevant information. Example: {"query": "search term"}',
    func: async (input: string) => {
      try {
        const params = JSON.parse(input);
        const result = await Tools.retrieval(params);

        if (result.snippet) {
          return `Search result: ${result.snippet}`;
        } else {
          return `No relevant results found for query: ${params.query}`;
        }
      } catch (error) {
        return `Retrieval error: ${error}`;
      }
    },
  });
};

// Tool Factory - creates appropriate tools based on agent configuration
export const createToolsForAgent = (agentId: string, toolNames: string[]) => {
  const tools = [];

  if (toolNames.includes('browser')) {
    tools.push(createBrowserTool(agentId));
  }

  if (toolNames.includes('stringKit')) {
    tools.push(createStringKitTool(agentId));
  }

  if (toolNames.includes('calc')) {
    tools.push(createCalcTool());
  }

  if (toolNames.includes('retrieval')) {
    tools.push(createRetrievalTool());
  }

  return tools;
};
