declare namespace NodeJS {
  interface ProcessEnv {
    MONGO_URI: string
    PORT: string
    JWT_SECRET: string
    BASE_URL: string
    BASE_URL_FRONT: string
    FILE_REG_PATH: string
    FILE_CATEGORY_PATH: string
    FILE_POST_PATH: string
    SESSION_SECRET: string
    NODE_ENV: string
    EMAIL_PROGRAMM: string
    EMAIL_PASSWORD: string
    RECAPTCHA_SECRET_KEY: string
  }
}
