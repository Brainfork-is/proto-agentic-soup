export const sort_numbers_ascending = {
  name: 'sort_numbers_ascending',
  description: 'Sorts a list of numbers in ascending order.',
  async invoke(params) {
    try {
      const { numbers } = params;

      // Input validation
      if (!Array.isArray(numbers)) {
        throw new Error('Invalid input: "numbers" must be an array.');
      }
      if (numbers.some(isNaN)) {
        throw new Error('Invalid input: All elements in "numbers" must be valid numbers.');
      }

      // Processing logic
      const sortedNumbers = [...numbers].sort((a, b) => a - b);
      const result = sortedNumbers;

      return JSON.stringify({
        success: true,
        result: result,
        processedAt: new Date().toISOString(),
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message,
        toolName: 'sort_numbers_ascending',
      });
    }
  },
};
