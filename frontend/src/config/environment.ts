interface EnvironmentConfig {
  authorUrl: string;
  gatewayUrl: string;
  apiTimeout: number;
}

const getEnvironmentConfig = (): EnvironmentConfig => {
  const env = import.meta.env.VITE_ENV || 'development';
  
  switch (env) {
    case 'production':
      return {
        authorUrl: import.meta.env.VITE_GATEWAY_URL + '/portal',
        gatewayUrl: import.meta.env.VITE_GATEWAY_URL,
        apiTimeout: 30000,
      };
    case 'stagging':
      return {
        authorUrl: import.meta.env.VITE_GATEWAY_URL + '/portal',
        gatewayUrl: import.meta.env.VITE_GATEWAY_URL,
        apiTimeout: 30000,
      };
    case 'dev-v3':
      return {
        authorUrl: import.meta.env.VITE_GATEWAY_URL + '/portal',
        gatewayUrl: import.meta.env.VITE_GATEWAY_URL,
        apiTimeout: 30000,
      };
    case 'development':
    default:
      return {
        authorUrl: import.meta.env.VITE_GATEWAY_URL + '/portal',
        gatewayUrl: import.meta.env.VITE_GATEWAY_URL,
        apiTimeout: 30000,
      };
  }
};


export const config = getEnvironmentConfig();
