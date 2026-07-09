import { createRequire } from 'node:module';
import { READER_DELEGATION } from './delegate/delegateToReader.js';

const require = createRequire(import.meta.url);

export type DoctorStatus = 'ok' | 'warn' | 'fail';

export interface DoctorCheck {
  id: string;
  status: DoctorStatus;
  message: string;
}

export interface DoctorReport {
  profile: 'smart_reader_doctor';
  version: string;
  status: 'ready' | 'degraded' | 'unavailable';
  checks: DoctorCheck[];
}

const probeNode = (): DoctorCheck => {
  const version = process.versions.node;
  const major = Number.parseInt(version.split('.')[0] ?? '0', 10);
  if (major >= 22) {
    return {
      id: 'node',
      status: 'ok',
      message: `Node.js ${version} meets the >=22.13 requirement.`,
    };
  }

  return {
    id: 'node',
    status: 'warn',
    message: `Node.js ${version} is below the recommended >=22.13 runtime.`,
  };
};

const probeSiblingPackage = (id: string, packageName: string): DoctorCheck => {
  try {
    require.resolve(`${packageName}/package.json`);
    return {
      id,
      status: 'ok',
      message: `${packageName} is installed for local delegation.`,
    };
  } catch {
    return {
      id,
      status: 'warn',
      message: `${packageName} is not installed locally. Delegation may fall back to npx when read_media runs.`,
    };
  }
};

const aggregateStatus = (checks: DoctorCheck[]): DoctorReport['status'] => {
  if (checks.some((check) => check.status === 'fail')) {
    return 'unavailable';
  }
  if (checks.some((check) => check.status === 'warn')) {
    return 'degraded';
  }
  return 'ready';
};

export function runDoctor(version: string): DoctorReport {
  const checks = [
    probeNode(),
    probeSiblingPackage('reader_pdf', READER_DELEGATION.pdf.packageName),
    probeSiblingPackage('reader_image', READER_DELEGATION.image.packageName),
    probeSiblingPackage('reader_video', READER_DELEGATION.video.packageName),
  ];

  return {
    profile: 'smart_reader_doctor',
    version,
    status: aggregateStatus(checks),
    checks,
  };
}

export function formatDoctorReport(report: DoctorReport): string {
  return JSON.stringify(report, null, 2);
}
