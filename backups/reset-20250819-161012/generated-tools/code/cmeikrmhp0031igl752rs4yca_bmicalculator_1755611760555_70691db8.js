export const bmicalculator = {
  name: 'bmicalculator',
  description:
    'Calculates Body Mass Index (BMI) given weight in kilograms and height in meters. Returns the BMI rounded to one decimal place.',
  async invoke(params) {
    try {
      const { weightKg, heightMeters } = params;

      if (typeof weightKg !== 'number' || typeof heightMeters !== 'number') {
        throw new Error('Invalid input types. Both weightKg and heightMeters must be numbers.');
      }

      if (weightKg <= 0 || heightMeters <= 0) {
        throw new Error('Invalid input values. Weight and height must be positive numbers.');
      }

      // Mathematical operations
      const bmi = weightKg / (heightMeters * heightMeters);
      const result = parseFloat(bmi.toFixed(1));

      return JSON.stringify({
        success: true,
        result: result,
        calculation: 'BMI = weight (kg) / (height (m) * height (m))',
        computedAt: new Date().toISOString(),
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message,
        toolName: 'bmicalculator',
      });
    }
  },
};
