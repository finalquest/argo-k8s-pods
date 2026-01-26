import * as fs from 'fs';

type DownloadResult = {
  tempPath: string;
  filename: string;
};

const ensureTmpDir = () => {
  if (!fs.existsSync('/tmp')) {
    fs.mkdirSync('/tmp');
  }
};

const extractFilename = (contentDisposition: string | null, fallback: string) => {
  if (!contentDisposition) return fallback;
  const match = /filename=\"?([^\";]+)\"?/i.exec(contentDisposition);
  if (!match) return fallback;
  return match[1] || fallback;
};

const downloadResponseToTemp = async (response: Response, fallbackFilename: string) => {
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentDisposition = response.headers.get('content-disposition');
  const filename = extractFilename(contentDisposition, fallbackFilename);

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  ensureTmpDir();

  const tempPath = `/tmp/${filename}`;
  fs.writeFileSync(tempPath, buffer);

  return { tempPath, filename } as DownloadResult;
};

export {
  downloadResponseToTemp,
  type DownloadResult,
};
