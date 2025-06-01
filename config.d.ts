declare module 'config' {
  const config: {
    get(key: 'port'): number;
    get(key: 'jwtSecret'): string;
    get(key: 'mongoUri'): string;
    get(key: 'baseUrl'): string;
    get(key: 'baseUrlFront'): string;
    get(key: 'fileRegPath'): string;
    get(key: 'fileCategoryPath'): string;
    get(key: 'VAPID_PUBLIC_KEY'): string;
    get(key: 'VAPID_PRIVATE_KEY'): string; 
  };
  export default config;
}