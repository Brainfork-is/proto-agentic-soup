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
    description: 'Process and transform data with custom logic',
    pattern: `
export const {{TOOL_NAME}} = {
  name: '{{TOOL_NAME}}',
  description: '{{DESCRIPTION}}',
  async invoke(params) {
    try {
      const { {{INPUT_PARAMS}} } = params;
      
      // Input validation
      {{VALIDATION_CODE}}
      
      // Processing logic
      {{PROCESSING_CODE}}
      
      return JSON.stringify({
        success: true,
        result: result,
        processedAt: new Date().toISOString()
      });
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
      
      return JSON.stringify({
        success: true,
        result: result,
        calculation: '{{CALCULATION_DESCRIPTION}}',
        computedAt: new Date().toISOString()
      });
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
      'MATH_CODE',
      'CALCULATION_DESCRIPTION',
    ],
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
      
      return JSON.stringify({
        success: true,
        originalText: text,
        result: result,
        analysisType: '{{ANALYSIS_TYPE}}',
        analyzedAt: new Date().toISOString()
      });
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
    placeholders: ['TOOL_NAME', 'DESCRIPTION', 'OTHER_PARAMS', 'ANALYSIS_CODE', 'ANALYSIS_TYPE'],
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
      
      return JSON.stringify({
        success: true,
        isValid: isValid,
        validationResults: validationResults,
        data: data,
        validatedAt: new Date().toISOString()
      });
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
    placeholders: ['TOOL_NAME', 'DESCRIPTION', 'VALIDATION_PARAMS', 'VALIDATION_RULES'],
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
      
      return JSON.stringify({
        success: true,
        originalData: data,
        formattedData: formattedResult,
        formatType: '{{FORMAT_TYPE}}',
        formattedAt: new Date().toISOString()
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message,
        toolName: '{{TOOL_NAME}}'
      });
    }
  }
};

// CommonJS export for runtime loader compatibility
module.exports = {{TOOL_NAME}};`,
    placeholders: ['TOOL_NAME', 'DESCRIPTION', 'FORMAT_PARAMS', 'FORMATTING_CODE', 'FORMAT_TYPE'],
  },
};

/**
 * Get the most appropriate template based on task description
 */
export function selectTemplate(taskDescription: string): ToolTemplate {
  const desc = taskDescription.toLowerCase();

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
