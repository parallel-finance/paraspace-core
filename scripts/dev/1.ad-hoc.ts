import rawBRE from "hardhat";
import YAML from "yaml";
import shell from "shelljs";
import fs from "fs";

export interface Config {
  wallet: Wallet;
  outputDir: string;
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
 * @param fatal
 */
const exec = (cmd: string, fatal = true) => {
  console.log(`$ ${cmd}`);
  const res = shell.exec(cmd, {silent: true});
  if (res.code !== 0) {
    console.error("Error: Command failed with code", res.code);
    console.log(res);
    if (fatal) {
      process.exit(1);
    }
  }
  return res;
};

const initiate = (config: Config) => {
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

  const genesisJson = JSON.parse(
    fs.readFileSync(`${config.outputDir}/genesis.json`, "utf8")
  );

  exec(`openssl rand -hex 32 | tr -d "\n" > "${config.outputDir}/jwtsecret"`);

  const dockerComposePath = `${config.outputDir}/docker-compose.yml`;
  const dockerCompose: DockerConfig = {
    version: "3.7",
    services: {},
    volumes: {},
  };

  const executionPort = 8551;
  const consensusPort = 5052;
  for (const [index, node] of config.nodes.entries()) {
    node.executionLayer.flags.push(`--datadir=${node.executionLayer.dataDir}`);
    node.executionLayer.flags.push(`--authrpc.addr=0.0.0.0`);
    node.executionLayer.flags.push(`--authrpc.vhosts=*`);
    node.executionLayer.flags.push(`--http.vhosts=*`);
    node.executionLayer.flags.push(`--authrpc.port=${executionPort + index}`);
    node.executionLayer.flags.push(
      `--authrpc.jwtsecret=/${config.outputDir}/jwtsecret`
    );
    node.executionLayer.flags.push(`--networkid=${genesisJson.config.chainId}`);

    node.consensusLayer.flags.push(`--datadir=${node.consensusLayer.dataDir}`);
    node.consensusLayer.flags.push(
      `--jwt-secrets=/${config.outputDir}/jwtsecret`
    );
    node.consensusLayer.flags.push(
      `--execution-endpoints=http://${node.name}-execution:${
        executionPort + index
      }`
    );
    node.consensusLayer.flags.push(`--http-address=0.0.0.0`);
    node.consensusLayer.flags.push(`--http-port=${consensusPort + index}`);

    node.validator.flags.push(`--datadir=${node.validator.dataDir}`);
    node.validator.flags.push(
      `--beacon-nodes=http://${node.name}-consensus:${consensusPort + index}`
    );

    exec(
      `(docker volume rm ${node.volume} || true) && docker volume create ${node.volume}`
    );
    exec(
      `docker run \
        -v "${node.volume}:/data" \
        -v "$(pwd)/${config.outputDir}:/app" \
        --rm ${node.executionLayer.image} \
        --datadir "/data/${node.executionLayer.dataDir}" \
        init /app/genesis.json`
    );
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
        `lighthouse`,
        `--testnet-dir=/app`,
        "bn",
        ...node.consensusLayer.flags,
      ],
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
      ports: [`${executionPort + index}:${executionPort + index}`],
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
      command: [`lighthouse`, "vc", ...node.validator.flags],
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
};

const info = (config: Config) => {
  const res1 = exec(
    `ethdo wallet info --wallet="${config.wallet.name}" --base-dir="${config.outputDir}/${config.wallet.baseDir}"`
  );
  console.log(res1.stdout.trim());

  for (const account of config.wallet.accounts) {
    const res2 = exec(
      `ethdo account info --account="${account.name}" --base-dir="${config.outputDir}/${config.wallet.baseDir}"`
    );
    console.log(res2.stdout.trim());
  }
};

const adHoc = async () => {
  console.time("ad-hoc");
  const configStr = fs.readFileSync("config.yml", "utf8");
  const config = YAML.parse(configStr);
  if (fs.existsSync(config.outputDir)) {
    fs.rmSync(config.outputDir, {recursive: true, force: true});
  }

  initiate(config);
  info(config);

  console.timeEnd("ad-hoc");
};

async function main() {
  await rawBRE.run("set-DRE");
  await adHoc();
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
