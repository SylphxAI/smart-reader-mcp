import type { RoutingDiagnostics } from '../delegate/delegationContract.js';

export type {
  AgentEvidenceDelegation,
  AgentEvidenceEnvelope,
  AgentEvidenceFreshness,
  AgentEvidenceLocator,
  AgentEvidenceRoute,
  Confidence,
} from '@sylphx/reader-evidence';

export { buildReadMediaEnvelope, hashFile } from '@sylphx/reader-evidence';

export type SmartReaderEvidenceEnvelope =
  import('@sylphx/reader-evidence').AgentEvidenceEnvelope<RoutingDiagnostics>;
