declare module "*.gif";
declare module "*.svg";

declare const APP_VERSION: string;

interface ImportMeta {
  env: {
    BASE_URL: string;
  };
}
