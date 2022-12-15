const eip712DomainType = Object.freeze({
  EIP712Domain: [
    {name: "name", type: "string"},
    {name: "version", type: "string"},
    {name: "chainId", type: "uint256"},
    {name: "verifyingContract", type: "address"},
  ],
});

export default eip712DomainType;
