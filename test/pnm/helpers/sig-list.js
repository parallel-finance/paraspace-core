#!/usr/bin/env node

const { utils } = require("ethers");
const { readFileSync } = require("fs");
const abi = readFileSync(process.argv[2]);
const i = new utils.Interface(JSON.parse(abi.toString()).abi);
const sigs = Object.keys(i.functions).map((f) => {
    return i.getSighash(i.functions[f]);
});
const encoder = new utils.AbiCoder();
process.stdout.write(`${encoder.encode(["bytes4[]"], [sigs])}`);
