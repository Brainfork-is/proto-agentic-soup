export const revenue_growth_rate_calculator = {
  name: 'revenue_growth_rate_calculator',
  description:
    'Calculates the Year-over-Year (YoY) Revenue Growth Rate given current and previous year revenue figures.',
  async invoke(params) {
    try {
      const { current_year_revenue, previous_year_revenue } = params;

      if (typeof current_year_revenue !== 'number' || typeof previous_year_revenue !== 'number') {
        throw new Error('Both current_year_revenue and previous_year_revenue must be numbers.');
      }

      if (previous_year_revenue === 0) {
        if (current_year_revenue === 0) {
          throw new Error(
            'Cannot calculate growth rate when both current and previous year revenues are zero.'
          );
        } else {
          throw new Error(
            'Cannot calculate growth rate when previous year revenue is zero and current year revenue is non-zero. Growth is infinite.'
          );
        }
      }

      // Mathematical operations
      const growthRate =
        ((current_year_revenue - previous_year_revenue) / previous_year_revenue) * 100;
      const result = parseFloat(growthRate.toFixed(2));

      return JSON.stringify({
        success: true,
        result: result,
        calculation:
          '((current_year_revenue - previous_year_revenue) / previous_year_revenue) * 100',
        computedAt: new Date().toISOString(),
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message,
        toolName: 'revenue_growth_rate_calculator',
      });
    }
  },
};
