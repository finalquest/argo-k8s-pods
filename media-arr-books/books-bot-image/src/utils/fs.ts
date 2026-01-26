import * as fs from 'fs';

type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (msg: string) => void;
  error: (obj: unknown, msg?: string) => void;
};

type WhitelistConfig = {
  whitelist: string[];
  admin: string | undefined;
};

type LoadWhitelistArgs = {
  isTestEnv: boolean;
  allowedUserIds: string[];
  adminUserId: string | undefined;
  whitelistFile: string;
  logger: Logger;
};

type SaveWhitelistArgs = {
  whitelistFile: string;
  logger: Logger;
};

type EmailsArgs = {
  emailsFile: string;
  logger: Logger;
};

const loadWhitelist = ({
  isTestEnv,
  allowedUserIds,
  adminUserId,
  whitelistFile,
  logger,
}: LoadWhitelistArgs): WhitelistConfig => {
  try {
    if (isTestEnv) {
      return {
        whitelist: allowedUserIds,
        admin: adminUserId || allowedUserIds[0],
      };
    }

    if (fs.existsSync(whitelistFile)) {
      const data = fs.readFileSync(whitelistFile, 'utf-8');
      const config = JSON.parse(data);
      logger.info({ whitelist: config.whitelist, admin: config.admin }, 'Whitelist loaded from file');
      return config;
    }

    logger.warn('Whitelist file not found, creating default');
    const defaultConfig = {
      whitelist: allowedUserIds,
      admin: adminUserId || allowedUserIds[0],
    };
    saveWhitelist(defaultConfig, { whitelistFile, logger });
    return defaultConfig;
  } catch (err) {
    logger.error({ err }, 'Error loading whitelist file');
    return {
      whitelist: allowedUserIds,
      admin: adminUserId || allowedUserIds[0],
    };
  }
};

const saveWhitelist = (config: WhitelistConfig, { whitelistFile, logger }: SaveWhitelistArgs) => {
  try {
    fs.writeFileSync(whitelistFile, JSON.stringify(config, null, 2));
    logger.info({ whitelist: config.whitelist, admin: config.admin }, 'Whitelist saved to file');
  } catch (err) {
    logger.error({ err }, 'Error saving whitelist file');
    throw err;
  }
};

const loadEmails = ({ emailsFile, logger }: EmailsArgs): Record<string, string> => {
  try {
    if (fs.existsSync(emailsFile)) {
      const data = fs.readFileSync(emailsFile, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    logger.error({ err }, 'Error loading emails file');
  }
  return {};
};

const saveEmails = (emails: Record<string, string>, { emailsFile, logger }: EmailsArgs) => {
  try {
    fs.writeFileSync(emailsFile, JSON.stringify(emails, null, 2));
    logger.info('Emails saved successfully');
  } catch (err) {
    logger.error({ err }, 'Error saving emails file');
    throw err;
  }
};

export {
  loadWhitelist,
  saveWhitelist,
  loadEmails,
  saveEmails,
};
