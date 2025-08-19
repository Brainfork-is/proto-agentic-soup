export const flight_parser = {
  name: 'flight_parser',
  description:
    'Parses a JSON string representing flight bookings to extract departure city, arrival city, and departure time for a specific flight number.',
  async invoke(params) {
    try {
      const { jsonData, flightNumber } = params;

      if (!jsonData || typeof jsonData !== 'string') {
        throw new Error('jsonData parameter is required and must be a string');
      }
      if (!flightNumber || typeof flightNumber !== 'string') {
        throw new Error('flightNumber parameter is required and must be a string');
      }

      let flightData;
      try {
        flightData = JSON.parse(jsonData);
      } catch (parseError) {
        throw new Error(`Invalid JSON format: ${parseError.message}`);
      }

      if (!Array.isArray(flightData)) {
        throw new Error('JSON data must be an array of flight objects');
      }

      const foundFlight = flightData.find((flight) => flight.flightNumber === flightNumber);

      if (!foundFlight) {
        throw new Error(`Flight number ${flightNumber} not found`);
      }

      const result = {
        departureCity: foundFlight.departureCity,
        arrivalCity: foundFlight.arrivalCity,
        departureTime: foundFlight.departureTime,
      };

      return JSON.stringify({
        success: true,
        originalInput: { jsonData, flightNumber },
        result: result,
        analyzedAt: new Date().toISOString(),
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message,
        toolName: 'flight_parser',
      });
    }
  },
};
