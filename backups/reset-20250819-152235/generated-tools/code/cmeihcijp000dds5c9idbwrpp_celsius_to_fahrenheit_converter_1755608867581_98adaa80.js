export const celsius_to_fahrenheit_converter = {
  name: 'celsius_to_fahrenheit_converter',
  description: 'Converts temperature from Celsius to Fahrenheit and rounds to one decimal place.',
  async invoke(params) {
    try {
      const { data, celsius } = params;

      if (typeof celsius !== 'number') {
        throw new Error('Invalid input: celsius must be a number.');
      }

      const fahrenheit = (celsius * 9) / 5 + 32;
      const formattedResult = parseFloat(fahrenheit.toFixed(1));

      return JSON.stringify({
        success: true,
        originalData: data,
        formattedData: formattedResult,
        formatType: 'Fahrenheit',
        formattedAt: new Date().toISOString(),
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message,
        toolName: 'celsius_to_fahrenheit_converter',
      });
    }
  },
};
