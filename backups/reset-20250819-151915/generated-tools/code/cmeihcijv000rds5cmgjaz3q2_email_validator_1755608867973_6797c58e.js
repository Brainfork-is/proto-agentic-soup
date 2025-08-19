export const email_validator = {
  name: 'email_validator',
  description:
    'Validates an email address format. Checks for "@", a domain name, and a top-level domain.',
  async invoke(params) {
    try {
      const { email } = params;

      const validationResults = [];

      // Input validation
      if (typeof email !== 'string') {
        validationResults.push({
          rule: 'inputType',
          passed: false,
          message: 'Input "email" must be a string.',
        });
      } else {
        validationResults.push({
          rule: 'inputType',
          passed: true,
          message: 'Input "email" is a string.',
        });

        // Regex for basic email format validation
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        const isFormatValid = emailRegex.test(email);

        validationResults.push({
          rule: 'format',
          passed: isFormatValid,
          message: isFormatValid
            ? 'Email format is valid.'
            : 'Email format is invalid. Missing "@", domain, or top-level domain.',
        });
      }

      const isValid = validationResults.every((r) => r.passed);

      return JSON.stringify({
        success: true,
        isValid: isValid,
        validationResults: validationResults,
        data: { email: email },
        validatedAt: new Date().toISOString(),
      });
    } catch (error) {
      return JSON.stringify({
        success: false,
        error: error.message,
        toolName: 'email_validator',
      });
    }
  },
};
