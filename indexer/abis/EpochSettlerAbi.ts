export const EpochSettlerAbi = [
  {
    "type": "event",
    "name": "EpochSettled",
    "inputs": [
      {
        "name": "epoch",
        "type": "uint64",
        "indexed": true,
        "internalType": "uint64"
      },
      {
        "name": "price",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "startedAt",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "settledAt",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "keeper",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ManagerSettled",
    "inputs": [
      {
        "name": "manager",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "epoch",
        "type": "uint64",
        "indexed": true,
        "internalType": "uint64"
      },
      {
        "name": "capitalStart",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "valueEnd",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "pnl",
        "type": "int256",
        "indexed": false,
        "internalType": "int256"
      },
      {
        "name": "performanceFee",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "curatorFees",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "fromStake",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "fromBackers",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "stakeAfter",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "allocatedAfter",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ParamsSet",
    "inputs": [
      {
        "name": "epochLength",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "performanceFeeBps",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "keeperBounty",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "StakeWithdrawn",
    "inputs": [
      {
        "name": "manager",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VaultManagerPnl",
    "inputs": [
      {
        "name": "vault",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "manager",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "epoch",
        "type": "uint64",
        "indexed": true,
        "internalType": "uint64"
      },
      {
        "name": "pnl",
        "type": "int256",
        "indexed": false,
        "internalType": "int256"
      }
    ],
    "anonymous": false
  }
] as const;
