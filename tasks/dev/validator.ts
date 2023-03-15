import {task} from "hardhat/config";
import YAML from "yaml";
import shell from "shelljs";
import fs from "fs";
import {BigNumber} from "ethers";

export interface Config {
  wallet: Wallet;
  outputDir: string;
  depositContract: string;
  genesis: string[];
  nodes: Node[];
}

export interface Node {
  name: string;
  volume: string;
  consensusLayer: ConsensusLayer;
  executionLayer: ExecutionLayer;
  validator: Validator;
}

export interface ConsensusLayer {
  image: string;
  dataDir: string;
  flags: string[];
}

export interface ExecutionLayer {
  image: string;
  dataDir: string;
  flags: string[];
}

export interface Validator {
  image: string;
  dataDir: string;
  flags: string[];
}

export interface Wallet {
  name: string;
  passphrase: string;
  baseDir: string;
  uuid?: string;
  accounts: Account[];
}

export interface Account {
  name: string;
  passphrase: string;
  path: string;
  uuid?: string;
}

export interface DockerConfig {
  version: string;
  services: {[index: string]: DockerNode};
  // eslint-disable-next-line
  volumes: {[index: string]: any};
}

export interface DockerNode {
  ports: string[];
  volumes: string[];
  build: {
    context: string;
    dockerfile: string;
  };
  command: string[];
  ulimits: {
    nofile: {
      soft: number;
      hard: number;
    };
  };
}

/**
 * Execute shell command
 *
 * @param cmd
 * @param { fatal, silent }
 */
const exec = (
  cmd: string,
  options: {fatal: boolean; silent: boolean} = {fatal: true, silent: true}
) => {
  console.log(`$ ${cmd}`);
  const res = shell.exec(cmd, options);
  if (res.code !== 0) {
    console.error("Error: Command failed with code", res.code);
    console.log(res);
    if (options.fatal) {
      process.exit(1);
    }
  }
  if (!options.silent) {
    console.log(res.stdout.trim());
  }
  return res;
};

task("setup-validators", "Setup validators")
  .addPositionalParam("configPath", "path to config.yml", "config.yml")
  .setAction(async ({configPath}, DRE) => {
    await DRE.run("set-DRE");

    const configStr = fs.readFileSync(configPath, "utf8");
    const config = YAML.parse(configStr);
    if (fs.existsSync(config.outputDir)) {
      fs.rmSync(config.outputDir, {recursive: true, force: true});
    }

    exec(
      `ethdo wallet create \
      --wallet="${config.wallet.name}" \
      --type="hd" \
      --wallet-passphrase="${config.wallet.passphrase}" \
      --allow-weak-passphrases \
      --base-dir="${config.outputDir}/${config.wallet.baseDir}"`
    );
    const res = exec(`ethdo wallet info \
      --wallet="${config.wallet.name}" \
      --base-dir="${config.outputDir}/${config.wallet.baseDir}" \
      --verbose | cut -d: -f2 | tr -d ' ' | awk '(NR==1)'`);
    config.wallet.uuid = res.stdout.trim();

    for (const account of config.wallet.accounts) {
      exec(`ethdo account create \
        --account="${account.name}" \
        --wallet-passphrase="${config.wallet.passphrase}" \
        --passphrase="${account.passphrase}" \
        --path="${account.path}" \
        --base-dir="${config.outputDir}/${config.wallet.baseDir}" \
        --verbose`);
      const res = exec(`ethdo account info \
        --account="${account.name}" \
        --base-dir="${config.outputDir}/${config.wallet.baseDir}" \
        --verbose | cut -d: -f2 | tr -d ' ' | awk '(NR==1)'`);
      account.uuid = res.stdout.trim();
      if (!fs.existsSync(`${config.outputDir}/secrets`)) {
        fs.mkdirSync(`${config.outputDir}/secrets`);
      }
      fs.writeFileSync(
        `${config.outputDir}/secrets/${account.uuid}`,
        account.passphrase
      );
    }

    for (const genesis of config.genesis) {
      exec(`cd ${config.outputDir} && curl -fsSLO ${genesis}`);
    }

    exec(`openssl rand -hex 32 | tr -d "\n" > "${config.outputDir}/jwtsecret"`);

    const dockerComposePath = `${config.outputDir}/docker-compose.yml`;
    const dockerCompose: DockerConfig = {
      version: "3.7",
      services: {},
      volumes: {},
    };

    const executionPort = 8545;
    const executionAuthPort = 8551;
    const consensusPort = 5052;
    for (const [index, node] of config.nodes.entries()) {
      node.executionLayer.flags.push(
        `--datadir=/data/${node.executionLayer.dataDir}`
      );
      node.executionLayer.flags.push(`--authrpc.addr=0.0.0.0`);
      node.executionLayer.flags.push(`--authrpc.vhosts=*`);
      node.executionLayer.flags.push(`--http.addr=0.0.0.0`);
      node.executionLayer.flags.push(`--http.port=${executionPort + index}`);
      node.executionLayer.flags.push(`--http.vhosts=*`);
      node.executionLayer.flags.push(
        `--authrpc.port=${executionAuthPort + index}`
      );
      node.executionLayer.flags.push(`--authrpc.jwtsecret=/app/jwtsecret`);

      node.consensusLayer.flags.push(
        `--datadir=/data/${node.consensusLayer.dataDir}`
      );
      node.consensusLayer.flags.push(`--jwt-secrets=/app/jwtsecret`);
      node.consensusLayer.flags.push(
        `--execution-endpoints=http://${node.name}-execution:${
          executionAuthPort + index
        }`
      );
      node.consensusLayer.flags.push(`--http-address=0.0.0.0`);
      node.consensusLayer.flags.push(`--http-port=${consensusPort + index}`);

      node.validator.flags.push(`--datadir=/data/${node.validator.dataDir}`);
      node.validator.flags.push(
        `--beacon-nodes=http://${node.name}-consensus:${consensusPort + index}`
      );

      exec(
        `(docker volume rm ${node.volume} || true) && docker volume create ${node.volume}`
      );
      if (fs.existsSync(`${config.outputDir}/genesis.json`)) {
        exec(
          `docker run \
        -v "${node.volume}:/data" \
        -v "$(pwd)/${config.outputDir}:/app" \
        --rm ${node.executionLayer.image} \
        --datadir "/data/${node.executionLayer.dataDir}" \
        init /app/genesis.json`,
          {fatal: true, silent: false}
        );
      }
      exec(
        `docker run \
        -v "${node.volume}:/data" \
        -v "$(pwd)/${config.outputDir}:/app" \
        --rm ${node.validator.image} \
        lighthouse \
        account validator import \
        --password-file /app/secrets/${config.wallet.accounts[index].uuid} \
        --reuse-password \
        --datadir "/data/${node.validator.dataDir}" \
        --keystore /app/${config.wallet.baseDir}/${config.wallet.uuid}/${config.wallet.accounts[index].uuid}`
      );

      const validatorLayerDockerfilePath = `${config.outputDir}/validator.Dockerfile`;
      if (!fs.existsSync(validatorLayerDockerfilePath)) {
        const validatorLayerDockerfile = [
          `FROM ${node.validator.image}`,
          "COPY . /app",
        ];
        fs.writeFileSync(
          validatorLayerDockerfilePath,
          validatorLayerDockerfile.join("\n")
        );
      }

      const executionLayerDockerfilePath = `${config.outputDir}/executionLayer.Dockerfile`;
      if (!fs.existsSync(executionLayerDockerfilePath)) {
        const executionLayerDockerfile = [
          `FROM ${node.executionLayer.image}`,
          "COPY . /app",
        ];
        fs.writeFileSync(
          executionLayerDockerfilePath,
          executionLayerDockerfile.join("\n")
        );
      }

      const consensusLayerDockerfilePath = `${config.outputDir}/consensusLayer.Dockerfile`;
      if (!fs.existsSync(consensusLayerDockerfilePath)) {
        const consensusLayerDockerfile = [
          `FROM ${node.consensusLayer.image}`,
          "COPY . /app",
        ];
        fs.writeFileSync(
          consensusLayerDockerfilePath,
          consensusLayerDockerfile.join("\n")
        );
      }

      const consensusConfig: DockerNode = {
        ports: [`${consensusPort + index}:${consensusPort + index}`],
        volumes: [`${node.volume}:/data`],
        build: {
          context: ".",
          dockerfile: "consensusLayer.Dockerfile",
        },
        command: [
          "lighthouse",
          node.consensusLayer.flags.some((flag) => flag.startsWith("--network"))
            ? ""
            : "--testnet-dir=/app",
          "bn",
          ...node.consensusLayer.flags,
        ].filter((x) => x),
        ulimits: {
          nofile: {
            soft: 65536,
            hard: 65536,
          },
        },
      };
      dockerCompose.services[`${node.name}-consensus`] = consensusConfig;
      dockerCompose.volumes[node.volume] = {
        external: true,
      };

      const executionConfig: DockerNode = {
        ports: [
          `${executionAuthPort + index}:${executionAuthPort + index}`,
          `${executionPort + index}:${executionPort + index}`,
        ],
        volumes: [`${node.volume}:/data`],
        build: {
          context: ".",
          dockerfile: "executionLayer.Dockerfile",
        },
        command: [...node.executionLayer.flags],
        ulimits: {
          nofile: {
            soft: 65536,
            hard: 65536,
          },
        },
      };
      dockerCompose.services[`${node.name}-execution`] = executionConfig;

      const validatorConfig: DockerNode = {
        ports: [],
        volumes: [`${node.volume}:/data`],
        build: {
          context: ".",
          dockerfile: "validator.Dockerfile",
        },
        command: [
          "lighthouse",
          node.validator.flags.some((flag) => flag.startsWith("--network"))
            ? ""
            : "--testnet-dir=/app",
          "vc",
          ...node.validator.flags,
        ].filter((x) => x),
        ulimits: {
          nofile: {
            soft: 65536,
            hard: 65536,
          },
        },
      };
      dockerCompose.services[`${node.name}-validator`] = validatorConfig;
    }

    fs.writeFileSync(dockerComposePath, YAML.stringify(dockerCompose));
  });

task("list-validators", "List validators")
  .addPositionalParam("configPath", "path to config.yml", "config.yml")
  .setAction(async ({configPath}, DRE) => {
    await DRE.run("set-DRE");

    const configStr = fs.readFileSync(configPath, "utf8");
    const config = YAML.parse(configStr);

    exec(
      `ethdo wallet info --wallet="${config.wallet.name}" --base-dir="${config.outputDir}/${config.wallet.baseDir}"`,
      {fatal: true, silent: false}
    );

    console.log();

    for (const account of config.wallet.accounts) {
      exec(
        `ethdo account info --account="${account.name}" --base-dir="${config.outputDir}/${config.wallet.baseDir}"`,
        {fatal: true, silent: false}
      );
    }
  });

task("register-validators", "List validators")
  .addPositionalParam("configPath", "path to config.yml", "config.yml")
  .setAction(async ({configPath}, DRE) => {
    await DRE.run("set-DRE");

    const {getFirstSigner, getDepositContract} = await import(
      "../../helpers/contracts-getters"
    );
    const {waitForTx} = await import("../../helpers/misc-utils");
    const signer = await getFirstSigner();
    const configStr = fs.readFileSync(configPath, "utf8");
    const config = YAML.parse(configStr);

    for (const account of config.wallet.accounts) {
      const res = exec(`ethdo validator depositdata \
         --validatoraccount ${account.name} \
         --withdrawaladdress ${await signer.getAddress()} \
         --depositvalue 32Ether \
         --launchpad \
         --wallet-passphrase="${config.wallet.passphrase}" \
         --passphrase="${account.passphrase}" \
         --base-dir="${config.outputDir}/${config.wallet.baseDir}"`);

      const depositdata = JSON.parse(res.stdout.trim());
      const depositContract = await getDepositContract(config.depositContract);

      for (const {
        pubkey,
        withdrawal_credentials,
        signature,
        deposit_data_root,
        amount,
      } of depositdata) {
        await waitForTx(
          await depositContract.deposit(
            `0x${pubkey}`,
            `0x${withdrawal_credentials}`,
            `0x${signature}`,
            `0x${deposit_data_root}`,
            {
              value: BigNumber.from(amount).mul(1e9).toString(),
            }
          )
        );
      }
    }
  });
