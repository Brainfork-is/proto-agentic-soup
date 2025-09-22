/**
 * Debug axios import
 */

import { createToolContext } from './tools/toolExecutionEnv';
import * as vm from 'vm';

async function debugAxios() {
  try {
    console.log('🔍 Debugging axios import...\n');

    const context = createToolContext();

    // Test axios import
    const testCode = `
      try {
        const axios = require('axios');
        console.log('Axios type:', typeof axios);
        console.log('Axios properties:', Object.keys(axios));
        console.log('axios.default:', typeof axios.default);
        console.log('axios.get:', typeof axios.get);

        // Try axios.default
        if (axios.default && typeof axios.default.get === 'function') {
          console.log('Using axios.default.get');
          result = 'axios.default works';
        } else if (typeof axios.get === 'function') {
          console.log('Using axios.get directly');
          result = 'axios.get works';
        } else {
          console.log('Neither axios.get nor axios.default.get work');
          result = 'axios import failed';
        }
      } catch (error) {
        console.log('Error:', error.message);
        result = 'require failed';
      }
    `;

    const script = new vm.Script(testCode);
    script.runInContext(context);

    console.log('Result:', (context as any).result);
  } catch (error) {
    console.error('❌ Debug failed:', error);
  }
}

debugAxios().catch(console.error);
