export const roi_calculator = {
  name: 'roi_calculator',
  description: 'Calculates the Return on Investment (ROI) as a percentage.',
  async invoke(params) {
    try {
      const { revenue, cost } = params;

      if (typeof revenue !== 'number' || typeof cost !== 'number') {
        throw new Error('Invalid input types. Both revenue and cost must be numbers.');
      }

      if (cost === 0) {
        throw new Error('Cost cannot be zero for ROI calculation.');
      }

      if (cost < 0 || revenue < 0) {
        throw new Error('Revenue and cost must be non-negative.');
      }

      // Mathematical operations
      const roi = ((revenue - cost) / cost) * 100;
      const result = parseFloat(roi.toFixed(1));

      return JSON.stringify({
        success: true,
        result: result,
        calculation: 'ROI = ((Revenue - Cost) / Cost) * 100',
        computedAt: new Date().toISOString(),
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message,
        toolName: 'roi_calculator',
      });
    }
  },
};
