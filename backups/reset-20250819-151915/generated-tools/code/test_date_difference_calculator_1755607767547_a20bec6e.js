export const date_difference_calculator = {
  name: 'date_difference_calculator',
  description: 'Calculates the number of days between two dates.',
  async invoke(params) {
    try {
      const { startDate, endDate } = params;

      if (!startDate || typeof startDate !== 'string') {
        throw new Error('startDate is a required string parameter in YYYY-MM-DD format.');
      }
      if (!endDate || typeof endDate !== 'string') {
        throw new Error('endDate is a required string parameter in YYYY-MM-DD format.');
      }

      const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
      if (!dateRegex.test(startDate)) {
        throw new Error('startDate must be in YYYY-MM-DD format.');
      }
      if (!dateRegex.test(endDate)) {
        throw new Error('endDate must be in YYYY-MM-DD format.');
      }

      const start = new Date(startDate);
      const end = new Date(endDate);

      // Check if dates are valid after parsing
      if (isNaN(start.getTime())) {
        throw new Error(`Invalid startDate provided: ${startDate}`);
      }
      if (isNaN(end.getTime())) {
        throw new Error(`Invalid endDate provided: ${endDate}`);
      }

      // Calculate the difference in milliseconds
      const timeDiff = end.getTime() - start.getTime();

      // Convert milliseconds to days
      // 1 day = 24 hours * 60 minutes * 60 seconds * 1000 milliseconds
      const daysDiff = Math.round(timeDiff / (1000 * 60 * 60 * 24));

      let result = daysDiff;

      return JSON.stringify({
        success: true,
        result: result,
        calculation: 'Difference in days between endDate and startDate',
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
