export const parse_customer_order = {
  name: 'parse_customer_order',
  description:
    'Parses a JSON string representing a customer order, extracting the order ID and the name of each item.',
  async invoke(params) {
    try {
      const { jsonString } = params;

      if (!jsonString || typeof jsonString !== 'string') {
        throw new Error('jsonString parameter is required and must be a string');
      }

      let orderData;
      try {
        orderData = JSON.parse(jsonString);
      } catch (parseError) {
        throw new Error(`Invalid JSON string provided: ${parseError.message}`);
      }

      if (!orderData || typeof orderData !== 'object') {
        throw new Error('Parsed JSON must be an object.');
      }

      const orderId = orderData.order_id;
      const items = orderData.items;

      if (typeof orderId !== 'string' || !orderId) {
        throw new Error('Order object must contain a valid "order_id" string.');
      }

      if (!Array.isArray(items)) {
        throw new Error('Order object must contain a valid "items" array.');
      }

      const itemNames = items
        .map((item) => {
          if (typeof item === 'object' && item !== null && typeof item.name === 'string') {
            return item.name;
          }
          return null; // Or throw an error if strict validation is needed for each item
        })
        .filter((name) => name !== null);

      if (itemNames.length !== items.length) {
        console.warn('Some items in the order did not have a valid string name.');
      }

      const result = {
        order_id: orderId,
        item_names: itemNames,
      };

      return JSON.stringify({
        success: true,
        originalJsonString: jsonString,
        result: result,
        analysisType: 'customer_order_parsing',
        analyzedAt: new Date().toISOString(),
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message,
        toolName: 'parse_customer_order',
      });
    }
  },
};
