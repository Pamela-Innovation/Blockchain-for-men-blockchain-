import { createHash } from "node:crypto";

const DEFAULT_BASE_URL = "https://liquid.network/api";

type JsonObject = Record<string, unknown>;

type TxSummary = {
  txid: string;
  fee?: number;
  vsize?: number;
};

type TxStatus = {
  confirmed: boolean;
  block_height?: number;
  block_hash?: string;
  block_time?: number;
};

type TxDetails = {
  txid: string;
  version: number;
  locktime: number;
  size: number;
  weight: number;
  fee: number;
  status: TxStatus;
};

type MerkleProof = {
  block_height: number;
  merkle: string[];
  pos: number;
};

const parseArgs = () => {
  const args = process.argv.slice(2);
  const options: {
    txid?: string;
    baseUrl: string;
    includeHex: boolean;
    blockHeaderHex?: string;
  } = { baseUrl: DEFAULT_BASE_URL, includeHex: false };
  const requireValue = (flag: string, index: number): string => {
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}`);
    }
    return value;
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--txid") {
      options.txid = requireValue(arg, i);
      i += 1;
    } else if (arg === "--base-url") {
      options.baseUrl = requireValue(arg, i);
      i += 1;
    } else if (arg === "--include-hex") {
      options.includeHex = true;
    } else if (arg === "--block-header-hex") {
      options.blockHeaderHex = requireValue(arg, i);
      i += 1;
    } else if (arg === "--help") {
      console.log(
        [
          "Usage: npm run analyze:liquid-api -- [options]",
          "",
          "Options:",
          "  --txid <txid>                Analyze a specific transaction",
          "  --base-url <url>             Override API base URL",
          "  --include-hex                Fetch /tx/<txid>/hex and summarize",
          "  --block-header-hex <hex>     Verify merkle proof against provided header hex (first 80 bytes used)",
          "  (No --txid means auto-pick from mempool endpoints only.)",
        ].join("\n")
      );
      process.exit(0);
    }
  }

  return options;
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return (await response.json()) as T;
};

const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
};

const pickWorkingTxid = async (baseUrl: string): Promise<TxSummary> => {
  const recent = await fetchJson<TxSummary[]>(`${baseUrl}/mempool/recent`);
  if (recent.length > 0 && recent[0].txid) {
    return recent[0];
  }
  if (recent.length > 0 && !recent[0].txid) {
    throw new Error("mempool/recent returned entries but first entry has no txid");
  }

  const txids = await fetchJson<string[]>(`${baseUrl}/mempool/txids`);
  if (txids.length > 0) {
    return { txid: txids[0] };
  }

  throw new Error("No mempool transactions returned by API");
};

const doubleSha256 = (buf: Buffer): Buffer => {
  return createHash("sha256").update(createHash("sha256").update(buf).digest()).digest();
};

const computeMerkleRootBitcoinStyle = (txid: string, siblings: string[], pos: number): string => {
  // Convention here: `hash` is always kept in internal little-endian byte order during hashing.
  let hash = Buffer.from(txid, "hex").reverse();
  let index = pos;
  for (const sibling of siblings) {
    const siblingHash = Buffer.from(sibling, "hex").reverse();
    const pair = index % 2 === 0 ? Buffer.concat([hash, siblingHash]) : Buffer.concat([siblingHash, hash]);
    hash = doubleSha256(pair);
    index = Math.floor(index / 2);
  }
  return Buffer.from(hash).reverse().toString("hex");
};

const getMerkleRootFromHeaderPrefix = (headerHex: string): string => {
  const header = Buffer.from(headerHex.trim(), "hex");
  if (header.length < 80) {
    throw new Error(`Block header hex must include at least 80 bytes (got ${header.length})`);
  }
  return Buffer.from(header.subarray(36, 68)).reverse().toString("hex");
};

const summarizeHex = (hex: string): JsonObject => {
  const bytes = Buffer.from(hex.trim(), "hex");
  if (bytes.length < 4) {
    return { serialized_size_bytes: bytes.length };
  }
  const version = bytes.readUInt32LE(0);
  return {
    serialized_size_bytes: bytes.length,
    version,
    note: "Locktime is omitted from raw summary because Liquid serialization contains witness/extension data.",
  };
};

const endpointPurposeMap = {
  "/mempool/txids": "Current unconfirmed txids",
  "/mempool/recent": "Recent mempool tx summaries (txid, fee, vsize)",
  "/tx/<txid>": "Transaction metadata and confirmation status",
  "/v1/cpfp/<txid>": "CPFP fee-bump/package analysis for unconfirmed tx",
  "/tx/<txid>/outspend/<n>": "Spend status of one output",
  "/tx/<txid>/outspends": "Spend status of all outputs",
  "/tx/<txid>/merkle-proof": "Proof path for block inclusion",
  "/tx/<txid>/hex": "Raw serialized transaction hex",
};

const main = async () => {
  const options = parseArgs();

  try {
    const workingTx = options.txid
      ? { txid: options.txid }
      : await pickWorkingTxid(options.baseUrl);

    const tx = await fetchJson<TxDetails>(`${options.baseUrl}/tx/${workingTx.txid}`);

    const report: JsonObject = {
      selected_txid: workingTx.txid,
      mempool_summary: workingTx,
      tx,
      endpoint_purpose_map: endpointPurposeMap,
    };

    if (!tx.status.confirmed) {
      report.cpfp = await fetchJson<JsonObject>(`${options.baseUrl}/v1/cpfp/${workingTx.txid}`);
      report.outspends = await fetchJson<JsonObject[]>(`${options.baseUrl}/tx/${workingTx.txid}/outspends`);
    } else {
      const proof = await fetchJson<MerkleProof>(`${options.baseUrl}/tx/${workingTx.txid}/merkle-proof`);
      report.merkle_proof = proof;
      report.outspends = await fetchJson<JsonObject[]>(`${options.baseUrl}/tx/${workingTx.txid}/outspends`);

      if (options.blockHeaderHex) {
        const computedRoot = computeMerkleRootBitcoinStyle(workingTx.txid, proof.merkle, proof.pos);
        const headerRoot = getMerkleRootFromHeaderPrefix(options.blockHeaderHex);
        report.merkle_verification = {
          assumption:
            "Uses Bitcoin-style txid/sibling double-SHA256 path and the first 80-byte header prefix merkle-root slot; this may not match all Liquid witness-merkle variants.",
          computed_root: computedRoot,
          header_merkle_root: headerRoot,
          verified: computedRoot === headerRoot,
        };
      }
    }

    if (options.includeHex) {
      const txHex = await fetchText(`${options.baseUrl}/tx/${workingTx.txid}/hex`);
      report.tx_hex_summary = summarizeHex(txHex);
    }

    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`liquid-api-analyzer failed: ${message}`);
    process.exit(1);
  }
};

void main();
