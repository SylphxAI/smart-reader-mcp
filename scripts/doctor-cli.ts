#!/usr/bin/env bun

import { createRequire } from 'node:module';
import { formatDoctorReport, runDoctor } from '../src/doctor.js';

const require = createRequire(import.meta.url);
const packageJson = require('../package.json') as { version: string };

const report = runDoctor(packageJson.version);
console.log(formatDoctorReport(report));
process.exit(report.status === 'unavailable' ? 1 : 0);