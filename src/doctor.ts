import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { READER_DELEGATION } from './delegate/delegateToReader.js';
import { isRustCliAvailable, resolveRustCliBinary } from './engine/rust-sniff.js';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));

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

const probeRustSniffCli = (): DoctorCheck => {
  const binary = resolveRustCliBinary();
  if (binary !== 'smart-reader-cli' && existsSync(binary)) {
    const probe = spawnSync(binary, [], {
      input: JSON.stringify({
        tool: 'resolve_media_path',
        input: { path: path.join(here, '../package.json') },
      }),
      encoding: 'utf8',
      timeout: 5_000,
    });

    if (probe.status === 0) {
      return {
        id: 'rust_sniff_cli',
        status: 'ok',
        message: `Rust sniff CLI is available at ${binary}.`,
      };
    }
  }

  const release = path.join(here, '../target/release/smart-reader-cli');
  const debug = path.join(here, '../target/debug/smart-reader-cli');
  if (existsSync(release) || existsSync(debug)) {
    return {
      id: 'rust_sniff_cli',
      status: 'ok',
      message: 'Rust sniff CLI is built locally.',
    };
  }

  return {
    id: 'rust_sniff_cli',
    status: 'warn',
    message:
      'Rust sniff CLI is not built. Run `cargo build --release` to route sniffing and path policy through the native engine by default.',
  };
};

const probeRustSniffDefault = (): DoctorCheck => {
  if (isRustCliAvailable()) {
    return {
      id: 'rust_sniff_default',
      status: 'ok',
      message:
        'Rust sniff and path policy are enabled by default because the CLI binary is available. Set SMART_READER_USE_RUST_SNIFF=0 to force the TypeScript fallback.',
    };
  }

  return {
    id: 'rust_sniff_default',
    status: 'warn',
    message:
      'TypeScript magic-byte sniffing is active because the Rust CLI is unavailable.',
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
    probeRustSniffCli(),
    probeRustSniffDefault(),
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
