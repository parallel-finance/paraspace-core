FROM node:18

WORKDIR /paraspace

COPY . /paraspace

RUN wget https://github.com/ethereum/solc-bin/blob/gh-pages/linux-amd64/list.json

RUN mkdir -p /root/.cache/hardhat-nodejs/compilers/linux-amd64 \
  && wget -O /root/.cache/hardhat-nodejs/compilers/linux-amd64/list.json https://raw.githubusercontent.com/ethereum/solc-bin/gh-pages/linux-amd64/list.json

RUN wget -O /root/.cache/hardhat-nodejs/compilers/linux-amd64/solc-linux-amd64-v0.8.10+commit.fc410830 https://binaries.soliditylang.org/linux-amd64/solc-linux-amd64-v0.8.10+commit.fc410830
RUN wget -O /root/.cache/hardhat-nodejs/compilers/linux-amd64/solc-linux-amd64-v0.7.6+commit.7338295f  https://binaries.soliditylang.org/linux-amd64/solc-linux-amd64-v0.7.6+commit.7338295f

RUN yarn
