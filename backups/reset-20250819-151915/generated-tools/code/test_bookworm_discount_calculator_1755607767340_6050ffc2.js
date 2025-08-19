export const bookworm_discount_calculator = {
  name: 'bookworm_discount_calculator',
  description:
    'Calculates the final price of a bookstore order after applying a 15% discount for orders of $100 or more.',
  async invoke(params) {
    try {
      const { totalAmount } = params;

      if (typeof totalAmount !== 'number' || isNaN(totalAmount) || totalAmount < 0) {
        throw new Error('Invalid input: totalAmount must be a non-negative number.');
      }

      const discountThreshold = 100;
      const discountRate = 0.15;
      let result;
      let calculationDescription;

      if (totalAmount >= discountThreshold) {
        const discountAmount = totalAmount * discountRate;
        result = totalAmount - discountAmount;
        calculationDescription = `Applied a ${discountRate * 100}% discount to ${totalAmount}. Discount amount: ${discountAmount}. Final price: ${result}.`;
      } else {
        result = totalAmount;
        calculationDescription = `No discount applied as the total amount ${totalAmount} is below the threshold of ${discountThreshold}. Final price: ${result}.`;
      }

      return JSON.stringify({
        success: true,
        result: parseFloat(result.toFixed(2)),
        calculation: calculationDescription,
        computedAt: new Date().toISOString(),
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message,
        toolName: 'bookworm_discount_calculator',
      });
    }
  },
};
