export const date_difference_calculator = {
  name: 'date_difference_calculator',
  description: 'Calculates the difference in days between two dates provided in YYYY-MM-DD format.',
  async invoke(params) {
    try {
      const { date1, date2 } = params;

      if (!date1 || typeof date1 !== 'string') {
        throw new Error('Invalid input: date1 must be a non-empty string.');
      }
      if (!date2 || typeof date2 !== 'string') {
        throw new Error('Invalid input: date2 must be a non-empty string.');
      }

      const date1Obj = new Date(date1);
      const date2Obj = new Date(date2);

      if (isNaN(date1Obj.getTime())) {
        throw new Error(
          `Invalid date format for date1. Expected YYYY-MM-DD, but received "${date1}".`
        );
      }
      if (isNaN(date2Obj.getTime())) {
        throw new Error(
          `Invalid date format for date2. Expected YYYY-MM-DD, but received "${date2}".`
        );
      }

      // Calculate the difference in milliseconds
      const timeDiff = Math.abs(date2Obj.getTime() - date1Obj.getTime());

      // Convert milliseconds to days
      const daysDiff = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));

      const result = daysDiff;

      return JSON.stringify({
        success: true,
        result: result,
        calculation: `Difference in days between ${date1} and ${date2}`,
        computedAt: new Date().toISOString(),
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message,
        toolName: 'date_difference_calculator',
      });
    }
  },
};
