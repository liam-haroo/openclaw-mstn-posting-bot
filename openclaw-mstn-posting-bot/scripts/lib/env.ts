export type Env = "rc" | "live";

interface EnvConfig {
  siteUrl: string;
  apiUrl: string;
  tokenKey: string;
}

const ENV_MAP: Record<Env, EnvConfig> = {
  rc: {
    siteUrl: "https://dev2.moneystation.kr",
    apiUrl: "https://api-dev.moneystation.kr",
    tokenKey: "dev_access_token",
  },
  live: {
    siteUrl: "https://www.moneystation.net",
    apiUrl: "https://api.moneystation.net",
    tokenKey: "access_token",
  },
};

export function getEnvConfig(env: Env = "rc"): EnvConfig {
  return ENV_MAP[env];
}
