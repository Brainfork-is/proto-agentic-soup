/**
 * Enhanced calculator tool using mathjs for safe expression evaluation
 * and LangChain for word problem solving
 */

import { evaluate, format } from 'mathjs';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { createLangChainLLM } from '../langchainProvider';

interface CalcInput {
  expr: string;
  mode?: 'expression' | 'word_problem' | 'auto';
}

interface CalcResult {
  ok: boolean;
  value?: number;
  explanation?: string;
  method: 'mathjs' | 'llm_parsed' | 'mock' | 'error';
}

/**
 * Determines if the input looks like a word problem vs mathematical expression
 */
function isWordProblem(expr: string): boolean {
  // Check for common word problem indicators
  const wordIndicators = [
    'how many',
    'what is',
    'if',
    'when',
    'calculate',
    'find',
    'total',
    'sum',
    'difference',
    'product',
    'quotient',
    'percent',
    'percentage',
    'rate',
    'speed',
    'distance',
    'time',
    'cost',
    'price',
    'profit',
    'loss',
  ];

  const hasWords = wordIndicators.some((indicator) => expr.toLowerCase().includes(indicator));

  // Check if it contains mostly numbers and operators (mathematical expression)
  const mathExpressionPattern = /^[\d+\-*/().\s,]+$/;
  const isMathExpression = mathExpressionPattern.test(expr.trim());

  return hasWords && !isMathExpression;
}

/**
 * Safely evaluate mathematical expressions using mathjs
 */
function evaluateExpression(expr: string): CalcResult {
  try {
    // Clean the expression - remove commas, extra spaces
    const cleanExpr = expr.replace(/,/g, '').replace(/\s+/g, ' ').trim();

    // Validate that the expression only contains safe characters
    const safePattern = /^[\d+\-*/().\s]+$/;
    if (!safePattern.test(cleanExpr)) {
      return {
        ok: false,
        method: 'error',
        explanation: 'Expression contains unsafe characters',
      };
    }

    // Evaluate using mathjs (much safer than eval)
    const result = evaluate(cleanExpr);

    // Ensure result is a number
    if (typeof result !== 'number' || !isFinite(result)) {
      return {
        ok: false,
        method: 'error',
        explanation: 'Expression did not evaluate to a valid number',
      };
    }

    return {
      ok: true,
      value: result,
      method: 'mathjs',
      explanation: `Evaluated "${cleanExpr}" = ${format(result, { precision: 14 })}`,
    };
  } catch (error) {
    return {
      ok: false,
      method: 'error',
      explanation: `Math evaluation failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Use LLM to solve word problems by extracting mathematical expressions
 */
async function solveWordProblem(problem: string): Promise<CalcResult> {
  try {
    const llm = createLangChainLLM('calc-tool');

    const prompt = ChatPromptTemplate.fromTemplate(`
You are a mathematical calculator. Solve the word problem step by step and give ONLY the final number.

Examples:
- "What is 5 plus 3?" → Answer: 8
- "If I have 10 apples and give away 3, how many do I have left?" → Answer: 7  
- "Calculate the total of 12 and 8" → Answer: 20

Problem: {problem}

Think step by step:
1. Identify the numbers in the problem
2. Identify the operation (addition, subtraction, multiplication, division)
3. Calculate the result
4. Respond with ONLY the final number

Answer:`);

    const chain = prompt.pipe(llm).pipe(new StringOutputParser());

    const response = await chain.invoke({ problem });

    // Try to extract the final number - look for number at the end or after "Answer:"
    let finalNumber: number | null = null;

    // First try to find a number after "Answer:" or at the very end
    const answerMatch = response.match(/(?:Answer:|answer:)\s*(-?\d+(?:\.\d+)?)/i);
    if (answerMatch) {
      finalNumber = parseFloat(answerMatch[1]);
    } else {
      // Look for the last number in the response (likely the final answer)
      const allNumbers = response.match(/-?\d+(?:\.\d+)?/g);
      if (allNumbers && allNumbers.length > 0) {
        finalNumber = parseFloat(allNumbers[allNumbers.length - 1]);
      }
    }

    if (finalNumber !== null && isFinite(finalNumber)) {
      return {
        ok: true,
        value: finalNumber,
        method: 'llm_parsed',
        explanation: `Word problem solved: "${problem}" → ${finalNumber}`,
      };
    }

    // If we can't extract a number, it might be an expression we can evaluate
    if (!response.includes('ERROR')) {
      const mathResult = evaluateExpression(response.trim());
      if (mathResult.ok) {
        return {
          ...mathResult,
          method: 'llm_parsed',
          explanation: `Word problem converted to expression: "${response.trim()}" = ${mathResult.value}`,
        };
      }
    }

    return {
      ok: false,
      method: 'error',
      explanation: `LLM could not solve word problem: ${response}`,
    };
  } catch (error) {
    return {
      ok: false,
      method: 'error',
      explanation: `Word problem solving failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Fallback mock calculation for simple expressions when LLM is unavailable
 */
function mockCalculation(expr: string): CalcResult {
  // Very simple fallback - try to handle basic arithmetic
  try {
    // Only handle very simple expressions like "2+2", "10*5", etc.
    const simplePattern = /^\s*(\d+(?:\.\d+)?)\s*([+\-*/])\s*(\d+(?:\.\d+)?)\s*$/;
    const match = expr.match(simplePattern);

    if (match) {
      const [, num1, op, num2] = match;
      const a = parseFloat(num1);
      const b = parseFloat(num2);

      let result: number;
      switch (op) {
        case '+': {
          result = a + b;
          break;
        }
        case '-': {
          result = a - b;
          break;
        }
        case '*': {
          result = a * b;
          break;
        }
        case '/': {
          result = b !== 0 ? a / b : NaN;
          break;
        }
        default:
          return { ok: false, method: 'error', explanation: 'Unsupported operation' };
      }

      if (isFinite(result)) {
        return {
          ok: true,
          value: result,
          method: 'mock',
          explanation: `Simple calculation: ${a} ${op} ${b} = ${result}`,
        };
      }
    }

    return {
      ok: false,
      method: 'error',
      explanation: 'Mock calc only supports simple expressions',
    };
  } catch (error) {
    return { ok: false, method: 'error', explanation: 'Mock calculation failed' };
  }
}

/**
 * Main calculation function with automatic mode detection
 */
export async function calculate(input: CalcInput): Promise<CalcResult> {
  const { expr, mode = 'auto' } = input;

  // Log the calculation attempt
  console.log(`[CalcTool] Processing: "${expr}" (mode: ${mode})`);

  // Determine the approach based on mode and content
  let useWordProblemSolver = false;

  if (mode === 'word_problem') {
    useWordProblemSolver = true;
  } else if (mode === 'auto') {
    useWordProblemSolver = isWordProblem(expr);
  }
  // mode === 'expression' defaults to useWordProblemSolver = false

  // Try word problem solving first if indicated
  if (useWordProblemSolver && process.env.LANGCHAIN_ENABLED === 'true') {
    console.log(`[CalcTool] Attempting word problem solving with LLM`);
    const wordResult = await solveWordProblem(expr);
    if (wordResult.ok) {
      console.log(`[CalcTool] ✅ Word problem solved: ${wordResult.value}`);
      return wordResult;
    }
    console.log(`[CalcTool] ⚠️ Word problem solving failed, falling back to expression evaluation`);
  }

  // Try mathematical expression evaluation
  console.log(`[CalcTool] Attempting expression evaluation with mathjs`);
  const mathResult = evaluateExpression(expr);
  if (mathResult.ok) {
    console.log(`[CalcTool] ✅ Expression evaluated: ${mathResult.value}`);
    return mathResult;
  }

  // Final fallback to simple mock calculation
  console.log(`[CalcTool] ⚠️ Expression evaluation failed, trying mock calculation`);
  const mockResult = mockCalculation(expr);
  if (mockResult.ok) {
    console.log(`[CalcTool] ✅ Mock calculation succeeded: ${mockResult.value}`);
  } else {
    console.log(`[CalcTool] ❌ All calculation methods failed`);
  }

  return mockResult;
}

/**
 * Tool wrapper class for integration with existing tool system
 */
export class CalculatorTool {
  async call(input: CalcInput): Promise<CalcResult> {
    return await calculate(input);
  }

  // Legacy interface compatibility
  async run(input: { expr: string }): Promise<{ ok: boolean; value?: number }> {
    const result = await calculate(input);
    return {
      ok: result.ok,
      value: result.value,
    };
  }
}

// Export default instance
export const calculatorTool = new CalculatorTool();
