export const VaultFactoryAbi = [
  {
    "type": "event",
    "name": "VaultCreated",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "curator",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "name",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "metadataURI",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "curatorCutBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "minRatioBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "maxAllocation",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  }
] as const;
