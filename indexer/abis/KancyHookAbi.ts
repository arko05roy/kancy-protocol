export const KancyHookAbi = [
  {
    "type": "event",
    "name": "KancySwap",
    "inputs": [
      {
        "name": "poolId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "PoolId"
      },
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount0",
        "type": "int128",
        "indexed": false,
        "internalType": "int128"
      },
      {
        "name": "amount1",
        "type": "int128",
        "indexed": false,
        "internalType": "int128"
      },
      {
        "name": "sqrtPriceX96",
        "type": "uint160",
        "indexed": false,
        "internalType": "uint160"
      },
      {
        "name": "tick",
        "type": "int24",
        "indexed": false,
        "internalType": "int24"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PoolBound",
    "inputs": [
      {
        "name": "poolId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "PoolId"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "PositionBookSet",
    "inputs": [
      {
        "name": "positionBook",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  }
] as const;
