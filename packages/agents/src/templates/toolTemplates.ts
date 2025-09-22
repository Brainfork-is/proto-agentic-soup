/**
 * Tool Templates for Dynamic Tool Generation
 * Provides base patterns for common tool types
 */

export interface ToolTemplate {
  name: string;
  description: string;
  pattern: string;
  placeholders: string[];
}

export const TOOL_TEMPLATES: Record<string, ToolTemplate> = {
  dataProcessor: {
    name: 'Data Processing Tool',
    description: 'Process and transform data with custom logic using real data sources',
    pattern: `
// Available packages and functions:
// const axios = require('axios').default || require('axios'); // Handle ES6 default export
// const cheerio = require('cheerio');
// const lodash = require('lodash');
// const dateUtils = require('date-fns');
// const webData = await webResearch('query');
// const htmlContent = await fetchWebContent('url');
// const $ = parseHTML(htmlContent);

const {{TOOL_NAME}} = {
  name: '{{TOOL_NAME}}',
  description: '{{DESCRIPTION}}',
  async invoke(params) {
    try {
      const { {{INPUT_PARAMS}} } = params;

      // Input validation
      {{VALIDATION_CODE}}

      // Use real data sources - Examples:
      // const webData = await webResearch('relevant query');
      // const axios = require('axios').default || require('axios');
      // const apiData = await axios.get('https://api.example.com/data');
      // const parsedHtml = parseHTML(await fetchWebContent('https://example.com'));

      // Processing logic with real data
      {{PROCESSING_CODE}}

      const output = {
        success: true,
        {{SUCCESS_FIELDS}}
      };

      return JSON.stringify(output);
    } catch (error) {
      const errMsg = (error && typeof error === 'object' && 'message' in (error as any))
        ? (error as any).message
        : 'Tool execution failed';
      return JSON.stringify({
        success: false,
        error: errMsg,
        toolName: '{{TOOL_NAME}}'
      });
    }
  }
};

// CommonJS export for runtime loader compatibility
module.exports = {{TOOL_NAME}};`,
    placeholders: [
      'TOOL_NAME',
      'DESCRIPTION',
      'INPUT_PARAMS',
      'VALIDATION_CODE',
      'PROCESSING_CODE',
      'SUCCESS_FIELDS',
    ],
  },

  calculator: {
    name: 'Mathematical Calculator Tool',
    description: 'Perform mathematical calculations and operations',
    pattern: `
export const {{TOOL_NAME}} = {
  name: '{{TOOL_NAME}}',
  description: '{{DESCRIPTION}}',
  async invoke(params) {
    try {
      const { {{INPUT_PARAMS}} } = params;
      
      // Mathematical operations
      {{MATH_CODE}}
      
      const output = {
        success: true,
        {{CALCULATION_FIELDS}}
      };

      return JSON.stringify(output);
    } catch (error) {
      const errMsg = (error && typeof error === 'object' && 'message' in (error as any))
        ? (error as any).message
        : 'Tool execution failed';
      return JSON.stringify({
        success: false,
        error: errMsg,
        toolName: '{{TOOL_NAME}}'
      });
    }
  }
};

// CommonJS export for runtime loader compatibility
module.exports = {{TOOL_NAME}};`,
    placeholders: ['TOOL_NAME', 'DESCRIPTION', 'INPUT_PARAMS', 'MATH_CODE', 'CALCULATION_FIELDS'],
  },

  textAnalyzer: {
    name: 'Text Analysis Tool',
    description: 'Analyze and process text content',
    pattern: `
export const {{TOOL_NAME}} = {
  name: '{{TOOL_NAME}}',
  description: '{{DESCRIPTION}}',
  async invoke(params) {
    try {
      const { text, {{OTHER_PARAMS}} } = params;
      
      if (!text || typeof text !== 'string') {
        throw new Error('Text parameter is required and must be a string');
      }
      
      // Text analysis logic
      {{ANALYSIS_CODE}}
      
      const output = {
        success: true,
        {{ANALYSIS_FIELDS}}
      };

      return JSON.stringify(output);
    } catch (error) {
      const errMsg = (error && typeof error === 'object' && 'message' in (error as any))
        ? (error as any).message
        : 'Tool execution failed';
      return JSON.stringify({
        success: false,
        error: errMsg,
        toolName: '{{TOOL_NAME}}'
      });
    }
  }
};

// CommonJS export for runtime loader compatibility
module.exports = {{TOOL_NAME}};`,
    placeholders: ['TOOL_NAME', 'DESCRIPTION', 'OTHER_PARAMS', 'ANALYSIS_CODE', 'ANALYSIS_FIELDS'],
  },

  validator: {
    name: 'Data Validation Tool',
    description: 'Validate data against specific criteria',
    pattern: `
export const {{TOOL_NAME}} = {
  name: '{{TOOL_NAME}}',
  description: '{{DESCRIPTION}}',
  async invoke(params) {
    try {
      const { data, {{VALIDATION_PARAMS}} } = params;
      
      // Validation logic
      const validationResults = [];
      {{VALIDATION_RULES}}
      
      const isValid = validationResults.every(r => r.passed);
      
      const output = {
        success: true,
        {{VALIDATION_FIELDS}}
      };

      return JSON.stringify(output);
    } catch (error) {
      const errMsg = (error && typeof error === 'object' && 'message' in (error as any))
        ? (error as any).message
        : 'Tool execution failed';
      return JSON.stringify({
        success: false,
        error: errMsg,
        toolName: '{{TOOL_NAME}}'
      });
    }
  }
};

// CommonJS export for runtime loader compatibility
module.exports = {{TOOL_NAME}};`,
    placeholders: [
      'TOOL_NAME',
      'DESCRIPTION',
      'VALIDATION_PARAMS',
      'VALIDATION_RULES',
      'VALIDATION_FIELDS',
    ],
  },

  formatter: {
    name: 'Data Formatting Tool',
    description: 'Format and transform data structures',
    pattern: `
export const {{TOOL_NAME}} = {
  name: '{{TOOL_NAME}}',
  description: '{{DESCRIPTION}}',
  async invoke(params) {
    try {
      const { data, {{FORMAT_PARAMS}} } = params;

      // Formatting logic
      {{FORMATTING_CODE}}

      const output = {
        success: true,
        {{FORMAT_FIELDS}}
      };

      return JSON.stringify(output);
    } catch (error) {
      const errMsg = (error && typeof error === 'object' && 'message' in (error as any))
        ? (error as any).message
        : 'Tool execution failed';
      return JSON.stringify({
        success: false,
        error: errMsg,
        toolName: '{{TOOL_NAME}}'
      });
    }
  }
};

// CommonJS export for runtime loader compatibility
module.exports = {{TOOL_NAME}};`,
    placeholders: ['TOOL_NAME', 'DESCRIPTION', 'FORMAT_PARAMS', 'FORMATTING_CODE', 'FORMAT_FIELDS'],
  },

  webResearcher: {
    name: 'Web Research Tool',
    description: 'Research and gather information from the internet',
    pattern: `
// Web Research Tool with internet access and npm packages
const axios = require('axios').default || require('axios');
const cheerio = require('cheerio');

const {{TOOL_NAME}} = {
  name: '{{TOOL_NAME}}',
  description: '{{DESCRIPTION}}',
  async invoke(params) {
    try {
      const { {{INPUT_PARAMS}} } = params;

      // Input validation
      {{VALIDATION_CODE}}

      // Use axios for direct API calls or webResearch for search
      // For direct URLs: const response = await axios.get('https://api.example.com/data');
      // For general web search: const searchResults = await webResearch(query);
      // For specific URL content: const webContent = await fetchWebContent('https://example.com');
      // Note: axios might need .default: const axios = require('axios').default || require('axios');

      {{RESEARCH_PROCESSING}}

      const output = {
        success: true,
        {{RESEARCH_FIELDS}}
      };

      return JSON.stringify(output);
    } catch (error) {
      const errMsg = (error && typeof error === 'object' && 'message' in (error as any))
        ? (error as any).message
        : 'Web research failed';
      return JSON.stringify({
        success: false,
        error: errMsg,
        toolName: '{{TOOL_NAME}}'
      });
    }
  }
};

// CommonJS export for runtime loader compatibility
module.exports = {{TOOL_NAME}};`,
    placeholders: [
      'TOOL_NAME',
      'DESCRIPTION',
      'INPUT_PARAMS',
      'VALIDATION_CODE',
      'RESEARCH_PROCESSING',
      'RESEARCH_FIELDS',
    ],
  },
};

/**
 * Get the most appropriate template based on task description
 */
export function selectTemplate(taskDescription: string): ToolTemplate {
  const desc = taskDescription.toLowerCase();

  if (
    desc.includes('research') ||
    desc.includes('search') ||
    desc.includes('web') ||
    desc.includes('internet') ||
    desc.includes('fetch') ||
    desc.includes('crawl') ||
    desc.includes('scrape') ||
    desc.includes('url') ||
    desc.includes('website') ||
    desc.includes('news') ||
    desc.includes('latest') ||
    desc.includes('current')
  ) {
    return TOOL_TEMPLATES.webResearcher;
  }

  if (desc.includes('calculat') || desc.includes('math') || desc.includes('compute')) {
    return TOOL_TEMPLATES.calculator;
  }

  if (desc.includes('text') || desc.includes('analyz') || desc.includes('parse')) {
    return TOOL_TEMPLATES.textAnalyzer;
  }

  if (desc.includes('validat') || desc.includes('check') || desc.includes('verify')) {
    return TOOL_TEMPLATES.validator;
  }

  if (desc.includes('format') || desc.includes('transform') || desc.includes('convert')) {
    return TOOL_TEMPLATES.formatter;
  }

  // Default to data processor for general tasks
  return TOOL_TEMPLATES.dataProcessor;
}

/**
 * Fill template placeholders with actual values
 */
export function fillTemplate(template: ToolTemplate, values: Record<string, string>): string {
  let code = template.pattern;

  for (const placeholder of template.placeholders) {
    const value = values[placeholder] || '';
    const regex = new RegExp(`{{${placeholder}}}`, 'g');
    code = code.replace(regex, value);
  }

  return code;
}
