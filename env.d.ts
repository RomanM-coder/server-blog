declare namespace NodeJS {
  interface ProcessEnv {
    MONGO_URI: string;
    PORT: string;   
    JWT_SECRET: string;    
    BASE_URL: string;
    BASE_URL_FRONT: string;
    FILE_REG_PATH: string;
    FILE_CATEGORY_PATH: string;
  }
}