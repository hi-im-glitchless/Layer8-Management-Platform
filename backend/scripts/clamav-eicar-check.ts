/**
 * Manual ClamAV connectivity probe — writes the standard EICAR test string
 * to a tmp file, runs scanFile against it, and reports the result.
 *
 * Expected outcomes:
 *   - With clamav up:        {"clean":false,"virus":"..."}  -> exit 0
 *   - With clamav stopped:   throws CLAMAV_UNREACHABLE      -> exit 2
 *
 * Run: `npx tsx scripts/clamav-eicar-check.ts` from backend/.
 *
 * NOT a CI test — CI lacks a ClamAV instance. Executor-run sanity check
 * before merging plan 23-02.
 */
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { scanFile } from '../src/services/clamService.js';

// Standard EICAR test string — see https://www.eicar.org/download-anti-malware-testfile/
const EICAR = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';
const tmp = path.join(tmpdir(), 'eicar.test.txt');

async function main() {
  writeFileSync(tmp, EICAR);
  try {
    const result = await scanFile(tmp);
    console.log(JSON.stringify(result));
    // EICAR must NOT be reported clean — fail with exit 1 if scanner missed it.
    process.exit(result.clean ? 1 : 0);
  } finally {
    try { unlinkSync(tmp); } catch { /* best-effort cleanup */ }
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(2);
});
