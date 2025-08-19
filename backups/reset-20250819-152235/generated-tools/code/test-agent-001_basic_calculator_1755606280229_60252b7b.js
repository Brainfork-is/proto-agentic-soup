export const basic_calculator = {
  name: 'basic_calculator',
  description:
    'Performs basic arithmetic operations (add, subtract, multiply, divide) on two numbers.',
  async invoke(params) {
    try {
      const { operation, num1, num2 } = params;

      if (
        typeof operation !== 'string' ||
        !['add', 'subtract', 'multiply', 'divide'].includes(operation.toLowerCase())
      ) {
        throw new Error(
          'Invalid operation. Supported operations are: add, subtract, multiply, divide.'
        );
      }
      if (typeof num1 !== 'number' || isNaN(num1)) {
        throw new Error('Invalid input for num1. It must be a number.');
      }
      if (typeof num2 !== 'number' || isNaN(num2)) {
        throw new Error('Invalid input for num2. It must be a number.');
      }

      let result;
      const normalizedOperation = operation.toLowerCase();

      // Mathematical operations
      switch (normalizedOperation) {
        case 'add':
          result = num1 + num2;
          break;
        case 'subtract':
          result = num1 - num2;
          break;
        case 'multiply':
          result = num1 * num2;
          break;
        case 'divide':
          if (num2 === 0) {
            throw new Error('Division by zero is not allowed.');
          }
          result = num1 / num2;
          break;
        default:
          // This case should ideally not be reached due to prior validation, but included for robustness.
          throw new Error(`Unsupported operation: ${operation}`);
      }

      return JSON.stringify({
        success: true,
        result: result,
        calculation: `${num1} ${normalizedOperation} ${num2}`,
        computedAt: new Date().toISOString(),
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message,
        toolName: 'basic_calculator',
      });
    }
  },
};
