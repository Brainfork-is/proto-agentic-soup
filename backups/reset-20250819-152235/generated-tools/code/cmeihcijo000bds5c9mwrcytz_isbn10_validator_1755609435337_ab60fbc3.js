export const isbn10_validator = {
  name: 'isbn10_validator',
  description: 'Validates an ISBN-10 number using the standard checksum algorithm.',
  async invoke(params) {
    try {
      const { isbn } = params;

      const validationResults = [];

      // Validation Rule 1: Check if isbn is provided and is a string
      if (typeof isbn !== 'string' || isbn.length === 0) {
        validationResults.push({
          rule: 'Input Type and Presence',
          passed: false,
          message: 'ISBN must be a non-empty string.',
        });
      } else {
        validationResults.push({
          rule: 'Input Type and Presence',
          passed: true,
          message: 'ISBN is a non-empty string.',
        });

        // Validation Rule 2: Check if ISBN-10 has exactly 10 characters
        if (isbn.length !== 10) {
          validationResults.push({
            rule: 'Length Check',
            passed: false,
            message: `ISBN-10 must be exactly 10 characters long. Received ${isbn.length}.`,
          });
        } else {
          validationResults.push({
            rule: 'Length Check',
            passed: true,
            message: 'ISBN-10 has the correct length.',
          });

          // Validation Rule 3: Check if the first 9 characters are digits
          const firstNine = isbn.substring(0, 9);
          if (!/^\d+$/.test(firstNine)) {
            validationResults.push({
              rule: 'First 9 Characters Digits',
              passed: false,
              message: 'The first 9 characters of an ISBN-10 must be digits.',
            });
          } else {
            validationResults.push({
              rule: 'First 9 Characters Digits',
              passed: true,
              message: 'The first 9 characters are digits.',
            });

            // Validation Rule 4: Check if the last character is a digit or 'X'
            const lastChar = isbn.charAt(9);
            if (!/^\d$/.test(lastChar) && lastChar.toUpperCase() !== 'X') {
              validationResults.push({
                rule: 'Last Character Valid',
                passed: false,
                message: "The last character of an ISBN-10 must be a digit or 'X'.",
              });
            } else {
              validationResults.push({
                rule: 'Last Character Valid',
                passed: true,
                message: 'The last character is valid.',
              });

              // Validation Rule 5: Perform the checksum calculation
              let sum = 0;
              for (let i = 0; i < 9; i++) {
                sum += parseInt(isbn[i]) * (10 - i);
              }

              const lastDigit = isbn[9].toUpperCase() === 'X' ? 10 : parseInt(isbn[9]);
              sum += lastDigit * 1;

              const isValidChecksum = sum % 11 === 0;

              validationResults.push({
                rule: 'Checksum Validation',
                passed: isValidChecksum,
                message: `Checksum calculation: (10*d1 + 9*d2 + ... + 1*d10) mod 11. Calculated sum: ${sum}. Result: ${isValidChecksum ? 'Valid' : 'Invalid'}.`,
              });
            }
          }
        }
      }

      const allRulesPassed = validationResults.every((r) => r.passed);
      const isValid = validationResults.length > 0 && allRulesPassed;

      return JSON.stringify({
        success: true,
        isValid: isValid,
        validationResults: validationResults,
        data: { isbn: isbn },
        validatedAt: new Date().toISOString(),
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message,
        toolName: 'isbn10_validator',
      });
    }
  },
};
