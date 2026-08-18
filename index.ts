import { BaseProvider } from "@ethersproject/providers";
import {
  downloadContractsBlob,
  ContractsBlob,
} from "@generationsoftware/pt-v5-utils-js";
import {
  getProvider,
  instantiateRelayerAccount,
  loadLiquidatorEnvVars,
  runLiquidator,
  LiquidatorEnvVars,
  LiquidatorConfig,
  RelayerAccount,
} from "@generationsoftware/pt-v5-autotasks-library";

const main = async () => {
  const envVars: LiquidatorEnvVars = loadLiquidatorEnvVars();
  const provider: BaseProvider = getProvider(envVars);

  const relayerAccount: RelayerAccount = await instantiateRelayerAccount(
    provider,
    envVars.CUSTOM_RELAYER_PRIVATE_KEY
  );

  const config: LiquidatorConfig = {
    ...relayerAccount,
    provider,
    covalentApiKey: envVars.COVALENT_API_KEY,
    chainId: envVars.CHAIN_ID,
    swapRecipient: envVars.SWAP_RECIPIENT,
    minProfitThresholdUsd: Number(envVars.MIN_PROFIT_THRESHOLD_USD),
    envTokenAllowList: envVars.ENV_TOKEN_ALLOW_LIST,
    claimRewards: envVars.CLAIM_REWARDS,
    pairsToLiquidate: envVars.PAIRS_TO_LIQUIDATE,
    contractJsonUrl: envVars.CONTRACT_JSON_URL,
  };

  const contracts: ContractsBlob = await downloadContractsBlob(
    config.contractJsonUrl
  );

  if (process.env.DRY_RUN === "true") {
    console.log("[DRY_RUN] Skipping transaction submission. Discovered config:");
    console.log(JSON.stringify({ chainId: config.chainId, swapRecipient: config.swapRecipient, minProfitThresholdUsd: config.minProfitThresholdUsd, contractJsonUrl: config.contractJsonUrl }, null, 2));
    console.log("[DRY_RUN] Contracts blob loaded successfully. Set DRY_RUN=false and configure a wallet to enable transaction sending.");
    return;
  }

  await runLiquidator(contracts, config);
};

main();
