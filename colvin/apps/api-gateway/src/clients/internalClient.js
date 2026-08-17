import axios from 'axios';

import { env } from '../config/env.js';

export function createInternalClient(baseURL) {
  return axios.create({
    baseURL,
    timeout: 5000,
    maxRedirects: 0,
    headers: {
      'x-internal-api-key': env.INTERNAL_API_KEY,
      'content-type': 'application/json',
    },
    validateStatus: (status) => status >= 200 && status < 600,
  });
}
