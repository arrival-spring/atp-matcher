import axios from 'axios';
import axiosRetry from 'axios-retry';

axiosRetry(axios, {
    retries: 4, // 1 original + 4 retries = 5 attempts
    retryDelay: retryCount => {
        return axiosRetry.exponentialDelay(retryCount, 1000);
    },
    retryCondition: error => {
        // Retry on 5xx errors
        const is5xx = error.response && error.response.status >= 500 && error.response.status <= 599;
        // Retry on network errors (e.g., connection reset, DNS issues)
        const isNetworkError = axiosRetry.isNetworkError(error);
        // Retry on timeouts
        const isTimeout = error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT';

        return isNetworkError || isTimeout || is5xx;
    },
});
